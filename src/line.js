// Default calendar: four simulation seconds per day, 365 days per year.
export const GAME_YEAR_SECONDS = 4 * 365;

// Passenger journeys count both directions; motion always uses the vehicle's empty mass.
export function analyseLine(train, {distanceKm, fillRatio = 1, baseRate = 1, brakingDeceleration = 2.5, stationDelaySeconds = 6}) {
  for (const [name, value] of Object.entries({distanceKm, baseRate, brakingDeceleration, capacity: train.passengerCapacity, multiplier: train.loadingUnloadingSpeedMultiplier, maintenance: train.economy.annualMaintenance})) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite`);
  }
  if (!Number.isInteger(train.carCount) || train.carCount <= 0) throw new RangeError('Car count must be a positive integer');
  if (!Number.isFinite(stationDelaySeconds) || stationDelaySeconds < 0) throw new RangeError('Station delay must be non-negative and finite');
  if (!Number.isFinite(fillRatio) || fillRatio < 0 || fillRatio > 1) throw new RangeError('Fill ratio must be between zero and one');
  const passengers = train.passengerCapacity * fillRatio;
  const rate = baseRate * train.loadingUnloadingSpeedMultiplier * train.carCount;
  // Find the braking start: acceleration distance plus stopping distance equals the leg.
  // This also handles short routes where the train cannot reach its top speed.
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
  const loadingSeconds = passengers / rate;
  const stationSeconds = 2 * loadingSeconds + stationDelaySeconds; // Sequential unloading, then loading at each terminal.
  const roundTripSeconds = 2 * travelSeconds + 2 * stationSeconds;
  const journeysPerSecond = 2 * passengers / roundTripSeconds;
  const journeysPerHour = journeysPerSecond * 3600;
  const transportPerMaintenance = journeysPerHour / train.economy.annualMaintenance;
  return {passengers, rate, travelSeconds, brakingSeconds, peakSpeedKmh, loadingSeconds, stationSeconds, roundTripSeconds,
    journeysPerHour, transportPerMaintenance,
    maintenancePerJourney: journeysPerSecond > 0 ? train.economy.annualMaintenance / (journeysPerSecond * GAME_YEAR_SECONDS) : null,
    maintenancePerThroughput: journeysPerHour > 0 ? train.economy.annualMaintenance / journeysPerHour : null,
    efficiency: journeysPerSecond / train.economy.annualMaintenance};
}

/** Whole identical trains, evenly spaced, on an A–B–A line. Demand is passenger journeys per game year per direction. */
export function analyseService(train, options) {
  const {demandPerDirection = null, maxHeadwaySeconds = null, frequencyMode = 'maximum'} = options;
  for(const [name,value] of Object.entries({demandPerDirection,maxHeadwaySeconds}))
    if(value!==null && (!Number.isFinite(value)||value<=0))throw new RangeError(`${name} must be positive or null`);
  if(!['maximum','closest'].includes(frequencyMode))throw new RangeError('Invalid frequency mode');
  const baseline=analyseLine(train,options);
  const roundUp=value=>Math.max(1,Math.ceil(value-1e-10));
  let trainCount=1, line=baseline;
  if(demandPerDirection!==null){
    if(!baseline.passengers)throw new RangeError('A positive occupancy limit is required for passenger demand');
    const flow=demandPerDirection/GAME_YEAR_SECONDS;
    const fixedCycle=2*baseline.travelSeconds+2*(options.stationDelaySeconds??6);
    const transferFactor=4*flow/baseline.rate;
    const capacityCount=flow*baseline.roundTripSeconds/baseline.passengers;
    const frequencyCount=maxHeadwaySeconds===null?1:transferFactor+fixedCycle/maxHeadwaySeconds;
    const minimum=roundUp(capacityCount);
    trainCount=roundUp(Math.max(capacityCount,frequencyCount));
    if(maxHeadwaySeconds!==null && frequencyMode==='closest'){
      const candidates=[Math.max(minimum,Math.floor(frequencyCount)),Math.max(minimum,Math.ceil(frequencyCount))];
      trainCount=candidates.sort((a,b)=>Math.abs(fixedCycle/(a-transferFactor)-maxHeadwaySeconds)-Math.abs(fixedCycle/(b-transferFactor)-maxHeadwaySeconds)||a-b)[0];
    }
    const passengers=flow*fixedCycle/(trainCount-transferFactor);
    line=analyseLine(train,{...options,fillRatio:Math.min(options.fillRatio??1,passengers/train.passengerCapacity)});
  }else if(maxHeadwaySeconds!==null){
    const count=baseline.roundTripSeconds/maxHeadwaySeconds;
    trainCount=roundUp(count);
    if(frequencyMode==='closest')trainCount=[Math.max(1,Math.floor(count)),Math.max(1,Math.ceil(count))].sort((a,b)=>Math.abs(baseline.roundTripSeconds/a-maxHeadwaySeconds)-Math.abs(baseline.roundTripSeconds/b-maxHeadwaySeconds)||a-b)[0];
  }
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
