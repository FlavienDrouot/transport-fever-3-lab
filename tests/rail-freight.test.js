import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyseLine, analyseService, GAME_YEAR_SECONDS, travelBetweenStops} from '../src/line.js';
import {analyseEconomicService, analyseFreightService} from '../src/rail-freight.js';
import {createModel} from '../src/model.js';
import {buildConsist} from '../src/consists.js';

const train = {cargoCapacity:40,passengerCapacity:40,carCount:5,lengthMetres:60,
  formationLoadingUnloadingSpeedMultiplier:8,loadingUnloadingSpeedMultiplier:99,
  economy:{annualMaintenance:1460},maxSpeedKmh:90,
  model:{timeAt:km => km * 1000 <= 312.5 ? Math.sqrt(km * 2000) : 25 + (km * 1000 - 312.5) / 25,
    stateAt:t => ({speedKmh:Math.min(t,25)*3.6,distanceKm:(t<=25?t*t/2:312.5+(t-25)*25)/1000})}};
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('Shared stop-to-stop motion preserves the passenger acceleration and braking result',()=>{
  for (const distanceKm of [.1,1,20]) {
    const motion = travelBetweenStops(train,{distanceKm});
    const passenger = analyseLine(train,{distanceKm});
    const freight = analyseFreightService(train,{distanceKm});
    for (const key of ['travelSeconds','brakingSeconds','peakSpeedKmh']) {
      assert.equal(motion[key],passenger[key]);assert.equal(motion[key],freight[key]);
    }
  }
  close(travelBetweenStops(train,{distanceKm:1}).travelSeconds,57.5);
  close(travelBetweenStops(train,{distanceKm:1}).brakingSeconds,10);
  const returned = travelBetweenStops(train,{distanceKm:1});
  returned.travelSeconds = 0;
  close(travelBetweenStops(train,{distanceKm:1}).travelSeconds,57.5);
});

test('Empty return accounts for one delivery, distinct load/unload operations and fixed stop pauses',()=>{
  const r = analyseFreightService(train,{distanceKm:1});
  assert.equal(r.handlingRateA,.5);assert.equal(r.handlingRateB,.5);
  assert.equal(r.cargoPerLeg,40);assert.equal(r.deliveredPerCycle,40);
  assert.equal(r.loadingSeconds,80);assert.equal(r.unloadingSeconds,80);
  assert.equal(r.stationSecondsA,84);assert.equal(r.stationSecondsB,84);
  close(r.roundTripSeconds,283);
  close(r.deliveredPerYear,40 * GAME_YEAR_SECONDS / 283);
  close(r.unitsPerHour,40 * 3600 / 283);
  close(r.maintenancePerUnit,r.fleetMaintenance/r.deliveredPerYear);
  close(r.efficiency,r.unitsPerHour/3600/r.fleetMaintenance);
  assert.equal(r.unitsPerTrain,1);assert.equal(r.capacityPerTrain,40);
  assert.equal(r.trainLengthMetres,60);assert.equal(r.carCount,5);
});

test('Independent A/B installations affect only their own handling operations',()=>{
  const options = {distanceKm:1,stopA:{specializedTerminal:true,specializedWarehouse:true},stopB:{specializedWarehouse:true}};
  const r = analyseFreightService(train,options), ordinary = analyseFreightService(train,{distanceKm:1});
  assert.equal(r.handlingRateA,2);assert.equal(r.handlingRateB,1);
  assert.equal(r.loadingSeconds,20);assert.equal(r.unloadingSeconds,40);
  assert.equal(r.stationSecondsA,24);assert.equal(r.stationSecondsB,44);
  for (const key of ['travelSeconds','brakingSeconds','peakSpeedKmh']) assert.equal(r[key],ordinary[key]);
  const swapped = analyseFreightService(train,{...options,stopA:options.stopB,stopB:options.stopA});
  assert.equal(swapped.loadingSeconds,r.unloadingSeconds);assert.equal(swapped.unloadingSeconds,r.loadingSeconds);
  assert.equal(swapped.stationSecondsA,r.stationSecondsB);assert.equal(swapped.roundTripSeconds,r.roundTripSeconds);
  const loaded = analyseFreightService(train,{...options,loadedReturn:true});
  assert.equal(loaded.loadingSeconds,60);assert.equal(loaded.unloadingSeconds,60);
  assert.equal(loaded.stationSecondsA,46);assert.equal(loaded.stationSecondsB,86);
  assert.equal(loaded.deliveredPerCycle,80);
  assert.equal(loaded.travelSeconds,r.travelSeconds);
  close(loaded.roundTripSeconds,2*r.travelSeconds+132);
});

