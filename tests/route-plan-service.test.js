import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRoutePlan,newRouteStop,newRouteBuilding,validateRoutePlan} from '../src/route-plan.js';
import {declaredSegmentFields,declaredRouteProfile,withoutDeclaredLineChoices,mergeUndeclaredLineChoices,declaredService,declaredLoadNames,declaredServiceText,declaredEndpointModel,declaredPlatformLength,declaredHandling,declarationReport,declaredServiceInputs} from '../src/route-plan-service.js';
import {optimizerRequest,optimizerCandidates,evaluateOptimizerCandidate} from '../src/optimizer.js';
import {optimizerInfrastructureValue,optimizerTrainLengthLimit,validateOptimizerInfrastructure} from '../src/optimizer-infrastructure.js';

const segment={distanceKm:2,gradePercent:1,speedLimitKmh:350,roadSpeedLimitKmh:120};
const coal={id:'good:coal',name:'Coal',type:'bulk'},grain={id:'good:grain',name:'Grain',type:'bulk'};
const operation=(stop,cargoId,action,value,{mode='year',direction='outbound',building=null}={})=>stop.operations.push({id:`operation:${stop.operations.length}-${stop.id}`,buildingId:building?.id??null,cargoId,action,direction,quantity:{mode,value}});
function freightPlan({back=0,backMode='year'}={}){
  const plan=createRoutePlan([segment,segment],'Coal');plan.goods=[coal];
  operation(plan.stops[0],coal.id,'load',6000);operation(plan.stops[1],coal.id,'unload',100,{mode:'percent'});
  if(back){operation(plan.stops[1],coal.id,'load',back,{mode:backMode,direction:'return'});operation(plan.stops[0],coal.id,'unload',100,{mode:'percent',direction:'return'});}
  return plan;
}
const bounds=Object.fromEntries(['stopA','stopB'].map(stop=>[stop,{maxTrainLength:840,maxPlatformTracks:2,maxPlatformLength:40,maxPlatforms:2,allowSpecialization:true,allowBusStop:true}]));

test('a declared tier caps the segment speed; tracks, lanes and Tram access qualify declared tiers only',()=>{
  const plan=createRoutePlan([segment,segment,segment]);
  plan.segmentAssets[0]={railTier:160,railTracks:2,roadTier:50,roadLanes:2,tramTracks:'road'};
  plan.segmentAssets[1]={railTier:null,railTracks:2,roadTier:null,roadLanes:4,tramTracks:'dedicated'};
  plan.segmentAssets[2]={railTier:100,railTracks:1,roadTier:120,roadLanes:4,tramTracks:'none'};
  const route=declaredRouteProfile(plan.segments,plan);
  assert.deepEqual(route[0],{...segment,speedLimitKmh:160,roadSpeedLimitKmh:50,railTracks:2,roadLanes:2,roadCity:true,tramInfrastructure:'road'});
  assert.deepEqual(route[1],{...segment,tramInfrastructure:'dedicated'});
  assert.deepEqual(route[2],{...segment,speedLimitKmh:100,roadLanes:4,roadCity:false});
  assert.deepEqual(declaredSegmentFields(plan).map(f=>[f.rail,f.railTracks,f.road,f.roadLanes,f.tram]),[[true,true,true,true,true],[false,false,false,false,true],[true,false,true,true,false]]);
  assert.deepEqual(plan.segments[0],segment);
});

test('a declared tier also lowers an existing hard constraint and never raises a slower geometry limit',()=>{
  const plan=createRoutePlan([{...segment,speedLimitKmh:80,railSpeedConstraintKmh:350,roadSpeedLimitKmh:60,roadSpeedConstraintKmh:60}]);
  plan.segmentAssets[0]={railTier:160,railTracks:2,roadTier:80,roadLanes:2,tramTracks:'none'};
  const [part]=declaredRouteProfile(plan.segments,plan);
  assert.equal(part.speedLimitKmh,80);assert.equal(part.railSpeedConstraintKmh,160);assert.equal(part.roadSpeedLimitKmh,60);assert.equal(part.roadSpeedConstraintKmh,60);
});

