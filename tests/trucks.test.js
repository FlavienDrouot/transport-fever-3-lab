import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rankTrucks,trucksByYear,trucksForCargo,analyseTruckService,renderTruckService} from '../src/trucks.js';
const catalogue=JSON.parse(await readFile(new URL('../data/trucks.json',import.meta.url)));
const data={...catalogue,trucks:trucksForCargo(catalogue.trucks,'all')};
test('All eleven supplied freight cards retain capacity, speed, costs and capture provenance',()=>{
  const expected=[['small-horse-wagon',4,16,14285],['horse-wagon',6,20,24221],['steam-truck',10,25,45899],['amo-f15',12,40,73490],['saurer-c',15,60,119756],['gmc-660',22,70,194915],['isuzu-elf',10,80,97089],['mercedes-urban-etruck',18,80,174759],['man-19304',18,80,174759],['gaz-3307',16,90,168558],['faw-j6p',40,120,516072]];
  assert.equal(data.trucks.length,11);assert.equal(new Set(data.trucks.map(t=>t.id)).size,11);
  for(const [id,capacity,speed,cost] of expected){const t=data.trucks.find(t=>t.id===id);assert.equal(t.cargoCapacity,capacity);assert.equal(t.maxSpeedKmh,speed);assert.equal(t.economy.annualMaintenance,cost);assert.match(t.sourceCapture,/^codex-clipboard-.+\.png$/);assert.ok(t.year&&t.lengthMetres&&t.economy.purchasePrice);}
});
test('The index uses captured annual maintenance divided by capacity and effective speed',()=>{
  const rows=rankTrucks(data.trucks);assert.equal(rows[0].truck.id,'faw-j6p');assert.equal(rows[0].index,516072/(40*120));
  const small=rows.find(r=>r.truck.id==='small-horse-wagon');assert.equal(small.index,14285/(4*16));
  const capped=rankTrucks(data.trucks,80);assert.ok(capped.every(r=>r.effectiveSpeedKmh<=80));assert.deepEqual(capped.filter(r=>r.rank===1).map(r=>r.truck.id).sort(),['man-19304','mercedes-urban-etruck']);
  assert.equal(capped.find(r=>r.truck.id==='faw-j6p').index,516072/(40*80));assert.equal(data.trucks.find(t=>t.id==='faw-j6p').maxSpeedKmh,120);
  assert.deepEqual(rankTrucks(data.trucks,200),rows);
});
test('Truck limits and card values must be valid',()=>{
  for(const cap of [0,-1,NaN,Infinity])assert.throws(()=>rankTrucks(data.trucks,cap),RangeError);
  assert.throws(()=>rankTrucks([{...data.trucks[0],cargoCapacity:0}]),RangeError);assert.deepEqual(rankTrucks([]),[]);
});

