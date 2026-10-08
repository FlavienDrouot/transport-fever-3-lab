import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildConsist,tramComponents,poweredVehicleComponents} from '../src/consists.js';
import {analyseLine,analyseService} from '../src/line.js';
const units={horsepowerWatts:735.5,kgfNewtons:9.80665};
// Synthetic component fixtures, not catalogue records.
const engine={id:'rail:engine',role:'locomotive',carrier:'rail',year:1950,massTonnes:80,lengthMetres:15,maxSpeedKmh:120,powerCh:1500,tractionKgf:15000,economy:{purchasePrice:10000,annualMaintenance:1000}};
const wagon=(id,capacity,multiplier,extra={})=>({id,role:'wagon',carrier:'rail',year:1960,massTonnes:20,lengthMetres:10,maxSpeedKmh:100,cargoCapacity:capacity,freightSpecialization:'general',loadingUnloadingSpeedMultiplier:multiplier,economy:{purchasePrice:1000,annualMaintenance:100},...extra});
const a=wagon('rail:a',18,8),b=wagon('rail:b',8,1);
const definition=(components,extra={})=>({schemaVersion:1,id:'custom:test',name:'Test formation',carrier:'rail',category:'freight',components:[{componentId:engine.id,quantity:1},...components.map(([componentId,quantity])=>({componentId,quantity}))],...extra});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('Heterogeneous freight handling reproduces the A / B / A+B experiment predictions',()=>{
  const catalogue=[engine,a,b],before=structuredClone(catalogue);
  const singleA=buildConsist(definition([[a.id,1]]),catalogue,units);
  const singleB=buildConsist(definition([[b.id,1]]),catalogue,units);
  const mixed=buildConsist(definition([[a.id,1],[b.id,1]]),catalogue,units);
  close(singleA.cargoCapacity/singleA.handlingRate,36);
  close(singleB.cargoCapacity/singleB.handlingRate,128);
  close(mixed.cargoCapacity/mixed.handlingRate,46.22222222222222);
  assert.equal(mixed.formationLoadingUnloadingSpeedMultiplier,9);
  assert.equal(mixed.carCount,3); // The engine counts towards length/cars, not handling.
  assert.equal(mixed.massTonnes,120);assert.equal(mixed.lengthMetres,35);
  assert.equal(mixed.economy.purchasePrice,12000);assert.equal(mixed.economy.annualMaintenance,1200);
  assert.equal(mixed.maxSpeedKmh,100);assert.equal(mixed.year,1960);
  assert.deepEqual(catalogue,before);
});

test('Additional wagons add load and slow acceleration; additional engines add force and power',()=>{
  const catalogue=[engine,a],one=buildConsist(definition([[a.id,1]]),catalogue,units);
  const longer=buildConsist(definition([[a.id,2]]),catalogue,units);
  assert.equal(longer.powerCh,one.powerCh);assert.equal(longer.tractionKgf,one.tractionKgf);
  assert.ok(longer.model.timeAt(.1)>one.model.timeAt(.1));
  const two=buildConsist({...definition([[a.id,2]]),components:[{componentId:engine.id,quantity:2},{componentId:a.id,quantity:2}]},catalogue,units);
  assert.equal(two.powerCh,2*one.powerCh);assert.equal(two.tractionKgf,2*one.tractionKgf);
  assert.ok(two.model.timeAt(.1)<longer.model.timeAt(.1));
  assert.equal(two.model.stateAt(1000).speedKmh,100);
});

test('Passenger Economics uses the aggregate multiplier once and never automatically recouples a custom consist',()=>{
  const pa={...a,cargoCapacity:undefined,passengerCapacity:18},pb={...b,cargoCapacity:undefined,passengerCapacity:8};
  const mixed=buildConsist(definition([[a.id,1],[b.id,1]],{category:'passengers'}),[engine,pa,pb],units);
  const line=analyseLine(mixed,{distanceKm:1});
  assert.equal(line.rate,9);close(line.loadingSeconds,26/9);
  const options={distanceKm:1,demandPerDirection:1000,maxHeadwaySeconds:100,frequencyMode:'closest',allowMultipleUnits:true};
  const service=analyseService(mixed,options);
  assert.equal(service.unitsPerTrain,1);assert.equal(service.capacityPerTrain,26);
  assert.equal(service.rate,9);assert.equal(service.fleetMaintenance,service.trainCount*1200);
  assert.deepEqual(service,analyseService(mixed,{...options,allowMultipleUnits:false}));
  assert.equal(analyseService(mixed,{...options,platformLengthMetres:34}).eligible,false);
  const capped=analyseService(mixed,{distanceKm:10,infrastructureSpeedKmh:100});
  assert.ok(capped.peakSpeedKmh<=100);
});