test('a route that no longer matches the declaration is returned unchanged',()=>{
  const plan=createRoutePlan([segment,segment]);plan.segmentAssets[0].railTier=100;
  const other=[segment];
  assert.deepEqual(declaredRouteProfile(other,plan),other);
});

test('line choices made elsewhere never copy declared values into the stored route',()=>{
  const plan=createRoutePlan([segment,segment]);
  plan.segmentAssets[0]={railTier:160,railTracks:2,roadTier:80,roadLanes:4,tramTracks:'dedicated'};
  const raw=plan.segments,effective=declaredRouteProfile(raw,plan);
  assert.deepEqual(mergeUndeclaredLineChoices(raw,effective,plan),raw);
  const edited=effective.map((part,i)=>i?{...part,railTracks:2,roadLanes:4,tramInfrastructure:'road'}:part);
  assert.deepEqual(mergeUndeclaredLineChoices(raw,edited,plan),[raw[0],{...raw[1],railTracks:2,roadLanes:4,tramInfrastructure:'road'}]);
  const proposal=effective.map(part=>({...part,speedLimitKmh:100}));
  assert.deepEqual(withoutDeclaredLineChoices(proposal,raw,plan),[{...raw[0],speedLimitKmh:100,roadSpeedLimitKmh:80},{...raw[1],speedLimitKmh:100}]);
});

test('annual flows become a Rate, and freight coming back means a loaded return',()=>{
  assert.equal(declaredService(createRoutePlan([segment])).status,'none');
  const outbound=declaredService(freightPlan());
  assert.deepEqual([outbound.status,outbound.rate,outbound.loadedReturn,outbound.goodName],['applied',6000,false,'Coal']);
  const loaded=declaredService(freightPlan({back:6000}));
  assert.deepEqual([loaded.status,loaded.rate,loaded.loadedReturn],['applied',12000,true]);
  const percent=freightPlan();percent.stops[0].operations[0].quantity.value=1000.2;
  assert.equal(declaredService(percent).rate,1001);
});

test('unsupported service shapes are reported instead of guessed',()=>{
  const asymmetric=declaredService(freightPlan({back:2000}));
  assert.equal(asymmetric.status,'unsupported');assert.match(asymmetric.issues[0],/equal loads/);
  const reverse=freightPlan();reverse.stops[0].operations=[];reverse.stops[1].operations=[];
  operation(reverse.stops[1],coal.id,'load',500,{direction:'return'});operation(reverse.stops[0],coal.id,'unload',100,{mode:'percent',direction:'return'});
  assert.match(declaredService(reverse).issues[0],/B → A leg only/);
  const visits=freightPlan();visits.stops[0].operations[0].quantity={mode:'visit',value:20};
  const visit=declaredService(visits);assert.equal(visit.status,'unsupported');assert.match(visit.issues[0],/per visit/);
  const mixed=freightPlan();operation(mixed.stops[0],coal.id,'load',20,{mode:'visit'});
  const kept=declaredService(mixed);assert.equal(kept.status,'applied');assert.match(kept.issues[0],/per visit/);
  const intermediate=freightPlan();intermediate.stops.splice(1,0,newRouteStop(1,'Halt'));
  assert.match(declaredService(intermediate).issues[0],/Intermediate stops/);
  const several=freightPlan();several.goods.push(grain);operation(several.stops[0],grain.id,'load',500);
  assert.match(declaredService(several).issues[0],/Several goods/);
});

