import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importSourceCatalogue} from '../scripts/import-source-catalogue.mjs';
import {filterSourceVehicles,sourceName,sourceRows,mountSourceCatalogue} from '../src/source-catalogue.js';
const text=await readFile(new URL('../data/source-catalogue.json',import.meta.url),'utf8');
const catalogue=JSON.parse(text);

test('Collected catalogue retains provenance, sentinel values and ordered formations without local host paths',()=>{
  assert.equal(catalogue.vehicles.length,380);assert.equal(catalogue.formations.length,14);
  assert.equal(catalogue.source.sourceSha256,'f4f37f86d84ed1670094f6f327b0874cd8efc2a9760034bdf22c65d252a45cb7');
  assert.equal(new Set([...catalogue.vehicles,...catalogue.formations].map(v=>v.id)).size,394);
  assert.doesNotMatch(text,/C:\\\\|Program Files|Users\\\\|game_path|"archive"|source_metadata/);
  for(const v of catalogue.vehicles){
    assert.equal(v.validation.import_ready,false);
    assert.match(v.provenance.sha256,/^[a-f0-9]{64}$/);
    assert.ok(v.capacity.raw_compartments===null||Array.isArray(v.capacity.raw_compartments));
    if(v.capacity.raw_compartments===null)assert.equal(v.capacity.display_candidate,null);
    for(const cost of [v.purchasePrice,v.annualMaintenance])if(cost.raw<0)assert.equal(cost.value,null);
  }
  const f=catalogue.formations.find(f=>f.id.includes('avelia_liberty'));
  assert.equal(f.components.length,11);assert.equal(f.components[0].forward,true);assert.equal(f.components.at(-1).forward,false);
});

test('Rail sample observations are separate from predicted costs and preserve physical units',()=>{
  const loco=catalogue.vehicles.find(v=>v.name.value==='ALCO HH 600');
  assert.equal(loco.topSpeed.unit,'m/s');assert.equal(loco.topSpeed.value,19.444);
  assert.equal(loco.emptyMass.value,93000);assert.equal(loco.engines.power_unit,'kW');
  assert.equal(loco.capacity.display_observed,0);assert.equal(loco.purchasePrice.value,null);
  assert.equal(loco.derivedCosts.purchase_price,1099191);assert.equal(loco.derivedCosts.annual_maintenance,366397);
  assert.equal(catalogue.vehicles.filter(v=>v.capacity.display_observed!==null).length,3);
  const rows=sourceRows([loco]);assert.match(rows,/1,099,191/);assert.doesNotMatch(rows,/estimate|observed|Sample checked/);
});

test('Inventory filters expose future models and distinguish installed non-transport resources',()=>{
  const all=filterSourceVehicles(catalogue,{includeAuxiliary:true});assert.equal(all.length,catalogue.vehicles.filter(v=>!v.provenance.owner.includes('campaign')).length+2);
  const before=filterSourceVehicles(catalogue,{year:2020,includeAuxiliary:true});assert.equal(all.length-before.length,20);
  assert.equal(Math.max(...all.map(v=>v.availability.raw?.yearFrom??0)),2035);
  assert.equal(filterSourceVehicles(catalogue).length,catalogue.vehicles.filter(v=>v.isTransportVehicle&&!v.provenance.owner.includes('campaign')).length+2);
  assert.equal(filterSourceVehicles(catalogue,{category:'train',query:'alco_hh600'}).length,1);
  assert.equal(filterSourceVehicles(catalogue,{query:'does not exist'}).length,0);
  const unresolved=all.find(v=>!v.name.value&&v.name.translation?.translation_key);assert.equal(sourceName(unresolved),unresolved.name.translation.translation_key);
});

test('Inventory safely renders names and unknown fields, and mounts independent native filters',()=>{
  const fixture=structuredClone(catalogue.vehicles[0]);fixture.name.value='<script>"bad"</script>';
  delete fixture.displayValues;fixture.capacity.display_observed=null;fixture.capacity.display_candidate=null;
  fixture.purchasePrice.value=null;fixture.derivedCosts=null;
  const rows=sourceRows([fixture]);assert.doesNotMatch(rows,/<script>|NaN/);assert.match(rows,/&lt;script&gt;/);assert.match(rows,/Unknown/);
  const ids=['source-catalogue-summary','source-search','source-category','source-year','source-auxiliary','source-catalogue-caption','source-catalogue-body','source-formations'];
  const nodes=Object.fromEntries(ids.map(id=>[id,{value:'',checked:false,addEventListener(event,handler){this.handler=handler;}}]));
  nodes['source-year'].valueAsNumber=2050;nodes['source-category'].value='train';
  mountSourceCatalogue({getElementById:id=>nodes[id]},catalogue);
  assert.match(nodes['source-catalogue-summary'].textContent,/373 models/);
  assert.match(nodes['source-catalogue-body'].innerHTML,/ALCO HH 600/);
  nodes['source-search'].value='no match';nodes['source-search'].handler();
  assert.match(nodes['source-catalogue-body'].innerHTML,/No vehicles/);
});

test('Importer rejects duplicate source identities and selects metadata without copying originals',()=>{
  const v={id:'resource',id_status:'source',name:{value:null},provenance:{archive:'C:\\private',owner:'base',entry:'x.mdl',sha256_utf8_text:'hash'},capacity:{raw_compartments:[{loadConfigs:[1,2]}]},source_metadata:{private:'do not export'}};
  const input={schema_version:3,vehicles:[v],formations:[],provenance:{rule_sources:[]}};
  const out=importSourceCatalogue(input,'source hash');
  assert.deepEqual(out.vehicles[0].capacity.raw_compartments,v.capacity.raw_compartments);
  assert.doesNotMatch(JSON.stringify(out),/private|archive|source_metadata/);
  assert.throws(()=>importSourceCatalogue({...input,vehicles:[v,v]},'hash'),/duplicate/);
  assert.throws(()=>importSourceCatalogue({...input,schema_version:2},'hash'),/schema 3/);
});


test('Default year controls include the named 2025 Rampini through the final collected year',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const id of ['truck-year','catalogue-year','source-year']){
    const input=html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0];
    assert.ok(input);assert.match(input,/max="2035"/);assert.match(input,/value="2035"/);
  }
  assert.equal(filterSourceVehicles(catalogue,{query:'Rampini',year:2020}).length,0);
  assert.equal(filterSourceVehicles(catalogue,{query:'Rampini',year:2025})[0].name.value,'Rampini Eltron');
  assert.equal(filterSourceVehicles(catalogue,{query:'Rampini'})[0].name.value,'Rampini Eltron');
  const rows=sourceRows(filterSourceVehicles(catalogue,{query:'Rampini'}));
  assert.match(rows,/<td>2025<\/td>/);assert.doesNotMatch(rows,/2,025|2025–0/);
});
