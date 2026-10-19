import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {lightRailComparisonVehicles} from '../src/consists.js';
import {STARTER_SIZE,RAIL_PASSENGER_STARTER,starterIds,applyStarterSelection} from '../src/starter-selection.js';

const items=[
  {id:'a',name:'Alpha',year:1990},{id:'b',name:'Beta',year:2025},{id:'c',name:'Gamma',year:2010},
  {id:'d',name:'Delta',year:2010},{id:'custom:1',name:'Mine',year:2030},
];

test('without a curated cast the starter selection keeps the newest catalogue vehicles',()=>{
  assert.deepEqual(starterIds(items,{size:3}),['b','d','c']);
  assert.equal(STARTER_SIZE,6);
  assert.deepEqual(starterIds(items),['b','d','c','a']);
});

test('missing curated vehicles are replaced by the newest vehicles not yet shown',()=>{
  assert.deepEqual(starterIds(items,{preferred:['c','a','missing'],size:3}),['c','a','b']);
  assert.deepEqual(starterIds(items,{preferred:['b','a','missing'],size:4}),['b','a','d','c']);
  assert.deepEqual(starterIds(items,{preferred:['missing'],size:2}),['b','d']);
});

test('the Rail passenger cast exists in the Rail and light-rail catalogues',async()=>{
  const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
  const trains=await read('trains'),trams=await read('trams');
  const ids=new Set([...trains.trains,...lightRailComparisonVehicles([...trams.trams,...trams.freightTrams],trains.source)].map(t=>t.id));
  for(const id of RAIL_PASSENGER_STARTER)assert.ok(ids.has(id),id);
});

test('applying the starter selection preserves compositions and previews',()=>{
  const selected=new Set(['a','custom:1','custom:preview:composition']);
  applyStarterSelection(selected,items,{size:2});
  assert.deepEqual([...selected],['b','d','custom:1','custom:preview:composition']);
});
