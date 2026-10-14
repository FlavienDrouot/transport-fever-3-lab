import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {serviceStudyTargets,automaticRaceDistance,clipStudyStory,withStudyDistance,automaticCostDistance,automaticCostStudyAllowed,serviceSteadyDistance,uniformServiceStudyOptions} from '../src/comparison-study.js';
import {economicSelection} from '../src/economic-selection.js';
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


test('automatic Service suspends saved fleet requirements and train constraints without changing utilization or bounded requests',()=>{
  const stored={studyScope:'auto',demandPerDirection:100000,maxHeadwaySeconds:30,frequencyMode:'closest',allowMultipleUnits:true,fillRatio:.75,platformLengthMetres:320};
  const automatic=serviceStudyTargets(stored);
  assert.equal(automaticCostStudyAllowed(automatic),true);
  assert.equal(automatic.fillRatio,.75);assert.equal(automatic.platformLengthMetres,null);
  const train=trains.find(t=>t.id==='twindexx');
  const result=analyseEconomicService(train,{distanceKm:10,...automatic});
  const reference=analyseEconomicService(train,{distanceKm:10,fillRatio:.75});
  assert.equal(result.trainCount,reference.trainCount);
  assert.equal(result.maintenancePerUnit,reference.maintenancePerUnit);
  assert.equal(stored.demandPerDirection,100000);assert.equal(stored.maxHeadwaySeconds,30);assert.equal(stored.allowMultipleUnits,true);
  for(const scope of [{studyScope:'distance'},{studyCustomRoute:true}]){
    const bounded={...stored,...scope},active=serviceStudyTargets(bounded);
    assert.equal(active,bounded);
    assert.ok(analyseEconomicService(train,{distanceKm:10,...active}).trainCount>result.trainCount);
  }
  assert.equal(serviceStudyTargets({...stored,freight:true,demandPerYear:500}).demandPerYear,null);
  const short={...stored,platformLengthMetres:1},selected=new Set([train.id]);
  assert.equal(economicSelection([train],selected,serviceStudyTargets(short)).eligible.length,1);
  assert.equal(economicSelection([train],selected,serviceStudyTargets({...short,studyScope:'distance'})).empty,'length');
  assert.equal(stored.platformLengthMetres,320);
});

test('automatic Rail cost stories and distance curves ignore retained simple-route lengths',async()=>{
  const {renderEconomicChart}=await import('../src/economic-chart.js');
  const cohort=trains.filter(t=>['metroliner','twindexx','fuxing'].includes(t.id));
  let expectedStory,expectedSvg;
  for(const distance of [.1,3.4,100]){
    const targets={studyScope:'auto',routeProfile:[{distanceKm:distance,gradePercent:0,speedLimitKmh:160}]};
    const story=economicStory(cohort,distance,.75,targets);
    assert.equal(story.current,null);assert.equal(story.automatic,true);
    const snapshot={start:story.start,end:story.end,phases:story.phases,intervals:story.intervals,roots:story.roots};
    const container={id:'study-cost',clientWidth:900};
    renderEconomicChart(container,{trains:cohort,distance:story.end,startDistance:story.start,referenceDistance:null,fill:.75,mode:'linear',targets:uniformServiceStudyOptions(targets)});
    assert.doesNotMatch(container.innerHTML,/km route|NaN|Infinity/);
    if(expectedStory){assert.deepEqual(snapshot,expectedStory);assert.equal(container.innerHTML,expectedSvg);}
    else{expectedStory=snapshot;expectedSvg=container.innerHTML;}
    const zero=economicStory(cohort,distance,0,targets);
    assert.equal(zero.start,.1);assert.equal(zero.end,1);assert.equal(zero.current,null);
  }
  const bounded=economicStory(cohort,3.4,.75,{studyScope:'distance'});
  assert.equal(bounded.current,3.4);assert.equal(bounded.end,3.4);
  const container={id:'bounded-cost',clientWidth:900};
  renderEconomicChart(container,{trains:cohort,distance:3.4,fill:.75,mode:'linear'});
  assert.match(container.innerHTML,/3.4 km route/);
});

test('automatic Road diagrams ignore retained distance, preserve the Road cap and omit reference markers',async()=>{
  const {renderRoadPhases,automaticRoadCostStory}=await import('../src/road-phases.js');
  const {analysePassengerRoadService}=await import('../src/trucks.js');
  const buses=(await read('buses')).buses.slice(-4),selection={category:'passengers',year:2035};
  const nodes=Object.fromEntries(['road-phase-axis','road-cost-scale','road-rank-scale','road-phase-help','road-cost-phases-chart','road-rank-phases-chart'].map(id=>[id,{id,value:'focus',clientWidth:900,querySelector(){return {value:this.value};}}]));
  nodes['road-phase-axis'].value='distance';
  const document={getElementById:id=>nodes[id]};
  let expected;
  for(const distance of [.1,3.4,100]){
    const options={studyScope:'auto',distanceKm:distance,fillRatio:.75,motion:true,passenger:true,routeProfile:[{distanceKm:distance,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:80}]};
    renderRoadPhases(document,{buses,trucks:[],trams:[],freightTrams:[]},selection,options);
    const actual={cost:nodes['road-cost-phases-chart'].innerHTML,rank:nodes['road-rank-phases-chart'].innerHTML,help:nodes['road-phase-help'].textContent};
    assert.doesNotMatch(actual.cost,/Current setting|NaN|Infinity/);
    if(expected)assert.deepEqual(actual,expected);else expected=actual;
    const story=automaticRoadCostStory(buses,options);
    const reference=analysePassengerRoadService(buses,{distanceKm:.25,fillRatio:.75,roadSpeedLimit:80,motion:true});
    for(const row of reference)assert.ok(Math.abs(story.valueAt(row.truck.id,.25)-row.costPerCargo)<1e-8);
  }
  renderRoadPhases(document,{buses,trucks:[],trams:[],freightTrams:[]},selection,{studyScope:'distance',distanceKm:3.4,fillRatio:.75,motion:true,passenger:true});
  assert.match(nodes['road-cost-phases-chart'].innerHTML,/Current setting: 3.4/);
});
