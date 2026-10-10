import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {railLineTiers,roadLineTiers,segmentLineTiers,lineInfrastructurePlan} from '../src/optimizer-line-infrastructure.js';
import {optimizerRequest,optimizerCandidates,evaluateOptimizerCandidate,compareOptimizerResults} from '../src/optimizer.js';
import {optimizerProposalRequest} from '../src/optimizer-infrastructure.js';
import {validateRouteProfile,reverseRouteProfile} from '../src/route-profile.js';
import {createRouteSelection} from '../src/route-selection.js';
import {renderOptimizerProposals} from '../src/optimizer-proposals.js';

const part={distanceKm:2,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:120};
test('Rail unlocks and the 1940 Road transition use inclusive introduction years',()=>{
  for(const [year,speeds] of [[1850,[100]],[1929,[100]],[1930,[100,160]],[1979,[100,160]],[1980,[100,160,350]]])
    assert.deepEqual(railLineTiers(year).map(t=>t.speed),speeds);
  assert.deepEqual(roadLineTiers(1939).map(t=>[t.speed,t.maintenance]),[[40,15000],[60,15000]]);
  assert.deepEqual(roadLineTiers(1940).map(t=>[t.speed,t.maintenance]),[[50,30000],[80,30000],[100,60000],[120,120000]]);
});

test('lanes impose tier availability and 120 already includes its four-lane cost',()=>{
  const choices=(year,lanes,speed=120)=>segmentLineTiers({...part,roadLanes:lanes,roadSpeedLimitKmh:speed},'road',year).map(t=>[t.tierSpeedKmh,t.annualMaintenance]);
  assert.deepEqual(choices(2035,2),[[80,60000],[100,120000]]);
  assert.deepEqual(choices(2035,4),[[80,120000],[120,240000]]);
  assert.deepEqual(choices(2035,4,50),[[50,120000]]);
  assert.deepEqual(choices(1939,2),[[60,30000]]);
  assert.deepEqual(choices(1939,4),[[60,60000]]);
  assert.deepEqual(choices(1939,2,40),[[40,30000]]);
});

test('city tiers remain fixed and arbitrary curve limits cannot be raised',()=>{
  assert.deepEqual(segmentLineTiers({...part,roadSpeedLimitKmh:50},'road',2035).map(t=>t.speedLimitKmh),[50]);
  assert.deepEqual(segmentLineTiers({...part,roadSpeedLimitKmh:90},'road',2035).map(t=>t.speedLimitKmh),[80,90]);
  assert.deepEqual(segmentLineTiers({...part,roadSpeedLimitKmh:60},'road',2035).map(t=>t.speedLimitKmh),[60,60]);
  assert.deepEqual(segmentLineTiers({...part,speedLimitKmh:130},'rail',2035).map(t=>t.speedLimitKmh),[100,130,130]);
  assert.ok(segmentLineTiers({...part,roadSpeedLimitKmh:80},'road',2035).some(t=>t.speedLimitKmh===100));
  const modern40=segmentLineTiers({...part,roadSpeedLimitKmh:40},'road',2035);
  assert.ok(modern40.every(t=>!t.city&&t.speedLimitKmh===40));
});