test('Freight cycle counts both travel legs and handles each delivered unit once at each end',()=>{
  const truck={...data.trucks[0],cargoCapacity:10,maxSpeedKmh:60,loadingUnloadingSpeedMultiplier:2,economy:{annualMaintenance:1460}};
  const options={distanceKm:1};
  const [empty]=analyseTruckService([truck],options);
  assert.equal(empty.terminalDelaySeconds,4);assert.equal(empty.travelSeconds,60);assert.equal(empty.loadingSeconds,80);assert.equal(empty.unloadingSeconds,80);
  assert.equal(empty.roundTripSeconds,288);assert.equal(empty.deliveredPerCycle,10);assert.ok(Math.abs(empty.costPerCargo-28.8)<1e-10);
  const [loaded]=analyseTruckService([truck],{...options,loadedReturn:true});
  assert.equal(loaded.terminalDelaySeconds,6);assert.equal(loaded.loadingSeconds,160);assert.equal(loaded.roundTripSeconds,452);assert.equal(loaded.deliveredPerCycle,20);assert.equal(loaded.costPerCargo,22.6);
  const [half]=analyseTruckService([truck],{...options,fillRatio:.5,roadSpeedLimit:30});
  assert.equal(half.travelSeconds,120);assert.equal(half.loadingSeconds,40);assert.equal(half.roundTripSeconds,328);assert.ok(Math.abs(half.costPerCargo-65.6)<1e-10);
});
test('Freight handling changes short-route rankings and tends to the long-haul proxy on long routes',()=>{
  const truck={...data.trucks[0],cargoCapacity:10,maxSpeedKmh:60,economy:{annualMaintenance:1460}};
  const a={...truck,id:'fast',name:'Fast',loadingUnloadingSpeedMultiplier:1};
  const b={...truck,id:'handler',name:'Handler',maxSpeedKmh:30,loadingUnloadingSpeedMultiplier:10};
  assert.equal(rankTrucks([a,b])[0].truck.id,'fast');
  assert.equal(analyseTruckService([a,b],{distanceKm:.01})[0].truck.id,'handler');
  assert.equal(analyseTruckService([a,b],{distanceKm:100})[0].truck.id,'fast');
  const [long]=analyseTruckService([a],{distanceKm:1e7});
  assert.ok(Math.abs(long.costPerCargo/(long.index*7200*1e7/1460)-1)<1e-6);
});
test('Freight calculator rejects invalid assumptions and renders all vehicles with finite costs',()=>{
  for(const invalid of [{distanceKm:0},{distanceKm:NaN},{fillRatio:0},{fillRatio:1.1},{loadedReturn:'yes'}])assert.throws(()=>analyseTruckService(data.trucks,{distanceKm:10,...invalid}));
  assert.throws(()=>analyseTruckService([{...data.trucks[0],loadingUnloadingSpeedMultiplier:0}],{distanceKm:10}));
  const nodes=Object.fromEntries(['truck-service-summary','truck-service-readout','truck-bars'].map(id=>[id,{}]));
  renderTruckService({getElementById:id=>nodes[id]},data.trucks,{distanceKm:10,loadedReturn:false,roadSpeedLimit:80});
  assert.match(nodes['truck-service-summary'].textContent,/empty return/);assert.equal((nodes['truck-service-readout'].innerHTML.match(/<tr>/g)||[]).length,11);assert.doesNotMatch(nodes['truck-service-readout'].innerHTML,/NaN|Infinity/);
});

