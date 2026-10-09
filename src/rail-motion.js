import {routeTrajectory} from './route-profile.js';
import {validateGradient} from './gradient.js';
const models=new WeakMap();
const gradients=new WeakMap();
export function withRailGradient(train,gradePercent=0) {
  validateGradient(gradePercent);
  if(!gradePercent&&(train.model.gradePercent??0)===0&&(train.model.effectiveMaxSpeedKmh==null||train.model.effectiveMaxSpeedKmh===train.maxSpeedKmh))return train;
  if(!gradients.has(train))gradients.set(train,new Map());
  const cache=gradients.get(train);
  if(!cache.has(gradePercent)){
    const model=train.model.gradePercent===gradePercent?train.model:train.model.withGradient(gradePercent);
    if(cache.size>=8)cache.delete(cache.keys().next().value);
    cache.set(gradePercent,{...train,model,maxSpeedKmh:model.effectiveMaxSpeedKmh});
  }
  return cache.get(gradePercent);
}
/** Shared infrastructure cap, without mutating captured or saved vehicle values. */
export function withRailSpeedLimit(train,limit) {
  if(!Number.isFinite(limit)||limit<10||limit>350)throw new RangeError('Infrastructure speed must be 10–350 km/h');
  if(train.maxSpeedKmh<=limit)return train;
  if(!models.has(train))models.set(train,new Map());
  const cache=models.get(train);
  if(!cache.has(limit))cache.set(limit,{...train,maxSpeedKmh:Math.min(limit,train.maxSpeedKmh),model:train.model.withSpeedLimit(limit)});
  return cache.get(limit);
}

const profileModels=new WeakMap();
/** Finite A→B Race model. Arrival after B is intentionally undefined. */
export function withRailProfile(train,segments) {
  const key=JSON.stringify(segments);
  let cache=profileModels.get(train);
  if(!cache){cache=new Map();profileModels.set(train,cache);}
  if(cache.has(key))return cache.get(key);
  const motion=routeTrajectory(train,segments);
  const model={canStart:!motion.stalled,routeProfile:true,routeDistanceKm:motion.routeDistanceKm,
    effectiveMaxSpeedKmh:motion.maxSpeedKmh,tractionEndSeconds:0,speedCapSeconds:motion.travelSeconds,
    speedViewSeconds:motion.travelSeconds,speedCapKm:motion.routeDistanceKm,profileEvents:motion.events,
    stateAt:motion.stateAt,timeAt:motion.timeAt};
  const result={...train,model,maxSpeedKmh:motion.maxSpeedKmh};
  if(cache.size>=12)cache.clear();cache.set(key,result);
  return result;
}