test('a building is the one an endpoint operation names; several candidates are not guessed',()=>{
  const plan=freightPlan();
  const mine=newRouteBuilding('Mine','factory');mine.industryTerminals=3;mine.storage=[{id:'stock:coal',cargoId:coal.id,inputCapacity:200,outputCapacity:1600}];
  const depot=newRouteBuilding('Depot','warehouse');depot.warehouseCapacity=1500;
  plan.stops[0].buildings=[mine];plan.stops[1].buildings=[depot];
  const model=declaredEndpointModel(plan,{category:'freight'});
  assert.deepEqual([model.sites.stopA.type,model.sites.stopA.factoryTerminals,model.sites.stopA.outputStorageCapacity,model.sites.stopA.inputStorageCapacity],['factory',3,1600,200]);
  assert.deepEqual([model.sites.stopB.type,model.sites.stopB.warehouseCapacity,model.sites.stopB.maxWarehouseCapacity,model.sites.stopB.existingSpecializedWarehouse,model.sites.stopB.allowWarehouseSpecialization],['warehouse',1500,1500,false,true]);
  assert.deepEqual(model.issues,[]);
  plan.stops[0].buildings.push(newRouteBuilding('Second mine','factory'));
  plan.stops[0].operations.push({...plan.stops[0].operations[0],id:'operation:second',buildingId:plan.stops[0].buildings[1].id});
  plan.stops[0].operations[0].buildingId=mine.id;
  const ambiguous=declaredEndpointModel(plan,{category:'freight'});
  assert.equal(ambiguous.sites.stopA.type,'industrial');assert.match(ambiguous.issues[0],/several buildings/);
  assert.equal(declaredEndpointModel(createRoutePlan([segment]),{category:'freight'}),null);
});

test('reusable endpoint terminals use the Optimizer defaults for permissions and honour bus stop rules',()=>{
  const plan=freightPlan();
  plan.stops[0].infrastructure=[{id:'infra:rail',kind:'railPlatform',length:200,tracks:2,platforms:1,specialized:false},{id:'infra:road',kind:'roadPlatform',length:30,platforms:2,specialized:true},{id:'infra:station',kind:'roadStation'}];
  plan.stops[1].infrastructure=[{id:'infra:bus',kind:'busStop'}];plan.stops[1].buildings=[newRouteBuilding('Depot','warehouse')];
  const freight=declaredEndpointModel(plan,{category:'freight'});
  assert.deepEqual(freight.entries.map(e=>[e.id,e.stop,e.domain,e.kind]),[['infra:rail','stopA','rail','platform'],['infra:road','stopA','road','platform'],['infra:station','stopA','road','station']]);
  assert.match(freight.issues[0],/bus stop/);
  const [rail,road]=freight.entries;
  assert.deepEqual([rail.existingLength,rail.maxTrainLength,rail.platformTrackCount,rail.railPlatformCount,rail.allowExtension,rail.allowParallelTracks,rail.allowSpecialization,rail.specializedTerminal],[200,200,2,1,false,false,true,false]);
  assert.deepEqual([road.platformLength,road.platformCount,road.maxPlatformLength,road.maxPlatforms,road.specializedTerminal],[30,2,30,2,true]);
  const passengers=declaredEndpointModel(plan,{category:'passengers'});
  assert.equal(passengers.entries.at(-1).kind,'busStop');assert.deepEqual(passengers.issues,[]);
  const industrial=freightPlan();industrial.stops[1].buildings=[newRouteBuilding('Works','industrial')];
  industrial.stops[1].infrastructure=[{id:'infra:bus',kind:'busStop'}];
  assert.equal(declaredEndpointModel(industrial,{category:'freight'}).entries[0].kind,'busStop');
  assert.match(declaredEndpointModel(industrial,{category:'freight',loadedReturn:true}).issues[0],/bus stop/);
});

test('declared terminals are capped at the number the Optimizer accepts per stop and domain',()=>{
  const plan=freightPlan();
  plan.stops[0].infrastructure=Array.from({length:10},(_,i)=>({id:`infra:${i}`,kind:'railStation'}));
  const model=declaredEndpointModel(plan,{category:'passengers'});
  assert.equal(model.entries.length,8);assert.match(model.issues[0],/first 8/);
  const request=optimizerRequest({routeProfile:[segment],domain:'rail',infrastructure:optimizerInfrastructureValue({sites:model.sites,bounds,entries:model.entries,scope:{domain:'rail',category:'passengers',loadedReturn:false,includeTrams:false}})});
  assert.equal(request.infrastructure.rail.stopA.length,8);
});

