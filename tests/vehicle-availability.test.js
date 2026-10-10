import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {vehicleAvailabilityIndex} from '../scripts/import-vehicle-availability.mjs';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));

test('maintained availability covers every selectable Rail/Road record and matches explicit source provenance',async()=>{
  const catalogue=await read('source-catalogue'),stored=await read('vehicle-availability'),observations=[];
  for(const [name,key] of [['trains','trains'],['rail-locomotives','locomotives'],['rail-passenger-wagons','wagons'],['rail-freight-wagons','wagons'],['buses','buses'],['trucks','trucks'],['trams','trams'],['trams','freightTrams'],['tram-locomotives','locomotives'],['tram-passenger-wagons','wagons'],['tram-freight-wagons','wagons']]){
    const data=await read(name);observations.push(...data[key].map(card=>({reference:`data/${name}.json#${card.id}`,card})));
  }
  assert.deepEqual(vehicleAvailabilityIndex(catalogue,observations),stored);
  assert.equal(Object.keys(stored.entries).length,223);
  assert.equal(stored.entries['data/trucks.json#man-19304'].yearTo,2010);
  assert.equal(stored.entries['data/buses.json#droschky'].yearTo,1915);
  assert.equal(stored.entries['data/trains.json#tgv'].yearTo,0);
  assert.equal(stored.entries['data/rail-passenger-wagons.json#british-mark-3-carriage'].resourceIds.length,2);
});

test('formation end uses the earliest finite component end; omitted end and unavailable metadata remain distinct',()=>{
  const id=name=>`base::/vehicle/train/test/${name}`;
  const model=(name,yearTo)=>({id:id(name),availability:{raw:yearTo===undefined?{}:{yearTo}}});
  const catalogue={source:{},vehicles:[model('a.mdl',2020),model('b.mdl',2010),model('c.mdl',0),model('d.mdl'),{id:id('unknown.mdl')}],
    formations:[{id:id('test.mu.lua'),components:[{name:'a.mdl'},{name:'b.mdl'},{name:'c.mdl'}]}]};
  const record=(name,resourceId)=>({reference:name,card:{dataProvenance:{resourceId}}});
  const index=()=>vehicleAvailabilityIndex(catalogue,[record('formation',id('test.mu.lua')),record('indefinite',id('d.mdl')),record('unknown',id('unknown.mdl'))]).entries;
  assert.equal(index().formation.yearTo,2010);assert.equal(index().indefinite.yearTo,0);assert.equal(index().unknown.yearTo,null);
  catalogue.formations[0].components.push({name:'unknown.mdl'});assert.equal(index().formation.yearTo,2010);
  catalogue.formations[0].components.push({name:'test.mu.lua'});assert.throws(index,/Unresolved/);
});

test('import rejects unassociated records and conflicting equivalent models instead of guessing',()=>{
  const catalogue={source:{},formations:[],vehicles:[{id:'a',availability:{raw:{yearTo:2010}}},{id:'b',availability:{raw:{yearTo:2020}}}]};
  assert.throws(()=>vehicleAvailabilityIndex(catalogue,[{reference:'unknown',card:{name:'A'}}]),/Missing source association/);
  assert.throws(()=>vehicleAvailabilityIndex(catalogue,[{reference:'alternatives',card:{dataProvenance:{equivalentResourceIds:['a','b']}}}]),/Ambiguous alternative availability/);
});