test('opening and reversing preserve original constraints; manual speed edits replace them',()=>{
  const route=[{...part,roadSpeedLimitKmh:90,roadLanes:4}];
  const plan=lineInfrastructurePlan(route,'road',[segmentLineTiers(route[0],'road',2035)[0]]);
  const transferred=optimizerProposalRequest({routeInfrastructure:plan},optimizerRequest({routeProfile:route,lineInfrastructure:{}}));
  assert.equal(transferred.routeProfile[0].roadSpeedLimitKmh,80);
  assert.equal(transferred.routeProfile[0].roadSpeedConstraintKmh,90);
  assert.equal(transferred.routeProfile[0].speedLimitKmh,350);
  assert.deepEqual(reverseRouteProfile(reverseRouteProfile(plan.routeProfile)),validateRouteProfile(plan.routeProfile));
  assert.deepEqual(segmentLineTiers(transferred.routeProfile[0],'road',2035).map(t=>t.speedLimitKmh),[80,90]);
  const selection=createRouteSelection(transferred.routeProfile[0]);
  selection.updateSimple({distanceKm:3});assert.equal(selection.segments[0].roadSpeedConstraintKmh,90);
  selection.updateSimple({roadSpeedLimitKmh:120});assert.equal(selection.segments[0].roadSpeedConstraintKmh,undefined);
  const historicalCity=lineInfrastructurePlan([{...part,roadSpeedLimitKmh:40}],'road',[segmentLineTiers({...part,roadSpeedLimitKmh:40},'road',1939)[0]]);
  assert.ok(segmentLineTiers(historicalCity.routeProfile[0],'road',2035).every(t=>t.city&&t.speedLimitKmh<=40));
  assert.throws(()=>validateRouteProfile([{...part,roadLanes:3}]),/2 or 4/);
});

const [trains,buses,trucks]=await Promise.all(['trains','buses','trucks'].map(async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)))));
const catalogue={units:trains.source,trains:trains.trains.filter(v=>v.id==='ice-1'),locomotives:[],passengerWagons:[],freightWagons:[],
  buses:buses.buses.filter(v=>v.id==='king-long-merry-combo'),trucks:trucks.trucks.filter(v=>v.id==='tesla-semi')};
function* plans(route,domain,year,index=0,chosen=[]){
  if(index===route.length){yield lineInfrastructurePlan(route,domain,[...chosen]);return;}
  for(const tier of segmentLineTiers(route[index],domain,year)){chosen[index]=tier;yield* plans(route,domain,year,index+1,chosen);}
}

test('segment search matches full enumeration across fleet, minimum interval and leg-time bounds',()=>{
  let feasible=0,mixed=0;
  const routeProfile=[{...part,distanceKm:2,gradePercent:.4,roadLanes:4},{...part,distanceKm:1,speedLimitKmh:130,roadSpeedLimitKmh:90,roadLanes:4},{...part,distanceKm:3,gradePercent:-.4,roadLanes:4}];
  for(const domain of ['rail','road'])for(const category of ['passengers','freight']){
    if(domain==='rail'&&category==='freight')continue;
    for(const bounds of [{rate:1000,minHeadwaySeconds:null},{rate:1000,minHeadwaySeconds:30},{rate:5000,minHeadwaySeconds:60},{rate:1000,minHeadwaySeconds:15,maxHeadwaySeconds:120,maxOutboundLegSeconds:180,maxReturnLegSeconds:180}]){
      const request=optimizerRequest({...bounds,domain,category,loadedReturn:category==='freight',lineInfrastructure:{},routeProfile,maxTrainLength:400});
      for(const candidate of optimizerCandidates(catalogue,request)){
        const actual=evaluateOptimizerCandidate(candidate,catalogue,request).result;
        let expected=null;
        for(const plan of plans(routeProfile,domain,request.year)){
          const {result}=evaluateOptimizerCandidate(candidate,catalogue,{...request,lineInfrastructure:null,routeProfile:plan.routeProfile});
          if(!result)continue;
          result.cost+=plan.segments.reduce((sum,part)=>sum+part.annualMaintenance*(plan.domain==='rail'&&result.fleet>1&&part.trackCount===1?2:1),0);
          if(!expected||compareOptimizerResults(result,expected)<0)expected=result;
        }
        assert.equal(!!actual,!!expected);
        if(!actual)continue;
        feasible++;
        assert.ok(Math.abs(actual.cost-expected.cost)<1e-6);
        assert.equal(actual.cost,actual.vehicleRunningCosts+actual.routeRunningCosts+actual.terminalRunningCosts);
        if(new Set(actual.routeInfrastructure.segments.map(t=>t.tierSpeedKmh)).size>1)mixed++;
        const html=renderOptimizerProposals({request,best:{[domain]:[actual]}},domain);
        assert.ok(html.includes('Selected '+(domain==='rail'?'track':'road')+' tiers'));
      }
    }
  }
  assert.ok(feasible>0);assert.ok(mixed>0);
});

