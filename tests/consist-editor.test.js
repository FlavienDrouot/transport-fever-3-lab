import test from 'node:test';
import assert from 'node:assert/strict';
import {compatibleComponents,restoreCompositions,compositionDefinition} from '../src/consist-editor.js';
import {readFile} from 'node:fs/promises';

test('Editor choices keep engines, reject mixed transport categories and filter cargo compatibility/year',()=>{
  const catalogue=[
    {id:'engine',role:'locomotive',year:1900},
    {id:'passenger-motor',role:'powered-carriage',passengerCapacity:20,year:1950},
    {id:'passenger-wagon',role:'wagon',passengerCapacity:10,year:1920},
    {id:'general',role:'wagon',cargoCapacity:10,freightSpecialization:'general',year:1920},
    {id:'bulk',role:'wagon',cargoCapacity:10,freightSpecialization:'bulk',year:1920},
    {id:'liquid-motor',role:'powered-carriage',cargoCapacity:10,freightSpecialization:'liquid',year:1970},
  ];
  const ids=options=>compatibleComponents(catalogue,options).map(x=>x.id);
  assert.deepEqual(ids({category:'passengers',year:2020}),['engine','passenger-motor','passenger-wagon']);
  assert.deepEqual(ids({category:'freight',cargo:'all',year:2020}),['engine','general']);
  assert.deepEqual(ids({category:'freight',cargo:'bulk',year:2020}),['engine','general','bulk']);
  assert.deepEqual(ids({category:'freight',cargo:'liquid',year:1960}),['engine','general']);
  assert.deepEqual(ids({category:'freight',cargo:'liquid',year:2020}),['engine','general','liquid-motor']);
});

test('Dedicated configurator owns the composition while filters live in its right panel',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<div id="configurator" class="analysis-view" hidden>/);
  assert.match(html,/<label class="search-label" for="composition-name">Composition name<\/label>/);
  assert.match(html,/id="composition-summary" role="status" aria-live="polite"/);
  assert.match(html,/id="composition-save" type="submit"/);
  assert.doesNotMatch(html,/custom-tram-form|tram-configurator/);
});

test('Stored definitions are recalculated from current data and reject duplicate, unknown or malformed components',async()=>{
  const [{buildConsist,railComponents},units,locomotives,passenger,freight]=await Promise.all([
    import('../src/consists.js'),...['trains','rail-locomotives','rail-passenger-wagons','rail-freight-wagons'].map(async file=>JSON.parse(await readFile(new URL(`../data/${file}.json`,import.meta.url))))]);
  const catalogue=railComponents({locomotives:locomotives.locomotives,passengerWagons:passenger.wagons,freightWagons:freight.wagons});
  const definition={schemaVersion:1,id:'custom:rail:test',name:'My train',carrier:'rail',category:'passengers',components:[{componentId:catalogue[0].id,quantity:1},{componentId:catalogue.find(c=>c.passengerCapacity).id,quantity:2}]};
  const item=buildConsist(definition,catalogue,units.source);
  assert.deepEqual(compositionDefinition(item),definition);
  const raw=JSON.stringify({schemaVersion:1,compositions:[{...definition,powerCh:999999,economy:{annualMaintenance:1}}]});
  const restored=restoreCompositions(raw,catalogue,units.source);
  assert.equal(restored.skipped,0);assert.equal(restored.compositions[0].powerCh,item.powerCh);assert.deepEqual(restored.compositions[0].economy,item.economy);
  const changed=catalogue.map(c=>({...c,economy:{...c.economy,annualMaintenance:c.economy.annualMaintenance*2}}));
  assert.equal(restoreCompositions(raw,changed,units.source).compositions[0].economy.annualMaintenance,item.economy.annualMaintenance*2);
  const malformed={...definition,id:'custom:bad',components:[{componentId:'missing',quantity:1}]};
  const result=restoreCompositions(JSON.stringify({schemaVersion:1,compositions:[definition,definition,malformed]}),catalogue,units.source);
  assert.equal(result.compositions.length,1);assert.equal(result.skipped,2);
  assert.equal(restoreCompositions('broken',catalogue,units.source).skipped,1);
  assert.equal(restoreCompositions(JSON.stringify({schemaVersion:2,compositions:[]}),catalogue,units.source).skipped,1);
});

