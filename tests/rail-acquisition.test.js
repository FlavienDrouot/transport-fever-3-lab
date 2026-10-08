import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formationFingerprint,modelFingerprint,reconcileNames,isCampaignResource} from '../src/catalogue-reconciliation.js';
import {filterSourceVehicles,sourceRows} from '../src/source-catalogue.js';
import {createModel} from '../src/model.js';
import {analyseLine} from '../src/line.js';
import {railComponents,buildConsist} from '../src/consists.js';
const load=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [catalogue,locomotives,trains]=await Promise.all(['source-catalogue','rail-locomotives','trains'].map(load));
const observations=locomotives.locomotives.map(card=>({reference:`data/rail-locomotives.json#${card.id}`,category:'train',card}));
const [passengerWagons,freightWagons]=await Promise.all(['rail-passenger-wagons','rail-freight-wagons'].map(load));
const wagons=[...passengerWagons.wagons,...freightWagons.wagons];
const wagonObservations=wagons.map(card=>({reference:card.id,category:card.dataProvenance.sourceCategory,card}));

test('All 43 purchasable railway wagons have usable values and cover all 41 standalone wagon resources',()=>{
 assert.equal(passengerWagons.wagons.length,16);assert.equal(freightWagons.wagons.length,27);
 const results=reconcileNames(catalogue,wagonObservations),resources=new Set();
 for(const r of results){
  assert.equal(r.status,'matched');
  for(const id of r.sourceIds??[r.sourceId]){
   resources.add(id);
   const v=catalogue.vehicles.find(v=>v.id===id);
   assert.deepEqual(v.engines.raw,[]);assert.equal(v.displayValues.capacity,r.card.passengerCapacity??r.card.cargoCapacity);
   assert.equal(v.displayValues.loadingUnloadingSpeedMultiplier,r.card.loadingUnloadingSpeedMultiplier);
   assert.equal(v.displayValues.purchasePrice,r.card.economy.purchasePrice);
   assert.ok([r.card.name,r.card.sourceName].includes(v.name.value));assert.doesNotMatch(sourceRows([v]),/NaN|undefined|Unknown/);
  }
  for(const field of ['massTonnes','lengthMetres','maxSpeedKmh','loadingUnloadingSpeedMultiplier'])assert.ok(r.card[field]>0);
  assert.ok(r.card.economy.annualMaintenance>0);
  const evidence=r.candidates.find(c=>c.sourceId===r.sourceId).evidence;
  assert.ok(!evidence.some(e=>['mass','length','traction','power'].includes(e.field)));
 }
 const standalone=catalogue.vehicles.filter(v=>v.category==='waggon'&&!isCampaignResource(v));
 assert.equal(standalone.length,41);assert.ok(standalone.every(v=>resources.has(v.id)));
 assert.equal(resources.size,44); // 41 standalone + DPZ + two equivalent Mark 3 resources
 const wagonRows=filterSourceVehicles(catalogue,{category:'waggon'});
 assert.equal(wagonRows.length,44);assert.ok([...resources].every(id=>wagonRows.some(v=>v.id===id)));
 assert.equal(wagons.find(w=>w.id==='freight-wagon-1899').loadingUnloadingSpeedMultiplier,1);
 assert.equal(wagons.find(w=>w.id==='swiss-dpz-carriage').passengerCapacity,33);
});

test('Wagon identity rejects incompatible values and distinguishes explicit equivalent aliases from arbitrary duplicates',()=>{
 const observation=wagonObservations[0];
 for(const patch of [{passengerCapacity:9},{economy:{...observation.card.economy,purchasePrice:observation.card.economy.purchasePrice*1.5}},{loadingUnloadingSpeedMultiplier:99}]){
  assert.equal(reconcileNames(catalogue,[{...observation,card:{...observation.card,...patch}}])[0].status,'unmatched');
 }
 const british=wagonObservations.find(o=>o.card.id==='british-mark-3-carriage');
 const matched=reconcileNames(catalogue,[british])[0];assert.equal(matched.sourceIds.length,2);
 const noAliases=structuredClone(british);delete noAliases.card.dataProvenance.equivalentResourceIds;
 assert.equal(reconcileNames(catalogue,[noAliases])[0].status,'ambiguous');
 const record=catalogue.vehicles.find(v=>v.id===matched.sourceId);
 const duplicate={...structuredClone(record),id:'duplicate'};
 assert.equal(reconcileNames({...catalogue,vehicles:[...catalogue.vehicles,duplicate]},[british])[0].status,'ambiguous');
 const changed=structuredClone(catalogue);changed.vehicles.find(v=>v.id===matched.sourceIds[1]).emptyMass.value+=1000;
 assert.equal(reconcileNames(changed,[british])[0].status,'ambiguous');
});

