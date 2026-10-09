import {sizeFleet} from './service-fleet.js';
import {canClimbRail,gradientAcceleration,validateGradient} from './gradient.js';
import {withRailGradient,withRailSpeedLimit} from './rail-motion.js';
// Default calendar: four simulation seconds per day, 365 days per year.
export const GAME_YEAR_SECONDS = 4 * 365;

const motionCache = new WeakMap();

/** Acceleration, cruising and braking on one leg, using the captured empty-mass model. */
export function travelBetweenStops(train, {distanceKm, brakingDeceleration = 2.5}) {
  for (const [name,value] of Object.entries({distanceKm,brakingDeceleration})) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite`);
  }
  if(train.model.canStart===false)throw new RangeError('Vehicle cannot start on this route');
  brakingDeceleration+=gradientAcceleration(train.model.gradePercent??0);
  if(brakingDeceleration<=0)throw new RangeError('Vehicle cannot stop on this gradient');
  let cache=motionCache.get(train.model);
  if (!cache) {cache=new Map();motionCache.set(train.model,cache);}
  const motionKey=`${distanceKm}:${brakingDeceleration}`;
  let motion=cache.get(motionKey);
  if (!motion) {
    // Find the braking start: acceleration distance plus stopping distance equals the leg.
    // This also handles short routes where the train cannot reach its top speed.
    if(train.model.motionAtSpeed){
      let low=0,high=train.model.effectiveMaxSpeedKmh;
      for(let i=0;i<50;i++){
        const speed=(low+high)/2,state=train.model.motionAtSpeed(speed);
        if(state.distance+(speed/3.6)**2/(2*brakingDeceleration)<distanceKm*1000)low=speed;else high=speed;
      }
      const peakSpeedKmh=(low+high)/2,state=train.model.motionAtSpeed(peakSpeedKmh);
      // If the cap is reached, include the remaining cruising distance.
      const cruise=Math.max(0,distanceKm*1000-state.distance-(peakSpeedKmh/3.6)**2/(2*brakingDeceleration))/(peakSpeedKmh/3.6);
      const brakingSeconds=peakSpeedKmh/3.6/brakingDeceleration;
      motion={travelSeconds:state.time+cruise+brakingSeconds,brakingSeconds,peakSpeedKmh};
    }else{
    let low = 0, high = train.model.timeAt(distanceKm);
    for (let i = 0; i < 70; i++) {
      const time = (low + high) / 2, state = train.model.stateAt(time);
      const speed = state.speedKmh / 3.6;
      if (state.distanceKm * 1000 + speed ** 2 / (2 * brakingDeceleration) < distanceKm * 1000) low = time;
      else high = time;
    }
    const brakingStartSeconds = (low + high) / 2;
    const peakSpeedKmh = train.model.stateAt(brakingStartSeconds).speedKmh;
    const brakingSeconds = peakSpeedKmh / 3.6 / brakingDeceleration;
    const travelSeconds = brakingStartSeconds + brakingSeconds;
    if (!Number.isFinite(travelSeconds) || travelSeconds <= 0) throw new RangeError('Travel time must be positive and finite');
    motion={travelSeconds,brakingSeconds,peakSpeedKmh};
    }
    if (cache.size>=2048) cache.clear();
    cache.set(motionKey,motion);
  }
  return {...motion};
}

/** Signed A→B grade; the return leg has the opposite gradient. */
export function roundTripMotion(train,{gradePercent=0,...options}) {
  validateGradient(gradePercent,9);
  const outbound=travelBetweenStops(withRailGradient(train,gradePercent),options);
  const back=gradePercent?travelBetweenStops(withRailGradient(train,-gradePercent),options):outbound;
  return {travelSeconds:(outbound.travelSeconds+back.travelSeconds)/2,
    outboundTravelSeconds:outbound.travelSeconds,returnTravelSeconds:back.travelSeconds,
    brakingSeconds:(outbound.brakingSeconds+back.brakingSeconds)/2,
    peakSpeedKmh:Math.max(outbound.peakSpeedKmh,back.peakSpeedKmh)};
}

// Passenger journeys count both directions; motion always uses the vehicle's empty mass.
export function analyseLine(train, {distanceKm, fillRatio = 1, baseRate = 1, brakingDeceleration = 2.5, stationDelaySeconds = 6, gradePercent = 0}) {
  const formationMultiplier=train.formationLoadingUnloadingSpeedMultiplier!==undefined?train.formationLoadingUnloadingSpeedMultiplier:train.loadingUnloadingSpeedMultiplier*train.carCount;
  for (const [name, value] of Object.entries({distanceKm, baseRate, brakingDeceleration, capacity: train.passengerCapacity, multiplier: formationMultiplier, maintenance: train.economy.annualMaintenance})) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite`);
  }
  if (!Number.isInteger(train.carCount) || train.carCount <= 0) throw new RangeError('Car count must be a positive integer');
  if (!Number.isFinite(stationDelaySeconds) || stationDelaySeconds < 0) throw new RangeError('Station delay must be non-negative and finite');
  if (!Number.isFinite(fillRatio) || fillRatio < 0 || fillRatio > 1) throw new RangeError('Fill ratio must be between zero and one');
  const passengers = train.passengerCapacity * fillRatio;
  const rate = baseRate * formationMultiplier;
  const motion=roundTripMotion(train,{distanceKm,brakingDeceleration,gradePercent});
  const {travelSeconds,brakingSeconds,peakSpeedKmh}=motion;
  const loadingSeconds = passengers / rate;
  const stationSeconds = 2 * loadingSeconds + stationDelaySeconds; // Sequential unloading, then loading at each terminal.
  const roundTripSeconds = 2 * travelSeconds + 2 * stationSeconds;
  const journeysPerSecond = 2 * passengers / roundTripSeconds;
  const journeysPerHour = journeysPerSecond * 3600;
  const transportPerMaintenance = journeysPerHour / train.economy.annualMaintenance;
  return {...motion,passengers, rate, travelSeconds, brakingSeconds, peakSpeedKmh, loadingSeconds, stationSeconds, roundTripSeconds,
    journeysPerHour, transportPerMaintenance,
    maintenancePerJourney: journeysPerSecond > 0 ? train.economy.annualMaintenance / (journeysPerSecond * GAME_YEAR_SECONDS) : null,
    maintenancePerThroughput: journeysPerHour > 0 ? train.economy.annualMaintenance / journeysPerHour : null,
    efficiency: journeysPerSecond / train.economy.annualMaintenance};
}