test('Unknown properties remain missing, while missing costs do not prevent a motion preview',()=>{
  const noCosts={...a,economy:undefined};
  const consist=buildConsist(definition([[a.id,1]]),[engine,noCosts],units);
  assert.equal(consist.economy.annualMaintenance,null);assert.equal(consist.economy.purchasePrice,null);
  assert.ok(consist.model);assert.equal(consist.serviceReady,false);assert.ok(consist.missing.includes(`${a.id}:economy.annualMaintenance`));
  const noPower={...engine,powerCh:undefined};
  const unknown=buildConsist(definition([[a.id,1]]),[noPower,a],units);
  assert.equal(unknown.powerCh,null);assert.equal(unknown.model,null);assert.equal(unknown.serviceReady,false);
  const noHandling={...a,loadingUnloadingSpeedMultiplier:undefined};
  const incomplete=buildConsist(definition([[a.id,1]]),[engine,noHandling],units);
  assert.equal(incomplete.formationLoadingUnloadingSpeedMultiplier,null);assert.equal(incomplete.handlingRate,null);
  assert.throws(()=>analyseLine({...incomplete,passengerCapacity:18},{distanceKm:1}),RangeError);
});

test('Invalid references, quantities, carriers, categories and selected cargo fail explicitly',()=>{
  const baseline=definition([[a.id,1]]),catalogue=[engine,a,b];
  for(const quantity of [0,-1,1.5,NaN,Infinity,1001])assert.throws(()=>buildConsist(definition([[a.id,quantity]]),catalogue,units),RangeError);
  for(const change of [{schemaVersion:2},{category:'mixed'},{carrier:'road'},{cargo:'unknown'},{components:[]},{components:[{componentId:'missing',quantity:1}]}])assert.throws(()=>buildConsist({...baseline,...change},catalogue,units),RangeError);
  assert.throws(()=>buildConsist(baseline,[engine,a,a],units),RangeError);
  assert.throws(()=>buildConsist(baseline,[engine,{...a,carrier:'tram'}],units),RangeError);
  assert.throws(()=>buildConsist(baseline,[engine,{...a,passengerCapacity:5}],units),RangeError);
  assert.throws(()=>buildConsist(baseline,[engine,{...a,freightSpecialization:'liquid'}],units),RangeError);
  assert.throws(()=>buildConsist({...baseline,components:[{componentId:a.id,quantity:1}]},catalogue,units),RangeError);
  assert.throws(()=>buildConsist(baseline,[engine,{...a,massTonnes:-1}],units),RangeError);
});

test('Stored tram components get unique namespaced IDs and produce a theoretical composition without mutating source data',async()=>{
  const load=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
  const [locomotives,passengers,freight]=await Promise.all(['tram-locomotives','tram-passenger-wagons','tram-freight-wagons'].map(load));
  const input={locomotives:locomotives.locomotives,passengerWagons:passengers.wagons,freightWagons:freight.wagons},before=structuredClone(input);
  const components=tramComponents(input);
  assert.equal(components.length,26);assert.equal(new Set(components.map(x=>x.id)).size,26);
  const consist=buildConsist({schemaVersion:1,id:'custom:tram-test',name:'Tram test',carrier:'tram',category:'passengers',components:[{componentId:'tram:locomotive:swiss-ge22',quantity:1},{componentId:'tram:passenger-wagon:open-wagon',quantity:2}]},components,units);
  assert.equal(consist.passengerCapacity,12);assert.equal(consist.handlingRate,8);assert.equal(consist.massTonnes,22);assert.equal(consist.lengthMetres,21.3);assert.equal(consist.maxSpeedKmh,25);
  assert.ok(consist.assumptions.some(x=>x.includes('not verified')));assert.deepEqual(input,before);
});


