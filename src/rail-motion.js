const models=new WeakMap();
/** Shared infrastructure cap, without mutating captured or saved vehicle values. */
export function withRailSpeedLimit(train,limit) {
  if(![100,160,350].includes(limit))throw new RangeError('Infrastructure speed must be 100, 160 or 350 km/h');
  if(train.maxSpeedKmh<=limit)return train;
  if(!models.has(train))models.set(train,new Map());
  const cache=models.get(train);
  if(!cache.has(limit))cache.set(limit,{...train,maxSpeedKmh:Math.min(limit,train.maxSpeedKmh),model:train.model.withSpeedLimit(limit)});
  return cache.get(limit);
}