test('the shared builder reproduces what the manual controls send',()=>{
  const sites={stopA:{type:'factory',factoryTerminals:3,inputStorageCapacity:100,outputStorageCapacity:800,existingSpecializedWarehouse:false,allowWarehouseSpecialization:true,allowWarehouseExpansion:false,warehouseCapacity:500,maxWarehouseCapacity:1000},
    stopB:{type:'warehouse',factoryTerminals:2,inputStorageCapacity:100,outputStorageCapacity:800,existingSpecializedWarehouse:true,allowWarehouseSpecialization:false,allowWarehouseExpansion:true,warehouseCapacity:1000,maxWarehouseCapacity:3000}};
  const value=optimizerInfrastructureValue({limitVehicleCapacity:false,sites,bounds,entries:[],scope:{domain:'both',category:'freight',loadedReturn:false,includeTrams:true}});
  assert.equal(value.limitVehicleCapacity,false);
  assert.deepEqual(value.sites.stopA,{type:'factory',warehouseCapacity:500,factoryTerminals:3,outputStorageCapacity:800,maxWarehouseCapacity:500,existingSpecializedWarehouse:false,warehouseSpecialization:'optimize'});
  assert.deepEqual(value.sites.stopB,{type:'warehouse',warehouseCapacity:1000,maxWarehouseCapacity:3000,existingSpecializedWarehouse:true,warehouseSpecialization:'specialized'});
  assert.deepEqual(value.road.stopA,[{mode:'factory'},{mode:'new',...bounds.stopA,allowBusStop:false,tramOnly:true}]);
  assert.deepEqual(value.road.stopB,{mode:'new',...bounds.stopB,allowBusStop:false});
  assert.deepEqual(value.rail.stopA,{mode:'new',...bounds.stopA,allowBusStop:false});
  const passengers=optimizerInfrastructureValue({sites,bounds,entries:[],scope:{domain:'road',category:'passengers',loadedReturn:false,includeTrams:false}});
  assert.deepEqual(passengers.sites,{stopA:{type:'industrial'},stopB:{type:'industrial'}});assert.equal(passengers.road.stopA.allowBusStop,true);assert.equal(passengers.rail,undefined);
  assert.ok(optimizerRequest({routeProfile:[segment],domain:'both',category:'freight',infrastructure:value}).infrastructure);
});

test('the declared platform length and specialized terminals feed the service controls',()=>{
  const plan=freightPlan();
  assert.equal(declaredPlatformLength(plan),null);
  plan.stops[0].infrastructure=[{id:'a1',kind:'railPlatform',length:200,tracks:1,platforms:1,specialized:false},{id:'a2',kind:'railPlatform',length:400,tracks:1,platforms:1,specialized:true}];
  assert.equal(declaredPlatformLength(plan),400);
  plan.stops[1].infrastructure=[{id:'b1',kind:'railPlatform',length:120,tracks:1,platforms:1,specialized:false},{id:'b2',kind:'roadPlatform',length:20,platforms:1,specialized:true}];
  assert.equal(declaredPlatformLength(plan),120);
  assert.deepEqual(declaredHandling(plan,{domain:'rail'}),{stopA:{specializedTerminal:true},stopB:{specializedTerminal:false}});
  assert.deepEqual(declaredHandling(plan,{domain:'road'}),{stopA:{specializedTerminal:false},stopB:{specializedTerminal:true}});
  const works=freightPlan();works.stops[0].buildings=[newRouteBuilding('Mine','factory')];
  assert.equal(declaredHandling(works,{domain:'road'}).stopA.specializedTerminal,true);
  assert.equal(declaredHandling(works,{domain:'road',includeTrams:true}).stopA.specializedTerminal,false);
  assert.equal(declaredHandling(works,{domain:'rail'}).stopA.specializedTerminal,false);
});

