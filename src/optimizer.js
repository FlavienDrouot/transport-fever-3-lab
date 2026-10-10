import {buildConsist,railComponents,tramComponents,lightRailComponents} from './consists.js';
import {mixedLightRailFormations,formationVehicleCostBound} from './optimizer-trams.js';
import {analyseEconomicService} from './rail-freight.js';
import {analyseRoadFleet,matchesFreightFilter,selectRoadVehicles} from './trucks.js';
import {routeProfileDistance,validateRouteProfile} from './route-profile.js';
import {RAIL_PLATFORM_MAX_LENGTH,validateOptimizerInfrastructure,optimizerTrainLengthLimit,optimizerTerminalChoices} from './optimizer-infrastructure.js';
import {validateLineInfrastructure,searchLineInfrastructure,sizeRailLineTracks} from './optimizer-line-infrastructure.js';
import {ROAD_MANEUVER_SECONDS} from './road-terminal-service.js';
import {railTerminalEstimates,RAIL_SWITCH_LENGTH_METRES} from './rail-terminal-service.js';

export const OPTIMIZER_DEFAULTS={domain:'both',includeTrams:false,identicalMUsOnly:true,category:'passengers',cargo:'all',rate:1000,minHeadwaySeconds:null,maxHeadwaySeconds:null,maxLegSeconds:null,maxOutboundLegSeconds:null,maxReturnLegSeconds:null,fillRatio:1,year:2035,ignoreRetirements:true,
  maxTrainLength:RAIL_PLATFORM_MAX_LENGTH,maxRoadTramLength:80,maxLocomotives:2,maxWagons:40,maxFleet:1000,loadedReturn:false,stopA:{},stopB:{},infrastructure:null,lineInfrastructure:null};
export const OPTIMIZER_MAX_TRAIN_LENGTH=RAIL_PLATFORM_MAX_LENGTH;

export function optimizerRequest(input){
  const request={...OPTIMIZER_DEFAULTS,...input,routeProfile:validateRouteProfile(input.routeProfile)};
  if(!['both','rail','road'].includes(request.domain))throw new RangeError('Choose Rail, Road or both.');
  if(!['passengers','freight'].includes(request.category)||!['all','bulk','goods','flatbed','liquid'].includes(request.cargo))throw new RangeError('Choose a supported transport type.');
  const bounds={rate:[.001,1e9],fillRatio:[.01,1],year:[1850,2035],maxTrainLength:[1,OPTIMIZER_MAX_TRAIN_LENGTH],maxRoadTramLength:[1,OPTIMIZER_MAX_TRAIN_LENGTH],maxLocomotives:[1,8],maxWagons:[1,100],maxFleet:[1,100000]};
  for(const [key,[low,high]] of Object.entries(bounds)){
    if(!Number.isFinite(request[key])||request[key]<low||request[key]>high)throw new RangeError(`${key} must be between ${low} and ${high}.`);
    if(['year','maxLocomotives','maxWagons','maxFleet'].includes(key)&&!Number.isInteger(request[key]))throw new RangeError(`${key} must be a whole number.`);
  }
  for(const key of ['minHeadwaySeconds','maxHeadwaySeconds'])if(request[key]!==null&&(!Number.isFinite(request[key])||request[key]<=0))throw new RangeError('Frequency intervals must be positive.');
  if(request.minHeadwaySeconds!==null&&request.maxHeadwaySeconds!==null&&request.minHeadwaySeconds>request.maxHeadwaySeconds)throw new RangeError('Minimum Frequency interval must not exceed the maximum interval.');
  for(const key of ['maxLegSeconds','maxOutboundLegSeconds','maxReturnLegSeconds'])if(request[key]!==null&&(!Number.isFinite(request[key])||request[key]<=0))throw new RangeError('Maximum leg times must be positive.');
  // Older callers may supply one bound for both directions. Explicit null disables a direction.
  for(const key of ['maxOutboundLegSeconds','maxReturnLegSeconds'])if(!Object.hasOwn(input,key))request[key]=request.maxLegSeconds;
  if(typeof request.ignoreRetirements!=='boolean')throw new RangeError('Choose a valid retirement setting.');
  if(typeof request.loadedReturn!=='boolean')throw new RangeError('Choose a valid return load.');
  if(typeof request.includeTrams!=='boolean')throw new RangeError('Choose a valid tram setting.');
  if(typeof request.identicalMUsOnly!=='boolean')throw new RangeError('Choose a valid MU coupling setting.');
  for(const stop of ['stopA','stopB']){
    const facilities=request[stop];
    if(!facilities||typeof facilities!=='object')throw new RangeError('Choose valid facilities.');
    request[stop]=Object.fromEntries(['specializedTerminal','specializedWarehouse'].map(key=>{
      const value=facilities[key]??false;if(typeof value!=='boolean')throw new RangeError('Choose valid facilities.');return [key,value];
    }));
  }
  return {...request,lineInfrastructure:validateLineInfrastructure(request.lineInfrastructure),infrastructure:validateOptimizerInfrastructure(request.infrastructure,request.domain,request.category,{loadedReturn:request.loadedReturn}),distanceKm:routeProfileDistance(request.routeProfile)};
}

