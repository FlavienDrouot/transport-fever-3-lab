import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {roadPlatformVehicleSlots,optimizerTerminalChoices,BUS_STOP_TARIFFS,roadTerminalRunningCosts} from '../src/optimizer-infrastructure.js';
import {optimizerRequest,optimizerCandidates,evaluateOptimizerCandidate,optimizeService} from '../src/optimizer.js';
import {analyseRoadFleet} from '../src/trucks.js';
import {renderOptimizerProposals} from '../src/optimizer-proposals.js';
import {optimizerExclusionSummary} from '../src/optimizer-diagnostics.js';

const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [buses,trucks]=await Promise.all(['buses','trucks'].map(read));
const data={buses:buses.buses.filter(v=>v.name==='Scania-Vabis H15'),trucks:trucks.trucks.filter(v=>v.id==='man-19304')};
const routeProfile=[{distanceKm:2,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:80}];
const newStop={mode:'new',allowBusStop:true};
const base={domain:'road',routeProfile,minHeadwaySeconds:null,rate:100, infrastructure:{road:{stopA:newStop,stopB:newStop}}};
const evaluate=input=>{const request=optimizerRequest({...base,...input});return evaluateOptimizerCandidate([...optimizerCandidates(data,request)][0],data,request);};

test('20 m platforms have two places at the measured 10 m boundary and accept longer vehicles alone',()=>{
  assert.equal(roadPlatformVehicleSlots(10),2);
  assert.equal(roadPlatformVehicleSlots(10.01),1);
  assert.equal(roadPlatformVehicleSlots(5),4);
  assert.equal(roadPlatformVehicleSlots(20),1);
  assert.equal(roadPlatformVehicleSlots(25),1);
  assert.equal(roadPlatformVehicleSlots(10,3),6);
  assert.throws(()=>roadPlatformVehicleSlots(0),/positive/);
});

test('the cheapest passenger service can use new or free reusable single-vehicle bus stops',()=>{
  const {result}=evaluate({});assert.ok(result);
  assert.equal(result.infrastructureRunningCosts,2*BUS_STOP_TARIFFS.annualMaintenance);
  for(const stop of ['stopA','stopB']){
    assert.equal(result.infrastructure[stop].terminalType,'busStop');
    assert.equal(result.infrastructure[stop].vehicleSlots,1);
    assert.ok(result.stopOccupancy[stop]<=result.frequency);
  }
  const reused=evaluate({infrastructure:{road:{stopA:{mode:'reuse',terminalType:'busStop'},stopB:{mode:'reuse',terminalType:'busStop'}}}}).result;
  assert.ok(reused);assert.equal(reused.infrastructureRunningCosts,0);
  const html=renderOptimizerProposals({request:optimizerRequest(base),best:{road:[result]}},'road');
  assert.ok(html.includes('New bus stop'));assert.ok(html.includes('1 simultaneous vehicle place'));
});

test('bus stops can only unload freight at industrial destination B without a loaded return',()=>{
  const sites={stopA:{type:'warehouse',warehouseCapacity:500,maxWarehouseCapacity:500,warehouseSpecialization:'generic'},stopB:{type:'industrial'}};
  const request=optimizerRequest({...base,category:'freight',rate:200,infrastructure:{sites,road:{stopA:newStop,stopB:newStop}}});
  const choices=[...optimizerTerminalChoices(request,'road',18,7.7)];
  assert.ok(choices.every(choice=>choice.stopA.terminalType!=='busStop'));
  assert.ok(choices.some(choice=>choice.stopB.terminalType==='busStop'));
  const candidate=[...optimizerCandidates(data,request)][0],result=evaluateOptimizerCandidate(candidate,data,request).result;
  assert.ok(result);assert.equal(result.infrastructure.stopB.terminalType,'busStop');
  const returning=optimizerRequest({...request,loadedReturn:true});
  assert.ok([...optimizerTerminalChoices(returning,'road',18,7.7)].every(choice=>choice.stopB.terminalType!=='busStop'));
  for(const change of [{loadedReturn:true},{infrastructure:{...request.infrastructure,road:{stopA:{mode:'reuse',terminalType:'busStop'},stopB:newStop}}},
    {infrastructure:{...request.infrastructure,sites:{...sites,stopB:{type:'warehouse'}},road:{stopA:newStop,stopB:{mode:'reuse',terminalType:'busStop'}}}}]){
    const enforced={...request,infrastructure:{...request.infrastructure,road:{...request.infrastructure.road,stopB:{mode:'reuse',terminalType:'busStop'}}},...change};
    assert.throws(()=>optimizerRequest(enforced),/Bus stops serve/);
  }
  assert.throws(()=>optimizerRequest({...base,domain:'rail',infrastructure:{rail:{stopA:{mode:'new',terminalType:'busStop'},stopB:{mode:'new'}}}}),/Bus stops serve/);
});