test('Compare and Composition receive the Rate and return only for Freight',()=>{
  const plan=freightPlan({back:6000});
  assert.deepEqual(declaredServiceInputs(plan,{category:'freight'}),{rate:12000,loadedReturn:true,cargo:'bulk',platformLengthMetres:null,specializedTerminals:{rail:{stopA:{specializedTerminal:false},stopB:{specializedTerminal:false}},road:{stopA:{specializedTerminal:false},stopB:{specializedTerminal:false}}}});
  const passengers=declaredServiceInputs(plan,{category:'passengers'});
  assert.deepEqual([passengers.rate,passengers.loadedReturn,passengers.specializedTerminals.rail],[null,null,null]);
});

test('the report lists what analyses use and what remains descriptive',()=>{
  const plan=freightPlan();
  plan.segmentAssets[0].railTier=100;plan.segmentAssets[0].railTracks=1;
  plan.stops[0].buildings=[Object.assign(newRouteBuilding('Mine','factory'),{recipe:{inputs:[{id:'r1',cargoId:coal.id,ratio:1}],outputs:[{id:'r2',cargoId:coal.id,ratio:1}]}})];
  const report=declarationReport(plan);
  assert.ok(report.used.some(item=>/speed ceilings/.test(item.text)));
  assert.ok(report.used.some(item=>/Rate 6,000/.test(item.text)&&item.views.includes('optimizer')));
  assert.ok(report.issues.some(issue=>/single existing Rail track/.test(issue)));
  assert.ok(report.issues.some(issue=>/recipes/.test(issue)));
  assert.deepEqual(declarationReport(createRoutePlan([segment])),{service:{status:'none',issues:[]},used:[],issues:[]});
  const halt=freightPlan();halt.stops.splice(1,0,newRouteStop(1,'Halt'));
  assert.equal(declarationReport(halt).issues.filter(issue=>/Intermediate stops/.test(issue)).length,1);
});

const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [trains,trucks]=await Promise.all(['trains','trucks'].map(read));
const data={units:trains.source,trains:trains.trains.filter(t=>t.id==='draisine'),locomotives:[],passengerWagons:[],freightWagons:[],trucks:[trucks.trucks.find(t=>t.id==='man-19304')],buses:[]};

test('declared platforms and Industry terminals reach the Optimizer as reusable, existing infrastructure',()=>{
  const plan=freightPlan();
  plan.stops[0].infrastructure=[{id:'a-rail',kind:'railPlatform',length:40,tracks:1,platforms:1,specialized:false},{id:'a-road',kind:'roadPlatform',length:20,platforms:1,specialized:true}];
  plan.stops[1].infrastructure=[{id:'b-rail',kind:'railPlatform',length:80,tracks:1,platforms:1,specialized:false},{id:'b-road',kind:'roadPlatform',length:20,platforms:1,specialized:false}];
  const scope={domain:'both',category:'freight',loadedReturn:false,includeTrams:false};
  const model=declaredEndpointModel(plan,scope);
  const input={routeProfile:declaredRouteProfile(plan.segments,plan),domain:'both',category:'freight',rate:50,infrastructure:optimizerInfrastructureValue({sites:model.sites,bounds,entries:model.entries,scope})};
  const request=optimizerRequest(input);
  assert.equal(optimizerTrainLengthLimit(request),40);
  const road=[...optimizerCandidates(data,{...request,domain:'road'})][0];
  const result=evaluateOptimizerCandidate(road,data,{...request,domain:'road'}).result;
  assert.ok(result);
  assert.equal(result.infrastructure.stopA.existing,true);assert.equal(result.infrastructure.stopA.specializedTerminal,true);
  assert.equal(result.infrastructure.stopB.existing,true);assert.equal(result.infrastructure.stopA.platformLengths[0],20);
  assert.equal(result.infrastructure.stopA.addedRunningCosts,0);
});

