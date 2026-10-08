import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analysePassengerRoadService,analyseTruckService,trucksForCargo,trucksByYear,renderTruckService} from '../src/trucks.js';
const data=JSON.parse(await readFile(new URL('../data/trams.json',import.meta.url)));

test('Seven tram cards retain independent passenger capacity, handling and source costs',()=>{
  const expected=[['horse-tram',1890,6,20,16147,96882,2,11],['aeg',1910,11,25,33658,201948,4,7.2],['nuremberg-f',1920,12,35,45037,540444,2.5,9.8],['gotha-t1',1928,14,60,74515,447090,5,10],['milano-4000',1935,25,40,102069,612414,3,20],['pittsburgh-pcc1643',1945,21,45,92472,554832,4,15],['duewag',1955,16,50,75462,452772,6,15]];
  assert.equal(data.trams.length,21);assert.equal(new Set(data.trams.map(t=>t.id)).size,21);
  for(const [id,year,cap,speed,cost,price,rate,length] of expected){const t=data.trams.find(t=>t.id===id);assert.equal(t.year,year);assert.equal(t.passengerCapacity,cap);assert.equal(t.maxSpeedKmh,speed);assert.equal(t.economy.annualMaintenance,cost);assert.equal(t.economy.purchasePrice,price);assert.equal(t.loadingUnloadingSpeedMultiplier,rate);assert.equal(t.lengthMetres,length);assert.match(t.sourceCapture,/^codex-clipboard-.+\.png$/);}
  assert.equal(data.trams.filter(t=>t.propulsion==='electric').length,20);
  assert.equal(trucksByYear(data.trams,1889).length,0);assert.equal(trucksByYear(data.trams,1890).length,1);assert.equal(trucksByYear(data.trams,1954).length,6);assert.equal(trucksByYear(data.trams,1955).length,7);
});
test('Trams share passenger cycles, without freight bonuses or inferred section multipliers',()=>{
  const options={distanceKm:1,fillRatio:.5,roadSpeedLimit:30,specializedTerminal:true,specializedWarehouse:true};
  const rows=analysePassengerRoadService(data.trams,options);assert.equal(rows.length,21);assert.ok(rows.every(r=>r.handlingMultiplier===1&&r.effectiveSpeedKmh<=30&&Number.isFinite(r.costPerCargo)));
  const milano=rows.find(r=>r.truck.id==='milano-4000');
  assert.equal(milano.cargoPerLeg,12.5);assert.equal(milano.deliveredPerCycle,25);assert.equal(milano.loadingSeconds,25/3);assert.equal(milano.unloadingSeconds,25/3);assert.equal(milano.travelSeconds,120);
  assert.deepEqual(rows,analysePassengerRoadService(data.trams,{...options,specializedTerminal:false,specializedWarehouse:false}));
  assert.ok(data.trams.every(t=>t.cargoCapacity===undefined));
});
test('Tram filtered chart and table use passenger vocabulary and handle years before introduction',()=>{
  const nodes=Object.fromEntries(['truck-service-summary','truck-service-readout','truck-bars','road-service-caption'].map(id=>[id,{closest:()=>({classList:{toggle(){}}})}]));const document={getElementById:id=>nodes[id]};
  renderTruckService(document,trucksByYear(data.trams,1920),{distanceKm:1,passenger:true});
  assert.match(nodes['truck-service-summary'].innerHTML,/passenger journey/);assert.doesNotMatch(nodes['truck-service-summary'].innerHTML,/cargo unit/);
  assert.equal((nodes['truck-service-readout'].innerHTML.match(/<tr>/g)||[]).length,3);assert.equal((nodes['truck-bars'].innerHTML.match(/class="truck-bar-row/g)||[]).length,3);
  renderTruckService(document,trucksByYear(data.trams,1889),{distanceKm:1,passenger:true});assert.match(nodes['truck-service-summary'].textContent,/No vehicles/);assert.equal(nodes['truck-service-readout'].innerHTML,'');
});
test('Seven later trams retain exact source maintenance and vehicle handling multipliers',()=>{
  const expected=[['zurich-mirage',1966,27,60,143707,862242,3,20],['tatra-t4',1968,18,55,90404,271212,2,15],['duewag-n8c',1978,32,70,189008,1134048,4.5,27],['toronto-clrv',1979,20,60,106450,638700,4,16],['hong-kong',1985,25,45,110086,660516,10,9.9],['st-petersburg-lvs86',1986,28,70,165382,496146,4,23],['toyama-8000',1993,20,60,106450,638700,3,14]];
  for(const [id,year,cap,speed,cost,price,rate,length] of expected){const t=data.trams.find(t=>t.id===id);assert.equal(t.year,year);assert.equal(t.passengerCapacity,cap);assert.equal(t.maxSpeedKmh,speed);assert.equal(t.economy.annualMaintenance,cost);assert.equal(t.economy.purchasePrice,price);assert.equal(t.loadingUnloadingSpeedMultiplier,rate);assert.equal(t.lengthMetres,length);assert.match(t.sourceCapture,/^codex-clipboard-.+\.png$/);}
  assert.equal(trucksByYear(data.trams,1965).length,7);assert.equal(trucksByYear(data.trams,1966).length,8);assert.equal(trucksByYear(data.trams,1992).length,13);assert.equal(trucksByYear(data.trams,1993).length,14);
  const rows=analysePassengerRoadService(data.trams,{distanceKm:1,roadSpeedLimit:50});assert.equal(rows.length,21);assert.ok(rows.every(r=>r.effectiveSpeedKmh<=50&&Number.isFinite(r.costPerCargo)));
  assert.equal(rows.find(r=>r.truck.id==='hong-kong').loadingSeconds,5);
});
test('Five recent passenger tram cards retain full-vehicle capacity, cost and handling data',()=>{
  const expected=[['bombardier-k4000',1995,35,80,226539,1359234,3.5,29],['skoda-10t',2000,25,70,147662,885972,6,20],['changchun-3000',2010,60,70,354389,4252668,4,59],['moscow-vityaz-m',2014,37,70,218540,1311240,4,27],['caf-urbos-3',2018,43,70,253979,1523874,5,34]];
  for(const [id,year,cap,speed,cost,price,rate,length] of expected){const t=data.trams.find(t=>t.id===id);assert.equal(t.year,year);assert.equal(t.passengerCapacity,cap);assert.equal(t.maxSpeedKmh,speed);assert.equal(t.economy.annualMaintenance,cost);assert.equal(t.economy.purchasePrice,price);assert.equal(t.loadingUnloadingSpeedMultiplier,rate);assert.equal(t.lengthMetres,length);assert.match(t.sourceCapture,/^codex-clipboard-.+\.png$/);}
  assert.equal(trucksByYear(data.trams,1994).length,14);assert.equal(trucksByYear(data.trams,1995).length,15);assert.equal(trucksByYear(data.trams,2017).length,18);assert.equal(trucksByYear(data.trams,2018).length,19);
  const [changchun]=analysePassengerRoadService([data.trams.find(t=>t.id==='changchun-3000')],{distanceKm:1});assert.equal(changchun.loadingSeconds,30);
});
test('Horse freight tram is separate from its passenger variant and applies confirmed freight facility bonuses',()=>{
  assert.equal(data.freightTrams.length,9);const freight=data.freightTrams.find(t=>t.id==='horse-freight-tram'),passenger=data.trams.find(t=>t.id==='horse-tram');
  assert.notEqual(freight.id,passenger.id);assert.equal(freight.year,1890);assert.equal(freight.cargoCapacity,7);assert.equal(freight.maxSpeedKmh,20);assert.equal(freight.economy.annualMaintenance,18838);assert.equal(freight.economy.purchasePrice,113028);assert.equal(freight.loadingUnloadingSpeedMultiplier,1);assert.equal(freight.lengthMetres,7.2);assert.equal(freight.passengerCapacity,undefined);
  assert.equal(trucksByYear(data.freightTrams,1889).length,0);assert.equal(trucksForCargo(data.freightTrams,'liquid').length,6);
  const options={distanceKm:1};const [empty]=analyseTruckService([freight],options);assert.equal(empty.deliveredPerCycle,7);assert.equal(empty.loadingSeconds,112);assert.equal(empty.roundTripSeconds,592);
  const [loaded]=analyseTruckService([freight],{...options,loadedReturn:true,specializedTerminal:true,specializedWarehouse:true});assert.equal(loaded.deliveredPerCycle,14);assert.equal(loaded.handlingMultiplier,4);assert.equal(loaded.loadingSeconds,56);assert.equal(loaded.roundTripSeconds,484);
  const [p]=analysePassengerRoadService([passenger],{...options,specializedTerminal:true,specializedWarehouse:true});assert.equal(p.handlingMultiplier,1);assert.equal(p.deliveredPerCycle,12);
  const nodes=Object.fromEntries(['truck-service-summary','truck-service-readout','truck-bars','road-service-caption'].map(id=>[id,{closest:()=>({classList:{toggle(){}}})}]));renderTruckService({getElementById:id=>nodes[id]},[freight],{...options,specializedTerminal:true});assert.match(nodes['truck-service-summary'].innerHTML,/cargo unit/);assert.match(nodes['road-service-caption'].textContent,/handling A ×2 \/ B ×2/);
});
test('Seven freight tram additions retain specialized source data and compatibility groups',()=>{
  const expected=[['sydney-24s',1910,10,35,37531,225186,2,22,'general'],['russian-x',1925,13,40,53076,318456,2,13,'general'],['tatra-t4-tanker',1968,20,55,125561,904041,4,28,'liquid'],['tatra-t4-tipper',1968,20,55,125561,904041,4,26,'bulk'],['tatra-t4-flatbed',1968,20,55,125561,904041,4,24,'flatbed'],['tatra-t4-box',1968,20,55,125561,904041,4,25,'goods'],['dresden-cargotram',2000,60,60,319350,3832200,16,90,'general']];
  assert.equal(new Set([...data.trams,...data.freightTrams].map(t=>t.id)).size,30);
  for(const [id,year,cap,speed,cost,price,rate,mass,special] of expected){const t=data.freightTrams.find(t=>t.id===id);assert.equal(t.year,year);assert.equal(t.cargoCapacity,cap);assert.equal(t.maxSpeedKmh,speed);assert.equal(t.economy.annualMaintenance,cost);assert.equal(t.economy.purchasePrice,price);assert.equal(t.loadingUnloadingSpeedMultiplier,rate);assert.equal(t.massTonnes,mass);assert.equal(t.freightSpecialization,special);assert.match(t.sourceCapture,/^codex-clipboard-.+\.png$/);}
  assert.equal(trucksForCargo(data.freightTrams,'all').length,5);
  for(const cargo of ['liquid','bulk','flatbed','goods']){
    const compatible=trucksForCargo(data.freightTrams,cargo);assert.equal(compatible.length,6);assert.ok(compatible.every(t=>t.freightSpecialization==='general'||t.freightSpecialization===cargo));
    assert.equal(trucksByYear(compatible,1967).length,3);assert.equal(trucksByYear(compatible,1968).length,4);assert.equal(trucksByYear(compatible,2000).length,5);
  }
  const dresden=data.freightTrams.find(t=>t.id==='dresden-cargotram');assert.equal(dresden.carCount,5);
  const [row]=analyseTruckService([dresden],{distanceKm:1});assert.equal(row.loadingSeconds,60);
  const [boost]=analyseTruckService([dresden],{distanceKm:1,specializedTerminal:true,specializedWarehouse:true});assert.equal(boost.loadingSeconds,15);
});
test('Condensed captures plus extracted metadata add future trams with whole-vehicle handling',async()=>{
  const source=JSON.parse(await readFile(new URL('../data/source-catalogue.json',import.meta.url)));
  for(const [id,year,capacity,speed,handling,power,price,key] of [
    ['stadler-citylink',2022,50,90,8,789,2106966,'trams'],
    ['stadler-tina',2024,60,80,6,816,2330118,'trams'],
    ['articulated-freight-tram',2030,80,100,12,1224,3629064,'freightTrams']]){
    const card=data[key].find(v=>v.id===id),record=source.vehicles.find(v=>v.id===card.dataProvenance.resourceId);
    assert.equal(card.year,year);assert.equal(card.passengerCapacity??card.cargoCapacity,capacity);
    assert.equal(card.maxSpeedKmh,speed);assert.equal(card.powerCh,power);assert.equal(card.loadingUnloadingSpeedMultiplier,handling);
    assert.equal(card.economy.purchasePrice,price);assert.equal(price,record.derivedCosts.purchase_price);
    assert.equal(card.economy.annualMaintenance,record.derivedCosts.annual_maintenance);
    assert.equal(card.economy.annualMaintenanceStatus,'source_formula_not_individually_observed');
    assert.ok(!card.dataProvenance.observedFields.includes('lengthMetres'));
    assert.ok(!trucksByYear(data[key],year-1).includes(card));assert.ok(trucksByYear(data[key],year).includes(card));
    const [row]=(key==='trams'?analysePassengerRoadService:analyseTruckService)([card],{distanceKm:1});
    assert.ok(Number.isFinite(row.costPerCargo));
    assert.equal(row.loadingSeconds,capacity*(key==='trams'?2:1)/(handling*(key==='trams'?1:.0625)));
  }
});