test('Powered passenger trams can tow wagons while retaining their own capacity and handling exactly once',async()=>{
  const load=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
  const [trams,locos,passengers,freight]=await Promise.all(['trams','tram-locomotives','tram-passenger-wagons','tram-freight-wagons'].map(load));
  const catalogue=tramComponents({locomotives:locos.locomotives,passengerWagons:passengers.wagons,freightWagons:freight.wagons,passengerTrams:trams.trams,freightTrams:trams.freightTrams});
  const tatra=trams.trams.find(x=>x.id==='tatra-t4');
  const formation=buildConsist({schemaVersion:1,id:'custom:tatra',name:'Tatra with trailers',carrier:'tram',category:'passengers',components:[{componentId:'tram:passenger-motor:tatra-t4',quantity:1},{componentId:'tram:passenger-wagon:open-wagon',quantity:2}]},catalogue,units);
  assert.equal(formation.passengerCapacity,tatra.passengerCapacity+12);assert.equal(formation.formationLoadingUnloadingSpeedMultiplier,tatra.loadingUnloadingSpeedMultiplier+8);
  assert.equal(formation.powerCh,tatra.powerCh);assert.equal(formation.massTonnes,tatra.massTonnes+4);assert.equal(formation.maxSpeedKmh,25);
  const {analysePassengerRoadService,selectRoadVehicles}=await import('../src/trucks.js');
  const cohort=selectRoadVehicles({trucks:[],buses:[],trams:[formation],freightTrams:[]},{category:'passengers',includeTrams:true,year:2020});
  const [row]=analysePassengerRoadService(cohort,{distanceKm:1});
  assert.equal(row.loadingSeconds,2*formation.passengerCapacity/formation.handlingRate);
  assert.equal(selectRoadVehicles({trucks:[],buses:[],trams:[formation],freightTrams:[]},{category:'passengers',includeTrams:false,year:2020}).length,0);
});

test('Rail multiple units contribute full formation handling once when used as powered components',async()=>{
  const source=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
  const metroliner=source.trains.find(x=>x.id==='metroliner');
  const powered=poweredVehicleComponents([metroliner],{carrier:'rail',catalogue:'multiple-unit',perCarHandling:true});
  const trailer={...a,cargoCapacity:undefined,passengerCapacity:18};
  const formation=buildConsist({schemaVersion:1,id:'custom:mu',name:'MU with trailer',carrier:'rail',category:'passengers',components:[{componentId:powered[0].id,quantity:2},{componentId:a.id,quantity:1}]},[...powered,trailer],units);
  assert.equal(formation.passengerCapacity,2*metroliner.passengerCapacity+18);
  assert.equal(formation.formationLoadingUnloadingSpeedMultiplier,2*metroliner.carCount*metroliner.loadingUnloadingSpeedMultiplier+8);
  assert.equal(formation.carCount,2*metroliner.carCount+1);
  assert.equal(formation.powerCh,2*metroliner.powerCh);
  assert.equal(analyseLine(formation,{distanceKm:1}).rate,formation.formationLoadingUnloadingSpeedMultiplier);
});

test('Dresden complete freight tram handling does not multiply its five sections a second time',async()=>{
  const source=JSON.parse(await readFile(new URL('../data/trams.json',import.meta.url)));
  const dresden=source.freightTrams.find(x=>x.id==='dresden-cargotram');
  const powered=poweredVehicleComponents([dresden],{carrier:'tram',catalogue:'freight-motor'});
  const formation=buildConsist({schemaVersion:1,id:'custom:dresden',name:'Dresden test',carrier:'tram',category:'freight',components:[{componentId:powered[0].id,quantity:1}]},powered,units);
  assert.equal(formation.cargoCapacity,60);assert.equal(formation.formationLoadingUnloadingSpeedMultiplier,16);assert.equal(formation.handlingRate,1);assert.equal(formation.carCount,5);
  const {analyseTruckService}=await import('../src/trucks.js');
  assert.equal(analyseTruckService([formation],{distanceKm:1})[0].loadingSeconds,60);
});
