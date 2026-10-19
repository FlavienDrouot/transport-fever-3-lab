import test from 'node:test';
import assert from 'node:assert/strict';
import {STARTER_SIZE,starterIds,applyStarterSelection} from '../src/starter-selection.js';

const items=[
  {id:'a',name:'Alpha',year:1990},{id:'b',name:'Beta',year:2025},{id:'c',name:'Gamma',year:2010},
  {id:'d',name:'Delta',year:2010},{id:'custom:1',name:'Mine',year:2030},
];

test('the starter selection keeps the newest catalogue vehicles, names breaking ties',()=>{
  assert.deepEqual(starterIds(items,3),['b','d','c']);
  assert.equal(STARTER_SIZE,6);
  assert.deepEqual(starterIds(items),['b','d','c','a']);
});

test('applying the starter selection preserves compositions and previews',()=>{
  const selected=new Set(['a','custom:1','custom:preview:composition']);
  applyStarterSelection(selected,items,2);
  assert.deepEqual([...selected],['b','d','custom:1','custom:preview:composition']);
});
