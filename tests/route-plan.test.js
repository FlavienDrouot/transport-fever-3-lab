import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoutePlan,newRouteStop,newRouteBuilding,validateRoutePlan,updateRoutePlanSegments,routePlanFlows,restoreRoutePlans} from '../src/route-plan.js';
import {routeProfileSketch} from '../src/route-profile-control.js';

const segment={distanceKm:2,gradePercent:0,speedLimitKmh:160,roadSpeedLimitKmh:80};
const goods=[{id:'good:a',name:'A'},{id:'good:b',name:'B'},{id:'good:c',name:'C'}];
const operation=(cargoId,action,value,mode='year',direction='outbound')=>({id:crypto.randomUUID(),buildingId:null,cargoId,action,direction,quantity:{mode,value}});
const recipe=(cargoId,ratio)=>({id:crypto.randomUUID(),cargoId,ratio});
function example(){
  const plan=createRoutePlan([segment,segment],'Supply route');plan.goods=structuredClone(goods);
  const industry=newRouteStop(1,'Industry');industry.buildings=[newRouteBuilding('Processing Industry','factory')];
  industry.buildings[0].recipe={inputs:[recipe('good:a',2),recipe('good:b',1)],outputs:[recipe('good:c',3)]};
  plan.stops.splice(1,0,industry);
  plan.stops[0].operations=[operation('good:a','load',600),operation('good:b','load',300)];
  industry.operations=[operation('good:a','unload',100,'percent'),operation('good:b','unload',100,'percent'),operation('good:c','load',900)].map(op=>({...op,buildingId:industry.buildings[0].id}));
  plan.stops[2].operations=[operation('good:c','unload',100,'percent')];
  return plan;
}

test('a saved service restores geometry, operations, asymmetric stocks, infrastructure and recipe ratios',()=>{
  const plan=example();plan.stops[1].buildings[0].storage=[{id:'stock:a',cargoId:'good:a',inputCapacity:1200,outputCapacity:100}];
  plan.segmentAssets[0]={railTier:160,railTracks:2,roadTier:80,roadLanes:4,tramTracks:'road'};
  plan.segmentAssets[1]={railTier:null,railTracks:1,roadTier:120,roadLanes:4,tramTracks:'dedicated'};
  plan.stops[1].infrastructure=[{id:'infra:rail',kind:'railPlatform',length:160,tracks:2,platforms:1,specialized:true},{id:'infra:road',kind:'roadPlatform',length:30,platforms:2,specialized:false}];
  const restored=restoreRoutePlans(JSON.stringify({schemaVersion:1,routes:[plan]}));
  assert.equal(restored.skipped,0);assert.deepEqual(restored.routes,[validateRoutePlan(plan)]);
  const second=structuredClone(plan);second.id='route:second';second.name='Second';
  const invalid=structuredClone(plan);invalid.id='route:invalid';invalid.stops[1].infrastructure[0].length=841;
  const partial=restoreRoutePlans(JSON.stringify({schemaVersion:1,routes:[plan,invalid,second,plan]}));
  assert.equal(partial.routes.length,2);assert.equal(partial.skipped,2);
  assert.deepEqual(restoreRoutePlans('{'),{routes:[],skipped:1});
  assert.deepEqual(restoreRoutePlans(JSON.stringify({schemaVersion:99,routes:[]})),{routes:[],skipped:1});
});