test('Acquired rail components build passenger, freight and multiple-unit formations with no missing calculator inputs',()=>{
 const components=railComponents({locomotives:locomotives.locomotives,passengerWagons:passengerWagons.wagons,freightWagons:freightWagons.wagons,multipleUnits:trains.trains});
 assert.equal(components.length,90);assert.equal(new Set(components.map(c=>c.id)).size,90);
 const locomotive=components.find(c=>c.id==='rail:locomotive:prussian-class-t-3');
 const passenger=components.find(c=>c.id==='rail:passenger-wagon:bavarian-passenger-carriage');
 const freight=components.find(c=>c.id==='rail:freight-wagon:freight-wagon-1899');
 const definition={schemaVersion:1,id:'test',name:'Rail sample',carrier:'rail',category:'passengers',components:[{componentId:locomotive.id,quantity:1},{componentId:passenger.id,quantity:2}]};
 const train=buildConsist(definition,components,trains.source);
 assert.equal(train.serviceReady,true);assert.deepEqual(train.missing,[]);assert.equal(train.passengerCapacity,16);assert.equal(train.handlingRate,4);assert.equal(train.powerCh,locomotive.powerCh);
 assert.equal(train.economy.annualMaintenance,locomotive.economy.annualMaintenance+2*passenger.economy.annualMaintenance);
 assert.equal(analyseLine(train,{distanceKm:10}).rate,4);
 const cargo=buildConsist({...definition,category:'freight',cargo:'all',components:[{componentId:locomotive.id,quantity:1},{componentId:freight.id,quantity:1}]},components,trains.source);
 assert.equal(cargo.serviceReady,true);assert.equal(cargo.cargoCapacity,8);assert.equal(cargo.handlingRate,.0625);
 const talent=components.find(c=>c.id==='rail:multiple-unit:talent-1');
 const coupled=buildConsist({...definition,components:[{componentId:talent.id,quantity:1},{componentId:passenger.id,quantity:1}]},components,trains.source);
 assert.equal(coupled.passengerCapacity,48);assert.equal(coupled.handlingRate,6);assert.equal(coupled.serviceReady,true);
});

test('All 30 purchasable locomotives match uniquely using only the condensed capture evidence',()=>{
 const results=reconcileNames(catalogue,observations);
 assert.equal(results.length,30);assert.equal(new Set(results.map(r=>r.sourceId)).size,30);
 const componentIds=new Set(catalogue.formations.flatMap(f=>formationFingerprint(f,catalogue.vehicles)?.componentIds??[]));
 const standalone=catalogue.vehicles.filter(v=>v.kind==='locomotive'&&v.category==='train'&&!isCampaignResource(v)&&!componentIds.has(v.id));
 assert.equal(standalone.length,28);assert.ok(standalone.every(v=>results.some(r=>r.sourceId===v.id)));
 for(const r of results){
  assert.equal(r.status,'matched');assert.equal(r.sourceId,r.card.dataProvenance.resourceId);
  const match=r.candidates.find(c=>c.sourceId===r.sourceId);
  assert.deepEqual(match.evidence.map(e=>e.field).sort(),['power','purchasePrice','speed','year']);
  for(const field of ['massTonnes','lengthMetres','tractionKgf'])assert.ok(Number.isFinite(r.card[field])&&r.card[field]>0);
  assert.ok(r.card.economy.annualMaintenance>0);assert.ok(createModel(r.card,trains.source).timeAt(1)>0);
  const rows=filterSourceVehicles(catalogue,{category:'train',query:r.card.name});
  assert.ok(rows.some(v=>v.id===r.sourceId));assert.doesNotMatch(sourceRows(rows),/NaN|undefined/);
 }
 for(const name of ['EMD F-Unit','Chinese Class SS4G']){
  const card=locomotives.locomotives.find(v=>v.name===name);
  assert.equal(card.carCount,2);
  const formation=catalogue.formations.find(f=>f.id===card.dataProvenance.resourceId);
  assert.equal(formation.displayValues.purchasePrice,card.economy.purchasePrice);
 }
});

test('Condensed locomotive matching rejects price/physical conflicts and ambiguous duplicates',()=>{
 const observation=observations[0];
 assert.equal(reconcileNames(catalogue,[{...observation,card:{...observation.card,economy:{...observation.card.economy,purchasePrice:observation.card.economy.purchasePrice*1.5}}}])[0].status,'unmatched');
 assert.equal(reconcileNames(catalogue,[{...observation,card:{...observation.card,powerCh:500}}])[0].status,'unmatched');
 const record=catalogue.vehicles.find(v=>v.id===observation.card.dataProvenance.resourceId);
 const duplicate={...structuredClone(record),id:'duplicate'};
 assert.equal(reconcileNames({...catalogue,vehicles:[...catalogue.vehicles,duplicate]},[observation])[0].status,'ambiguous');
});

test('Every multiple unit uses actual extracted model handling rather than visual sections',()=>{
 const results=reconcileNames(catalogue,trains.trains.map(card=>({reference:card.id,category:'train',card})));
 assert.equal(results.length,17);
 for(const result of results){
  assert.equal(result.status,'matched');
  const f=catalogue.formations.find(f=>f.id===result.sourceId);
  const fp=f?formationFingerprint(f,catalogue.vehicles):modelFingerprint(catalogue.vehicles.find(v=>v.id===result.sourceId));
  assert.equal(result.card.formationLoadingUnloadingSpeedMultiplier,fp.handling);
  const line=analyseLine({...result.card,model:createModel(result.card,trains.source)},{distanceKm:10});
  assert.equal(line.rate,fp.handling);assert.ok(Number.isFinite(line.maintenancePerJourney));
 }
 assert.equal(trains.trains.find(t=>t.id==='tgv').formationLoadingUnloadingSpeedMultiplier,30);
 assert.equal(trains.trains.find(t=>t.id==='talent-1').formationLoadingUnloadingSpeedMultiplier,4);
});
