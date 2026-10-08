import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {railComponents,buildConsist} from '../src/consists.js';
import {economicCandidates,economicSelection,economicEmptyContent} from '../src/economic-selection.js';
import {economicStory} from '../src/economic-crossovers.js';
import {renderEconomicCrossovers} from '../src/economic-crossover-chart.js';
import {renderEconomicChart} from '../src/economic-chart.js';
import {analyseFreightService} from '../src/rail-freight.js';
import {mountConsistEditor} from '../src/consist-editor.js';
const data=file=>JSON.parse(readFileSync(new URL(`../data/${file}.json`,import.meta.url)));
const units=data('trains').source;
const catalogue=railComponents({locomotives:data('rail-locomotives').locomotives,passengerWagons:data('rail-passenger-wagons').wagons,freightWagons:data('rail-freight-wagons').wagons});
function formation(cargo='all',count=4){
  const wagon=catalogue.find(c=>c.cargoCapacity&&c.freightSpecialization===(cargo==='all'?'general':cargo));
  return {...buildConsist({schemaVersion:1,id:`custom:${cargo}:${count}`,name:`Freight ${cargo} ${count}`,carrier:'rail',category:'freight',cargo,components:[{componentId:catalogue[0].id,quantity:1},{componentId:wagon.id,quantity:count}]},catalogue,units),color:'#008899',dash:''};
}
const general=formation(),bulk=formation('bulk'),passenger={id:'passenger',passengerCapacity:20,year:1950,lengthMetres:20};
const options={freight:true,cargo:'all',year:2035};

test('Freight Economics compares saved compatible rail compositions, preserving hidden selections',()=>{
  const tram={...general,id:'tram',carrier:'tram'},unconfigured={...general,id:'unconfigured',components:[]};
  const all=[general,bulk,passenger,tram,unconfigured],selected=new Set(all.map(t=>t.id)),before=[...selected];
  assert.deepEqual(economicCandidates(all,options),[general]);
  assert.deepEqual(economicCandidates(all,{...options,cargo:'bulk'}),[general,bulk]);
  assert.deepEqual(economicCandidates(all,{year:2035}),[passenger]);
  const selection=economicSelection(all,selected,{...options,platformLengthMetres:general.lengthMetres-1});
  assert.equal(selection.empty,'length');assert.deepEqual(selection.excluded,[general]);
  assert.deepEqual([...selected],before);
  const future={...general,year:2025};
  const year=economicSelection([future],new Set([future.id]),{...options,year:2000});
  assert.equal(year.empty,'year');assert.deepEqual(year.phaseItems,[future]);
  assert.equal(economicSelection(all,new Set(),options).empty,'selection');
});

test('No freight recipes provides an invitation to configure trains instead of empty results',()=>{
  assert.equal(economicSelection([passenger],new Set([passenger.id]),options).empty,'create');
  const content=economicEmptyContent('create',true);
  assert.match(content,/Create your own freight train/);assert.match(content,/locomotive.*freight wagons/);
  assert.match(content,/href="#configurator" data-economic-configure/);assert.doesNotMatch(content,/<svg/);
  assert.match(economicEmptyContent('selection',true),/economic-empty-select/);
  assert.match(economicEmptyContent('length',true),/href="#platform-length"/);
});