test('existing segment infrastructure moves with geometry and rejects street Tram tracks on highways',()=>{
  const plan=createRoutePlan([segment,{...segment,distanceKm:3}]);
  plan.segmentAssets[0]={railTier:100,railTracks:1,roadTier:60,roadLanes:2,tramTracks:'road'};
  plan.segmentAssets[1]={railTier:350,railTracks:2,roadTier:120,roadLanes:4,tramTracks:'dedicated'};
  const moved=updateRoutePlanSegments(plan,plan.segments.toReversed(),{action:'down',index:0});
  assert.deepEqual(moved.segmentAssets,plan.segmentAssets.toReversed());
  const inserted=updateRoutePlanSegments(plan,[segment,segment,plan.segments[1]],{action:'insert',index:0});
  assert.deepEqual(inserted.segmentAssets[2],plan.segmentAssets[1]);assert.equal(inserted.segmentAssets[1].roadTier,null);
  const removed=updateRoutePlanSegments(inserted,plan.segments,{action:'remove',index:1});assert.deepEqual(removed.segmentAssets,plan.segmentAssets);
  const half={...plan.segments[1],distanceKm:1.5},split=updateRoutePlanSegments(plan,[plan.segments[0],half,half],{action:'split',index:1});
  assert.deepEqual(split.segmentAssets,[plan.segmentAssets[0],plan.segmentAssets[1],plan.segmentAssets[1]]);assert.equal(split.stops.at(-1).boundary,3);
  const invalid=structuredClone(plan);invalid.segmentAssets[1].tramTracks='road';assert.throws(()=>validateRoutePlan(invalid),/highways/);
  invalid.segmentAssets[1].tramTracks='none';invalid.segmentAssets[1].roadLanes=2;assert.throws(()=>validateRoutePlan(invalid),/4 lanes/);
  const legacy=structuredClone(plan);delete legacy.segmentAssets;
  assert.ok(validateRoutePlan(legacy).segmentAssets.every(a=>a.railTier===null&&a.roadTier===null&&a.tramTracks==='none'));
});

test('industry input needs follow output recipe ratios, without selecting vehicles',()=>{
  const plan=example(),before=JSON.stringify(plan),flow=routePlanFlows(plan);
  assert.equal(JSON.stringify(plan),before);
  const need=flow.production[0];
  assert.deepEqual(need.required.year,{'good:a':600,'good:b':300});
  assert.deepEqual(need.plannedOutputs.year,{'good:c':900});
  assert.deepEqual(need.incoming.year,{'good:a':600,'good:b':300});
  assert.equal(flow.sections[0].load['good:a'].year,600);
  assert.equal(flow.sections[1].load['good:c'].year,900);
  assert.ok(Object.values(flow.remaining).every(q=>q.visit===0&&q.year===0));assert.deepEqual(flow.warnings,[]);
});

test('absolute visits and annual Rate stay independent; percentages follow actual declared onboard goods',()=>{
  const plan=createRoutePlan([segment,segment]);plan.goods=[goods[0]];
  const mid=newRouteStop(1,'Drop-off');plan.stops.splice(1,0,mid);
  plan.stops[0].operations=[operation('good:a','load',100,'visit'),operation('good:a','load',1000,'year')];
  mid.operations=[operation('good:a','unload',25,'percent')];
  plan.stops[2].operations=[operation('good:a','unload',50,'percent'),operation('good:a','load',20,'visit','return')];
  plan.stops[0].operations.push(operation('good:a','unload',100,'percent','return'));
  const flows=routePlanFlows(plan);
  assert.deepEqual(flows.sections[1].load['good:a'],{visit:75,year:750});
  assert.deepEqual(flows.sections[2].load['good:a'],{visit:57.5,year:375});
  assert.deepEqual(flows.remaining['good:a'],{visit:0,year:0});
  const empty=createRoutePlan([segment]);empty.goods=[goods[0]];empty.stops[0].operations=[operation('good:a','load',50,'percent')];
  assert.match(routePlanFlows(empty).warnings[0].message,/already onboard/);
  empty.stops[1].operations=[operation('good:a','unload',10,'visit')];
  assert.match(routePlanFlows(empty).warnings[1].message,/exceeds/);
});

test('multiple recipe outputs share a production-cycle basis and expose untransported byproducts',()=>{
  const plan=example();plan.goods.push({id:'good:d',name:'D'});
  plan.stops[1].buildings[0].recipe.outputs.push(recipe('good:d',1));
  plan.stops[1].operations.push({...operation('good:d','load',500),buildingId:plan.stops[1].buildings[0].id});
  const production=routePlanFlows(plan).production[0];
  assert.deepEqual(production.required.year,{'good:a':1000,'good:b':500});
  assert.deepEqual(production.plannedOutputs.year,{'good:c':1500,'good:d':500});
});