test('Cargo quantity changes transfer time but keeps empty-mass travel and pause policy',()=>{
  for (const loadedReturn of [false,true]) {
    const full = analyseFreightService(train,{distanceKm:1,loadedReturn});
    const half = analyseFreightService(train,{distanceKm:1,loadedReturn,fillRatio:.5});
    assert.equal(full.travelSeconds,half.travelSeconds);assert.equal(full.brakingSeconds,half.brakingSeconds);
    assert.equal(half.loadingSeconds,full.loadingSeconds/2);assert.equal(half.deliveredPerCycle,full.deliveredPerCycle/2);
    const zero = analyseFreightService(train,{distanceKm:1,loadedReturn,fillRatio:0});
    assert.equal(zero.stationSecondsA,loadedReturn?6:4);assert.equal(zero.stationSecondsB,loadedReturn?6:4);
    assert.equal(zero.unitsPerHour,0);assert.equal(zero.deliveredPerYear,0);
    assert.equal(zero.efficiency,0);assert.equal(zero.maintenancePerUnit,null);
  }
});

test('Demand means total annual deliveries; whole fleets adjust occupancy below its limit',()=>{
  for (const loadedReturn of [false,true]) for (const demandPerYear of [20,1000,12000]) {
    const options = {distanceKm:1,fillRatio:.8,loadedReturn,demandPerYear,
      stopA:{specializedTerminal:true},stopB:{specializedWarehouse:true,specializedTerminal:true}};
    const r = analyseFreightService(train,options), baseline = analyseFreightService(train,{...options,demandPerYear:null});
    assert.ok(Number.isInteger(r.trainCount));assert.ok(r.actualOccupancyRatio<=.8);
    close(r.deliveredPerYear,demandPerYear);close(r.maintenancePerUnit,r.fleetMaintenance/demandPerYear);
    close(r.headwaySeconds*r.trainCount,r.roundTripSeconds);
    close(r.deliveredPerCycle,r.cargoPerLeg*(loadedReturn?2:1));
    if (r.trainCount>1) assert.ok(baseline.deliveredPerYear*(r.trainCount-1)<demandPerYear);
    const frequent = analyseFreightService(train,{...options,maxHeadwaySeconds:30});
    close(frequent.deliveredPerYear,demandPerYear);
    assert.ok(frequent.headwaySeconds<=30+1e-8);assert.ok(frequent.actualOccupancyRatio<=r.actualOccupancyRatio);
    assert.ok(frequent.trainCount>=r.trainCount);assert.ok(Number.isInteger(frequent.trainCount));
  }
});

test('Frequency without demand preserves occupancy and closest selects the adjacent whole fleet',()=>{
  const baseline = analyseFreightService(train,{distanceKm:1,fillRatio:.5});
  const maximum = analyseFreightService(train,{distanceKm:1,fillRatio:.5,maxHeadwaySeconds:60});
  close(maximum.actualOccupancyRatio,.5);close(maximum.maintenancePerUnit,baseline.maintenancePerUnit);
  assert.ok(maximum.headwaySeconds<=60);assert.equal(maximum.trainCount,Math.ceil(baseline.roundTripSeconds/60));
  const target = baseline.roundTripSeconds/2.4;
  const closest = analyseFreightService(train,{distanceKm:1,fillRatio:.5,maxHeadwaySeconds:target,frequencyMode:'closest'});
  assert.equal(closest.trainCount,2);
  for (const n of [1,3]) assert.ok(Math.abs(closest.headwaySeconds-target)<=Math.abs(baseline.roundTripSeconds/n-target));
  const options = {distanceKm:1,fillRatio:.8,demandPerYear:1000,maxHeadwaySeconds:60,frequencyMode:'closest'};
  const r = analyseFreightService(train,options), flow = options.demandPerYear/GAME_YEAR_SECONDS;
  const fixed = 2*r.travelSeconds+8, transfer = flow*(1/r.handlingRateA+1/r.handlingRateB);
  close(r.deliveredPerYear,options.demandPerYear);
  for (const n of [r.trainCount-1,r.trainCount+1].filter(n=>n>=1&&n>transfer)) {
    const headway = fixed/(n-transfer), cargo = flow*headway;
    if (cargo<=train.cargoCapacity*.8) assert.ok(Math.abs(r.headwaySeconds-60)<=Math.abs(headway-60)+1e-8);
  }
});

