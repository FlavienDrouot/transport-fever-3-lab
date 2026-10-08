import test from 'node:test';
import assert from 'node:assert/strict';
import {analyseRoadFleet,analyseTruckService,analysePassengerRoadService} from '../src/trucks.js';
import {sizeFleet} from '../src/service-fleet.js';
import {roadPhaseStory} from '../src/road-phases.js';
const vehicle={id:'test',name:'Test',year:2000,maxSpeedKmh:80,cargoCapacity:30,passengerCapacity:30,loadingUnloadingSpeedMultiplier:4,economy:{annualMaintenance:24000}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('No road targets retain the one-vehicle calculation',()=>{
  const opts={distanceKm:5,fillRatio:.8};const old=analyseTruckService([vehicle],opts)[0],row=analyseRoadFleet([vehicle],opts)[0];
  assert.equal(row.vehicleCount,1);close(row.costPerCargo,old.costPerCargo);close(row.deliveredPerYear,old.cargoPerYear);assert.equal(row.actualFillRatio,.8);
});
test('Whole road fleets satisfy a given flow and maximum interval; actual load, handling and cost reconcile',()=>{
  for(const passenger of [false,true])for(const loadedReturn of [false,true])for(const demandPerYear of [100,1000,10000]){
    const opts={distanceKm:12,fillRatio:.7,passenger,loadedReturn,demandPerYear,maxHeadwaySeconds:100,stopA:{specializedTerminal:true},stopB:{specializedWarehouse:true}};
    const row=analyseRoadFleet([vehicle],opts)[0];
    close(row.deliveredPerYear,demandPerYear);assert.ok(Number.isInteger(row.vehicleCount));assert.ok(row.actualFillRatio<=.7);assert.ok(row.headwaySeconds<=100+1e-7);
    const measured=(passenger?analysePassengerRoadService:analyseTruckService)([vehicle],{...opts,fillRatio:row.actualFillRatio})[0];
    close(measured.roundTripSeconds/row.vehicleCount,row.headwaySeconds);close(row.fleetMaintenance,24000*row.vehicleCount);close(row.costPerCargo,row.fleetMaintenance/demandPerYear);
  }
});
test('Closest frequency chooses the closest achievable whole fleet while respecting capacity',()=>{
  const baseline={cycleSeconds:520,transferSeconds:120,unitsPerCycle:20};
  for(const demandPerYear of [null,50,300,2000])for(const target of [100,150,300]){
    const result=sizeFleet(baseline,{demandPerYear,maxHeadwaySeconds:target,frequencyMode:'closest'});
    const flow=demandPerYear===null?null:demandPerYear/1460;
    const candidates=Array.from({length:100},(_,i)=>i+1).filter(n=>flow===null||n>=Math.ceil(flow*520/20-1e-10)).map(n=>({n,interval:flow===null?520/n:400/(n-flow*120/20)}));
    candidates.sort((a,b)=>Math.abs(a.interval-target)-Math.abs(b.interval-target)||a.n-b.n);
    assert.equal(result.count,candidates[0].n);
  }
});
test('Road phase values include the fleet targets, rather than the old proportional cost approximation',()=>{
  const opts={distanceKm:5,fillRatio:.8,demandPerYear:1000,maxHeadwaySeconds:120};
  for(const axis of ['distance','utilization','year']){
    const story=roadPhaseStory([vehicle],opts,{axis,start:axis==='year'?1900:axis==='distance'?.1:1,end:axis==='year'?2035:axis==='distance'?10:100});
    for(const x of axis==='year'?[2000,2035]:axis==='distance'?[.1,2,10]:[1,50,100]){
      const row=analyseRoadFleet([vehicle],{...opts,...(axis==='distance'?{distanceKm:x}:axis==='utilization'?{fillRatio:x/100}:{})})[0];
      close(story.valueAt(vehicle.id,x),row.costPerCargo);
    }
  }
});
