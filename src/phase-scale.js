/** Continuous piecewise-linear axis, with optional relative space for each interval. */
export function createPhaseScale(knots, weights = Array(knots.length-1).fill(1)) {
  if (knots.length < 2 || knots.some((n,i)=>!Number.isFinite(n) || (i && n<=knots[i-1]))) throw new RangeError('Phase knots must increase');
  if (weights.length !== knots.length-1 || weights.some(w=>!Number.isFinite(w) || w<=0)) throw new RangeError('Phase weights must be positive');
  const count=knots.length-1, total=weights.reduce((a,b)=>a+b,0), positions=[0];
  for(const weight of weights) positions.push(positions.at(-1)+weight/total);
  positions[count]=1;
  return {
    position(value) {
      const found=knots.findIndex(n=>n>=value);
      const i=found<0 ? count-1 : Math.max(0,found-1);
      return positions[i]+(value-knots[i])/(knots[i+1]-knots[i])*(positions[i+1]-positions[i]);
    },
    invert(position) {
      const found=positions.findIndex(n=>n>=position);
      const i=found<0 ? count-1 : Math.max(0,found-1);
      return knots[i]+(position-positions[i])/(positions[i+1]-positions[i])*(knots[i+1]-knots[i]);
    }
  };
}

/** Show only a short tail once the final leader is established. */
export function leadershipWeights(count) {
  return Array.from({length:count},(_,i)=>count>1 && i===count-1 ? .3 : 1);
}
