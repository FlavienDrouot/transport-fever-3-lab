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
  return {passengers, rate, travelSeconds, brakingSeconds, peakSpeedKmh, loadingSeconds, stationSeconds, roundTripSeconds,
    journeysPerHour: journeysPerSecond * 3600,
    efficiency: journeysPerSecond / train.economy.annualMaintenance};
}
