import {analyseService, GAME_YEAR_SECONDS, serviceEligible, travelBetweenStops} from './line.js';
import {withRailSpeedLimit} from './rail-motion.js';
import {sizeFleet} from './service-fleet.js';

import {FREIGHT_LOAD_SPEED_FACTOR} from './trucks.js';

function handlingRate(multiplier, stop, name) {
  if (stop === null || typeof stop !== 'object' || Array.isArray(stop)) throw new RangeError(`${name} must describe a stop`);
  const {specializedTerminal = false, specializedWarehouse = false} = stop;
  if (typeof specializedTerminal !== 'boolean' || typeof specializedWarehouse !== 'boolean') throw new RangeError(`${name} installation flags must be boolean`);
  return FREIGHT_LOAD_SPEED_FACTOR * multiplier * (specializedTerminal ? 2 : 1) * (specializedWarehouse ? 2 : 1);
}

/** Whole freight formations on A–B–A; demand counts all units delivered per game year.
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
  if (typeof loadedReturn !== 'boolean') throw new RangeError('Loaded return must be boolean');
  for (const [name,value] of Object.entries({demandPerYear,maxHeadwaySeconds})) {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) throw new RangeError(`${name} must be positive or null`);
  }
  if (!['maximum','closest'].includes(frequencyMode)) throw new RangeError('Invalid frequency mode');
  if (demandPerYear !== null && fillRatio === 0) throw new RangeError('A positive occupancy limit is required for freight demand');
  if (infrastructureSpeedKmh !== null && ![100,160,350].includes(infrastructureSpeedKmh)) throw new RangeError('Infrastructure speed must be 100, 160 or 350 km/h');
  const handlingRateA = handlingRate(multiplier, stopA, 'stopA');
  const handlingRateB = handlingRate(multiplier, stopB, 'stopB');
  if (!serviceEligible(train, options)) return {eligible:false, efficiency:0, maintenancePerUnit:null};
  const vehicle = infrastructureSpeedKmh === null ? train : withRailSpeedLimit(train, infrastructureSpeedKmh);
  const motion = travelBetweenStops(vehicle, {distanceKm,brakingDeceleration});
  const returns = Number(loadedReturn);
  // A loads the outbound cargo and unloads the return; B performs the inverse.
  // Each configured operation has a 2 s pause, followed by 2 s before departure.
  const pauseSeconds = loadedReturn ? 6 : 4;
  const cycleFor = cargoPerLeg => {
    const loadingSeconds = cargoPerLeg / handlingRateA + returns * cargoPerLeg / handlingRateB;
    const unloadingSeconds = cargoPerLeg / handlingRateB + returns * cargoPerLeg / handlingRateA;
    const stationSecondsA = (1 + returns) * cargoPerLeg / handlingRateA + pauseSeconds;
    const stationSecondsB = (1 + returns) * cargoPerLeg / handlingRateB + pauseSeconds;
    return {cargoPerLeg, deliveredPerCycle:cargoPerLeg * (1 + returns), loadingSeconds, unloadingSeconds,
      stationSecondsA, stationSecondsB, roundTripSeconds:2 * motion.travelSeconds + stationSecondsA + stationSecondsB};
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