test('Truck year filtering includes introduction boundaries and preserves older vehicles',()=>{
  assert.equal(trucksByYear(data.trucks,1884).length,0);
  assert.deepEqual(trucksByYear(data.trucks,1885).map(t=>t.id),['small-horse-wagon']);
  assert.equal(trucksByYear(data.trucks,2019).length,10);
  assert.equal(trucksByYear(data.trucks,2020).length,11);
  assert.equal(data.trucks.length,11);
  assert.throws(()=>trucksByYear(data.trucks,NaN),RangeError);
});
test('Bars and table use the same filtered cost ranking and proportional zero-based widths',()=>{
  const nodes=Object.fromEntries(['truck-service-summary','truck-service-readout','truck-bars'].map(id=>[id,{}]));
  const options={distanceKm:1,roadSpeedLimit:80};
  const filtered=trucksByYear(data.trucks,1942), rows=analyseTruckService(filtered,options);
  renderTruckService({getElementById:id=>nodes[id]},filtered,options);
  const chart=nodes['truck-bars'].innerHTML;
  const widths=[...chart.matchAll(/style="width:([\d.]+)%"/g)].map(match=>Number(match[1]));
  assert.equal(widths.length,rows.length);
  rows.forEach((row,i)=>assert.ok(Math.abs(widths[i]-row.costPerCargo/rows.at(-1).costPerCargo*100)<1e-10));
  assert.ok(chart.indexOf(rows[0].truck.name)<chart.indexOf(rows.at(-1).truck.name));
  assert.equal((nodes['truck-service-readout'].innerHTML.match(/<tr>/g)||[]).length,rows.length);
  assert.doesNotMatch(chart,/FAW Jiefang|NaN|Infinity/);
  renderTruckService({getElementById:id=>nodes[id]},[],options);
  assert.match(nodes['truck-bars'].innerHTML,/No vehicles/);assert.equal(nodes['truck-service-readout'].innerHTML,'');
});
test('Specialized facilities independently double handling and stack without changing travel or delays',()=>{
  const options={distanceKm:1},truck=data.trucks[0];
  const [baseline]=analyseTruckService([truck],options);
  for(const [terminal,warehouse,factor] of [[true,false,2],[false,true,2],[true,true,4]]){
    const [row]=analyseTruckService([truck],{...options,specializedTerminal:terminal,specializedWarehouse:warehouse});
    assert.equal(row.handlingMultiplier,factor);assert.equal(row.loadingSeconds,baseline.loadingSeconds/factor);assert.equal(row.unloadingSeconds,baseline.unloadingSeconds/factor);
    assert.equal(row.travelSeconds,baseline.travelSeconds);assert.equal(row.cargoPerLeg,baseline.cargoPerLeg);
    assert.ok(Math.abs(row.roundTripSeconds-(2*baseline.travelSeconds+(baseline.loadingSeconds+baseline.unloadingSeconds)/factor+8))<1e-10);
    assert.ok(row.costPerCargo<baseline.costPerCargo);
  }
  assert.throws(()=>analyseTruckService([truck],{...options,specializedTerminal:2}),TypeError);
});
test('Ten unique bulk tippers retain captured costs, capacity, speeds and doubled handling multipliers',()=>{
  const expected=[['benz-3t',1912,12,30,51193,6],['ford-77',1928,10,40,51034,8],['zis-150',1947,15,60,99796,8],['gmc-660',1956,22,70,162429,4],['man-19304',1965,18,80,145633,6],['peterbilt-359',1973,25,80,202268,8],['kenworth-k100e',1980,30,120,322545,6],['gaz-3307',1989,16,90,140465,10],['volvo-fh12',1999,34,100,321324,8],['faw-j6p',2014,40,120,430060,10]];
  const bulk=catalogue.trucks.filter(t=>t.freightSpecialization==='bulk');
  assert.equal(bulk.length,10);assert.equal(catalogue.trucks.length,50);assert.equal(new Set(catalogue.trucks.map(t=>t.id)).size,50);
  for(const [id,year,capacity,speed,cost,rate] of expected){const truck=bulk.find(t=>t.id==='tipper-'+id);assert.equal(truck.year,year);assert.equal(truck.cargoCapacity,capacity);assert.equal(truck.maxSpeedKmh,speed);assert.equal(truck.economy.annualMaintenance,cost);assert.equal(truck.loadingUnloadingSpeedMultiplier,rate);assert.match(truck.sourceCapture,/^codex-clipboard-.+\.png$/);}
  assert.equal(bulk.find(t=>t.id==='tipper-faw-j6p').additionalSourceCaptures.length,1);
});
test('Bulk comparisons include general-purpose vehicles, respect year and change costs with tipper handling',()=>{
  assert.equal(trucksForCargo(catalogue.trucks,'all').length,11);
  assert.equal(trucksForCargo(catalogue.trucks,'bulk').length,21);
  const early=trucksByYear(trucksForCargo(catalogue.trucks,'bulk'),1912);
  assert.equal(early.length,4);assert.ok(early.some(t=>t.id==='tipper-benz-3t'));
  assert.ok(!trucksForCargo(catalogue.trucks,'all').some(t=>t.freightSpecialization==='bulk'));
  assert.throws(()=>trucksForCargo(catalogue.trucks,'unknown'),RangeError);
  const rows=analyseTruckService(trucksForCargo(catalogue.trucks,'bulk'),{distanceKm:1});
  const general=rows.find(r=>r.truck.id==='faw-j6p'),tipper=rows.find(r=>r.truck.id==='tipper-faw-j6p');
  assert.equal(tipper.loadingSeconds,general.loadingSeconds/2);assert.ok(tipper.costPerCargo<general.costPerCargo);
});
test('Goods box trucks retain independent captured values and do not leak into bulk comparisons',()=>{
  const expected=[['benz-3t',1912,12,30,51193,6,6.8],['ford-aa',1930,10,40,51034,8,5],['saurer-c',1942,15,60,99796,8,5.8],['gmc-660',1956,22,70,162429,4,12],['man-19304',1965,18,80,145633,6,9.1],['peterbilt-359',1973,25,80,202268,8,17],['kenworth-k100e',1980,30,120,322545,6,15],['gaz-3307',1989,16,90,140465,10,6.9],['freightliner-fld112',1999,38,100,354401,8,18],['faw-j6p',2014,40,120,430060,10,17]];
  const goods=catalogue.trucks.filter(t=>t.freightSpecialization==='goods');assert.equal(goods.length,10);
  for(const [id,year,cap,speed,cost,rate,length] of expected){const t=goods.find(t=>t.id==='box-'+id);assert.equal(t.year,year);assert.equal(t.cargoCapacity,cap);assert.equal(t.maxSpeedKmh,speed);assert.equal(t.economy.annualMaintenance,cost);assert.equal(t.loadingUnloadingSpeedMultiplier,rate);assert.equal(t.lengthMetres,length);assert.equal(t.sourceCargoLabel,'Marchandises');assert.match(t.sourceCapture,/^codex-clipboard-.+\.png$/);}
  const compatible=trucksForCargo(catalogue.trucks,'goods');assert.equal(compatible.length,21);assert.ok(compatible.every(t=>['general','goods'].includes(t.freightSpecialization)));
  assert.ok(trucksForCargo(catalogue.trucks,'bulk').every(t=>t.freightSpecialization!=='goods'));
  assert.ok(!trucksByYear(compatible,1929).some(t=>t.id==='box-ford-aa'));assert.ok(trucksByYear(compatible,1930).some(t=>t.id==='box-ford-aa'));
  const rows=analyseTruckService(compatible,{distanceKm:1,specializedTerminal:true,specializedWarehouse:true});
  assert.equal(rows.length,21);assert.ok(rows.every(r=>Number.isFinite(r.costPerCargo)&&r.handlingMultiplier===4));
});
test('Eight flatbeds retain their own card data and freight compatibility',()=>{
  const expected=[['mack-ac',1916,12,30,51193,6,6.3],['gaz-mm',1938,15,50,88431,8,5.3],['zis-150',1947,15,60,99796,8,6.7],['gmc-660',1956,22,70,162429,4,13],['peterbilt-359',1973,25,80,202268,8,17],['kenworth-k100e',1980,30,120,322545,6,18],['freightliner-fld112',1999,38,100,354401,8,18],['faw-j6p',2014,40,120,430060,10,16]];
  const flatbeds=catalogue.trucks.filter(t=>t.freightSpecialization==='flatbed');assert.equal(flatbeds.length,8);
  for(const [id,year,cap,speed,cost,rate,length] of expected){const t=flatbeds.find(t=>t.id==='flatbed-'+id);assert.equal(t.year,year);assert.equal(t.cargoCapacity,cap);assert.equal(t.maxSpeedKmh,speed);assert.equal(t.economy.annualMaintenance,cost);assert.equal(t.loadingUnloadingSpeedMultiplier,rate);assert.equal(t.lengthMetres,length);assert.equal(t.sourceCargoLabel,'Plateau');assert.match(t.sourceCapture,/^codex-clipboard-.+\.png$/);}
  const compatible=trucksForCargo(catalogue.trucks,'flatbed');assert.equal(compatible.length,19);assert.ok(compatible.every(t=>['general','flatbed'].includes(t.freightSpecialization)));
  for(const cargo of ['all','bulk','goods'])assert.ok(!trucksForCargo(catalogue.trucks,cargo).some(t=>t.freightSpecialization==='flatbed'));
  assert.ok(!trucksByYear(compatible,1915).some(t=>t.id==='flatbed-mack-ac'));assert.ok(trucksByYear(compatible,1916).some(t=>t.id==='flatbed-mack-ac'));
  const rows=analyseTruckService(compatible,{distanceKm:1,roadSpeedLimit:80});assert.equal(rows.length,19);assert.ok(rows.every(r=>Number.isFinite(r.costPerCargo)&&r.effectiveSpeedKmh<=80));
});
test('Eleven liquid vehicles preserve tanker-specific data and only join compatible freight results',()=>{
  const expected=[['horse-barrels',1907,10,20,33639,5,7.7],['amo-f15',1924,12,40,61241,6,5.3],['saurer-c',1942,15,60,99796,8,5.5],['gmc-660',1956,22,70,162429,4,12],['man-19304',1965,18,80,145633,6,7.4],['isuzu-elf',1967,10,80,80908,8,4.4],['peterbilt-359',1973,25,80,202268,8,16],['kenworth-k100e',1980,30,120,322545,6,16],['gaz-3307',1989,16,90,140465,10,6.3],['volvo-fh12',1999,34,100,321324,8,10],['faw-j6p',2014,40,120,430060,10,15]];
  const liquid=catalogue.trucks.filter(t=>t.freightSpecialization==='liquid');assert.equal(liquid.length,11);
  for(const [id,year,cap,speed,cost,rate,length] of expected){const t=liquid.find(t=>t.id==='liquid-'+id);assert.equal(t.year,year);assert.equal(t.cargoCapacity,cap);assert.equal(t.maxSpeedKmh,speed);assert.equal(t.economy.annualMaintenance,cost);assert.equal(t.loadingUnloadingSpeedMultiplier,rate);assert.equal(t.lengthMetres,length);assert.equal(t.sourceCargoLabel,'Liquide');assert.match(t.sourceCapture,/^codex-clipboard-.+\.png$/);}
  assert.equal(liquid.find(t=>t.id==='liquid-peterbilt-359').powerCh,544);assert.equal(liquid.find(t=>t.id==='liquid-horse-barrels').propulsion,'horse');
  const compatible=trucksForCargo(catalogue.trucks,'liquid');assert.equal(compatible.length,22);assert.ok(compatible.every(t=>['general','liquid'].includes(t.freightSpecialization)));
  for(const cargo of ['all','bulk','goods','flatbed'])assert.ok(!trucksForCargo(catalogue.trucks,cargo).some(t=>t.freightSpecialization==='liquid'));
  assert.ok(!trucksByYear(compatible,1906).some(t=>t.id==='liquid-horse-barrels'));assert.ok(trucksByYear(compatible,1907).some(t=>t.id==='liquid-horse-barrels'));
  const rows=analyseTruckService(compatible,{distanceKm:1,roadSpeedLimit:80,specializedTerminal:true,specializedWarehouse:true});assert.equal(rows.length,22);assert.ok(rows.every(r=>Number.isFinite(r.costPerCargo)&&r.handlingMultiplier===4));
});

test('MAN handling uses the fixed freight factor and legacy calibration options cannot override it',()=>{
  const man=data.trucks.find(t=>t.id==='man-19304');
  const options={distanceKm:1,fillRatio:16/18};
  const [row]=analyseTruckService([man],options);
  assert.ok(Math.abs(row.unloadingSeconds-85.33333333333333)<1e-10);
  assert.ok(Math.abs(row.loadingSeconds-85.33333333333333)<1e-10);
  assert.ok(Math.abs(row.roundTripSeconds-2*row.travelSeconds-row.loadingSeconds-row.unloadingSeconds-8)<1e-10);
  assert.deepEqual(analyseTruckService([man],{...options,baseRate:1,terminalDelaySeconds:0}),[row]);
});
