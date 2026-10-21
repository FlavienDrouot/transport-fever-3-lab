import {analyseService, GAME_YEAR_SECONDS, serviceEligible, roundTripMotion} from './line.js';
import {withRailSpeedLimit} from './rail-motion.js';
import {sizeFleet} from './service-fleet.js';
import {servicePattern,cycleHandling} from './stop-pattern.js';

import {FREIGHT_LOAD_SPEED_FACTOR} from './trucks.js';

function handlingRate(multiplier, stop, name) {
  if (stop === null || typeof stop !== 'object' || Array.isArray(stop)) throw new RangeError(`${name} must describe a stop`);
  const {specializedTerminal = false, specializedWarehouse = false} = stop;
  if (typeof specializedTerminal !== 'boolean' || typeof specializedWarehouse !== 'boolean') throw new RangeError(`${name} installation flags must be boolean`);
  return FREIGHT_LOAD_SPEED_FACTOR * multiplier * (specializedTerminal ? 2 : 1) * (specializedWarehouse ? 2 : 1);
}

/** Whole freight formations on A–B–A, stopping at the route's intermediate stops; demand counts all units delivered per game year.
 * Motion uses empty mass in both directions. Terminal bonuses only change transfers.
 */
export function analyseFreightService(train, options) {
  const {distanceKm, fillRatio = 1, infrastructureSpeedKmh = null,
    demandPerYear = null, maxHeadwaySeconds = null, frequencyMode = 'maximum',
    loadedReturn = false, stopA = {}, stopB = {}, brakingDeceleration = 2.5} = options;
  const multiplier = train.formationLoadingUnloadingSpeedMultiplier;
  for (const [name,value] of Object.entries({distanceKm, brakingDeceleration, capacity:train.cargoCapacity,
    multiplier, maintenance:train.economy?.annualMaintenance})) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite`);
  }
  if (!Number.isInteger(train.carCount) || train.carCount <= 0) throw new RangeError('Car count must be a positive integer');
  if (!Number.isFinite(fillRatio) || fillRatio < 0 || fillRatio > 1) throw new RangeError('Fill ratio must be between zero and one');
  for (const [name,value] of Object.entries({demandPerYear,maxHeadwaySeconds})) {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) throw new RangeError(`${name} must be positive or null`);
  }
  if (!['maximum','closest'].includes(frequencyMode)) throw new RangeError('Invalid frequency mode');
  if (demandPerYear !== null && fillRatio === 0) throw new RangeError('A positive occupancy limit is required for freight demand');
  if (infrastructureSpeedKmh !== null && (!Number.isFinite(infrastructureSpeedKmh)||infrastructureSpeedKmh<10||infrastructureSpeedKmh>350)) throw new RangeError('Infrastructure speed must be 10–350 km/h');
  const handlingRateA = handlingRate(multiplier, stopA, 'stopA');
  const handlingRateB = handlingRate(multiplier, stopB, 'stopB');
  if (!serviceEligible(train, options)) return {eligible:false, efficiency:0, maintenancePerUnit:null};
  const vehicle = infrastructureSpeedKmh === null ? train : withRailSpeedLimit(train, infrastructureSpeedKmh);
  const motion = roundTripMotion(vehicle, {distanceKm,brakingDeceleration,gradePercent:options.gradePercent??0,routeProfile:options.routeProfile??null});
  if(motion.eligible===false)return {eligible:false,efficiency:0,maintenancePerUnit:null};
  // The busiest section carries the full load; each stop moves its share of it (A–B–A: the
  // return a share of the outbound load). Motion uses empty mass, so loads do not change travel.
  const pattern = servicePattern({servicePattern:options.servicePattern ?? null, loadedReturn, routeProfile:options.routeProfile ?? null});
  const baseRate = FREIGHT_LOAD_SPEED_FACTOR * multiplier, last = pattern.stops.length - 1;
  const rateAt = stop => stop === 0 ? handlingRateA : stop === last ? handlingRateB : baseRate;
  const cycleFor = cargoPerLeg => {
    const h = cycleHandling(pattern, cargoPerLeg, rateAt);
    return {cargoPerLeg, deliveredPerCycle:h.deliveredPerCycle, loadingSeconds:h.loadingSeconds, unloadingSeconds:h.unloadingSeconds,
      stationSecondsA:h.stationSecondsA, stationSecondsB:h.stationSecondsB, intermediateStopSeconds:h.intermediateStopSeconds, deliveries:h.deliveries,
      roundTripSeconds:2 * motion.travelSeconds + h.loadingSeconds + h.unloadingSeconds + h.pauseSeconds};
  };
  const baseline = cycleFor(train.cargoCapacity * fillRatio);
  const fleet = sizeFleet({cycleSeconds:baseline.roundTripSeconds,
    transferSeconds:baseline.loadingSeconds + baseline.unloadingSeconds,
    unitsPerCycle:baseline.deliveredPerCycle || 1, yearSeconds:GAME_YEAR_SECONDS},
  {demandPerYear,maxHeadwaySeconds,frequencyMode});
  const line = fleet.loadScale === 1 ? baseline : cycleFor(baseline.cargoPerLeg * fleet.loadScale);
  const trainCount = fleet.count;
  const unitsPerSecond = line.deliveredPerCycle * trainCount / line.roundTripSeconds;
  const deliveredPerYear = unitsPerSecond * GAME_YEAR_SECONDS;
  const fleetMaintenance = train.economy.annualMaintenance * trainCount;
  return {...motion,...line,eligible:true,trainCount,unitsPerTrain:1,
    capacityPerTrain:train.cargoCapacity,trainLengthMetres:train.lengthMetres,carCount:train.carCount,
    deliveredPerYear,unitsPerHour:unitsPerSecond * 3600,fleetMaintenance,
    actualOccupancyRatio:line.cargoPerLeg / train.cargoCapacity,
    headwaySeconds:line.roundTripSeconds / trainCount,
    maintenancePerUnit:deliveredPerYear > 0 ? fleetMaintenance / deliveredPerYear : null,
    efficiency:unitsPerSecond / fleetMaintenance,handlingRateA,handlingRateB};
}

/** Common Economics entry point, retaining all passenger service fields. */
export function analyseEconomicService(train, options) {
  if (options.freight === true) return analyseFreightService(train, options);
  const result = analyseService(train, options);
  return {...result,maintenancePerUnit:result.maintenancePerJourney};
}
