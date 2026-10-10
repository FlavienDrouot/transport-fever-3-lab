import {createModel} from './model.js';
import {MOTION_UNITS,ROAD_MOTION,validateGradient} from './gradient.js';
import {withRailGradient,withRailSpeedLimit} from './rail-motion.js';
import {routeRoundTrip,scaledRouteProfile,routeProfileForDomain} from './route-profile.js';

// Records are decorated anew by catalogue/category filters: cache by mechanical
// inputs, independently of capacity, annual maintenance and passenger/freight type.
const models=new Map(),vehicles=new Map();
export function withRoadModel(vehicle) {
  const {model:sourceModel,...record}=vehicle;
  const recordKey=JSON.stringify(record);
  if(vehicles.has(recordKey))return vehicles.get(recordKey);
  const key=JSON.stringify([vehicle.massTonnes,vehicle.tractionKgf,vehicle.powerCh,vehicle.maxSpeedKmh]);
  let model=models.get(key);
  if(!model){
    model=createModel(vehicle,MOTION_UNITS,{motion:ROAD_MOTION});
    if(models.size>=512)models.clear();models.set(key,model);
  }
  const result={...vehicle,model};
  if(vehicles.size>=512)vehicles.clear();vehicles.set(recordKey,result);
  return result;
}

/** Empty-mass acceleration; braking is omitted and each leg starts from rest. */
export function roadRoundTripMotion(vehicle,{distanceKm,gradePercent=0,roadSpeedLimit=null,routeProfile=null}={}) {
  let train=withRoadModel(vehicle);
  let route=routeProfile?routeProfileForDomain(routeProfile,'road'):null;
  if(route){
    const first=route[0];
    if(route.some(part=>part.gradePercent!==first.gradePercent||part.speedLimitKmh!==first.speedLimitKmh))
      return routeRoundTrip(train,scaledRouteProfile(route,distanceKm));
    gradePercent=first.gradePercent;roadSpeedLimit=first.speedLimitKmh;
  }
  validateGradient(gradePercent);
  if(roadSpeedLimit!=null)train=withRailSpeedLimit(train,roadSpeedLimit);
  const outward=withRailGradient(train,gradePercent),back=withRailGradient(train,-gradePercent);
  if(!outward.model.canStart||!back.model.canStart)return {eligible:false};
  if(!Number.isFinite(distanceKm)||distanceKm<=0)throw new RangeError('Distance must be positive and finite');
  const leg=model=>{
    const travelSeconds=model.timeAt(distanceKm);
    return {travelSeconds,peakSpeedKmh:model.stateAt(travelSeconds).speedKmh};
  };
  const a=leg(outward.model),b=gradePercent?leg(back.model):a;
  return {eligible:true,travelSeconds:(a.travelSeconds+b.travelSeconds)/2,
    outboundTravelSeconds:a.travelSeconds,returnTravelSeconds:b.travelSeconds,
    outboundPeakSpeedKmh:a.peakSpeedKmh,returnPeakSpeedKmh:b.peakSpeedKmh,
    peakSpeedKmh:Math.max(a.peakSpeedKmh,b.peakSpeedKmh)};
}
