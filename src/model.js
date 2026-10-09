import {createGradientModel} from './gradient-model.js';
import {validateGradient} from './gradient.js';
/** Exact flat-track integration; constant grades add the gravity component. */
export function createModel(train, units, {gradePercent=0}={}) {
  validateGradient(gradePercent);
  if(gradePercent)return createGradientModel(train,units,gradePercent,(vehicle,u,grade)=>createModel(vehicle,u,{gradePercent:grade}));
  const m = train.massTonnes * 1000;
  const f = train.tractionKgf * units.kgfNewtons;
  const p = train.powerCh * units.horsepowerWatts;
  const vmax = train.maxSpeedKmh / 3.6;
  if (![m, f, p, vmax].every(n => Number.isFinite(n) && n > 0)) throw new RangeError('Invalid physical parameters');
  const a = f / m;
  const q = p / m;
  const v1 = Math.min(p / f, vmax);
  const t1 = v1 / a;
  const x1 = v1 * t1 / 2;
  const t2 = t1 + (vmax ** 2 - v1 ** 2) / (2 * q);
  const x2 = x1 + (vmax ** 3 - v1 ** 3) / (3 * q);
  function valid(n) {
    if (!Number.isFinite(n) || n < 0) throw new RangeError('Invalid time or distance');
  }
  function stateAt(t) {
    valid(t);
    if (t <= t1) return {speedKmh: a * t * 3.6, distanceKm: a * t ** 2 / 2000};
    if (t < t2) {
      const v = Math.sqrt(v1 ** 2 + 2 * q * (t - t1));
      return {speedKmh: v * 3.6, distanceKm: (x1 + (v ** 3 - v1 ** 3) / (3 * q)) / 1000};
    }
    return {speedKmh: vmax * 3.6, distanceKm: (x2 + vmax * (t - t2)) / 1000};
  }
  function timeAt(distanceKm) {
    valid(distanceKm);
    const x = distanceKm * 1000;
    if (x <= x1) return Math.sqrt(2 * x / a);
    if (x < x2) {
      const v = Math.cbrt(v1 ** 3 + 3 * q * (x - x1));
      return t1 + (v ** 2 - v1 ** 2) / (2 * q);
    }
    return t2 + (x - x2) / vmax;
  }
  return {gradePercent:0,canStart:true,effectiveMaxSpeedKmh:train.maxSpeedKmh,
    motionParameters:{tractionAcceleration:a,powerPerMass:q,gravity:0},
    withGradient:grade=>createModel(train,units,{gradePercent:grade}),
    withSpeedLimit: limit => createModel({...train, maxSpeedKmh: Math.min(train.maxSpeedKmh, limit)}, units), stateAt, timeAt, tractionEndSeconds: t1, speedCapSeconds: t2, speedCapKm: x2 / 1000};
}
