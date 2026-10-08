// Exact knots belong to the interval on their left; outside values extrapolate
// from the first or last interval.
function intervalIndex(boundaries,value) {
  let low=0,high=boundaries.length;
  while(low<high){
    const middle=Math.floor((low+high)/2);
    if(boundaries[middle]>=value)high=middle;
    else low=middle+1;
  }
  return Math.max(0,Math.min(boundaries.length-2,low-1));
}

/** Continuous piecewise-linear axis, with optional relative space for each interval. */
export function createPhaseScale(knots, weights = Array(knots.length-1).fill(1)) {
  if (knots.length < 2 || knots.some((n,i)=>!Number.isFinite(n) || (i && n<=knots[i-1]))) throw new RangeError('Phase knots must increase');
  if (weights.length !== knots.length-1 || weights.some(w=>!Number.isFinite(w) || w<=0)) throw new RangeError('Phase weights must be positive');
  const count=knots.length-1, total=weights.reduce((a,b)=>a+b,0), positions=[0];
  for(const weight of weights) positions.push(positions.at(-1)+weight/total);
  positions[count]=1;
  return {
    position(value) {
      const i=intervalIndex(knots,value);
      return positions[i]+(value-knots[i])/(knots[i+1]-knots[i])*(positions[i+1]-positions[i]);
    },
    invert(position) {
      const i=intervalIndex(positions,position);
      return knots[i]+(position-positions[i])/(positions[i+1]-positions[i])*(knots[i+1]-knots[i]);
    }
  };
}

/** Show only a short tail once the final leader is established. */
export function leadershipWeights(count) {
  return Array.from({length:count},(_,i)=>count>1 && i===count-1 ? .3 : 1);
}