test('raw-material sources can declare outputs without consuming inputs',()=>{
  const plan=createRoutePlan([segment]);plan.goods=[goods[0]];plan.stops[0].buildings=[newRouteBuilding('Source Industry','factory')];
  plan.stops[0].buildings[0].recipe.outputs=[recipe('good:a',1)];plan.stops[0].operations=[{...operation('good:a','load',600),buildingId:plan.stops[0].buildings[0].id}];
  const production=routePlanFlows(plan).production[0];
  assert.equal(production.incomplete,false);assert.deepEqual(production.required.year,{});assert.deepEqual(production.plannedOutputs.year,{'good:a':600});
  plan.stops[0].buildings[0].recipe.outputs[0].ratio=1e-310;
  assert.throws(()=>routePlanFlows(plan),/overflow/);
  assert.equal(restoreRoutePlans(JSON.stringify({schemaVersion:1,routes:[plan]})).skipped,1);
});

test('geometry insertion rebases stops and refuses collapsing their declarations on deletion',()=>{
  const plan=example(),before=JSON.stringify(plan);
  const extended=updateRoutePlanSegments(plan,[segment,segment,segment],{action:'insert',index:0});
  assert.deepEqual(extended.stops.map(s=>s.boundary),[0,2,3]);
  assert.deepEqual(extended.stops[1].operations,plan.stops[1].operations);
  const deleted=updateRoutePlanSegments(extended,[segment,segment],{action:'remove',index:0});
  assert.deepEqual(deleted.stops.map(s=>s.boundary),[0,1,2]);
  assert.throws(()=>updateRoutePlanSegments(plan,[segment],{action:'remove',index:0}),/Two stops/);
  assert.throws(()=>updateRoutePlanSegments(plan,[segment],null),/complete route/);
  assert.equal(JSON.stringify(plan),before);
  const changed=updateRoutePlanSegments(plan,[{...segment,gradePercent:2},segment]);assert.equal(changed.segments[0].gradePercent,2);
  assert.deepEqual(changed.stops,validateRoutePlan(plan).stops);
});

test('declaration validation rejects dangling goods, duplicate boundaries and unsupported physical geometry',()=>{
  const plan=example();
  const withChange=change=>{const draft=structuredClone(plan);change(draft);return ()=>validateRoutePlan(draft);};
  assert.throws(withChange(p=>p.goods.push({id:'good:z',name:'a'})),/names must be distinct/);
  assert.throws(withChange(p=>p.stops[0].operations[0].cargoId='good:unknown'),/declared good/);
  assert.throws(withChange(p=>p.stops[1].boundary=0),/Two stops/);
  assert.throws(withChange(p=>p.stops[1].id='stop:"unsafe'),/unsupported characters/);
  assert.throws(withChange(p=>p.stops[1].buildings[0].recipe.inputs[0].ratio=0),/Recipe ratio/);
  assert.throws(withChange(p=>p.stops[1].infrastructure=[{id:'infra:r',kind:'railPlatform',length:120,tracks:3,platforms:1,specialized:false}]),/Platforms/);
  assert.throws(withChange(p=>p.stops[1].infrastructure=[{id:'infra:r',kind:'roadPlatform',length:25,platforms:1,specialized:false}]),/whole 10/);
  const bus=structuredClone(plan);bus.stops[2].infrastructure=[{id:'infra:bus',kind:'busStop'}];
  assert.deepEqual(validateRoutePlan(bus).stops[2].infrastructure,[{id:'infra:bus',kind:'busStop'}]);
});

test('route previews mark and escape named stops at the correct boundary',()=>{
  const plan=example();plan.stops[1].name='<Industry & "depot">';
  const svg=routeProfileSketch(plan.segments,{stops:plan.stops});
  assert.match(svg,/&lt;Industry &amp; &quot;depot&quot;&gt;/);assert.doesNotMatch(svg,/<Industry/);
  assert.match(svg,/aria-label="[^"]*&lt;Industry &amp; &quot;depot&quot;&gt; at 2 km\./);
  assert.equal((svg.match(/profile-stop-node/g)??[]).length,3);
});