test('Duplicating a composition makes a separate identity and deeply independent component entries',async()=>{
  const {duplicateDefinition}=await import('../src/consist-editor.js');
  const original={id:'custom:original',name:'My train',carrier:'rail',category:'freight',freightSpecialization:'bulk',components:[{componentId:'engine',quantity:1},{componentId:'wagon',quantity:4}]};
  const copy=duplicateDefinition(original,'custom:copy');assert.equal(copy.id,'custom:copy');assert.equal(copy.name,'My train · copy');assert.equal(copy.cargo,'bulk');
  copy.components[1].quantity=8;assert.equal(original.components[1].quantity,4);
});
test('Catalogue filters can browse other types while incompatible additions are rejected for the retained draft',async()=>{
  const {canAddComponent}=await import('../src/consist-editor.js');
  const engine={id:'engine',carrier:'rail',role:'locomotive',year:1900};
  const bulk={id:'bulk',carrier:'rail',role:'wagon',year:1920,cargoCapacity:20,freightSpecialization:'bulk'};
  const liquid={...bulk,id:'liquid',freightSpecialization:'liquid'},tram={...engine,id:'tram',carrier:'tram'},passenger={...bulk,id:'passenger',passengerCapacity:20,cargoCapacity:undefined};
  const draft={carrier:'rail',category:'freight',cargo:'bulk',year:1900};
  assert.equal(canAddComponent(engine,draft),true);assert.equal(canAddComponent(bulk,draft),true);
  for(const item of [liquid,tram,passenger])assert.equal(canAddComponent(item,draft),false);
});

test('Duplicating a saved train uses its derived introduction year and leaves filters and saved copies valid',async()=>{
  const {mountConsistEditor}=await import('../src/consist-editor.js');
  const {buildConsist,railComponents}=await import('../src/consists.js');
  const [html,units,locomotives,passenger]=await Promise.all([
    readFile(new URL('../index.html',import.meta.url),'utf8'),
    ...['trains','rail-locomotives','rail-passenger-wagons'].map(async file=>JSON.parse(await readFile(new URL(`../data/${file}.json`,import.meta.url))))
  ]);
  const catalogue=railComponents({locomotives:locomotives.locomotives,passengerWagons:passenger.wagons,freightWagons:[]});
  const original=buildConsist({schemaVersion:1,id:'custom:rail:original',name:'Original',carrier:'rail',category:'passengers',components:[{componentId:catalogue[0].id,quantity:1},{componentId:catalogue.find(c=>c.passengerCapacity&&c.year>=2000).id,quantity:2}]},catalogue,units.source);
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{
    value:'',innerHTML:'',handlers:{},focus(){},get valueAsNumber(){return Number(this.value);},
    addEventListener(type,fn){this.handlers[type]=fn;},querySelector(){return null;}
  }]));
  for(const [id,values] of Object.entries({'configuration-carrier':['rail','tram'],'configuration-category':['passengers','freight'],'configuration-cargo':['all','bulk','goods','flatbed','liquid'],'configuration-role':['all','locomotive','wagon','powered-carriage']})){
    const radios=values.map(value=>({value}));let chosen=values[0];
    for(const radio of radios)Object.defineProperty(radio,'checked',{get:()=>chosen===radio.value,set:on=>{if(on)chosen=radio.value;}});
    nodes.get(id).querySelector=selector=>selector==='input:checked'?radios.find(r=>r.checked):radios.find(r=>selector.includes(`"${r.value}"`));
  }
  const document={getElementById(id){assert.ok(nodes.has(id),`Unknown document ID: ${id}`);return nodes.get(id);}};
  const saved=JSON.stringify({schemaVersion:1,compositions:[compositionDefinition(original)]});
  const editor=mountConsistEditor(document,{catalogue,units:units.source,storage:{getItem:()=>saved,setItem(){}},onChange(){}});
  const year=nodes.get('configuration-year'),output=nodes.get('configuration-year-value');
  const action=type=>nodes.get('composition-saved').handlers.click({target:{closest:selector=>selector===`[data-${type}]`?{dataset:{[type]:original.id}}:null}});
  // A copy intentionally stores only a recipe, with no derived year. Its source
  // still supplies that year when the editor switches catalogue context.
  editor.openContext({carrier:'rail',category:'passengers',cargo:'all',year:1900});
  action('duplicate');
  assert.equal(year.value,original.year);assert.equal(output.textContent,original.year);
  assert.match(nodes.get('component-catalogue-body').innerHTML,/\+ Add/);
  assert.equal(nodes.get('composition-name').value,'Original · copy');
  assert.match(nodes.get('composition-summary').innerHTML,new RegExp(`${Math.round(original.tractionKgf*units.source.kgfNewtons).toLocaleString('en-GB')} N`));
  assert.doesNotMatch(nodes.get('composition-summary').innerHTML,/kgf/);
  nodes.get('composition-form').handlers.submit({preventDefault(){}});
  const items=editor.getCompositions();
  assert.equal(items.length,2);assert.equal(items[1].year,original.year);assert.notEqual(items[1].id,original.id);
  assert.deepEqual(items[1].components,original.components);
  editor.openContext({carrier:'rail',category:'passengers',cargo:'all',year:1900});action('edit');
  assert.equal(year.value,original.year);assert.equal(output.textContent,original.year);
});
