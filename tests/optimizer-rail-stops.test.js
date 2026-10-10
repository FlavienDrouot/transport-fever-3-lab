import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {railTerminalEstimate} from '../src/rail-terminal-service.js';
import {optimizerRequest,optimizerCandidates,evaluateOptimizerCandidate} from '../src/optimizer.js';
import {optimizerTerminalChoices,railTerminalRunningCosts} from '../src/optimizer-infrastructure.js';
import {renderOptimizerProposals} from '../src/optimizer-proposals.js';

const flatModel={gradePercent:0,effectiveMaxSpeedKmh:72,
  timeAt:km=>km<=.2?Math.sqrt(2000*km):20+(km*1000-200)/20};
const train={lengthMetres:200,maxSpeedKmh:72,model:flatModel};
const estimate=(values={},vehicle=train)=>railTerminalEstimate(vehicle,{stopSeconds:60,headwaySeconds:94,speedLimitKmh:72,arrivalPeakSpeedKmh:72,...values});

test('Rail reservation includes flat acceleration, braking and both 100 m switch zones; waiting is rejected',()=>{
  const result=estimate();
  assert.equal(result.clearanceMetres,200);
  assert.equal(result.exitSeconds,20);assert.equal(result.entrySeconds,14);
  assert.equal(result.blockedSeconds,94);assert.equal(result.overloaded,false);
  assert.equal(estimate({headwaySeconds:93.99}).overloaded,true);
  assert.equal(estimate({trackCount:2,headwaySeconds:47}).overloaded,false);
  assert.equal(estimate({trackCount:2,headwaySeconds:46.99}).overloaded,true);
  assert.equal(estimate({arrivalPeakSpeedKmh:36}).entrySeconds,22);
  const fast=estimate({speedLimitKmh:144,arrivalPeakSpeedKmh:144},{...train,maxSpeedKmh:144,model:{...flatModel,effectiveMaxSpeedKmh:144}});
  assert.equal(fast.entrySeconds,Math.sqrt(160));
  const sloped={...train,model:{...flatModel,gradePercent:2,withGradient:grade=>{assert.equal(grade,0);return flatModel;}}};
  assert.deepEqual(estimate({},sloped),result);
  assert.ok(estimate({}, {...train,lengthMetres:400}).blockedSeconds>result.blockedSeconds);
  assert.ok(estimate({}, {...train,model:{...flatModel,timeAt:km=>flatModel.timeAt(km)*2}}).blockedSeconds>result.blockedSeconds);
});

const raw=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
const data={units:raw.source,trains:raw.trains.filter(t=>t.id==='ice-1'),locomotives:[],passengerWagons:[],freightWagons:[]};
const routeProfile=[{distanceKm:10,gradePercent:0,speedLimitKmh:350}];
const terminal={mode:'new',maxTrainLength:400,maxPlatformTracks:2};
const request=values=>optimizerRequest({domain:'rail',category:'passengers',rate:5000,minHeadwaySeconds:null,routeProfile,
  infrastructure:{rail:{stopA:terminal,stopB:terminal}},...values});
const candidate=req=>[...optimizerCandidates(data,req)][0];

test('Rail search buys the second track without a duplicate platform, and rejects insufficient reusable access',()=>{
  const req=request(),result=evaluateOptimizerCandidate(candidate(req),data,req).result;
  assert.ok(result);assert.equal(result.infrastructure.stopA.platformTrackCount,2);
  assert.equal(result.infrastructure.stopA.platformCount,1);
  for(const stop of ['stopA','stopB']){
    const plan=result.infrastructure[stop];
    assert.equal(plan.annualMaintenance,18000+plan.maxTrainLength/40*(2*30000+60000));
    assert.ok(result.frequency+1e-7>=result.terminalEstimates[stop].minHeadwaySeconds);
  }
  const limited=request({infrastructure:{rail:{stopA:{...terminal,maxPlatformTracks:1},stopB:terminal}}});
  const excluded=evaluateOptimizerCandidate(candidate(limited),data,limited);
  assert.ok(excluded.limitingConstraints.includes('stopCapacityA'));
  assert.ok(excluded.singleConstraints.includes('stopCapacityA'));
  const unknown={id:'legacy',name:'Legacy',annualMaintenance:0,maxTrainLength:400};
  const mixed=request({infrastructure:{rail:{stopA:{...terminal,maxPlatformTracks:1},stopB:[unknown]}}});
  assert.deepEqual(evaluateOptimizerCandidate(candidate(mixed),data,mixed).limitingConstraints,['stopCapacityA']);
  const reused={mode:'reuse',existingLength:320,platformTrackCount:2,platformCount:1};
  const free=request({infrastructure:{rail:{stopA:reused,stopB:reused}}});
  const available=evaluateOptimizerCandidate(candidate(free),data,free).result;
  assert.ok(available);assert.equal(available.terminalRunningCosts,0);
  assert.equal(available.infrastructure.stopA.platformTrackCount,2);
  const html=renderOptimizerProposals({request:free,best:{rail:[available]}},'rail');
  assert.ok(html.includes('2 platform tracks · 1 platform'));
  assert.ok(html.includes('Shared switches may limit capacity'));
  const short=request({routeProfile:[{...routeProfile[0],distanceKm:.4}]});
  assert.deepEqual(evaluateOptimizerCandidate(candidate(short),data,short).limitingConstraints,['railTerminalGeometry']);
});

test('Rail shared-platform pricing and permissions preserve reusable geometry and charge only additions',()=>{
  const priced={maxTrainLength:160,platformTrackCount:2,platformCount:1,additionalAnnualMaintenance:0};
  assert.equal(railTerminalRunningCosts(priced,'passengers'),498000);
  assert.equal(railTerminalRunningCosts({...priced,platformTrackCount:3,platformCount:2},'passengers'),858000);
  const reused={mode:'reuse',existingLength:160,maxTrainLength:240,platformTrackCount:2,platformCount:1,
    allowExtension:true,allowParallelTracks:true,maxPlatformTracks:4};
  const req=request({infrastructure:{rail:{stopA:reused,stopB:reused}}});
  assert.deepEqual(optimizerRequest(req),req);
  const choices=[...optimizerTerminalChoices(req,'rail',0,200)];
  const pair=choices.find(c=>c.stopA.platformTrackCount===4&&c.stopB.platformTrackCount===2);
  assert.ok(pair);assert.equal(pair.stopA.platformCount,2);
  assert.equal(pair.stopA.maxTrainLength,200);
  assert.equal(pair.stopA.annualMaintenance,5*(4*30000+2*60000)-4*(2*30000+60000));
  assert.equal(pair.stopB.annualMaintenance,2*30000+60000);
  const fixed=request({infrastructure:{rail:{stopA:{...reused,allowParallelTracks:false},stopB:reused}}});
  assert.ok([...optimizerTerminalChoices(fixed,'rail',0,200)].every(c=>c.stopA.platformTrackCount===2));
  for(const bad of [{platformTrackCount:0},{platformTrackCount:3,platformCount:1},{maxPlatformTracks:1}])
    assert.throws(()=>request({infrastructure:{rail:{stopA:{...reused,...bad},stopB:reused}}}),/platform tracks/);
});