function railCatalogue(data){return [...railComponents({locomotives:data.locomotives??[],passengerWagons:data.passengerWagons??[],freightWagons:data.freightWagons??[],multipleUnits:data.trains??[]}),...lightRailComponents([...(data.trams??[]),...(data.freightTrams??[])])];}

/** Rail/Road designs, including length-bounded tram formations and safe mixed-search pruning. */
export function* optimizerCandidates(data,request,{mixedCostCeiling=()=>Infinity,formationCostCeiling=()=>Infinity}={}){
  const freight=request.category==='freight';
  const isAvailable=item=>item.year<=request.year&&(request.ignoreRetirements||item.yearTo==null||item.yearTo===0||request.year<item.yearTo);
  if(request.domain!=='road'){
    const maxTrainLength=optimizerTrainLengthLimit(request);
    const catalogue=railCatalogue(data);
    const available=catalogue.filter(isAvailable);
    const carrying=item=>freight?item.cargoCapacity>0&&matchesFreightFilter(item,request.cargo):item.passengerCapacity>0;
    const definition=(components,name)=>({schemaVersion:1,id:`optimizer:${components.map(c=>`${c.componentId}:${c.quantity}`).join('|')}`,name,carrier:'rail',category:request.category,...(freight?{cargo:request.cargo}:{}),components});
    for(const unit of available.filter(item=>item.role==='powered-carriage'&&carrying(item))){
      if(!Number.isFinite(unit.lengthMetres)||unit.lengthMetres<=0)throw new RangeError(`Invalid trainset length: ${unit.id}`);
      const maximum=Math.floor((maxTrainLength+1e-9)/unit.lengthMetres);
      for(let quantity=1;quantity<=maximum;quantity++)yield {domain:'rail',catalogue,definition:definition([{componentId:unit.id,quantity}],unit.name)};
    }
    for(const engine of available.filter(item=>item.role==='locomotive'))for(const wagon of available.filter(item=>item.role==='wagon'&&carrying(item))){
      for(let engines=1;engines<=request.maxLocomotives;engines++){
        const maximum=Math.min(request.maxWagons,Math.floor((maxTrainLength-engines*engine.lengthMetres+1e-9)/wagon.lengthMetres));
        for(let quantity=1;quantity<=maximum;quantity++)yield {domain:'rail',catalogue,definition:definition([{componentId:engine.id,quantity:engines},{componentId:wagon.id,quantity}],`${engine.name} + ${wagon.name}`.slice(0,120))};
      }
    }
    const costBound=formationVehicleCostBound(request,'rail');
    for(const unit of available.filter(item=>!request.identicalMUsOnly&&item.role==='powered-carriage'&&!item.lightRailCompatible&&carrying(item)))for(const wagon of available.filter(item=>item.role==='wagon'&&carrying(item))){
      const maximumUnits=Math.floor((maxTrainLength-wagon.lengthMetres+1e-9)/unit.lengthMetres);
      for(let quantity=1;quantity<=maximumUnits;quantity++){
        const maximumWagons=Math.min(request.maxWagons,Math.floor((maxTrainLength-quantity*unit.lengthMetres+1e-9)/wagon.lengthMetres));
        for(let wagons=1;wagons<=maximumWagons;wagons++){
          const maintenance=quantity*unit.economy.annualMaintenance+wagons*wagon.economy.annualMaintenance,ceiling=formationCostCeiling('rail',unit.id,wagon.id);
          if(maintenance>ceiling+1e-7)break;
          if(costBound({maintenance,speed:Math.min(unit.maxSpeedKmh,wagon.maxSpeedKmh),capacity:quantity*(freight?unit.cargoCapacity:unit.passengerCapacity)+wagons*(freight?wagon.cargoCapacity:wagon.passengerCapacity),multiplier:quantity*unit.loadingUnloadingSpeedMultiplier+wagons*wagon.loadingUnloadingSpeedMultiplier})>ceiling+1e-7)continue;
          yield {domain:'rail',catalogue,definition:definition([{componentId:unit.id,quantity},{componentId:wagon.id,quantity:wagons}],`${unit.name} + ${wagon.name}`.slice(0,120))};
        }
      }
    }
    if(!request.identicalMUsOnly)for(const components of mixedLightRailFormations(available.filter(item=>item.lightRailCompatible&&carrying(item)),request,maxTrainLength,()=>mixedCostCeiling('rail')))
      yield {domain:'rail',kind:'mixed-light-rail',catalogue,definition:definition(components,'Mixed tram composition')};
  }
  if(request.domain!=='rail'){
    for(const vehicle of selectRoadVehicles({trucks:data.trucks??[],buses:data.buses??[]},{category:request.category,cargo:request.cargo,year:request.year}).filter(isAvailable))yield {domain:'road',vehicle};
    if(request.includeTrams){
      const catalogue=tramComponents({locomotives:data.tramLocomotives??[],passengerWagons:data.tramPassengerWagons??[],freightWagons:data.tramFreightWagons??[],passengerTrams:data.trams??[],freightTrams:data.freightTrams??[]});
      const available=catalogue.filter(isAvailable),carrying=item=>freight?item.cargoCapacity>0&&matchesFreightFilter(item,request.cargo):item.passengerCapacity>0;
      const definition=(components,name)=>({schemaVersion:1,id:`optimizer:${components.map(c=>`${c.componentId}:${c.quantity}`).join('|')}`,name,carrier:'tram',category:request.category,...(freight?{cargo:request.cargo}:{}),components});
      for(const unit of available.filter(item=>item.role==='powered-carriage'&&carrying(item))){
        if(!Number.isFinite(unit.lengthMetres)||unit.lengthMetres<=0)throw new RangeError(`Invalid tram length: ${unit.id}`);
        for(let quantity=1;quantity*unit.lengthMetres<=request.maxRoadTramLength+1e-9;quantity++)yield {domain:'road',catalogue,definition:definition([{componentId:unit.id,quantity}],unit.name)};
      }
      const costBound=formationVehicleCostBound(request,'road');
      for(const engine of available.filter(item=>item.role==='locomotive'||!request.identicalMUsOnly&&item.role==='powered-carriage'&&!item.lightRailCompatible&&carrying(item)))for(const wagon of available.filter(item=>item.role==='wagon'&&carrying(item)))for(let engines=1;engines<=(engine.role==='locomotive'?request.maxLocomotives:Math.floor(request.maxRoadTramLength/engine.lengthMetres));engines++){
        const maximum=Math.min(request.maxWagons,Math.floor((request.maxRoadTramLength-engines*engine.lengthMetres+1e-9)/wagon.lengthMetres));
        for(let quantity=1;quantity<=maximum;quantity++){
          const maintenance=engines*engine.economy.annualMaintenance+quantity*wagon.economy.annualMaintenance,ceiling=formationCostCeiling('road',engine.id,wagon.id);
          if(maintenance>ceiling+1e-7)break;
          if(costBound({maintenance,speed:Math.min(engine.maxSpeedKmh,wagon.maxSpeedKmh),capacity:engines*(freight?engine.cargoCapacity??0:engine.passengerCapacity??0)+quantity*(freight?wagon.cargoCapacity:wagon.passengerCapacity),multiplier:engines*(engine.role==='locomotive'?0:engine.loadingUnloadingSpeedMultiplier)+quantity*wagon.loadingUnloadingSpeedMultiplier})>ceiling+1e-7)continue;
          yield {domain:'road',catalogue,definition:definition([{componentId:engine.id,quantity:engines},{componentId:wagon.id,quantity}],`${engine.name} + ${wagon.name}`.slice(0,120))};
        }
      }
      if(!request.identicalMUsOnly)for(const components of mixedLightRailFormations(available.filter(item=>item.lightRailCompatible&&carrying(item)),request,request.maxRoadTramLength,()=>mixedCostCeiling('road'),'road'))
        yield {domain:'road',kind:'mixed-light-rail',catalogue,definition:definition(components,'Mixed tram composition')};
    }
  }
}