test('high Frequency rejects single bus stops and chooses independent parallel station platforms',()=>{
  const terminal={mode:'new',allowBusStop:true,maxPlatformLength:40,maxPlatforms:2};
  const request=optimizerRequest({...base,rate:1000,maxHeadwaySeconds:5,infrastructure:{road:{stopA:terminal,stopB:terminal}}});
  const candidate=[...optimizerCandidates(data,request)][0],result=evaluateOptimizerCandidate(candidate,data,request).result;
  assert.ok(result);
  for(const stop of ['stopA','stopB']){
    assert.equal(result.infrastructure[stop].terminalType,'station');assert.equal(result.infrastructure[stop].platformCount,2);
    assert.deepEqual(result.infrastructure[stop].platformLengths,[20,20]);
    assert.ok(result.stopWaiting[stop]>0);
    assert.ok(1/result.frequency<=result.stopMaxVehiclesPerSecond[stop]+1e-9);
  }
  const constrained=optimizerRequest({...request,infrastructure:{road:{stopA:{mode:'reuse',terminalType:'busStop'},stopB:{...terminal,allowBusStop:false}}}});
  const evaluation=evaluateOptimizerCandidate(candidate,data,constrained);
  assert.equal(evaluation.result,undefined);assert.deepEqual(evaluation.singleConstraints,['stopCapacityA']);
  const search=optimizeService(data,constrained);let next;do{next=search.next();}while(!next.done);
  assert.ok(optimizerExclusionSummary(next.value,'road').includes('Terminal vehicle throughput at A'));
});

test('actual stop occupancy retains directional handling and follows the delivered load',()=>{
  const vehicle=data.trucks[0],options={distanceKm:2,fillRatio:.8,loadedReturn:true,stopA:{specializedTerminal:true},stopB:{},demandPerYear:500};
  const row=analyseRoadFleet([vehicle],options)[0];
  assert.ok(row.actualFillRatio<.8);
  assert.ok(row.stationSecondsA<row.stationSecondsB);
  assert.ok(Math.abs(row.roundTripSeconds-row.outboundTravelSeconds-row.returnTravelSeconds-row.stationSecondsA-row.stationSecondsB)<1e-7);
});

test('initial platforms cost two 10 m sections; extensions and parallel additions have no surcharge',()=>{
  const cost=(platformLength,platformCount=1)=>roadTerminalRunningCosts({platformLength,platformCount,additionalAnnualMaintenance:0},'freight')-42000;
  assert.equal(cost(20),60000);assert.equal(cost(30),90000);assert.equal(cost(40),120000);assert.equal(cost(20,2),120000);
  assert.equal(roadPlatformVehicleSlots(10,1,30),3);
  assert.equal(roadPlatformVehicleSlots(12,1,40),3);assert.equal(roadPlatformVehicleSlots(12,2,20),2);
  const reused={mode:'reuse',platformLength:20,platformCount:1,allowExtension:true,maxPlatformLength:40,allowParallelPlatforms:true,maxPlatforms:2};
  const request=optimizerRequest({...base,category:'freight',infrastructure:{road:{stopA:reused,stopB:{mode:'new'}}}});
  const plans=[...optimizerTerminalChoices(request,'road',18,10)].map(c=>c.stopA);
  for(const [lengths,annual] of [[[20],0],[[30],30000],[[40],60000],[[20,20],60000]]){
    assert.equal(plans.find(plan=>JSON.stringify(plan.platformLengths)===JSON.stringify(lengths)).annualMaintenance,annual);
  }
  assert.ok(plans.some(plan=>JSON.stringify(plan.platformLengths)==='[30,40]'));
  assert.deepEqual(optimizerRequest(request),request);
  const fixed=optimizerRequest({...base,category:'freight',infrastructure:{road:{stopA:{...reused,allowExtension:false,allowParallelPlatforms:false},stopB:{mode:'new'}}}});
  assert.deepEqual([...optimizerTerminalChoices(fixed,'road',18,10)].map(c=>c.stopA.platformLengths),[[20]]);
  for(const change of [{platformLength:25},{maxPlatformLength:10},{platformCount:0},{maxPlatforms:.5}]){
    assert.throws(()=>optimizerRequest({...base,infrastructure:{road:{stopA:{...reused,...change},stopB:{mode:'new'}}}}),/Road/);
  }
});

