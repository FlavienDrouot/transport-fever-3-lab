import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {automaticRaceDistance,clipStudyStory,withStudyDistance,automaticCostDistance,automaticCostStudyAllowed,serviceSteadyDistance,uniformServiceStudyOptions} from '../src/comparison-study.js';
import {crossoverStory} from '../src/crossovers.js';
import {motionCurveEnd,motionTransitions,speedOrdinateMaximum,renderModelTransitions} from '../src/motion-chart.js';
import {economicStory} from '../src/economic-crossovers.js';
import {withRailProfile} from '../src/rail-motion.js';
import {analyseEconomicService} from '../src/rail-freight.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const source=await read('trains');
const trains=source.trains.map(t=>({...t,model:createModel(t,source.source)}));
const fake=(id,speed,offset)=>({id,maxSpeedKmh:speed,model:{speedCapKm:1,timeAt:x=>3600*x/speed+offset}});

test('automatic Race range follows the final leader, without a fixed kilometre ceiling or late losing crossings',()=>{
  const cohort=[fake('a',100,0),fake('b',200,1800)];
  assert.ok(automaticRaceDistance(cohort)>100);
  const leader=fake('leader',1000,0),losers=[fake('slow',100,0),fake('fast',200,1800)];
  assert.equal(automaticRaceDistance([leader,...losers]),automaticRaceDistance([leader]));
});
test('a bounded story omits later phases and never labels its boundary as infinite',()=>{
  const cohort=[fake('a',100,0),fake('b',200,18),fake('c',400,45)],original=crossoverStory(cohort),before=structuredClone(original);
  const short=clipStudyStory(original,2);
  assert.deepEqual(short.phases.map(p=>p.leaders),[['a'],['b']]);assert.equal(short.end,2);
  assert.ok(short.intervals.every(p=>p.end<=2));assert.ok(short.phases.every(p=>!p.unbounded));
  assert.deepEqual(original,before);
  const automatic=clipStudyStory(original,automaticRaceDistance(cohort),{unbounded:true});assert.equal(automatic.phases.at(-1).unbounded,true);
});
test('specified distance clips speed, arrival curves, transition rows and CSV sampling endpoints consistently',()=>{
  const train=trains.find(t=>t.id==='avelia-liberty'),bounded=withStudyDistance(train,.1),arrival=train.model.timeAt(.1);
  assert.equal(withStudyDistance(train,.1),bounded);assert.equal(train.model.studyDistanceKm,undefined);
  assert.equal(motionCurveEnd(bounded,'distance',arrival*4),arrival);assert.equal(motionCurveEnd(bounded,'speed',arrival*4),arrival);
  assert.equal(motionCurveEnd(bounded,'time',.1),.1);
  const transitions=motionTransitions(bounded,'speed');assert.equal(transitions.at(-1).time,arrival);assert.equal(transitions.at(-1).label,'End of study');
  assert.ok(transitions.every(t=>t.time<=arrival));
  assert.ok(speedOrdinateMaximum([bounded],arrival*4,'speed')<train.maxSpeedKmh);
  assert.doesNotMatch(renderModelTransitions([bounded]),/NaN|Infinity/);
  const profile=withRailProfile(train,[{distanceKm:2,gradePercent:0,speedLimitKmh:160},{distanceKm:1,gradePercent:0,speedLimitKmh:40}]);
  assert.equal(withStudyDistance(profile,3),profile);
  assert.ok(profile.model.effectiveMaxSpeedKmh>profile.model.stateAt(profile.model.timeAt(3)).speedKmh);
});
test('automatic affine cost exploration includes distant tail crossings and isolates constrained fleets',()=>{
  const cost=(id,d)=>id==='a'?d:500+.5*d;
  assert.ok(automaticCostDistance([{id:'a'},{id:'b'}],cost,10)>1000);
  assert.equal(automaticCostStudyAllowed({studyScope:'auto'}),true);
  for(const options of [{studyCustomRoute:true},{demandPerDirection:1000},{demandPerYear:1000},{maxHeadwaySeconds:300}])assert.equal(automaticCostStudyAllowed({studyScope:'auto',...options}),false);
});
test('unconstrained Service auto covers all later stable-tail leaders; custom/targeted Service respects its declared range',()=>{
  const cohort=trains.filter(t=>['metroliner','twindexx','fuxing'].includes(t.id)),targets={studyScope:'auto',routeProfile:[{distanceKm:10,gradePercent:0,speedLimitKmh:350}]};
  const story=economicStory(cohort,10,1,targets);
  assert.equal(story.automatic,true);assert.ok(Number.isFinite(story.end));assert.equal(story.phases.at(-1).unbounded,true);
  const winner=story.phases.at(-1).leaders[0];
  for(const distance of [story.end*2,story.end*10,story.end*100]){
    const options={distanceKm:distance,fillRatio:1,...uniformServiceStudyOptions(targets)};
    const best=[...cohort].sort((a,b)=>analyseEconomicService(a,options).maintenancePerUnit-analyseEconomicService(b,options).maintenancePerUnit)[0];
    assert.equal(best.id,winner);
  }
  const steady=serviceSteadyDistance(cohort,targets);assert.ok(steady>0&&Number.isFinite(steady));
  const single=economicStory(cohort.slice(0,1),.1,1,targets);assert.equal(single.phases.length,1);assert.ok(single.end>=1);
  for(const extra of [{studyCustomRoute:true},{demandPerDirection:1000},{maxHeadwaySeconds:300},{studyScope:'distance'}]){
    const finite=economicStory(cohort,2,1,{...targets,...extra});assert.equal(finite.end,2);assert.equal(finite.automatic,false);
  }
});

test('automatic Road cost leaders remain stable beyond the tail, without distance-growing numerical ties',async()=>{
  const {roadPhaseStory}=await import('../src/road-phases.js');
  const {automaticCostTail}=await import('../src/comparison-study.js');
  const buses=(await read('buses')).buses;
  const options={distanceKm:10,fillRatio:1,motion:true,passenger:true,routeProfile:[{distanceKm:10,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:120}]};
  const probe=roadPhaseStory(buses,options),steady=serviceSteadyDistance(buses,options,true),tail=automaticCostTail(buses,probe.valueAt,steady);
  const story=roadPhaseStory(buses,options,{end:tail.end,rankingOptions:{knownRoots:tail.roots,absoluteTolerance:tail.absoluteTolerance}});
  const leaders=story.phases.at(-1).leaders;
  for(const distance of [tail.end*2,tail.end*100]){
    const best=Math.min(...buses.map(b=>probe.valueAt(b.id,distance)));
    const actual=buses.filter(b=>probe.valueAt(b.id,distance)<=best+tail.absoluteTolerance).map(b=>b.id).sort();
    assert.deepEqual(actual,leaders);
  }
});
