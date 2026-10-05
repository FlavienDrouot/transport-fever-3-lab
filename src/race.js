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

/** Last arrival-order crossing: numerical search during acceleration, exact steady-speed tail. */
export function rankingSettlesAt(trains) {
  let last = 0;
  for (let i = 0; i < trains.length; i++) for (let j = i + 1; j < trains.length; j++) {
    last = Math.max(last, ...pairCrossings(trains[i], trains[j]));
  }
  return last;
}

/** Positive crossings between two arrival-time curves, including the steady-speed tail. */
export function pairCrossings(a, b) {
  const crossings = [];
    const end = Math.max(a.model.speedCapKm, b.model.speedCapKm);
    const difference = x => a.model.timeAt(x) - b.model.timeAt(x);
    // Mix linear and logarithmic samples to resolve both early and late crossings.
    const points = new Set([end]);
    for (let k = 0; k <= 2048; k++) {
      points.add(end * (k + 1) / 2049);
      points.add(end * 10 ** (-8 + 8 * k / 2048));
    }
    let previous, prior;
    for (const x of [...points].sort((x,y) => x-y)) {
      const current = difference(x);
      if (prior * current < 0) {
        let low = previous, high = x;
        for (let k = 0; k < 50; k++) {
          const mid = (low + high) / 2;
          if (difference(mid) * prior > 0) low = mid; else high = mid;
        }
        crossings.push((low + high) / 2);
      }
      if (current !== 0) {previous = x; prior = current;}
    }
    const slope = 3600 / a.maxSpeedKmh - 3600 / b.maxSpeedKmh;
    if (slope !== 0) {
      const crossing = end - difference(end) / slope;
      if (crossing >= end) crossings.push(crossing);
    }
  return crossings;
}

export function suggestedDistanceLimit(trains) {
  return Math.min(30, Math.max(5, Math.ceil(rankingSettlesAt(trains) * 1.2 / 5) * 5));
}

/** End the acceleration view shortly after every selected train reaches its speed cap. */
export function speedHorizon(trains) {
  return Math.max(1, ...trains.map(t => t.model.speedCapSeconds * 1.05));
}
