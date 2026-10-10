import {validateRouteProfile} from './route-profile.js';
import {sizeFleet} from './service-fleet.js';
import {GAME_YEAR_SECONDS} from './line.js';
import {RAIL_MOTION,gradientAcceleration,MOTION_UNITS} from './gradient.js';

export const RAIL_LINE_TIERS=[{speed:100,maintenance:10000,year:1850},{speed:160,maintenance:30000,year:1930},{speed:350,maintenance:90000,year:1980}];
export const railLineTiers=year=>RAIL_LINE_TIERS.filter(tier=>tier.year<=year);
export const DEDICATED_TRAM_TRACKS={speed:100,maintenance:20000}; // Both directions, not per track.
export const roadLineTiers=year=>year<1940
  ?[{speed:40,maintenance:15000,lanes:[2,4],city:true},{speed:60,maintenance:15000,lanes:[2,4]}]
  :[{speed:50,maintenance:30000,lanes:[2,4],city:true},{speed:80,maintenance:30000,lanes:[2,4]},{speed:100,maintenance:60000,lanes:[2]},{speed:120,maintenance:120000,lanes:[4]}];

export function validateLineInfrastructure(value){
  if(value==null)return null;
  if(typeof value!=='object'||Array.isArray(value))throw new RangeError('Choose valid route infrastructure.');
  return {};
}

/** Preset maxima describe a tier; other values remain hard speed constraints. */
export function segmentLineTiers(part,domain,year){
  const tiers=domain==='rail'?railLineTiers(year):roadLineTiers(year);
  const speed=domain==='rail'?(part.railSpeedConstraintKmh??part.speedLimitKmh):(part.roadSpeedConstraintKmh??part.roadSpeedLimitKmh??part.speedLimitKmh);
  const city=domain==='road'&&(speed===50||(part.roadCity??(year<1940&&speed===40)));
  const preset=domain==='rail'?RAIL_LINE_TIERS:tiers;
  const hardLimit=city||!preset.some(tier=>tier.speed===speed)?speed:Infinity;
  const lanes=part.roadLanes??2;
  const trackCount=part.railTracks??1;
  return tiers.filter(tier=>domain==='rail'||tier.lanes.includes(lanes)&&Boolean(tier.city)===city).map(tier=>({
    tierSpeedKmh:tier.speed,speedLimitKmh:Math.min(tier.speed,hardLimit),speedConstraintKmh:speed,
    ...(domain==='road'?{roadLanes:lanes,city}:{trackCount}),distanceKm:part.distanceKm,
    annualMaintenance:part.distanceKm*tier.maintenance*(domain==='rail'?trackCount:lanes===4&&tier.speed!==120?2:1)
  }));
}

/** Trams cannot use highway tiers, even when a curve lowers their effective speed.
 * Dedicated track upkeep already includes two tracks. With route upkeep disabled,
 * retain the configured speed cap; still enforce physical tram access.
 */
export function segmentTramTiers(part,request){
  const speed=part.roadSpeedConstraintKmh??part.roadSpeedLimitKmh??part.speedLimitKmh;
  const configured=part.roadSpeedLimitKmh??part.speedLimitKmh,kind=part.tramInfrastructure??'auto';
  const city=speed===50||(part.roadCity??(request.year<1940&&speed===40));
  const hardLimit=city||!roadLineTiers(request.year).some(tier=>tier.speed===speed)?speed:Infinity;
  let road=kind==='dedicated'?[]:segmentLineTiers(part,'road',request.year).filter(tier=>tier.tierSpeedKmh<100).map(tier=>({...tier,tramInfrastructure:'road'}));
  if(!request.lineInfrastructure){
    road=road.filter(()=>speed!==100&&speed!==120).map(tier=>({...tier,speedLimitKmh:Math.min(tier.speedLimitKmh,configured),annualMaintenance:0}));
  }
  const dedicated=kind==='road'?[]:[{tierSpeedKmh:100,speedLimitKmh:Math.min(100,hardLimit,...(request.lineInfrastructure?[]:[configured])),speedConstraintKmh:speed,
    distanceKm:part.distanceKm,tramInfrastructure:'dedicated',trackCount:2,annualMaintenance:request.lineInfrastructure?part.distanceKm*DEDICATED_TRAM_TRACKS.maintenance:0}];
  return [...road,...dedicated];
}

export function lineInfrastructurePlan(route,domain,segments){
  const routeProfile=validateRouteProfile(route.map((part,i)=>domain==='rail'
    ?{...part,speedLimitKmh:segments[i].speedLimitKmh,railSpeedConstraintKmh:segments[i].speedConstraintKmh}
    :{...part,roadSpeedLimitKmh:segments[i].speedLimitKmh,roadSpeedConstraintKmh:segments[i].speedConstraintKmh,
      ...(segments[i].roadLanes?{roadLanes:segments[i].roadLanes}:{}),...(segments[i].city!==undefined?{roadCity:segments[i].city}:{}),
      ...(segments[i].tramInfrastructure?{tramInfrastructure:segments[i].tramInfrastructure}:{})}));
  return {domain,segments,routeProfile,annualMaintenance:segments.reduce((total,part)=>total+part.annualMaintenance,0)};
}

/** Without passing loops, one train can use one track; multiple trains need one track per direction. */
export function sizeRailLineTracks(plan,fleet){
  if(plan.domain!=='rail')return plan;
  const segments=plan.segments.map((part,i)=>{
    const trackCount=plan.routeProfile[i].railTracks??(fleet>1?2:1);
    return {...part,trackCount,annualMaintenance:part.annualMaintenance/(part.trackCount??1)*trackCount};
  });
  return {...plan,segments,annualMaintenance:segments.reduce((total,part)=>total+part.annualMaintenance,0)};
}

