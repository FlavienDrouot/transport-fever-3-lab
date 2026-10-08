import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {isCampaignResource,reconcileNames} from '../src/catalogue-reconciliation.js';
import {filterSourceVehicles,sourceRows} from '../src/source-catalogue.js';
import {selectRoadVehicles,analyseTruckService,analysePassengerRoadService} from '../src/trucks.js';
import {tramComponents} from '../src/consists.js';
const load=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [catalogue,trucks,buses,trams,locos,passWagons,freightWagons]=await Promise.all(['source-catalogue','trucks','buses','trams','tram-locomotives','tram-passenger-wagons','tram-freight-wagons'].map(load));
const groups=[['trucks','trucks','truck',trucks.trucks],['buses','buses','bus',buses.buses],['trams','trams','tram',trams.trams],['trams','freightTrams','tram',trams.freightTrams],['tram-locomotives','locomotives','tram',locos.locomotives],['tram-passenger-wagons','wagons','tram',passWagons.wagons],['tram-freight-wagons','wagons','tram',freightWagons.wagons]];
const observations=groups.flatMap(([file,key,category,cards])=>cards.map(card=>({reference:`data/${file}.json#${card.id}`,category,card})));
const datasets={trucks:trucks.trucks,buses:buses.buses,trams:trams.trams,freightTrams:trams.freightTrams};

test('Every installed non-campaign road/tram model has one complete calculator or configurator identity',()=>{
  const expected=catalogue.vehicles.filter(v=>v.isTransportVehicle&&['bus','truck','tram'].includes(v.category)&&!isCampaignResource(v));
  assert.equal(expected.length,133);
  const matches=reconcileNames(catalogue,observations);
  assert.ok(matches.every(r=>r.status==='matched'));
  const matchedIds=new Set(matches.map(r=>r.sourceId));assert.equal(matchedIds.size,133);
  for(const record of expected){
    assert.ok(matchedIds.has(record.id),record.id);assert.ok(record.name.value);
    const observation=observations.find(o=>o.reference===record.nameReconciliation.observation);
    assert.ok(observation,record.id);
    assert.equal(record.displayValues.capacity,observation.card.passengerCapacity??observation.card.cargoCapacity??0);
    assert.equal(record.displayValues.annualMaintenance,observation.card.economy.annualMaintenance);
    for(const value of ['year','capacity','maxSpeedKmh','annualMaintenance','purchasePrice','massTonnes','lengthMetres',...(record.displayValues.capacity>0?['loadingUnloadingSpeedMultiplier']:[])])assert.ok(Number.isFinite(record.displayValues[value]),`${record.id}: ${value}`);
  }
  assert.ok(!filterSourceVehicles(catalogue,{includeAuxiliary:true}).some(isCampaignResource));
  assert.doesNotMatch(sourceRows(expected),/Unknown|Awaiting validation| · estimate| · observed|VEHICLE_/);
});

test('All powered vehicles reach the Road selectors/calculators and every tram component reaches the configurator',()=>{
  const seen=new Set();
  for(const cargo of ['all','bulk','goods','flatbed','liquid']){
    const cohort=selectRoadVehicles(datasets,{category:'freight',includeTrams:true,cargo,year:2035});
    cohort.forEach(v=>seen.add(v.id));
    assert.ok(analyseTruckService(cohort,{distanceKm:1}).every(r=>Number.isFinite(r.costPerCargo)));
  }
  const passenger=selectRoadVehicles(datasets,{category:'passengers',includeTrams:true,year:2035});passenger.forEach(v=>seen.add(v.id));
  assert.equal(passenger.length,46);assert.ok(analysePassengerRoadService(passenger,{distanceKm:1}).every(r=>Number.isFinite(r.costPerCargo)));
  assert.equal(seen.size,107);assert.equal(trucks.trucks.length,52);assert.equal(buses.buses.length,25);
  for(const id of ['rivian-edv','tesla-semi','king-long-merry-combo','stadler-citylink','stadler-tina','articulated-freight-tram'])assert.ok(seen.has(id));
  const components=tramComponents({locomotives:locos.locomotives,passengerWagons:passWagons.wagons,freightWagons:freightWagons.wagons,passengerTrams:trams.trams,freightTrams:trams.freightTrams});
  assert.equal(components.length,56);
});