test('the optimizer retains both designs and selects parallel or extended platforms according to vehicle length',()=>{
  const configurations=[{id:'long',mode:'reuse',platformLength:40,platformCount:1},{id:'parallel',mode:'reuse',platformLength:20,platformCount:2}];
  for(const [length,rate,id] of [[10,450,'parallel'],[12,500,'long']]){
    const vehicle={...data.trucks[0],lengthMetres:length};
    const request=optimizerRequest({...base,category:'freight',rate,infrastructure:{road:{stopA:configurations,stopB:configurations}}});
    const {result}=evaluateOptimizerCandidate({domain:'road',vehicle},data,request);assert.ok(result);
    assert.match(result.infrastructure.stopA.id,new RegExp(`^${id}:`));assert.match(result.infrastructure.stopB.id,new RegExp(`^${id}:`));
    assert.equal(result.maneuverSeconds,5);
    const road=analyseRoadFleet([vehicle],{distanceKm:2,routeProfile,motion:true,demandPerYear:rate,maneuverSeconds:5,
      stopA:result.infrastructure.stopA,stopB:result.infrastructure.stopB})[0];
    assert.ok(Math.abs(result.cycle-road.roundTripSeconds)<1e-7);
    assert.ok(Math.abs(result.rate-rate)<1e-7);
    const html=renderOptimizerProposals({request,best:{road:[result]}},'road');
    assert.ok(html.includes('estimated mean wait'));assert.ok(html.includes('vehicles/min'));
  }
});

test('industries offer two or three free parallel single-vehicle terminals, defaulting to two',()=>{
  const factory={type:'factory'},terminal={mode:'factory'};
  const request=optimizerRequest({...base,category:'freight',rate:500,infrastructure:{sites:{stopA:factory,stopB:factory},road:{stopA:terminal,stopB:terminal}}});
  const [choice]=optimizerTerminalChoices(request,'road',18,10);
  for(const stop of ['stopA','stopB']){
    assert.equal(request.infrastructure.sites[stop].factoryTerminals,2);
    assert.equal(choice[stop].annualMaintenance,0);assert.equal(choice[stop].specializedTerminal,true);
    assert.deepEqual(choice[stop].platformSlots,[1,1]);assert.equal(choice[stop].vehicleSlots,2);
    assert.equal(choice[stop].platformLengths,undefined);
  }
  const candidate={domain:'road',vehicle:data.trucks[0]};
  const {result}=evaluateOptimizerCandidate(candidate,data,request);assert.ok(result);
  assert.equal(result.infrastructureRunningCosts,0);assert.equal(result.maneuverSeconds,5);
  assert.equal(result.stopWaiting.stopA,0);
  assert.ok(Math.abs(result.stopMaxVehiclesPerSecond.stopA-2/result.stopOccupancy.stopA)<1e-10);
  const busy=optimizerRequest({...request,rate:1000});
  assert.deepEqual(evaluateOptimizerCandidate(candidate,data,busy).limitingConstraints,['stopCapacityA','stopCapacityB']);
  const more=optimizerRequest({...busy,infrastructure:{...busy.infrastructure,sites:{stopA:{...factory,factoryTerminals:3},stopB:{...factory,factoryTerminals:3}}}});
  const expanded=evaluateOptimizerCandidate(candidate,data,more).result;assert.ok(expanded);
  assert.equal(expanded.infrastructureRunningCosts,0);assert.equal(expanded.infrastructure.stopA.vehicleSlots,3);
  assert.ok(renderOptimizerProposals({request:more,best:{road:[expanded]}},'road').includes('3 parallel terminals · 1 vehicle each'));
  assert.deepEqual(optimizerRequest(more),more);
  for(const factoryTerminals of [null,0,1,1.5,4,101,'3'])assert.throws(()=>optimizerRequest({...request,infrastructure:{...request.infrastructure,sites:{stopA:{...factory,factoryTerminals},stopB:factory}}}),/industry terminals/);
});
