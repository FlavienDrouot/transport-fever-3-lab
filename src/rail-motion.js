import {validateGradient} from './gradient.js';
const models=new WeakMap();
const gradients=new WeakMap();
export function withRailGradient(train,gradePercent=0) {
  validateGradient(gradePercent,9);
  if(!gradePercent)return train;
  if(!gradients.has(train))gradients.set(train,new Map());
  const cache=gradients.get(train);
  if(!cache.has(gradePercent)){
    const model=train.model.withGradient(gradePercent);
    cache.set(gradePercent,{...train,model,maxSpeedKmh:model.effectiveMaxSpeedKmh});
  }
  return cache.get(gradePercent);
}
/** Shared infrastructure cap, without mutating captured or saved vehicle values. */
export function withRailSpeedLimit(train,limit) {
  if(![100,160,350].includes(limit))throw new RangeError('Infrastructure speed must be 100, 160 or 350 km/h');
  if(train.maxSpeedKmh<=limit)return train;
  if(!models.has(train))models.set(train,new Map());
  const cache=models.get(train);
  if(!cache.has(limit))cache.set(limit,{...train,maxSpeedKmh:Math.min(limit,train.maxSpeedKmh),model:train.model.withSpeedLimit(limit)});
  return cache.get(limit);
}
