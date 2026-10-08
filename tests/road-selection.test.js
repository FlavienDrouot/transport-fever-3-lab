import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectRoadVehicles,analysePassengerRoadService,analyseTruckService,renderTruckService} from '../src/trucks.js';
const truckData=JSON.parse(await readFile(new URL('../data/trucks.json',import.meta.url)));
const busData=JSON.parse(await readFile(new URL('../data/buses.json',import.meta.url)));
const tramData=JSON.parse(await readFile(new URL('../data/trams.json',import.meta.url)));
const datasets={trucks:truckData.trucks,buses:busData.buses,trams:tramData.trams,freightTrams:tramData.freightTrams};

test('Transport category merges only compatible vehicles and optionally includes trams',()=>{
  const freight=selectRoadVehicles(datasets,{category:'freight'});assert.equal(freight.length,50);assert.ok(freight.every(v=>v.vehicleType==='Truck'&&v.cargoCapacity>0&&v.passengerCapacity===undefined));
  const mixed=selectRoadVehicles(datasets,{category:'freight',includeTrams:true});assert.equal(mixed.length,58);assert.equal(mixed.filter(v=>v.vehicleType==='Tram').length,8);
  const passenger=selectRoadVehicles(datasets,{category:'passengers'});assert.equal(passenger.length,23);assert.ok(passenger.every(v=>v.vehicleType==='Bus'));
  const all=selectRoadVehicles(datasets,{category:'passengers',includeTrams:true});assert.equal(all.length,42);assert.equal(all.filter(v=>v.vehicleType==='Tram').length,19);assert.ok(all.every(v=>v.passengerCapacity>0&&v.cargoCapacity===undefined));
  assert.equal(new Set(all.map(v=>v.id)).size,42);assert.ok(datasets.trucks.every(v=>v.vehicleType===undefined));
  assert.throws(()=>selectRoadVehicles(datasets,{category:'unknown'}),RangeError);assert.throws(()=>selectRoadVehicles(datasets,{includeTrams:'yes'}),TypeError);
});
test('Shared freight and year filters apply to both vehicle types',()=>{
  for(const cargo of ['bulk','goods','liquid']){
    const selected=selectRoadVehicles(datasets,{category:'freight',includeTrams:true,cargo});assert.equal(selected.length,cargo==='liquid'?27:26);assert.ok(selected.every(v=>v.freightSpecialization==='general'||v.freightSpecialization===cargo));
  }
  assert.equal(selectRoadVehicles(datasets,{category:'freight',includeTrams:true,cargo:'flatbed'}).length,24);
  const early=selectRoadVehicles(datasets,{category:'passengers',includeTrams:true,year:1890});assert.equal(early.length,1);assert.equal(early[0].id,'horse-tram');
  assert.equal(selectRoadVehicles(datasets,{category:'passengers',includeTrams:false,year:1890}).length,0);
  const earlyFreight=selectRoadVehicles(datasets,{category:'freight',includeTrams:true,year:1890});assert.equal(earlyFreight.length,2);assert.ok(earlyFreight.some(v=>v.id==='horse-freight-tram'));
});
test('Combined comparisons retain absolute individual costs and distinguish vehicle types in output',()=>{
  const options={distanceKm:1,roadSpeedLimit:50,specializedTerminal:true,specializedWarehouse:true};
  for(const category of ['freight','passengers']){
    const vehicles=selectRoadVehicles(datasets,{category,includeTrams:true});
    const analyse=category==='passengers'?analysePassengerRoadService:analyseTruckService;
    const combined=analyse(vehicles,options);
    for(const row of combined){const [single]=analyse([row.truck],options);assert.equal(row.costPerCargo,single.costPerCargo);assert.equal(row.handlingMultiplier,category==='passengers'?1:4);}
    assert.ok(combined.every((row,i)=>i===0||combined[i-1].costPerCargo<=row.costPerCargo));
    const nodes=Object.fromEntries(['truck-service-summary','truck-service-readout','truck-bars'].map(id=>[id,{closest:()=>({classList:{toggle(){}}})}]));renderTruckService({getElementById:id=>nodes[id]},vehicles,{...options,passenger:category==='passengers'});
    assert.equal((nodes['truck-service-readout'].innerHTML.match(/<tr>/g)||[]).length,vehicles.length);assert.match(nodes['truck-bars'].innerHTML,/road-vehicle-kind">Tram/);assert.match(nodes['truck-bars'].innerHTML,category==='passengers'?/road-vehicle-kind">Bus/:/road-vehicle-kind">Truck/);
  }
});
