/** The shared time horizon ends when the last selected train reaches the route distance. */
export function raceHorizon(trains, distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) throw new RangeError('Invalid route distance');
  let seconds = 0, lastTrain;
  for (const train of trains) {
    const arrival = train.model.timeAt(distanceKm);
    if (arrival > seconds) {seconds = arrival; lastTrain = train;}
  }
  return {seconds, lastTrain};
}
