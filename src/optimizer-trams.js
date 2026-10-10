import {GAME_YEAR_SECONDS} from './line.js';
import {sizeFleet} from './service-fleet.js';
import {segmentLineTiers,segmentTramTiers} from './optimizer-line-infrastructure.js';

/** Safe whole-fleet upkeep floor for Rail MU/wagon and Road tram formations. */
export function formationVehicleCostBound(request,domain){
  const caps=request.routeProfile.map(part=>domain==='road'?Math.max(0,...segmentTramTiers(part,request).map(tier=>tier.speedLimitKmh)):
    request.lineInfrastructure?Math.max(...segmentLineTiers(part,'rail',request.year).map(tier=>tier.speedLimitKmh)):part.speedLimitKmh);
  return ({capacity,multiplier,speed,maintenance})=>{
    if(caps.some(cap=>cap<=0))return Infinity;
    const trip=request.routeProfile.reduce((seconds,part,i)=>seconds+part.distanceKm*7200/Math.min(speed,caps[i]),0);
    const freight=request.category==='freight',load=capacity*request.fillRatio,deliveries=freight?request.loadedReturn?2:1:2;
    const transferSeconds=freight?load*(request.loadedReturn?4:2)/(multiplier*.0625*4):4*load/multiplier;
    const pauses=freight?(request.loadedReturn?12:8):12;
    return maintenance*sizeFleet({cycleSeconds:trip+pauses+transferSeconds,transferSeconds,unitsPerCycle:load*deliveries},
      {demandPerYear:request.rate*(freight?1:2),maxHeadwaySeconds:request.maxHeadwaySeconds}).count;
  };
}

/** Enumerate every multiset of confirmed light-rail units within the length bound.
 * A live retained-result ceiling prunes only optimistic vehicle-upkeep bounds.
 * There is no arbitrary unit-count or mixed-model cutoff.
 */
export function* mixedLightRailFormations(items,request,maxLength,costCeiling=()=>Infinity,domain='rail'){
  if(items.length<2)return;
  const shortest=Math.min(...items.map(item=>item.lengthMetres));
  const fastest=Math.max(...items.map(item=>item.maxSpeedKmh));
  const caps=request.routeProfile.map(part=>domain==='road'?Math.max(0,...segmentTramTiers(part,request).map(tier=>tier.speedLimitKmh)):
    request.lineInfrastructure?Math.max(...segmentLineTiers(part,'rail',request.year).map(tier=>tier.speedLimitKmh)):part.speedLimitKmh);
  if(caps.some(cap=>cap<=0))return;
  const minimumTrip=speed=>request.routeProfile.reduce((seconds,part,i)=>seconds+part.distanceKm*7200/Math.min(speed,caps[i]),0);
  const deliveryFactor=request.category==='passengers'?2:request.loadedReturn?2:1;
  const flow=request.rate*(request.category==='passengers'?2:1)/GAME_YEAR_SECONDS;
  const parts=[];
  function* visit(index,left,length,maintenance,capacity,multiplier,speed){
    const tripMinimum=minimumTrip(speed);
    if(request.maxOutboundLegSeconds!==null&&tripMinimum/2>request.maxOutboundLegSeconds+1e-7||request.maxReturnLegSeconds!==null&&tripMinimum/2>request.maxReturnLegSeconds+1e-7)return;
    if(index===items.length){
      if(left!==0||parts.length<2||maintenance>costCeiling()+1e-7)return;
      const freight=request.category==='freight',load=capacity*request.fillRatio;
      // Instant acceleration/braking, fastest legal segment tiers and best possible
      // freight handling bonuses give an optimistic lower bound on fleet upkeep.
      const transferSeconds=freight?load*(request.loadedReturn?4:2)/(multiplier*.0625*4):4*load/multiplier;
      const pauses=freight?(request.loadedReturn?12:8):12;
      const fleet=sizeFleet({cycleSeconds:tripMinimum+pauses+transferSeconds,transferSeconds,unitsPerCycle:load*deliveryFactor},
        {demandPerYear:request.rate*(freight?1:2),maxHeadwaySeconds:request.maxHeadwaySeconds}).count;
      if(fleet<=request.maxFleet&&maintenance*fleet<=costCeiling()+1e-7)yield parts.map(part=>({...part}));
      return;
    }
    const remaining=items.slice(index);
    if(length+left*Math.min(...remaining.map(item=>item.lengthMetres))>maxLength+1e-9)return;
    const maxCapacity=capacity+Math.max(0,maxLength-length)*Math.max(...remaining.map(item=>(item.passengerCapacity??item.cargoCapacity)/item.lengthMetres));
    const minCount=Math.max(1,Math.ceil(flow*tripMinimum/(maxCapacity*deliveryFactor)-1e-10),request.maxHeadwaySeconds===null?1:Math.ceil(tripMinimum/request.maxHeadwaySeconds-1e-10));
    const minimumMaintenance=maintenance+left*Math.min(...remaining.map(item=>item.economy.annualMaintenance));
    if(minCount>request.maxFleet||minimumMaintenance*minCount>costCeiling()+1e-7)return;
    const headwayDeliveries=request.category==='passengers'?1:deliveryFactor;
    if(request.minHeadwaySeconds!==null&&maxCapacity*request.fillRatio*headwayDeliveries*GAME_YEAR_SECONDS/request.rate<request.minHeadwaySeconds-1e-7)return;
    const item=items[index],maximum=Math.min(left,Math.floor((maxLength-length+1e-9)/item.lengthMetres));
    for(let quantity=0;quantity<=maximum;quantity++){
      if(quantity)parts.push({componentId:item.id,quantity});
      yield* visit(index+1,left-quantity,length+quantity*item.lengthMetres,maintenance+quantity*item.economy.annualMaintenance,capacity+quantity*(item.passengerCapacity??item.cargoCapacity),
        multiplier+quantity*item.loadingUnloadingSpeedMultiplier,quantity?Math.min(speed,item.maxSpeedKmh):speed);
      if(quantity)parts.pop();
    }
  }
  for(let count=2;count<=Math.floor((maxLength+1e-9)/shortest);count++)yield* visit(0,count,0,0,0,0,fastest);
}