export function evaluateOptimizerCandidate(candidate,data,request){
  let vehicle,definition=null,parts;
  if(candidate.definition){
    definition=candidate.definition;
    vehicle=buildConsist(definition,candidate.catalogue,data.units);
    if(candidate.domain==='road')vehicle={...vehicle,vehicleType:'Tram',loadingUnloadingSpeedMultiplier:vehicle.formationLoadingUnloadingSpeedMultiplier};
    if(!vehicle.serviceReady)return {rejected:'data'};
    parts=definition.components.map(entry=>({name:candidate.catalogue.find(c=>c.id===entry.componentId).name,quantity:entry.quantity}));
  }else{
    vehicle=candidate.vehicle;
    if(request.infrastructure&&(!Number.isFinite(vehicle.lengthMetres)||vehicle.lengthMetres<=0))return {rejected:'data'};
    parts=[{name:vehicle.name,quantity:1}];
  }
  let best=null,rejected='infrastructure';
  const limitingConstraints=new Set(),singleConstraints=new Set();
  for(const choice of optimizerTerminalChoices(request,candidate.domain,vehicle.cargoCapacity,vehicle.lengthMetres,{vehicleType:vehicle.vehicleType,costCeiling:()=>best?best.cost-vehicle.economy.annualMaintenance:Infinity})){
    if(best&&(choice.selection?.annualMaintenance??0)+vehicle.economy.annualMaintenance>best.cost+1e-7)continue;
    if(candidate.domain==='rail'&&vehicle.lengthMetres>choice.maxTrainLength+1e-9)continue;
    const search=request.lineInfrastructure||vehicle.vehicleType==='Tram'&&candidate.domain==='road'?searchLineInfrastructure(request,candidate.domain,vehicle,choice,
      plan=>evaluateOptimizerService(candidate.domain,vehicle,definition,parts,{...request,routeProfile:plan.routeProfile},choice,plan),compareOptimizerResults):null;
    const evaluations=search?[...(search.result?[{result:search.result}]:[]),...search.rejections]:[evaluateOptimizerService(candidate.domain,vehicle,definition,parts,request,choice)];
    for(const evaluation of evaluations)if(evaluation.result){
      if(!best||compareOptimizerResults(evaluation.result,best)<0)best=evaluation.result;
    }else {
      rejected=evaluation.rejected;
      const limits=evaluation.limitingConstraints??[rejected];
      for(const limit of limits)limitingConstraints.add(limit);
      if(limits.length===1&&['minHeadwaySeconds','maxHeadwaySeconds','maxOutboundLegSeconds','maxReturnLegSeconds','maxFleet','rate','fillRatio','stopCapacityA','stopCapacityB','railTerminalGeometry'].includes(limits[0]))singleConstraints.add(limits[0]);
    }
  }
  if(best){
    const powered=definition?candidate.catalogue.find(item=>item.id===definition.components[0].componentId):vehicle;
    const wagon=definition?candidate.catalogue.find(item=>item.id===definition.components[1]?.componentId&&item.role==='wagon'):null;
    best.vehicleType=vehicle.vehicleType??(candidate.domain==='road'?(request.category==='passengers'?'Bus':'Truck'):'Train');
    best.poweredModel=candidate.kind==='mixed-light-rail'?{id:'mixed-light-rail',name:'Mixed tram compositions',role:'powered-carriage',vehicleType:'Tram'}:{id:powered.id,name:powered.name,role:powered.role??'vehicle',vehicleType:best.vehicleType};
    best.wagonModel=wagon?{id:wagon.id,name:wagon.name}:null;
  }
  return best?{result:best}:{rejected,limitingConstraints:[...(limitingConstraints.size?limitingConstraints:new Set([rejected]))],singleConstraints:[...singleConstraints]};
}

