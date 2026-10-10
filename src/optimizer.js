import {buildConsist,railComponents} from './consists.js';
import {analyseEconomicService} from './rail-freight.js';
import {analyseRoadFleet,matchesFreightFilter,selectRoadVehicles} from './trucks.js';
import {routeProfileDistance,validateRouteProfile} from './route-profile.js';

export const OPTIMIZER_DEFAULTS={domain:'both',category:'passengers',cargo:'all',rate:1000,minHeadwaySeconds:null,maxHeadwaySeconds:300,fillRatio:1,year:2035,ignoreRetirements:false,
  maxTrainLength:320,maxLocomotives:2,maxWagons:40,maxFleet:1000,loadedReturn:false,stopA:{},stopB:{}};

export function optimizerRequest(input){
  const request={...OPTIMIZER_DEFAULTS,...input,routeProfile:validateRouteProfile(input.routeProfile)};
  if(!['both','rail','road'].includes(request.domain))throw new RangeError('Choose Rail, Road or both.');
  if(!['passengers','freight'].includes(request.category)||!['all','bulk','goods','flatbed','liquid'].includes(request.cargo))throw new RangeError('Choose a supported transport type.');
  const bounds={rate:[.001,1e9],fillRatio:[.01,1],year:[1850,2035],maxTrainLength:[1,2000],maxLocomotives:[1,8],maxWagons:[1,100],maxFleet:[1,100000]};
  for(const [key,[low,high]] of Object.entries(bounds)){
    if(!Number.isFinite(request[key])||request[key]<low||request[key]>high)throw new RangeError(`${key} must be between ${low} and ${high}.`);
    if(['year','maxLocomotives','maxWagons','maxFleet'].includes(key)&&!Number.isInteger(request[key]))throw new RangeError(`${key} must be a whole number.`);
  }
  for(const key of ['minHeadwaySeconds','maxHeadwaySeconds'])if(request[key]!==null&&(!Number.isFinite(request[key])||request[key]<=0))throw new RangeError('Frequency intervals must be positive.');
  if(request.minHeadwaySeconds!==null&&request.maxHeadwaySeconds!==null&&request.minHeadwaySeconds>request.maxHeadwaySeconds)throw new RangeError('Minimum Frequency interval must not exceed the maximum interval.');
  if(typeof request.ignoreRetirements!=='boolean')throw new RangeError('Choose a valid retirement setting.');
  if(typeof request.loadedReturn!=='boolean')throw new RangeError('Choose a valid return load.');
  for(const stop of ['stopA','stopB']){
    const facilities=request[stop];
    if(!facilities||typeof facilities!=='object')throw new RangeError('Choose valid facilities.');
    request[stop]=Object.fromEntries(['specializedTerminal','specializedWarehouse'].map(key=>{
      const value=facilities[key]??false;if(typeof value!=='boolean')throw new RangeError('Choose valid facilities.');return [key,value];
    }));
  }
  return {...request,distanceKm:routeProfileDistance(request.routeProfile)};
}

function railCatalogue(data){return railComponents({locomotives:data.locomotives,passengerWagons:data.passengerWagons,freightWagons:data.freightWagons,multipleUnits:data.trains});}

/** Exhaustive homogeneous designs within the stated integer/length/year bounds. */
export function* optimizerCandidates(data,request){
  const freight=request.category==='freight';
  const isAvailable=item=>item.year<=request.year&&(request.ignoreRetirements||item.yearTo==null||item.yearTo===0||request.year<item.yearTo);
  if(request.domain!=='road'){
    const catalogue=railCatalogue(data);
    const available=catalogue.filter(isAvailable);
    const carrying=item=>freight?item.cargoCapacity>0&&matchesFreightFilter(item,request.cargo):item.passengerCapacity>0;
    const definition=(components,name)=>({schemaVersion:1,id:`optimizer:${components.map(c=>`${c.componentId}:${c.quantity}`).join('|')}`,name,carrier:'rail',category:request.category,...(freight?{cargo:request.cargo}:{}),components});
    for(const unit of available.filter(item=>item.role==='powered-carriage'&&carrying(item))){
      if(!Number.isFinite(unit.lengthMetres)||unit.lengthMetres<=0)throw new RangeError(`Invalid trainset length: ${unit.id}`);
      const maximum=Math.floor((request.maxTrainLength+1e-9)/unit.lengthMetres);
      for(let quantity=1;quantity<=maximum;quantity++)yield {domain:'rail',catalogue,definition:definition([{componentId:unit.id,quantity}],unit.name)};
    }
    for(const engine of available.filter(item=>item.role==='locomotive'))for(const wagon of available.filter(item=>item.role==='wagon'&&carrying(item))){
      for(let engines=1;engines<=request.maxLocomotives;engines++){
        const maximum=Math.min(request.maxWagons,Math.floor((request.maxTrainLength-engines*engine.lengthMetres+1e-9)/wagon.lengthMetres));
        for(let quantity=1;quantity<=maximum;quantity++)yield {domain:'rail',catalogue,definition:definition([{componentId:engine.id,quantity:engines},{componentId:wagon.id,quantity}],`${engine.name} + ${wagon.name}`.slice(0,120))};
      }
    }
  }
  if(request.domain!=='rail')for(const vehicle of selectRoadVehicles({trucks:data.trucks??[],buses:data.buses??[]},{category:request.category,cargo:request.cargo,year:request.year}).filter(isAvailable))yield {domain:'road',vehicle};
}

