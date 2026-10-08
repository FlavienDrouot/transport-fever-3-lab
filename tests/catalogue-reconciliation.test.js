import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reconcileNames,applyReconciledNames,modelFingerprint,formationFingerprint} from '../src/catalogue-reconciliation.js';
const catalogue=JSON.parse(await readFile(new URL('../data/source-catalogue.json',import.meta.url)));
const card=JSON.parse(await readFile(new URL('../data/vehicle-name-observations.json',import.meta.url))).vehicles[0];
const observation={reference:'data/vehicle-name-observations.json#rampini-eltron',category:'bus',card};
const rampini=catalogue.vehicles.find(v=>v.id.includes('/rampini_2025/'));

test('A unique physical fingerprint identifies Rampini without using difficulty-dependent costs',()=>{
  const result=reconcileNames(catalogue,[observation])[0];
  assert.equal(result.status,'matched');assert.equal(result.sourceId,rampini.id);
  assert.equal(result.candidates[0].matches,8);
  const costsChanged={...observation,card:{...card,economy:{purchasePrice:1,annualMaintenance:99999999}}};
  assert.deepEqual(reconcileNames(catalogue,[costsChanged])[0].candidates,result.candidates);
  const output=applyReconciledNames(catalogue,[result]);const v=output.vehicles.find(v=>v.id===rampini.id);
  assert.equal(v.name.value,'Rampini Eltron');assert.equal(v.validation.import_ready,false);
  assert.deepEqual(v.capacity,rampini.capacity);assert.deepEqual(v.derivedCosts,rampini.derivedCosts);
  assert.equal(v.purchasePrice.value,null);
});

test('Equal candidates and conflicting capture names remain ambiguous rather than overwriting identity',()=>{
  const duplicate={...structuredClone(rampini),id:'base::/vehicle/bus/other.mdl'};
  const input={...catalogue,vehicles:[rampini,duplicate],formations:[]};
  assert.equal(reconcileNames(input,[observation])[0].status,'ambiguous');
  const results=reconcileNames({...input,vehicles:[rampini]},[observation,{...observation,reference:'different',card:{...card,name:'Other bus'}}]);
  assert.ok(results.every(r=>r.status==='ambiguous'&&r.sourceId===null));
});

test('Meaningful physical conflicts prevent a match; model extents are only secondary evidence',()=>{
  const conflicting={...observation,card:{...card,passengerCapacity:13}};
  const result=reconcileNames(catalogue,[conflicting])[0];assert.equal(result.status,'unmatched');
  assert.ok(result.candidates[0].conflicts.includes('capacity'));
  const lengthChanged={...observation,card:{...card,lengthMetres:card.lengthMetres+1}};
  const lengthResult=reconcileNames(catalogue,[lengthChanged])[0];assert.equal(lengthResult.status,'matched');
  assert.deepEqual(lengthResult.candidates[0].conflicts,['length']);
  const missing=structuredClone(rampini);missing.engines.raw[0].power=null;
  assert.equal(modelFingerprint(missing).power,null);
});

test('Multiple-unit fingerprints resolve ordered repeated components and do not name an individual car as the whole train',()=>{
  const formation=catalogue.formations.find(f=>f.id.includes('/ice1/'));
  const fp=formationFingerprint(formation,catalogue.vehicles);
  assert.equal(fp.componentIds.length,11);assert.equal(fp.componentIds[0],fp.componentIds.at(-1));
  assert.equal(fp.mass,623);assert.equal(fp.capacity,170);
  assert.equal(formationFingerprint({...formation,components:[{name:'missing.mdl'}]},catalogue.vehicles),null);
  assert.ok(formation.nameReconciliation);assert.equal(formation.name.value,'ICE 1');
  const front=catalogue.vehicles.find(v=>v.id===fp.componentIds[0]);assert.equal(front.name.value,null);
});

test('Reconciliation is reproducible and the generated catalogue retains supporting evidence',()=>{
  const results=reconcileNames(catalogue,[observation]);
  const once=applyReconciledNames(catalogue,results);
  assert.deepEqual(applyReconciledNames(once,results),once);
  assert.ok(rampini.nameReconciliation.evidence.some(e=>e.field==='power'));
  assert.equal(rampini.name.status,'matched_to_captured_characteristics');
  const rejected=catalogue.vehicles.find(v=>v.id.includes('freightliner_fld_112_box'));
  assert.equal(rejected.name.value,null);assert.ok(rejected.nameCandidates.some(c=>c.conflicts.includes('capacity')));
});
