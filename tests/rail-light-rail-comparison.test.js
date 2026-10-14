import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {lightRailComparisonVehicles,lightRailComponents,buildConsist} from '../src/consists.js';
import {economicCandidates,economicSelection} from '../src/economic-selection.js';
import {analyseEconomicService} from '../src/rail-freight.js';
import {analyseService} from '../src/line.js';
import {RAIL_MOTION} from '../src/gradient.js';
import {withRailProfile} from '../src/rail-motion.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [trams,trains]=await Promise.all(['trams','trains'].map(read));
const source=[...trams.trams,...trams.freightTrams],vehicles=lightRailComparisonVehicles(source,trains.source);
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('Rail Compare includes exactly the nine confirmed whole light-rail trams with separate Road identities',()=>{
  const before=structuredClone(source),catalogue=lightRailComparisonVehicles(source,trains.source);
  assert.equal(catalogue.length,9);assert.equal(new Set(catalogue.map(v=>v.id)).size,9);
  assert.equal(catalogue.filter(v=>v.category==='passengers').length,7);assert.equal(catalogue.filter(v=>v.category==='freight').length,2);
  for(const vehicle of catalogue){
    const original=source.find(v=>vehicle.id===`rail:light-rail:${v.id}`);assert.ok(original?.lightRailCompatible);
    assert.equal(vehicle.name,original.name);assert.equal(vehicle.carrier,'rail');assert.equal(vehicle.isCustomConsist,false);
    assert.equal(vehicle.automaticCouplingAllowed,true);assert.equal(vehicle.serviceReady,true);
    assert.deepEqual(vehicle.model.motionConfig,RAIL_MOTION);
    for(const key of ['year','massTonnes','lengthMetres','powerCh','tractionKgf','maxSpeedKmh'])assert.equal(vehicle[key],original[key]);
    assert.equal(vehicle.economy.annualMaintenance,original.economy.annualMaintenance);
    assert.equal(vehicle.formationLoadingUnloadingSpeedMultiplier,original.loadingUnloadingSpeedMultiplier);
    assert.notEqual(vehicle.id,original.id);
  }
  assert.deepEqual(source,before);
});

test('the existing Rail filters select passenger/freight light rail by introduction year without losing hidden selections',()=>{
  assert.equal(economicCandidates(vehicles).length,7);
  for(const cargo of ['all','bulk','goods','flatbed','liquid'])assert.equal(economicCandidates(vehicles,{freight:true,cargo}).length,2);
  const selected=new Set(vehicles.map(v=>v.id));
  const early=economicSelection(vehicles,selected,{freight:true,year:1999});assert.equal(early.available.length,0);assert.equal(early.empty,'year');
  const later=economicSelection(vehicles,selected,{freight:true,year:2035});assert.equal(later.chosen.length,2);assert.equal(later.empty,null);
  assert.equal(selected.size,9);
  for(const vehicle of vehicles){
    const profile=withRailProfile(vehicle,[{distanceKm:1,gradePercent:0,speedLimitKmh:60},{distanceKm:1,gradePercent:2,speedLimitKmh:40}]);
    assert.ok(Number.isFinite(profile.model.timeAt(2)));assert.equal(profile.model.routeProfile,true);
    const result=analyseEconomicService(vehicle,{distanceKm:2,freight:vehicle.category==='freight',fillRatio:.8});
    assert.ok(result.eligible);assert.ok(Number.isFinite(result.maintenancePerUnit));
  }
});

test('Dresden handling is counted once, and passenger light rail uses identical-MU service coupling',()=>{
  const dresden=vehicles.find(v=>v.name==='Dresden CarGoTram');assert.equal(dresden.carCount,5);
  const freight=analyseEconomicService(dresden,{distanceKm:1,freight:true,fillRatio:1});
  close(freight.loadingSeconds,dresden.cargoCapacity/(16*.0625));
  const citylink=vehicles.find(v=>v.name==='Stadler Citylink'),options={distanceKm:10,demandPerDirection:1000,maxHeadwaySeconds:300,allowMultipleUnits:true};
  const coupled=analyseService(citylink,options);assert.ok(coupled.unitsPerTrain>1);assert.ok(coupled.headwaySeconds<=300);
  const components=lightRailComponents(trams.trams);
  const manual=buildConsist({schemaVersion:1,id:'manual:citylink',name:'Citylink units',carrier:'rail',category:'passengers',components:[{componentId:citylink.id,quantity:coupled.unitsPerTrain}]},components,trains.source);
  const equivalent=analyseService(manual,{...options,allowMultipleUnits:false});
  close(coupled.roundTripSeconds,equivalent.roundTripSeconds);close(coupled.fleetMaintenance,equivalent.fleetMaintenance);
  close(coupled.capacityPerTrain,citylink.passengerCapacity*coupled.unitsPerTrain);
});
