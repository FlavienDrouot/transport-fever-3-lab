import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../data/trains.json', import.meta.url)));
const names = ['Draisine','ACF M-300','CLe 2/4 Roter Pfeil','Autorail Uerdingen','TEE VT 11.5','Shinkansen série 0','Metroliner','Inter-City 125','Italian Class ETR 450','Swiss Re 450 DPZ','ICE 1','TGV Duplex','Talbot Talent 1','ES1 Lastochka','RABe 502 Twindexx','Fuxing Hao','Avelia Liberty'];
test('Every supplied multiple-unit identity has exactly one detailed data card', () => {
 assert.equal(data.trains.length, 17);
 assert.equal(new Set(data.trains.map(t=>t.id)).size,17);
 assert.deepEqual(data.trains.map(t=>t.sourceCapture.raw.name).sort(), [...names].sort());
 assert.deepEqual(data.trains.slice(0,4).map(t=>t.id),['metroliner','twindexx','tgv','fuxing']);
});

test('Avelia detailed card agrees with the complete extracted formation and excludes power cars from handling',async()=>{
 const {formationFingerprint,reconcileNames}=await import('../src/catalogue-reconciliation.js');
 const {createModel}=await import('../src/model.js');
 const {analyseLine}=await import('../src/line.js');
 const source=JSON.parse(await readFile(new URL('../data/source-catalogue.json',import.meta.url)));
 const train=data.trains.find(t=>t.id==='avelia-liberty');
 const formation=source.formations.find(f=>f.id===train.formationProvenance.resourceId);
 const fp=formationFingerprint(formation,source.vehicles);
 assert.equal(train.carCount,fp.componentIds.length);assert.equal(train.carCount,11);
 assert.equal(train.passengerCapacity,fp.capacity);assert.equal(train.massTonnes,fp.mass);
 assert.equal(train.tractionKgf,Math.round(fp.traction));assert.equal(train.powerCh,Math.round(fp.power));
 assert.equal(train.maxSpeedKmh,Math.round(fp.speed));assert.equal(train.lengthMetres,Math.round(fp.length));
 const parts=fp.componentIds.map(id=>source.vehicles.find(v=>v.id===id));
 assert.equal(parts.filter(v=>v.capacity.display_candidate>0).length,9);
 assert.equal(parts.reduce((s,v)=>s+v.derivedCosts.purchase_price,0),train.economy.purchasePrice);
 assert.equal(parts.reduce((s,v)=>s+v.derivedCosts.annual_maintenance,0),train.economy.annualMaintenance);
 assert.equal(train.formationLoadingUnloadingSpeedMultiplier,fp.handling);assert.equal(fp.handling,45);
 const result=reconcileNames(source,[{reference:'data/trains.json#avelia-liberty',category:'train',card:train}])[0];
 assert.equal(result.status,'matched');assert.equal(result.sourceId,formation.id);
 const line=analyseLine({...train,model:createModel(train,data.source)},{distanceKm:10});
 assert.equal(line.rate,45);assert.equal(line.loadingSeconds,94/45);assert.ok(Number.isFinite(line.maintenancePerJourney));
});
test('Screenshot values retain physical units, normal difficulty, all indicators and provenance', () => {
 for (const t of data.trains) {
  assert.equal(t.economy.difficulty,'normal');
  assert.ok(t.economy.purchasePrice>0 && t.economy.annualMaintenance>0);
  assert.ok(t.lengthMetres>0 && t.passengerCapacity>0 && t.loadingUnloadingSpeedMultiplier>0);
  assert.equal(t.sourceCapture.indicators.length,4);
  assert.equal(t.sourceCapture.raw.name,t.id==='draisine'?'Draisine':t.name);
  assert.equal(t.sourceCapture.raw.year,String(t.year));
  assert.equal(t.sourceCapture.raw.maxSpeed,`${t.maxSpeedKmh} km/h`);
  assert.equal(t.sourceCapture.raw.mass.replace(',','.').replace(' t','')*1,t.massTonnes);
  assert.equal(t.sourceCapture.raw.tractiveEffort.replaceAll(' ','').replace('kgf','')*1,t.tractionKgf);
  assert.equal(t.sourceCapture.raw.power.replaceAll(' ','').replace(',','.').replace('ch','')*1,t.powerCh);
  assert.equal(t.sourceCapture.raw.purchasePrice.replaceAll(' ','').replace('$','')*1,t.economy.purchasePrice);
  assert.equal(t.sourceCapture.raw.maintenance.replaceAll(' ','').replace('$','').replace('/an','')*1,t.economy.annualMaintenance);
  assert.ok(t.sourceCapture.attachment.endsWith('.png'));
  assert.equal(t.sourceCapture.indicators[1].displayValue,t.noise);
  assert.equal(t.sourceCapture.indicators[2].displayValue,t.pollution);
  assert.equal(t.sourceCapture.indicators[3].displayValue,t.comfort);
 }
 const draisine=data.trains.find(t=>t.id==='draisine');
 assert.equal(draisine.name,'Handcar');
 assert.equal(draisine.powerCh,1.4);
 assert.equal(draisine.propulsion,'horse');
 assert.equal(data.trains.find(t=>t.id==='roter-pfeil').economy.purchasePrice/ data.trains.find(t=>t.id==='roter-pfeil').economy.annualMaintenance,12);
});