/** Whole identical trains, evenly spaced, on an A–B–A line. Demand is passenger journeys per game year per direction. */
function analyseSingleService(train, options, fleetCount = null) {
  const {demandPerDirection = null, maxHeadwaySeconds = null, frequencyMode = 'maximum'} = options;
  for(const [name,value] of Object.entries({demandPerDirection,maxHeadwaySeconds}))
    if(value!==null && (!Number.isFinite(value)||value<=0))throw new RangeError(`${name} must be positive or null`);
  if(!['maximum','closest'].includes(frequencyMode))throw new RangeError('Invalid frequency mode');
  const baseline=analyseLine(train,options);
  if(demandPerDirection!==null&&!baseline.passengers)throw new RangeError('A positive occupancy limit is required for passenger demand');
  const fleet=sizeFleet({cycleSeconds:baseline.roundTripSeconds,transferSeconds:4*baseline.loadingSeconds,unitsPerCycle:2*baseline.passengers||1,yearSeconds:GAME_YEAR_SECONDS},
    {demandPerYear:demandPerDirection===null?null:2*demandPerDirection,maxHeadwaySeconds,frequencyMode},fleetCount);
  const trainCount=fleet.count;
  const line=fleet.loadScale===1?baseline:analyseLine(train,{...options,fillRatio:(options.fillRatio??1)*fleet.loadScale});
  const journeysPerHour=line.journeysPerHour*trainCount;
  const fleetMaintenance=train.economy.annualMaintenance*trainCount;
  const journeysPerSecond=journeysPerHour/3600;
  return {...line,trainCount,fleetMaintenance,journeysPerHour,
    perDirectionJourneysPerHour:journeysPerHour/2,
    perDirectionJourneysPerYear:journeysPerSecond*GAME_YEAR_SECONDS/2,
    actualOccupancyRatio:line.passengers/train.passengerCapacity,
    headwaySeconds:line.roundTripSeconds/trainCount,
    maintenancePerJourney:journeysPerSecond>0?fleetMaintenance/(journeysPerSecond*GAME_YEAR_SECONDS):null,
    maintenancePerThroughput:journeysPerHour>0?fleetMaintenance/journeysPerHour:null,
    transportPerMaintenance:journeysPerHour/fleetMaintenance,
    efficiency:journeysPerSecond/fleetMaintenance};
}


/** Platform length is a hard limit; no short-platform loading penalty is modelled. */
export function serviceEligible(train, {platformLengthMetres = null,gradePercent = 0} = {}) {
  if (platformLengthMetres !== null && (!Number.isFinite(platformLengthMetres) || platformLengthMetres <= 0)) throw new RangeError('Platform length must be positive or null');
  validateGradient(gradePercent,9);
  if(gradePercent&&!canClimbRail(train,Math.abs(gradePercent)))return false;
  if(!gradePercent&&train.model?.canStart===false)return false;
  return platformLengthMetres === null || (Number.isFinite(train.lengthMetres) && train.lengthMetres <= platformLengthMetres + 1e-9);
}