function evaluateOptimizerService(domain,vehicle,definition,parts,request,choice,linePlan=null){
  const freight=request.category==='freight';
  const warehouseLimit=freight?Math.min(choice.stopA.warehouseCapacity??Infinity,choice.stopB.warehouseCapacity??Infinity)/vehicle.cargoCapacity:Infinity;
  const options={distanceKm:request.distanceKm,routeProfile:request.routeProfile,fillRatio:Math.min(request.fillRatio,warehouseLimit),
    maxHeadwaySeconds:request.maxHeadwaySeconds,frequencyMode:'maximum',loadedReturn:request.loadedReturn,stopA:choice.stopA,stopB:choice.stopB,
    maneuverSeconds:domain==='road'&&choice.selection?ROAD_MANEUVER_SECONDS:0};
  const service=domain==='rail'?analyseEconomicService(vehicle,{...options,freight,allowMultipleUnits:false,platformLengthMetres:choice.maxTrainLength,
    ...(freight?{demandPerYear:request.rate}:{demandPerDirection:request.rate})}):
    analyseRoadFleet([vehicle],{...options,passenger:!freight,motion:true,demandPerYear:request.rate*(freight?1:2)})[0];
  if(!service||service.eligible===false)return {rejected:'route'};
  const outboundTravelSeconds=service.outboundTravelSeconds??service.travelSeconds,returnTravelSeconds=service.returnTravelSeconds??service.travelSeconds;
  const result={domain,id:vehicle.id,name:vehicle.name,definition,parts,year:vehicle.year,
    length:vehicle.lengthMetres,capacity:freight?vehicle.cargoCapacity:vehicle.passengerCapacity,
    fleet:service.trainCount??service.vehicleCount,cost:service.fleetMaintenance,
    rate:domain==='rail'&&!freight?service.perDirectionJourneysPerYear:service.deliveredPerYear/(freight?1:2),
    frequency:service.headwaySeconds,utilization:service.actualOccupancyRatio??service.actualFillRatio,
    cycle:service.roundTripSeconds,outboundTravelSeconds,returnTravelSeconds,unitCost:service.maintenancePerUnit??service.costPerCargo,
    purchase:vehicle.economy.purchasePrice*(service.trainCount??service.vehicleCount)};
  if(![result.cost,result.rate,result.frequency,result.utilization,result.cycle,result.unitCost,outboundTravelSeconds,returnTravelSeconds].every(Number.isFinite)||result.cost<=0)throw new Error('A service calculation returned invalid values.');
  const transfer=domain==='rail'&&!freight?4*service.loadingSeconds:service.loadingSeconds+service.unloadingSeconds;
  const fleetModel={transferSeconds:transfer/result.utilization*options.fillRatio,
    // Queue estimates depend on headway and route tiers; omit them from optimistic search bounds.
    stationSeconds:Math.max(0,result.cycle-outboundTravelSeconds-returnTravelSeconds-transfer-(service.waitingSecondsA??0)-(service.waitingSecondsB??0)),
    unitsPerCycle:result.capacity*options.fillRatio*(freight?1+Number(request.loadedReturn):2)};
  const limitingConstraints=[];
  const railStops=domain==='rail'&&choice.selection&&['stopA','stopB'].some(stop=>choice[stop].platformTrackCount!=null);
  let terminalEstimates=null;
  if(railStops){
    if(request.distanceKm*1000+1e-7<vehicle.lengthMetres+2*RAIL_SWITCH_LENGTH_METRES)limitingConstraints.push('railTerminalGeometry');
    else {
      terminalEstimates=railTerminalEstimates(vehicle,service,request.routeProfile,choice);
      for(const [stop,suffix] of [['stopA','A'],['stopB','B']])if(terminalEstimates[stop]?.overloaded)limitingConstraints.push(`stopCapacity${suffix}`);
    }
  }
  if(domain==='road')for(const [stop,suffix] of [['stopA','A'],['stopB','B']]){
    if(service[`terminalEstimate${suffix}`]?.overloaded)limitingConstraints.push(`stopCapacity${suffix}`);
  }
  if(result.fleet>request.maxFleet)limitingConstraints.push('maxFleet');
  if(request.maxOutboundLegSeconds!==null&&outboundTravelSeconds>request.maxOutboundLegSeconds+1e-7)limitingConstraints.push('maxOutboundLegSeconds');
  if(request.maxReturnLegSeconds!==null&&returnTravelSeconds>request.maxReturnLegSeconds+1e-7)limitingConstraints.push('maxReturnLegSeconds');
  if(result.rate+Math.max(1,request.rate)*1e-8<request.rate)limitingConstraints.push('rate');
  if(result.utilization>request.fillRatio+1e-8)limitingConstraints.push('fillRatio');
  if(request.maxHeadwaySeconds!==null&&result.frequency>request.maxHeadwaySeconds+1e-7)limitingConstraints.push('maxHeadwaySeconds');
  if(freight&&result.capacity*result.utilization>Math.min(choice.stopA.warehouseCapacity??Infinity,choice.stopB.warehouseCapacity??Infinity)+1e-7)limitingConstraints.push('infrastructure');
  // The calculator chooses the smallest feasible fleet. More vehicles shorten the interval,
  // so a fleet already below the minimum interval cannot be repaired by adding vehicles.
  if(request.minHeadwaySeconds!==null&&result.frequency<request.minHeadwaySeconds-1e-7)limitingConstraints.push('minHeadwaySeconds');
  if(limitingConstraints.length)return {rejected:limitingConstraints.includes('infrastructure')?'infrastructure':limitingConstraints.includes('maxFleet')?'fleet':'service',limitingConstraints,fleetModel};
  result.vehicleRunningCosts=result.cost;
  result.infrastructure=choice.selection;
  if(domain==='road'&&choice.selection){
    result.stopOccupancy={stopA:service.stationSecondsA,stopB:service.stationSecondsB};
    result.stopWaiting={stopA:service.waitingSecondsA,stopB:service.waitingSecondsB};
    result.stopMaxVehiclesPerSecond={stopA:service.terminalEstimateA?.maxVehiclesPerSecond??null,stopB:service.terminalEstimateB?.maxVehiclesPerSecond??null};
    result.maneuverSeconds=ROAD_MANEUVER_SECONDS;
  }
  if(terminalEstimates){
    result.terminalEstimates=terminalEstimates;
    result.stopOccupancy={stopA:service.stationSecondsA??service.stationSeconds,stopB:service.stationSecondsB??service.stationSeconds};
  }
  if(linePlan)linePlan=sizeRailLineTracks(linePlan,result.fleet);
  result.terminalRunningCosts=choice.selection?.annualMaintenance??0;
  result.routeRunningCosts=linePlan?.annualMaintenance??0;
  if(linePlan)result.routeInfrastructure=linePlan;
  result.infrastructureRunningCosts=result.terminalRunningCosts+result.routeRunningCosts;
  result.cost+=result.infrastructureRunningCosts;
  result.unitCost+=result.infrastructureRunningCosts/(result.rate*(freight?1:2));
  return {result,fleetModel};
}