test('Infrastructure speed caps the shared motion without modifying source train values',async()=>{
  const data = JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
  const raw = data.trains.find(t=>t.id==='fuxing');
  const fast = {...raw,cargoCapacity:100,formationLoadingUnloadingSpeedMultiplier:8,model:createModel(raw,data.source)};
  const originalModel = fast.model, originalCost = fast.economy.annualMaintenance;
  const unrestricted = analyseFreightService(fast,{distanceKm:30});
  for (const infrastructureSpeedKmh of [10,90,100,160,350]) {
    const capped = analyseFreightService(fast,{distanceKm:30,infrastructureSpeedKmh});
    assert.ok(capped.peakSpeedKmh<=infrastructureSpeedKmh+1e-7);
    assert.ok(capped.travelSeconds>=unrestricted.travelSeconds-1e-7);
    assert.equal(capped.loadingSeconds,unrestricted.loadingSeconds);
  }
  assert.equal(fast.maxSpeedKmh,350);assert.equal(fast.model,originalModel);assert.equal(fast.economy.annualMaintenance,originalCost);
});

test('Aggregate formation handling counts each wagon once and never multiplies by locomotive/car count',()=>{
  const engine = {id:'engine',role:'locomotive',carrier:'rail',year:1950,massTonnes:80,lengthMetres:15,maxSpeedKmh:120,powerCh:1500,tractionKgf:15000,economy:{purchasePrice:10000,annualMaintenance:1000}};
  const wagon = {id:'wagon',role:'wagon',carrier:'rail',year:1960,massTonnes:20,lengthMetres:10,maxSpeedKmh:100,cargoCapacity:20,freightSpecialization:'general',loadingUnloadingSpeedMultiplier:8,economy:{purchasePrice:1000,annualMaintenance:100}};
  const formation = buildConsist({schemaVersion:1,id:'custom:freight',name:'Freight',carrier:'rail',category:'freight',components:[{componentId:engine.id,quantity:1},{componentId:wagon.id,quantity:3}]},[engine,wagon],{horsepowerWatts:735.5,kgfNewtons:9.80665});
  const r = analyseFreightService(formation,{distanceKm:1,demandPerYear:1000,maxHeadwaySeconds:30,allowMultipleUnits:true});
  assert.equal(formation.formationLoadingUnloadingSpeedMultiplier,24);assert.equal(r.handlingRateA,1.5);
  assert.equal(r.unitsPerTrain,1);assert.equal(r.capacityPerTrain,60);assert.equal(r.carCount,4);
  close(r.loadingSeconds,r.cargoPerLeg/1.5);close(r.fleetMaintenance,r.trainCount*1300);
});

test('Platform exclusions, zero fill and invalid parameters are explicit',()=>{
  assert.equal(analyseFreightService(train,{distanceKm:1,platformLengthMetres:60}).eligible,true);
  assert.deepEqual(analyseFreightService(train,{distanceKm:1,platformLengthMetres:59}),{eligible:false,efficiency:0,maintenancePerUnit:null});
  for (const extra of [{distanceKm:0},{distanceKm:NaN},{fillRatio:-.1},{fillRatio:1.1},{brakingDeceleration:0},
    {platformLengthMetres:0},{infrastructureSpeedKmh:351},{demandPerYear:0},{demandPerYear:NaN},
    {demandPerYear:100,fillRatio:0},{maxHeadwaySeconds:0},{frequencyMode:'exact'},
    {loadedReturn:'yes'},{stopA:null},{stopB:[]},{stopA:{specializedTerminal:1}},{stopB:{specializedWarehouse:'yes'}}]) {
    assert.throws(()=>analyseFreightService(train,{distanceKm:1,...extra}),RangeError);
  }
  for (const extra of [{cargoCapacity:0},{formationLoadingUnloadingSpeedMultiplier:null},
    {formationLoadingUnloadingSpeedMultiplier:undefined},{carCount:1.5},{economy:{annualMaintenance:0}}]) {
    assert.throws(()=>analyseFreightService({...train,...extra},{distanceKm:1}),RangeError);
  }
  assert.throws(()=>travelBetweenStops(train,{distanceKm:0}),RangeError);
  assert.throws(()=>travelBetweenStops(train,{distanceKm:1,brakingDeceleration:NaN}),RangeError);
});

test('Economic dispatcher preserves passenger output and aliases its annual unit cost',()=>{
  const options = {distanceKm:1,demandPerDirection:1000};
  const passenger = analyseService(train,options);
  assert.deepEqual(analyseEconomicService(train,options),{...passenger,maintenancePerUnit:passenger.maintenancePerJourney});
  assert.deepEqual(analyseEconomicService(train,{...options,freight:false}),{...passenger,maintenancePerUnit:passenger.maintenancePerJourney});
  assert.deepEqual(analyseEconomicService(train,{distanceKm:1,freight:true}),analyseFreightService(train,{distanceKm:1}));
  const excluded = analyseEconomicService(train,{distanceKm:1,platformLengthMetres:59});
  assert.equal(excluded.eligible,false);assert.equal(excluded.maintenancePerUnit,null);
});