test('the declared route profile is a valid Optimizer route with Road lanes and Tram access',()=>{
  const plan=createRoutePlan([segment]);plan.segmentAssets[0]={railTier:null,railTracks:2,roadTier:80,roadLanes:4,tramTracks:'dedicated'};
  const request=optimizerRequest({routeProfile:declaredRouteProfile(plan.segments,plan),domain:'road',category:'passengers',lineInfrastructure:{}});
  assert.deepEqual([request.routeProfile[0].roadLanes,request.routeProfile[0].tramInfrastructure,request.routeProfile[0].roadSpeedLimitKmh],[4,'dedicated',80]);
  assert.deepEqual(validateRoutePlan(plan).segmentAssets[0].roadLanes,4);
});

test('A–B–A delivers everything onboard at B: only return-direction loading makes a loaded return',()=>{
  const bare=createRoutePlan([segment,segment]);bare.goods=[coal];operation(bare.stops[0],coal.id,'load',1000);
  const service=declaredService(bare);
  assert.deepEqual([service.status,service.rate,service.loadedReturn],['applied',1000,false]);
  assert.equal(service.deliveredAtB,true);assert.deepEqual(service.issues,[]);
  assert.match(declarationReport(bare).used.find(item=>/Coal/.test(item.text)).text,/still onboard at B is delivered there/);
  assert.deepEqual(declaredServiceInputs(bare,{category:'freight'}).loadedReturn,false);
  const partial=createRoutePlan([segment,segment]);partial.goods=[coal];operation(partial.stops[0],coal.id,'load',1000);operation(partial.stops[1],coal.id,'unload',400);
  assert.deepEqual([declaredService(partial).rate,declaredService(partial).loadedReturn],[1000,false]);
  const loaded=createRoutePlan([segment,segment]);loaded.goods=[coal];operation(loaded.stops[0],coal.id,'load',1000);operation(loaded.stops[1],coal.id,'load',1000,{direction:'return'});
  const back=declaredService(loaded);
  assert.deepEqual([back.status,back.rate,back.loadedReturn],['applied',2000,true]);
  assert.equal(back.deliveredAtB,true);
});

test('freight carried over from A never fills an unequal return',()=>{
  const plan=createRoutePlan([segment,segment]);plan.goods=[coal];operation(plan.stops[0],coal.id,'load',1000);operation(plan.stops[1],coal.id,'load',500,{direction:'return'});
  const service=declaredService(plan);
  assert.equal(service.status,'unsupported');assert.match(service.issues.at(-1),/A → B \(1,000\) and B → A \(500\)/);
});

test('freight services name their goods, including unsupported ones',()=>{
  assert.deepEqual(declaredLoadNames(createRoutePlan([segment])),[]);
  const plan=freightPlan();plan.goods.push(grain);operation(plan.stops[0],grain.id,'load',500);
  assert.deepEqual(declaredLoadNames(plan),['Coal','Grain']);
});

test('infrastructure Running costs are optional while declared stops still constrain the search',()=>{
  const plan=freightPlan();
  plan.stops[0].infrastructure=[{id:'a-road',kind:'roadPlatform',length:20,platforms:1,specialized:true}];
  const scope={domain:'road',category:'freight',loadedReturn:false,includeTrams:false},model=declaredEndpointModel(plan,scope);
  const evaluate=countRunningCosts=>{
    const request=optimizerRequest({routeProfile:declaredRouteProfile(plan.segments,plan),domain:'road',category:'freight',rate:50,infrastructure:optimizerInfrastructureValue({countRunningCosts,sites:model.sites,bounds,entries:model.entries,scope})});
    return evaluateOptimizerCandidate([...optimizerCandidates(data,request)][0],data,request).result;
  };
  const counted=evaluate(true),free=evaluate(false);
  assert.ok(counted.terminalRunningCosts>0);
  // B declares nothing, so it is a new stop; A is the declared platform in both cases.
  for(const result of [counted,free]){assert.equal(result.infrastructure.stopA.existing,true);assert.equal(result.infrastructure.stopA.platformLengths[0],20);}
  assert.equal(free.infrastructureCostsCounted,false);
  assert.equal(free.terminalRunningCosts,0);assert.equal(free.cost,free.vehicleRunningCosts);assert.equal(free.cost,counted.cost-counted.terminalRunningCosts);
  assert.equal(free.uncountedTerminalRunningCosts,counted.terminalRunningCosts);
  assert.equal(free.unitCost<counted.unitCost,true);
});

