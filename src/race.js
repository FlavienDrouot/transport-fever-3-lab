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

// Models are immutable. Reuse roots across the distance limit and both phase
// diagrams, without keeping replaced composition/gradient models alive.
const crossingCache=new WeakMap();
function cachedPair(a,b) {
  const entry=crossingCache.get(a.model)?.get(b.model);
  return entry&&entry.aSpeed===a.maxSpeedKmh&&entry.bSpeed===b.maxSpeedKmh&&
    entry.aTime===a.model.timeAt&&entry.bTime===b.model.timeAt?entry.roots:null;
}
function rememberPair(a,b,roots) {
  if(!crossingCache.has(a.model))crossingCache.set(a.model,new WeakMap());
  crossingCache.get(a.model).set(b.model,{aSpeed:a.maxSpeedKmh,bSpeed:b.maxSpeedKmh,aTime:a.model.timeAt,bTime:b.model.timeAt,roots:[...roots]});
}
function dominates(a,b) {
  const pa=a.model.motionParameters,pb=b.model.motionParameters;
  // With equal grade, no slower cap and at least as much force per mass at
  // every velocity, an initially equal position can never reverse order.
  return pa&&pb&&pa.gravity===pb.gravity&&a.maxSpeedKmh>=b.maxSpeedKmh&&
    pa.tractionAcceleration>=pb.tractionAcceleration&&pa.powerPerMass>=pb.powerPerMass;
}

/** Positive crossings between two arrival-time curves, including the steady-speed tail. */
export function pairCrossings(a, b) {
  const cached=cachedPair(a,b);
  if(cached)return [...cached];
  if(dominates(a,b)||dominates(b,a))return [];
  const crossings = [];
    const finite=a.model.routeProfile||b.model.routeProfile;
    const end = finite?Math.min(a.model.routeDistanceKm??Infinity,b.model.routeDistanceKm??Infinity):Math.max(a.model.speedCapKm, b.model.speedCapKm);
    const difference = x => a.model.timeAt(x) - b.model.timeAt(x);
    // Mix linear and logarithmic samples to resolve both early and late crossings.
    const points = new Set([end]);
    const samples=finite?256:2048;
    for (let k = 0; k <= samples; k++) {
      points.add(end * (k + 1) / (samples+1));
      points.add(end * 10 ** (-8 + 8 * k / samples));
    }
    if(finite)for(const event of [...(a.model.profileEvents??[]),...(b.model.profileEvents??[])])points.add(event.distanceKm);
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
    if (!finite && slope !== 0) {
      const crossing = end - difference(end) / slope;
      if (crossing >= end) crossings.push(crossing);
    }
  rememberPair(a,b,crossings);rememberPair(b,a,crossings);
  return crossings;
}

export function suggestedDistanceLimit(trains,settlesAt=rankingSettlesAt(trains)) {
  return Math.min(30, Math.max(5, Math.ceil(settlesAt * 1.2 / 5) * 5));
}

/** Show a practical approach to an asymptote; race/service calculations keep full precision. */
export function speedHorizon(trains) {
  return Math.max(1, ...trains.map(t => (t.model.speedViewSeconds??t.model.speedCapSeconds) * (t.model.routeProfile?1:1.05)));
}

/** Distance view covers the same practical acceleration milestones as speed/time. */
export function speedDistanceHorizon(trains) {
  return Math.max(.1,...trains.map(t=>t.model.stateAt(t.model.speedViewSeconds??t.model.speedCapSeconds).distanceKm*1.05));
}
