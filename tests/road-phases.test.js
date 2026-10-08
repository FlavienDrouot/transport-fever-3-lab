import test from 'node:test';
import assert from 'node:assert/strict';
import {roadPhaseStory,renderRoadPhases} from '../src/road-phases.js';
import {analyseTruckService,analysePassengerRoadService} from '../src/trucks.js';
const vehicle=(id,year,capacity,speed,maintenance,handling)=>({id,name:id,year,cargoCapacity:capacity,maxSpeedKmh:speed,loadingUnloadingSpeedMultiplier:handling,economy:{annualMaintenance:maintenance},freightSpecialization:'general'});
const vehicles=[vehicle('small',1900,8,40,10000,6),vehicle('large',2000,20,80,20000,2)];
const options={distanceKm:1,fillRatio:.75,loadedReturn:false,stopA:{specializedTerminal:true,specializedWarehouse:true},stopB:{specializedTerminal:false,specializedWarehouse:false}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('A and B facilities apply only to transfers at their own stop, including loaded returns',()=>{
  const [row]=analyseTruckService([vehicles[0]],options);
  assert.equal(row.handlingMultiplierA,4);assert.equal(row.handlingMultiplierB,1);
  assert.equal(row.loadingSeconds,4);assert.equal(row.unloadingSeconds,16);
  const [reverse]=analyseTruckService([vehicles[0]],{...options,stopA:options.stopB,stopB:options.stopA});
  assert.equal(reverse.loadingSeconds,16);assert.equal(reverse.unloadingSeconds,4);close(reverse.costPerCargo,row.costPerCargo);
  const [loaded]=analyseTruckService([vehicles[0]],{...options,loadedReturn:true});
  assert.equal(loaded.loadingSeconds,20);assert.equal(loaded.unloadingSeconds,20);
  const passenger={...vehicles[0],passengerCapacity:8};
  const [p]=analysePassengerRoadService([passenger],options);assert.equal(p.handlingMultiplierA,1);assert.equal(p.handlingMultiplierB,1);
});
test('Distance and utilization chart values reproduce the calculator throughout their domain',()=>{
  for(const axis of ['distance','utilization']){
    const story=roadPhaseStory(vehicles,options,{axis,start:axis==='distance'?.1:1,end:axis==='distance'?5:100});
    for(const x of axis==='distance'?[.1,1,2.7,5]:[1,25,75,100]){
      const rows=analyseTruckService(vehicles,{...options,...(axis==='distance'?{distanceKm:x}:{fillRatio:x/100})});
      for(const row of rows)close(story.valueAt(row.truck.id,x),row.costPerCargo);
    }
    for(const interval of story.intervals){
      const x=(interval.start+interval.end)/2;
      const leader=vehicles.reduce((a,b)=>story.valueAt(a.id,x)<story.valueAt(b.id,x)?a:b);
      assert.equal(interval.ranks[leader.id],1);
    }
  }
});
test('Year phases introduce vehicles discretely and do not rank unavailable models',()=>{
  const story=roadPhaseStory(vehicles,options,{axis:'year',start:1885,end:2035});
  assert.equal(story.valueAt('small',1899),null);assert.equal(story.valueAt('large',1999),null);
  const before=story.intervals.find(p=>p.start===1900);assert.equal(before.ranks.small,1);assert.equal(before.ranks.large,null);
  assert.ok(story.intervals.some(p=>p.start===2000));
  const atLimit=vehicle('future',2035,100,100,10000,10);
  const final=roadPhaseStory([...vehicles,atLimit],options,{axis:'year',start:1885,end:2035});
  assert.equal(final.valueAt('future',2034),null);assert.equal(final.endRanks.future,1);
});
test('Both diagrams render all three axes without nonfinite SVG coordinates',()=>{
  const nodes=Object.fromEntries(['road-phase-axis','road-cost-scale','road-rank-scale','road-phase-help','road-cost-phases-chart','road-rank-phases-chart'].map(id=>[id,{value:'focus',clientWidth:900,querySelector(){return {value:this.value};}}]));
  const document={getElementById:id=>nodes[id]};
  for(const axis of ['year','distance','utilization']){
    nodes['road-phase-axis'].value=axis;
    renderRoadPhases(document,{trucks:vehicles,buses:[],trams:[],freightTrams:[]},{category:'freight',year:2035},options);
    for(const id of ['road-cost-phases-chart','road-rank-phases-chart']){
      assert.match(nodes[id].innerHTML,/<svg/);assert.doesNotMatch(nodes[id].innerHTML,/NaN|Infinity/);assert.match(nodes[id].innerHTML,/small/);
    }
  }
});
test('A costly losing vehicle cannot stretch the cost axis away from the winner',()=>{
  const cheap=vehicle('winner',1900,20,80,10000,4);
  const loser=vehicle('outlier',1900,20,80,10000000,4);
  const render=trucks=>{
    const nodes=Object.fromEntries(['road-phase-axis','road-cost-scale','road-rank-scale','road-phase-help','road-cost-phases-chart','road-rank-phases-chart'].map(id=>[id,{id,value:'focus',clientWidth:900,querySelector(){return {value:this.value};}}]));
    nodes['road-phase-axis'].value='distance';
    renderRoadPhases({getElementById:id=>nodes[id]},{trucks,buses:[],trams:[],freightTrams:[]},{category:'freight',year:2035},{...options,distanceKm:30});
    return nodes['road-cost-phases-chart'].innerHTML;
  };
  const alone=render([cheap]),withOutlier=render([cheap,loser]);
  const ticks=html=>[...html.matchAll(/<text x="57"[^>]*>([^<]*)<\/text>/g)].map(m=>m[1]);
  assert.deepEqual(ticks(withOutlier),ticks(alone));
  assert.doesNotMatch(withOutlier,/<text class="end-label" data-train="outlier"/);
  assert.match(withOutlier,/data-train="outlier"/); // Its curve remains in the clipped plot.
});