export function evaluateOptimizerCandidate(candidate,data,request){
  const freight=request.category==='freight';
  const options={distanceKm:request.distanceKm,routeProfile:request.routeProfile,fillRatio:request.fillRatio,
    maxHeadwaySeconds:request.maxHeadwaySeconds,frequencyMode:'maximum',loadedReturn:request.loadedReturn,stopA:request.stopA,stopB:request.stopB};
  let vehicle,service,definition=null,parts;
  if(candidate.domain==='rail'){
    definition=candidate.definition;
    vehicle=buildConsist(definition,candidate.catalogue,data.units);
    if(!vehicle.serviceReady)return {rejected:'data'};
    service=analyseEconomicService(vehicle,{...options,freight,allowMultipleUnits:false,platformLengthMetres:request.maxTrainLength,
      ...(freight?{demandPerYear:request.rate}:{demandPerDirection:request.rate})});
    if(!service.eligible)return {rejected:'route'};
    parts=definition.components.map(entry=>({name:candidate.catalogue.find(c=>c.id===entry.componentId).name,quantity:entry.quantity}));
  }else{
    vehicle=candidate.vehicle;
    service=analyseRoadFleet([vehicle],{...options,passenger:!freight,motion:true,demandPerYear:request.rate*(freight?1:2)})[0];
    if(!service)return {rejected:'route'};
    parts=[{name:vehicle.name,quantity:1}];
  }
  const result={domain:candidate.domain,id:vehicle.id,name:vehicle.name,definition,parts,year:vehicle.year,
    length:vehicle.lengthMetres,capacity:freight?vehicle.cargoCapacity:vehicle.passengerCapacity,
    fleet:service.trainCount??service.vehicleCount,cost:service.fleetMaintenance,
    rate:candidate.domain==='rail'&&!freight?service.perDirectionJourneysPerYear:service.deliveredPerYear/(freight?1:2),
    frequency:service.headwaySeconds,utilization:service.actualOccupancyRatio??service.actualFillRatio,
    cycle:service.roundTripSeconds,unitCost:service.maintenancePerUnit??service.costPerCargo,
    purchase:vehicle.economy.purchasePrice*(service.trainCount??service.vehicleCount)};
  if(result.fleet>request.maxFleet)return {rejected:'fleet'};
  if(![result.cost,result.rate,result.frequency,result.utilization,result.cycle,result.unitCost].every(Number.isFinite)||result.cost<=0)throw new Error('A service calculation returned invalid values.');
  if(result.rate+Math.max(1,request.rate)*1e-8<request.rate||result.utilization>request.fillRatio+1e-8||request.maxHeadwaySeconds!==null&&result.frequency>request.maxHeadwaySeconds+1e-7)return {rejected:'service'};
  // The calculator chooses the smallest feasible fleet. More vehicles shorten the interval,
  // so a fleet already below the minimum interval cannot be repaired by adding vehicles.
  if(request.minHeadwaySeconds!==null&&result.frequency<request.minHeadwaySeconds-1e-7)return {rejected:'service'};
  return {result};
}

export const compareOptimizerResults=(a,b)=>a.cost-b.cost||a.fleet-b.fleet||a.length-b.length||a.id.localeCompare(b.id);

/** Progress is yielded between candidates so callers can schedule or cancel work. */
export function* optimizeService(data,input,{limit=3}={}){
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new RangeError('Result limit must be between 1 and 1000.');
  const request=optimizerRequest(input),best={rail:[],road:[]},stats={tested:0,feasible:{rail:0,road:0},rejected:{data:0,route:0,fleet:0,service:0}};
  for(const candidate of optimizerCandidates(data,request)){
    const {result,rejected}=evaluateOptimizerCandidate(candidate,data,request);stats.tested++;
    if(result){stats.feasible[result.domain]++;const list=best[result.domain];list.push(result);list.sort(compareOptimizerResults);if(list.length>limit)list.pop();}
    else stats.rejected[rejected]++;
    yield {tested:stats.tested,feasible:stats.feasible.rail+stats.feasible.road};
  }
  return {request,best,stats};
}