test('joint track and freight terminal search retains storage limits and counts every upkeep once',async()=>{
  const [engines,wagons]=await Promise.all(['rail-locomotives','rail-freight-wagons'].map(async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)))));
  const data={...catalogue,trains:[],locomotives:engines.locomotives.filter(v=>v.id==='german-class-246'),freightWagons:wagons.wagons.filter(v=>v.id==='gondola-wagon-2001')};
  const terminal={id:'generic',name:'Generic',annualMaintenance:1000,maxTrainLength:840,existing:false,specializedTerminal:false,specializedWarehouse:false};
  const infrastructure={rail:{stopA:[terminal,{...terminal,id:'specialized',specializedTerminal:true,annualMaintenance:20000}],stopB:[terminal]},
    sites:{stopA:{type:'warehouse',warehouseCapacity:500,maxWarehouseCapacity:500},stopB:{type:'warehouse',warehouseCapacity:500,maxWarehouseCapacity:500}}};
  const routeProfile=[{...part,distanceKm:4},{...part,distanceKm:2,speedLimitKmh:130}];
  const request=optimizerRequest({domain:'rail',category:'freight',cargo:'bulk',loadedReturn:true,rate:10000,minHeadwaySeconds:null,maxHeadwaySeconds:null,lineInfrastructure:{},infrastructure,routeProfile});
  const candidate=[...optimizerCandidates(data,request)].at(-1),actual=evaluateOptimizerCandidate(candidate,data,request).result;
  let expected=null;
  for(const plan of plans(routeProfile,'rail',request.year)){
    const {result}=evaluateOptimizerCandidate(candidate,data,{...request,lineInfrastructure:null,routeProfile:plan.routeProfile});
    if(!result)continue;
    result.cost+=plan.segments.reduce((sum,part)=>sum+part.annualMaintenance*(plan.domain==='rail'&&result.fleet>1&&part.trackCount===1?2:1),0);
    if(!expected||compareOptimizerResults(result,expected)<0)expected=result;
  }
  assert.ok(actual&&expected);assert.equal(actual.cost,expected.cost);
  assert.ok(actual.capacity>500);assert.ok(actual.capacity*actual.utilization<=500+1e-7);
  assert.equal(actual.terminalRunningCosts,actual.infrastructure.annualMaintenance);
  assert.equal(actual.infrastructureRunningCosts,actual.routeRunningCosts+actual.terminalRunningCosts);
  assert.equal(actual.cost,actual.vehicleRunningCosts+actual.infrastructureRunningCosts);
  const opened=optimizerProposalRequest(actual,request);
  assert.deepEqual(opened.routeProfile,actual.routeInfrastructure.routeProfile);
  assert.ok(opened.fillRatio<=500/actual.capacity);
});

test('joint Road tier and serial-terminal search matches full tier enumeration with waiting',()=>{
  const data={trucks:trucks.trucks.filter(v=>v.id==='man-19304')};
  const terminal={mode:'new',maxPlatformLength:40,maxPlatforms:2,allowSpecialization:true};
  const routeProfile=[{...part,distanceKm:2,roadLanes:2},{...part,distanceKm:3,roadLanes:4,gradePercent:.4}];
  const request=optimizerRequest({domain:'road',category:'freight',rate:750,minHeadwaySeconds:null,lineInfrastructure:{},routeProfile,
    infrastructure:{road:{stopA:terminal,stopB:terminal}}});
  const candidate=[...optimizerCandidates(data,request)][0],actual=evaluateOptimizerCandidate(candidate,data,request).result;
  let expected=null;
  for(const plan of plans(routeProfile,'road',request.year)){
    const {result}=evaluateOptimizerCandidate(candidate,data,{...request,lineInfrastructure:null,routeProfile:plan.routeProfile});
    if(!result)continue;
    result.cost+=plan.segments.reduce((sum,part)=>sum+part.annualMaintenance*(plan.domain==='rail'&&result.fleet>1&&part.trackCount===1?2:1),0);
    if(!expected||compareOptimizerResults(result,expected)<0)expected=result;
  }
  assert.ok(actual&&expected);
  assert.ok(Math.abs(actual.cost-expected.cost)<1e-7);
  assert.ok(Math.abs(actual.cycle-expected.cycle)<1e-7);
  assert.equal(actual.cost,actual.vehicleRunningCosts+actual.routeRunningCosts+actual.terminalRunningCosts);
});

