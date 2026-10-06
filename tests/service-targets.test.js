import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {analyseLine,analyseService,GAME_YEAR_SECONDS} from '../src/line.js';
const data=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
const train={...data.trains[0],model:createModel(data.trains[0],data.source)};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${a} ≠ ${b}`);
test('No service targets preserve the single-train cost and occupancy',()=>{
  const base=analyseLine(train,{distanceKm:10,fillRatio:.7}),service=analyseService(train,{distanceKm:10,fillRatio:.7});
  close(service.maintenancePerJourney,base.maintenancePerJourney);close(service.actualOccupancyRatio,.7);assert.equal(service.trainCount,1);close(service.headwaySeconds,base.roundTripSeconds);
});
test('Annual directional demand uses a whole fleet and adjusts transfers and occupancy',()=>{
  const r=analyseService(train,{distanceKm:10,fillRatio:.8,demandPerDirection:1000});
  assert.ok(Number.isInteger(r.trainCount));assert.ok(r.actualOccupancyRatio<=.8);close(r.perDirectionJourneysPerYear,1000);close(r.maintenancePerJourney,r.fleetMaintenance/2000);
  close(r.headwaySeconds*r.trainCount,r.roundTripSeconds);close(r.loadingSeconds,r.passengers/r.rate);
  if(r.trainCount>1){const smaller=analyseLine(train,{distanceKm:10,fillRatio:.8});assert.ok(smaller.journeysPerHour/3600*GAME_YEAR_SECONDS/2*(r.trainCount-1)<1000);}
});
test('A tighter station interval can increase fleet size and reduce actual occupancy',()=>{
  const options={distanceKm:10,fillRatio:1,demandPerDirection:200};const base=analyseService(train,options),r=analyseService(train,{...options,maxHeadwaySeconds:30});
  assert.ok(r.headwaySeconds<=30+1e-7);assert.ok(r.trainCount>base.trainCount);assert.ok(r.actualOccupancyRatio<base.actualOccupancyRatio);close(r.perDirectionJourneysPerYear,200);assert.ok(r.maintenancePerJourney>base.maintenancePerJourney);
});
test('Closest interval evaluates both adjacent feasible whole fleets',()=>{
  const base=analyseLine(train,{distanceKm:10,fillRatio:1});const target=base.roundTripSeconds/.9;
  const r=analyseService(train,{distanceKm:10,maxHeadwaySeconds:target,frequencyMode:'closest'});assert.equal(r.trainCount,1);
  const options={distanceKm:10,demandPerDirection:1000,maxHeadwaySeconds:180,frequencyMode:'closest'};const chosen=analyseService(train,options);close(chosen.perDirectionJourneysPerYear,1000);
  const fixed=2*chosen.travelSeconds+12, flow=1000/GAME_YEAR_SECONDS, transfer=4*flow/chosen.rate;
  for(const n of [chosen.trainCount-1,chosen.trainCount+1].filter(n=>n>=1&&n>transfer)){
    const passengers=flow*fixed/(n-transfer);if(passengers<=train.passengerCapacity)assert.ok(Math.abs(chosen.headwaySeconds-180)<=Math.abs(fixed/(n-transfer)-180)+1e-7);
  }
});
test('Frequency alone preserves occupancy and scales capacity and maintenance together',()=>{
  const options={distanceKm:10,fillRatio:.5};const base=analyseLine(train,options);const r=analyseService(train,{...options,maxHeadwaySeconds:30});assert.ok(r.headwaySeconds<=30);close(r.actualOccupancyRatio,.5);close(r.maintenancePerJourney,base.maintenancePerJourney);close(r.fleetMaintenance,train.economy.annualMaintenance*r.trainCount);
});
test('Invalid demand and interval policies are rejected',()=>{
  for(const extra of [{demandPerDirection:0},{demandPerDirection:NaN},{maxHeadwaySeconds:-1},{frequencyMode:'exact'},{demandPerDirection:100,fillRatio:0}])assert.throws(()=>analyseService(train,{distanceKm:10,...extra}),RangeError);
});
