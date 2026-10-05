import {pairCrossings} from './race.js';

const sameLeaders = (a, b) => a.join('|') === b.join('|');

/** Arrival ranking intervals and the upper envelope of that ranking, over all distances. */
export function crossoverStory(trains) {
  if (!trains.length) return {phases: [], intervals: [], end: 1};
  const roots = [];
  for (let i=0; i<trains.length; i++) for (let j=i+1; j<trains.length; j++) roots.push(...pairCrossings(trains[i], trains[j]));
  const boundaries = [0];
  for (const root of roots.sort((a,b)=>a-b)) {
    if (root > 0 && root-boundaries.at(-1) > Math.max(1e-9, root*1e-9)) boundaries.push(root);
  }
  const end = Math.max(1, boundaries.at(-1)*1.25);
  boundaries.push(end);
  const intervals = [], phases = [];
  for (let i=0; i<boundaries.length-1; i++) {
    const start = boundaries[i], stop = boundaries[i+1], distance = (start+stop)/2;
    const times = trains.map(t=>({id:t.id, time:t.model.timeAt(distance)})).sort((a,b)=>a.time-b.time || a.id.localeCompare(b.id));
    const tolerance = Math.max(1e-9, times[0].time*1e-10);
    const ranks = Object.fromEntries(times.map(t=>[t.id, 1+times.filter(other=>other.time < t.time-tolerance).length]));
    const leaders = times.filter(t=>ranks[t.id]===1).map(t=>t.id).sort();
    intervals.push({start, end:stop, ranks});
    const last = phases.at(-1);
    if (last && sameLeaders(last.leaders,leaders)) last.end=stop;
    else phases.push({start, end:stop, leaders});
  }
  // The final leaders stay ahead at all longer distances in this model.
  phases.at(-1).unbounded = true;
  return {phases, intervals, end};
}

/** A short window around leader changes, independent of crossings among slower trains. */
export function leaderCurveWindow(trains, story = crossoverStory(trains)) {
  if (!story.phases.length) return {phases: [], end: 1};
  const phases=story.phases.map(p=>({...p})), last=phases.at(-1);
  const leaders=trains.filter(t=>last.leaders.includes(t.id));
  const end=last.start>0 ? last.start*1.15 : Math.max(1,...leaders.map(t=>t.model.speedCapKm*1.05));
  last.end=end;
  return {phases,end};
}

/** Crop the ranking display without changing the model or the ranks after the cutoff. */
export function rankWindow(story, minimumKm = .1) {
  if (!Number.isFinite(minimumKm) || minimumKm < 0) throw new RangeError('Invalid minimum distance');
  return {
    ...story,
    intervals: story.intervals.filter(p=>p.end>minimumKm).map(p=>({...p,start:Math.max(minimumKm,p.start)})),
    phases: story.phases.filter(p=>p.end>minimumKm).map(p=>({...p,start:Math.max(minimumKm,p.start)}))
  };
}
