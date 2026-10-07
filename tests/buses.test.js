import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyseBusService,trucksByYear,renderTruckService} from '../src/trucks.js';
const data=JSON.parse(await readFile(new URL('../data/buses.json',import.meta.url)));

test('Eight early passenger road cards retain capacity, speed, costs, multipliers and provenance',()=>{
  const expected=[['droschky',1892,4,17,9840,2],['stagecoach',1896,6,20,16147,3],['obeissante',1905,6,25,18359,2],['postbus-et13',1913,8,30,27303,2.5],['daimler-deck',1919,12,35,45037,1.5],['yellow-coach-w',1925,10,40,40827,2],['mitsubishi-fuso-b46',1932,8,50,37731,3],['saurer-tuscher',1939,10,50,47164,2]];
  assert.equal(data.buses.length,23);assert.equal(new Set(data.buses.map(b=>b.id)).size,23);
  for(const [id,year,cap,speed,cost,rate] of expected){const b=data.buses.find(b=>b.id===id);assert.equal(b.year,year);assert.equal(b.passengerCapacity,cap);assert.equal(b.maxSpeedKmh,speed);assert.equal(b.economy.annualMaintenance,cost);assert.equal(b.loadingUnloadingSpeedMultiplier,rate);assert.ok(b.comfort);assert.ok(!('cargoCapacity' in b));}
  assert.equal(data.buses.filter(b=>b.sourceCapture).length,22);
  assert.match(data.buses.find(b=>b.id==='saurer-tuscher').sourceEvidence,/Inline/);
  assert.equal(trucksByYear(data.buses,1891).length,0);assert.equal(trucksByYear(data.buses,1892).length,1);assert.equal(trucksByYear(data.buses,1939).length,8);
});
test('Bus cycle counts passenger journeys in both directions and ignores freight facility options',()=>{
  const bus={...data.buses[0],passengerCapacity:10,maxSpeedKmh:60,loadingUnloadingSpeedMultiplier:2,economy:{annualMaintenance:1460}};
  const options={distanceKm:1,fillRatio:.5,loadedReturn:false,specializedTerminal:true,specializedWarehouse:true};
  const [row]=analyseBusService([bus],options);
  assert.equal(row.handlingMultiplier,1);assert.equal(row.cargoPerLeg,5);assert.equal(row.deliveredPerCycle,10);
  assert.equal(row.loadingSeconds,5);assert.equal(row.unloadingSeconds,5);assert.equal(row.roundTripSeconds,142);assert.equal(row.costPerCargo,14.2);
  const [baseline]=analyseBusService([bus],{...options,specializedTerminal:false,specializedWarehouse:false,loadedReturn:true});assert.deepEqual(row,baseline);
  const [capped]=analyseBusService([bus],{...options,roadSpeedLimit:30});assert.equal(capped.travelSeconds,120);assert.equal(capped.roundTripSeconds,262);
  assert.deepEqual(analyseBusService([bus],{...options,baseRate:0.0625,terminalDelaySeconds:0}),[row]);
  assert.equal(bus.passengerCapacity,10);assert.equal(bus.cargoCapacity,undefined);
  assert.throws(()=>analyseBusService([{...bus,passengerCapacity:0}],options),RangeError);
});
test('Passenger rendering uses passenger vocabulary and filters chart and table consistently',()=>{
  const nodes=Object.fromEntries(['truck-service-summary','truck-service-readout','truck-bars'].map(id=>[id,{}]));
  renderTruckService({getElementById:id=>nodes[id]},trucksByYear(data.buses,1913),{distanceKm:1,passenger:true});
  assert.match(nodes['truck-service-summary'].textContent,/passenger journey/);assert.match(nodes['truck-service-summary'].textContent,/equal utilization/);assert.doesNotMatch(nodes['truck-service-summary'].textContent,/cargo unit|empty return/);
  assert.equal((nodes['truck-service-readout'].innerHTML.match(/<tr>/g)||[]).length,4);
  assert.equal((nodes['truck-bars'].innerHTML.match(/class="truck-bar-row/g)||[]).length,4);
  assert.doesNotMatch(nodes['truck-bars'].innerHTML,/NaN|Infinity|Mitsubishi/);
});
test('Eight additional bus cards retain independent costs, capacities and handling rates',()=>{
  const expected=[['scania-vabis-h15',1945,13,50,61313,367878,3],['aec-routemaster',1954,25,60,133062,798372,4],['citroen-u55-cityrama',1956,15,50,70745,848940,3],['gm-new-look-fishbowl',1959,10,70,59065,354390,4],['isuzu-bu10p',1963,15,60,79837,479022,1.5],['shinjin-microbus',1970,15,65,84256,505536,2.5],['mercedes-benz-o303',1974,15,90,105348,632088,3],['beijing-bk670',1976,20,70,118130,708780,2]];
  for(const [id,year,cap,speed,cost,price,rate] of expected){const b=data.buses.find(b=>b.id===id);assert.equal(b.year,year);assert.equal(b.passengerCapacity,cap);assert.equal(b.maxSpeedKmh,speed);assert.equal(b.economy.annualMaintenance,cost);assert.equal(b.economy.purchasePrice,price);assert.equal(b.loadingUnloadingSpeedMultiplier,rate);assert.match(b.sourceCapture,/^codex-clipboard-.+\.png$/);}
  assert.equal(trucksByYear(data.buses,1944).length,8);assert.equal(trucksByYear(data.buses,1945).length,9);assert.equal(trucksByYear(data.buses,1976).length,16);
  const rows=analyseBusService(data.buses,{distanceKm:1,roadSpeedLimit:50,specializedTerminal:true,specializedWarehouse:true});assert.equal(rows.length,23);assert.ok(rows.every(r=>Number.isFinite(r.costPerCargo)&&r.effectiveSpeedKmh<=50&&r.handlingMultiplier===1));
});
test('Seven recent bus cards preserve captured costs and electric vehicle parameters',()=>{
  const expected=[['mercedes-benz-o405-g',1985,24,80,155341,932046,2.5],['new-flyer-d40',1990,17,90,119395,716370,4],['mercedes-benz-citaro-g1',1997,28,80,181232,1087392,3],['irisbus-crossway-le',2007,20,120,172024,1032144,5],['wright-streetcar',2008,28,70,165382,992292,4],['zuhai-gtq',2017,30,60,159675,1916100,4.5],['mercedes-benz-ecitaro',2019,20,70,118130,2835120,5]];
  for(const [id,year,cap,speed,cost,price,rate] of expected){const b=data.buses.find(b=>b.id===id);assert.equal(b.year,year);assert.equal(b.passengerCapacity,cap);assert.equal(b.maxSpeedKmh,speed);assert.equal(b.economy.annualMaintenance,cost);assert.equal(b.economy.purchasePrice,price);assert.equal(b.loadingUnloadingSpeedMultiplier,rate);assert.match(b.sourceCapture,/^codex-clipboard-.+\.png$/);}
  assert.deepEqual(data.buses.filter(b=>b.propulsion==='electric').map(b=>b.id),['zuhai-gtq','mercedes-benz-ecitaro']);
  assert.equal(trucksByYear(data.buses,1984).length,16);assert.equal(trucksByYear(data.buses,1985).length,17);assert.equal(trucksByYear(data.buses,2018).length,22);assert.equal(trucksByYear(data.buses,2019).length,23);
  const rows=analyseBusService(data.buses,{distanceKm:1,roadSpeedLimit:80});assert.equal(rows.length,23);assert.ok(rows.every(r=>Number.isFinite(r.costPerCargo)&&r.effectiveSpeedKmh<=80));
});