test('a declared warehouse stays the stop with or without counted Running costs',()=>{
  const plan=freightPlan();plan.stops[0].buildings=[{...newRouteBuilding('Depot','warehouse'),warehouseCapacity:1000}];
  const scope={domain:'road',category:'freight',loadedReturn:false,includeTrams:false},model=declaredEndpointModel(plan,scope);
  for(const countRunningCosts of [true,false]){
    const request=optimizerRequest({routeProfile:declaredRouteProfile(plan.segments,plan),domain:'road',category:'freight',rate:50,infrastructure:optimizerInfrastructureValue({countRunningCosts,sites:model.sites,bounds,entries:model.entries,scope})});
    const result=evaluateOptimizerCandidate([...optimizerCandidates(data,request)][0],data,request).result;
    assert.equal(request.infrastructure.countRunningCosts,countRunningCosts);
    assert.equal(result.infrastructure.stopA.warehouseCapacity,1000);assert.equal(result.infrastructure.stopA.warehouseExpanded,false);
  }
});

test('the infrastructure request counts Running costs unless told otherwise',()=>{
  const value=optimizerInfrastructureValue({sites:{stopA:{type:'industrial'},stopB:{type:'industrial'}},bounds,entries:[],scope:{domain:'road',category:'passengers',loadedReturn:false,includeTrams:false}});
  assert.equal(value.countRunningCosts,true);
  assert.equal(validateOptimizerInfrastructure(value,'road','passengers').countRunningCosts,true);
  assert.equal(validateOptimizerInfrastructure({...value,countRunningCosts:false},'road','passengers').countRunningCosts,false);
  assert.throws(()=>validateOptimizerInfrastructure({...value,countRunningCosts:'no'},'road','passengers'),/counted/);
});

test('declared loads carry their category and freight group; untyped legacy goods are not guessed',()=>{
  const typed=declaredService(freightPlan());assert.equal(typed.category,'freight');assert.equal(typed.cargo,'bulk');
  const untyped=freightPlan();untyped.goods=[{...coal,type:null}];
  const service=declaredService(untyped);assert.equal(service.status,'unsupported');assert.match(service.issues[0],/Choose a type for Coal/);
  assert.equal(declaredServiceInputs(freightPlan(),{category:'freight'}).cargo,'bulk');
  assert.equal(declaredServiceInputs(freightPlan(),{category:'passengers'}).rate,null);
});

test('declared passengers become a Rate per direction, equal both ways',()=>{
  const people={id:'good:people',name:'Passengers',type:'passengers'};
  const plan=createRoutePlan([segment,segment]);plan.goods=[people];operation(plan.stops[0],people.id,'load',5000);
  const service=declaredService(plan);
  assert.deepEqual([service.status,service.category,service.rate,service.bothDirectionsDeclared],['applied','passengers',5000,false]);
  assert.match(declaredServiceText(service),/in each direction \(the same Rate is used B → A\)/);
  assert.equal(declaredServiceInputs(plan,{category:'passengers'}).rate,5000);assert.equal(declaredServiceInputs(plan,{category:'passengers'}).loadedReturn,null);
  operation(plan.stops[1],people.id,'load',5000,{direction:'return'});assert.equal(declaredService(plan).bothDirectionsDeclared,true);
  const uneven=createRoutePlan([segment,segment]);uneven.goods=[people];operation(uneven.stops[0],people.id,'load',5000);operation(uneven.stops[1],people.id,'load',3000,{direction:'return'});
  assert.match(declaredService(uneven).issues.at(-1),/one Rate in both directions/);
});