export function analyseService(train, options) {
  const {infrastructureSpeedKmh = null, allowMultipleUnits = false, platformLengthMetres = null} = options;
  if (infrastructureSpeedKmh !== null && ![100,160,350].includes(infrastructureSpeedKmh)) throw new RangeError('Infrastructure speed must be 100, 160 or 350 km/h');
  if (!serviceEligible(train, options)) return {eligible:false, efficiency:0, maintenancePerJourney:null};
  const vehicle=infrastructureSpeedKmh===null?train:withRailSpeedLimit(train,infrastructureSpeedKmh);
  const resultFor = (units, fleetCount = null) => {
    const composition={...vehicle,passengerCapacity:vehicle.passengerCapacity*units,carCount:vehicle.carCount*units,
      economy:{...vehicle.economy,annualMaintenance:vehicle.economy.annualMaintenance*units}};
    if(vehicle.formationLoadingUnloadingSpeedMultiplier!=null)composition.formationLoadingUnloadingSpeedMultiplier=vehicle.formationLoadingUnloadingSpeedMultiplier*units;
    return {...analyseSingleService(composition,options,fleetCount),eligible:true,unitsPerTrain:units,
      trainLengthMetres:train.lengthMetres*units,capacityPerTrain:composition.passengerCapacity,carCount:composition.carCount};
  };
  let best=resultFor(1);
  if (!allowMultipleUnits || train.automaticCouplingAllowed===false || options.maxHeadwaySeconds == null || options.demandPerDirection == null) return best;
  const flow=options.demandPerDirection/GAME_YEAR_SECONDS, target=options.maxHeadwaySeconds;
  const fixedCycle=2*best.travelSeconds+2*(options.stationDelaySeconds??6);
  const transfer=4*flow/best.rate;
  const capacityCount=flow*fixedCycle/(train.passengerCapacity*(options.fillRatio??1))+transfer;
  const maximum=platformLengthMetres===null?Infinity:Math.floor((platformLengthMetres+1e-9)/train.lengthMetres);
  const maximumFleet=best.trainCount+1;
  const error=result=>Math.abs(Math.round(result.headwaySeconds)-Math.round(target));
  // Search fleet sizes analytically: h = C0 / (n - A/k), decreasing with units k.
  // Frequency is compared at the readout's one-second resolution. Equal displayed
  // intervals then favor cost, so an unlimited platform never requires infinite k.
  for (let n=1;n<=maximumFleet;n++) {
    // Even a single unit has a shorter interval at this fleet size; adding units
    // only reduces it further. Later fleets therefore cannot improve or tie.
    if (n>transfer && Math.round(fixedCycle/(n-transfer))<Math.round(target)-error(best)) break;
    let minimum=Math.max(1,Math.ceil(capacityCount/n-1e-10));
    const targetDenominator=n-fixedCycle/target;
    if (options.frequencyMode!=='closest') {
      if (targetDenominator<=0) continue;
      minimum=Math.max(minimum,Math.ceil(transfer/targetDenominator-1e-10));
    }
    if (minimum>maximum) continue;
    const clamp=k=>Math.max(minimum,Math.min(maximum,k));
    const candidates=new Set([minimum]);
    if (targetDenominator>0) {
      const ideal=transfer/targetDenominator;
      candidates.add(clamp(Math.floor(ideal)));candidates.add(clamp(Math.ceil(ideal)));
    } else if (Number.isFinite(maximum)) candidates.add(maximum);
    else {
      const roundedLimit=Math.round(fixedCycle/n);
      const denominator=n-fixedCycle/(roundedLimit+.5);
      candidates.add(Math.max(minimum,Math.floor(transfer/denominator)+1));
    }
    for (const k of [...candidates]) {
      const interval=fixedCycle/(n-transfer/k), rounded=Math.round(interval);
      const denominator=n-fixedCycle/(rounded+.5);
      if (denominator>0) candidates.add(clamp(Math.floor(transfer/denominator)+1));
    }
    for (const units of candidates) {
      if (!Number.isSafeInteger(units) || units<minimum || units>maximum) continue;
      const candidate=resultFor(units,n);
      if (options.frequencyMode!=='closest' && candidate.headwaySeconds>target+1e-7) continue;
      if (error(candidate)<error(best) || (error(candidate)===error(best) &&
        (candidate.fleetMaintenance<best.fleetMaintenance-1e-7 ||
        (Math.abs(candidate.fleetMaintenance-best.fleetMaintenance)<1e-7 && candidate.unitsPerTrain<best.unitsPerTrain)))) best=candidate;
    }
  }
  return best;
}