const existingTerminals=result=>result.infrastructure?Number(result.infrastructure.stopA.existing)+Number(result.infrastructure.stopB.existing):0;
export const compareOptimizerResults=(a,b)=>a.cost-b.cost||a.fleet-b.fleet||(a.domain==='road'&&b.domain==='road'?a.cycle-b.cycle:0)||a.length-b.length||a.id.localeCompare(b.id)||existingTerminals(b)-existingTerminals(a);

/** Progress is yielded between candidates so callers can schedule or cancel work. */
export function* optimizeService(data,input,{limit=3}={}){
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new RangeError('Result limit must be between 1 and 1000.');
  const request=optimizerRequest(input),best={rail:[],road:[]},modelGroups={rail:new Map(),road:new Map()},stats={tested:0,feasible:{rail:0,road:0},rejected:{data:0,route:0,fleet:0,service:0,infrastructure:0},rejectedByDomain:{rail:{},road:{}},singleConstraintByDomain:{rail:{},road:{}}};
  const ceiling=(domain,powered,wagon)=>{const variants=modelGroups[domain].get(powered)?.wagons.get(wagon)?.variants;return variants?.length===limit?variants.at(-1).cost:Infinity;};
  for(const candidate of optimizerCandidates(data,request,{mixedCostCeiling:domain=>ceiling(domain,'mixed-light-rail','trainsets'),formationCostCeiling:ceiling})){
    const {result,rejected,limitingConstraints,singleConstraints}=evaluateOptimizerCandidate(candidate,data,request);stats.tested++;
    if(result){
      stats.feasible[result.domain]++;const list=best[result.domain];list.push(result);list.sort(compareOptimizerResults);if(list.length>limit)list.pop();
      {
        const powered=result.poweredModel,group=modelGroups[result.domain].get(powered.id)??{...powered,wagons:new Map()};
        modelGroups[result.domain].set(powered.id,group);
        const wagon=result.wagonModel??{id:'trainsets',name:result.vehicleType==='Tram'?'Complete trams':result.domain==='rail'?'Complete trainsets':'Vehicle'},variants=group.wagons.get(wagon.id)??{...wagon,variants:[]};
        group.wagons.set(wagon.id,variants);
        variants.variants.push(result);variants.variants.sort(compareOptimizerResults);if(variants.variants.length>limit)variants.variants.pop();
      }
    }
    else {
      stats.rejected[rejected]++;
      for(const [counts,limits] of [[stats.rejectedByDomain[candidate.domain],limitingConstraints??[rejected]],[stats.singleConstraintByDomain[candidate.domain],singleConstraints??[]]])for(const limit of limits)counts[limit]=(counts[limit]??0)+1;
    }
    yield {tested:stats.tested,feasible:stats.feasible.rail+stats.feasible.road};
  }
  const groups=Object.fromEntries(['rail','road'].map(domain=>[domain,[...modelGroups[domain].values()].map(group=>({...group,wagons:[...group.wagons.values()].sort((a,b)=>compareOptimizerResults(a.variants[0],b.variants[0]))})).sort((a,b)=>compareOptimizerResults(a.wagons[0].variants[0],b.wagons[0].variants[0]))]));
  return {request,best,groups,stats};
}