test('the same stop serves distinct buildings for meat, sheet metal and a canned-goods return',()=>{
  const plan=createRoutePlan([segment],'Cannery supply');
  plan.goods=[{id:'good:meat',name:'Meat'},{id:'good:metal',name:'Sheet metal'},{id:'good:cans',name:'Canned goods'}];
  const meat=newRouteBuilding('Meat Industry','factory'),warehouse=newRouteBuilding('Supply warehouse','warehouse');
  const cannery=newRouteBuilding('Cannery','factory'),other=newRouteBuilding('Other Industry','factory');
  plan.stops[0].buildings=[meat,warehouse];plan.stops[1].buildings=[cannery,other];
  meat.storage=[{id:'stock:meat',cargoId:'good:meat',inputCapacity:100,outputCapacity:800}];
  warehouse.storage=[{id:'stock:cans',cargoId:'good:cans',inputCapacity:1000,outputCapacity:100}];
  cannery.storage=[{id:'stock:cans-b',cargoId:'good:cans',inputCapacity:100,outputCapacity:600}];
  cannery.recipe={inputs:[recipe('good:meat',2),recipe('good:metal',1)],outputs:[recipe('good:cans',3)]};
  other.recipe={inputs:[recipe('good:meat',1)],outputs:[recipe('good:cans',1)]};
  const move=(building,cargoId,action,value,mode='year',direction='outbound')=>({...operation(cargoId,action,value,mode,direction),buildingId:building.id});
  plan.stops[0].operations=[move(meat,'good:meat','load',200),move(warehouse,'good:metal','load',100),move(warehouse,'good:cans','unload',100,'percent','return')];
  plan.stops[1].operations=[move(cannery,'good:meat','unload',100,'percent'),move(cannery,'good:metal','unload',100,'percent'),move(cannery,'good:cans','load',300,'year','return'),move(other,'good:cans','load',50,'year','return')];
  const flow=routePlanFlows(plan);
  assert.deepEqual(flow.sections[0].load,{'good:meat':{visit:0,year:200},'good:metal':{visit:0,year:100},'good:cans':{visit:0,year:0}});
  assert.equal(flow.sections[1].load['good:cans'].year,350);
  const production=flow.production.find(p=>p.buildingId===cannery.id);
  assert.deepEqual(production.required.year,{'good:meat':200,'good:metal':100});
  assert.deepEqual(production.incoming.year,{'good:meat':200,'good:metal':100});
  assert.deepEqual(flow.production.find(p=>p.buildingId===other.id).required.year,{'good:meat':50});
  assert.ok(Object.values(flow.remaining).every(q=>q.year===0&&q.visit===0));
  assert.equal(flow.visits[0].moves[0].buildingId,meat.id);assert.equal(flow.visits.at(-1).moves[0].buildingId,warehouse.id);
  assert.deepEqual(restoreRoutePlans(JSON.stringify({schemaVersion:1,routes:[plan]})).routes,[validateRoutePlan(plan)]);
  const broken=structuredClone(plan);broken.stops[0].operations[0].buildingId=cannery.id;
  assert.throws(()=>validateRoutePlan(broken),/building at this stop/);
  const duplicate=structuredClone(plan);duplicate.stops[0].buildings[1].name='Meat Industry';assert.throws(()=>validateRoutePlan(duplicate),/names must be distinct/);
});

test('version 1 saved routes migrate their single building and retain explicit storage and operation ownership',()=>{
  const current=example(),legacy={...structuredClone(current),schemaVersion:1};
  legacy.stops=legacy.stops.map((stop,i)=>{
    const building=stop.buildings[0]??newRouteBuilding(stop.name,'none');
    const {buildings,...rest}=stop;
    return {...rest,building:building.type,warehouseCapacity:building.warehouseCapacity,industryTerminals:building.industryTerminals,
      storage:i===1?[{id:'legacy:stock',cargoId:'good:c',inputCapacity:100,outputCapacity:100}]:building.storage,recipe:building.recipe,
      operations:stop.operations.map(({buildingId,...op})=>op)};
  });
  const before=JSON.stringify(legacy),restored=restoreRoutePlans(JSON.stringify({schemaVersion:1,routes:[legacy]}));
  assert.equal(restored.skipped,0);assert.equal(JSON.stringify(legacy),before);
  const migrated=restored.routes[0];assert.equal(migrated.schemaVersion,2);
  assert.equal(migrated.stops[1].buildings[0].type,'factory');assert.equal(migrated.stops[1].buildings[0].storage[0].outputCapacity,100);
  for(const stop of migrated.stops)assert.ok(stop.operations.every(op=>op.buildingId===stop.buildings[0].id));
  assert.deepEqual(routePlanFlows(migrated).production[0].required.year,{'good:a':600,'good:b':300});
  assert.deepEqual(validateRoutePlan(migrated),migrated);
});