// Constant maximum tractive force, no power limit/resistance/braking: always optimistic.
function optimisticLegSeconds(route,tiers,vehicle,reverse=false){
  const motion=vehicle.model?.motionConfig??RAIL_MOTION;
  const forceAcceleration=vehicle.tractionKgf*MOTION_UNITS.kgfNewtons*motion.tractionFactor/(vehicle.massTonnes*1000);
  let speed=0,time=0;
  for(let step=0;step<route.length;step++){
    const i=reverse?route.length-1-step:step,part=route[i],cap=Math.min(vehicle.maxSpeedKmh,tiers[i].speedLimitKmh)/3.6;
    const acceleration=forceAcceleration+Math.max(0,-gradientAcceleration(part.gradePercent*(reverse?-1:1))*(motion.gravityFactor??1));
    speed=Math.min(speed,cap);
    const distance=part.distanceKm*1000,toCap=(cap*cap-speed*speed)/(2*acceleration);
    if(distance<=toCap){const finish=Math.sqrt(speed*speed+2*acceleration*distance);time+=(finish-speed)/acceleration;speed=finish;}
    else {time+=(cap-speed)/acceleration+(distance-toCap)/cap;speed=cap;}
  }
  return time;
}

/** Exact search using optimistic motion and fleet-cost bounds, without a heuristic cutoff. */
export function searchLineInfrastructure(request,domain,vehicle,choice,evaluate,compare){
  const options=request.routeProfile.map(part=>{
    const alternatives=domain==='road'&&vehicle.vehicleType==='Tram'?segmentTramTiers(part,request):segmentLineTiers(part,domain,request.year),unique=new Map();
    for(const tier of alternatives){
      const effective=Math.min(vehicle.maxSpeedKmh,tier.speedLimitKmh),previous=unique.get(effective);
      if(!previous||tier.annualMaintenance<previous.annualMaintenance)unique.set(effective,tier);
    }
    return [...unique.values()].sort((a,b)=>a.annualMaintenance-b.annualMaintenance||b.speedLimitKmh-a.speedLimitKmh);
  });
  if(options.some(parts=>!parts.length))return {result:null,rejections:[{rejected:'infrastructure',limitingConstraints:['infrastructure']}]};
  let best=null,fleetModel=null;
  const rejections=[],cache=new Map();
  const check=segments=>{
    const key=segments.map(part=>`${part.tramInfrastructure??domain}:${part.tierSpeedKmh}`).join(',');
    if(cache.has(key))return cache.get(key);
    const plan={...lineInfrastructurePlan(request.routeProfile,domain,segments),costsIncluded:request.lineInfrastructure!==null},evaluation=evaluate(plan);
    cache.set(key,evaluation);fleetModel??=evaluation.fleetModel;
    if(evaluation.result){if(!best||compare(evaluation.result,best)<0)best=evaluation.result;}
    else rejections.push(evaluation);
    return evaluation;
  };
  const cheapest=options.map(parts=>parts[0]),fastest=options.map(parts=>parts.reduce((a,b)=>a.speedLimitKmh>b.speedLimitKmh?a:b));
  check(cheapest);check(fastest);
  // Even infinite speed cannot deliver more than this load per departure at the requested Rate.
  const capacity=request.category==='freight'?vehicle.cargoCapacity:vehicle.passengerCapacity;
  const fill=Math.min(request.fillRatio,request.category==='freight'?Math.min(choice.stopA.warehouseCapacity??Infinity,choice.stopB.warehouseCapacity??Infinity)/capacity:Infinity);
  const deliveries=request.category==='freight'&&request.loadedReturn?2:1;
  if(request.minHeadwaySeconds!==null&&capacity*fill*deliveries*GAME_YEAR_SECONDS/request.rate<request.minHeadwaySeconds-1e-7)return {result:best,rejections};
  const chosen=[];
  const visit=(index,cost)=>{
    let minimumCost=cost;
    const fastestCompletion=[];
    for(let i=0;i<options.length;i++){
      const tier=i<index?chosen[i]:fastest[i];
      fastestCompletion.push(tier);
      if(i>=index)minimumCost+=cheapest[i].annualMaintenance;
    }
    const outbound=optimisticLegSeconds(request.routeProfile,fastestCompletion,vehicle),inbound=optimisticLegSeconds(request.routeProfile,fastestCompletion,vehicle,true);
    if((request.maxOutboundLegSeconds!==null&&outbound>request.maxOutboundLegSeconds+1e-7)||
       (request.maxReturnLegSeconds!==null&&inbound>request.maxReturnLegSeconds+1e-7))return;
    let count=1;
    if(fleetModel){
      count=sizeFleet({...fleetModel,cycleSeconds:outbound+inbound+fleetModel.stationSeconds+fleetModel.transferSeconds},
        {demandPerYear:request.rate*(request.category==='passengers'?2:1),maxHeadwaySeconds:request.maxHeadwaySeconds}).count;
    }
    const lowerCost=count*vehicle.economy.annualMaintenance+(choice.selection?.annualMaintenance??0)+minimumCost;
    if(count>request.maxFleet||best&&lowerCost>best.cost+1e-7)return;
    if(index===options.length){check([...chosen]);return;}
    for(const tier of options[index]){chosen[index]=tier;visit(index+1,cost+tier.annualMaintenance);}
  };
  visit(0,0);
  return {result:best,rejections};
}