test('All five Economics axes use freight deliveries, independent stops and the same service model',()=>{
  const trains=[general,formation('all',8)];
  const targets={freight:true,demandPerYear:1000,maxHeadwaySeconds:180,loadedReturn:true,infrastructureSpeedKmh:100,stopA:{specializedTerminal:true},stopB:{specializedWarehouse:true}};
  const before=structuredClone(targets);
  for(const [axis,values] of Object.entries({distance:[.1,3,8],utilization:[1,50,100],demand:[1,1000,1500],headway:[.1,2,10],year:[1900,2035]})){
    const story=economicStory(trains,8,.75,targets,{axis,year:2000});
    for(const x of values)for(const train of trains){
      const scenario={distanceKm:8,fillRatio:.75,...targets};
      if(axis==='distance')scenario.distanceKm=x;
      if(axis==='utilization')scenario.fillRatio=x/100;
      if(axis==='demand')scenario.demandPerYear=x;
      if(axis==='headway')scenario.maxHeadwaySeconds=x*60;
      assert.equal(story.valueAt(train.id,x),axis==='year'&&train.year>x?null:analyseFreightService(train,scenario).maintenancePerUnit);
    }
    if(axis==='demand')assert.equal(story.label,'Cargo units / year delivered');
    for(const kind of ['curves','rank'])for(const distanceMode of ['linear','focus']){
      const container={id:'freight-phase',clientWidth:900};
      renderEconomicCrossovers(container,{trains,story,fill:.75,targets,kind,distanceMode});
      assert.doesNotMatch(container.innerHTML,/NaN|Infinity|passenger/);
      assert.match(container.innerHTML,/curve-hit/);
      if(kind==='curves')assert.match(container.innerHTML,/Running cost \/ cargo unit/);
    }
  }
  assert.deepEqual(targets,before);
  const implicit=economicStory(trains,8,.75,{freight:true},{axis:'demand'});
  assert.equal(implicit.valueAt(general.id,1000),analyseFreightService(general,{distanceKm:8,fillRatio:.75,demandPerYear:1000}).maintenancePerUnit);
});

test('Distance curve cache refreshes edited freight recipes under the same ID',()=>{
  const container={id:'freight-cost',clientWidth:900};
  const render=train=>renderEconomicChart(container,{trains:[train],distance:8,fill:.75,mode:'linear',targets:{freight:true}});
  render(general);const before=container.innerHTML;
  render({...general,cargoCapacity:general.cargoCapacity*2});
  assert.notEqual(container.innerHTML,before);assert.match(container.innerHTML,/delivered cargo unit/);
  assert.doesNotMatch(container.innerHTML,/NaN|Infinity|passenger/);
});

test('Configurator invitation selects the freight context and keeps an existing draft',()=>{
  // Limit the fixture to real document IDs, so a broken invitation cannot silently
  // create a missing control. Exercise the editor's public API and event handlers.
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const nodes=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],{value:'',innerHTML:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},querySelector(){return null;}}]));
  for(const [id,values] of Object.entries({'configuration-carrier':['rail','tram'],'configuration-category':['passengers','freight'],'configuration-cargo':['all','bulk','goods','flatbed','liquid'],'configuration-role':['all','locomotive','wagon','powered-carriage']})){
    const radios=values.map(value=>({value,checked:value===values[0]}));
    nodes.get(id).querySelector=selector=>selector==='input:checked'?radios.find(r=>r.checked):radios.find(r=>selector.includes(`"${r.value}"`));
  }
  const document={getElementById(id){assert.ok(nodes.has(id),`Unknown document ID: ${id}`);return nodes.get(id);}};
  const editor=mountConsistEditor(document,{catalogue,units,onChange(){}});
  editor.openContext({carrier:'rail',category:'freight',cargo:'bulk',year:2000});
  assert.equal(nodes.get('composition-context').textContent,'Rail · bulk');
  assert.equal(nodes.get('configuration-cargo-group').hidden,false);
  nodes.get('component-catalogue-body').handlers.click({target:{closest:()=>({dataset:{add:catalogue[0].id}})}});
  const before=nodes.get('composition-components').innerHTML;
  editor.openContext({carrier:'rail',category:'passengers',cargo:'all',year:2035});
  assert.equal(nodes.get('composition-components').innerHTML,before);
  assert.equal(nodes.get('composition-context').textContent,'Rail · bulk');
  assert.match(nodes.get('composition-message').textContent,/draft has been kept/);
  assert.equal(nodes.get('configuration-cargo-group').hidden,true);
  nodes.get('composition-new').handlers.click();
  assert.equal(nodes.get('composition-context').textContent,'Rail · Passengers');
});