test('Rail route upkeep chooses one or two tracks from the fleet and preserves imposed double track',()=>{
  const route=[{...part,distanceKm:10}],make=(rate,routeProfile=route)=>optimizerRequest({domain:'rail',category:'passengers',rate,
    minHeadwaySeconds:null,lineInfrastructure:{},routeProfile,maxTrainLength:400});
  const one=make(100),auto=evaluateOptimizerCandidate([...optimizerCandidates(catalogue,one)][0],catalogue,one).result;
  assert.ok(auto);assert.equal(auto.fleet,1);assert.equal(auto.routeInfrastructure.segments[0].trackCount,1);
  const forced=make(100,[{...route[0],railTracks:2}]);
  const double=evaluateOptimizerCandidate([...optimizerCandidates(catalogue,forced)][0],catalogue,forced).result;
  assert.equal(double.fleet,1);assert.equal(double.routeRunningCosts,2*auto.routeRunningCosts);
  assert.equal(double.cost-auto.cost,auto.routeRunningCosts);
  const opened=optimizerProposalRequest(double,forced);
  assert.equal(opened.routeProfile[0].railTracks,2);
  assert.equal(reverseRouteProfile(opened.routeProfile)[0].railTracks,2);
  const busy=make(1000),larger=evaluateOptimizerCandidate([...optimizerCandidates(catalogue,busy)][0],catalogue,busy).result;
  assert.ok(larger.fleet>1);assert.equal(larger.routeInfrastructure.segments[0].trackCount,2);
  const mixed=make(100,[{...part,railTracks:2},{...part,distanceKm:3}]);
  const result=evaluateOptimizerCandidate([...optimizerCandidates(catalogue,mixed)][0],catalogue,mixed).result;
  assert.equal(result.fleet,1);assert.deepEqual(result.routeInfrastructure.segments.map(s=>s.trackCount),[2,1]);
  assert.throws(()=>optimizerRequest({...one,routeProfile:[{...part,railTracks:1}]}),/automatic or fixed at 2/);
});

test('joint Rail tier and no-wait terminal search agrees with full tier enumeration',()=>{
  const terminal={mode:'new',maxTrainLength:400,maxPlatformTracks:3};
  const routeProfile=[{...part,distanceKm:4},{...part,distanceKm:2,speedLimitKmh:130,railTracks:2}];
  const request=optimizerRequest({domain:'rail',category:'passengers',rate:5000,minHeadwaySeconds:null,lineInfrastructure:{},routeProfile,
    infrastructure:{rail:{stopA:terminal,stopB:terminal}}});
  const candidate=[...optimizerCandidates(catalogue,request)][0],actual=evaluateOptimizerCandidate(candidate,catalogue,request).result;
  let expected=null;
  for(const plan of plans(routeProfile,'rail',request.year)){
    const {result}=evaluateOptimizerCandidate(candidate,catalogue,{...request,lineInfrastructure:null,routeProfile:plan.routeProfile});
    if(!result)continue;
    result.cost+=plan.segments.reduce((sum,part)=>sum+part.annualMaintenance*(result.fleet>1&&part.trackCount===1?2:1),0);
    if(!expected||compareOptimizerResults(result,expected)<0)expected=result;
  }
  assert.ok(actual&&expected);assert.equal(actual.cost,expected.cost);
  assert.equal(actual.infrastructure.stopA.platformTrackCount,expected.infrastructure.stopA.platformTrackCount);
  assert.equal(actual.cost,actual.vehicleRunningCosts+actual.routeRunningCosts+actual.terminalRunningCosts);
});
