import test from 'node:test';
import assert from 'node:assert/strict';
import {sortRows,nextSort} from '../src/table-sort.js';

const items=[{name:'B',year:2000,power:null},{name:'A',year:2000,power:5},{name:'C',year:1990,power:9}];
const accessors={name:t=>t.name,year:t=>t.year,power:t=>t.power};

test('rows sort by the chosen column, names break ties and missing values stay last',()=>{
  assert.deepEqual(sortRows(items,{key:'year',dir:'desc'},accessors).map(t=>t.name),['A','B','C']);
  assert.deepEqual(sortRows(items,{key:'year',dir:'asc'},accessors).map(t=>t.name),['C','A','B']);
  assert.deepEqual(sortRows(items,{key:'power',dir:'asc'},accessors).map(t=>t.name),['A','C','B']);
  assert.deepEqual(sortRows(items,{key:'power',dir:'desc'},accessors).map(t=>t.name),['C','A','B']);
  assert.deepEqual(sortRows(items,{key:'name',dir:'asc'},accessors).map(t=>t.name),['A','B','C']);
});

test('clicking the active column reverses it; a new column starts in its natural direction',()=>{
  assert.deepEqual(nextSort({key:'year',dir:'desc'},'year'),{key:'year',dir:'asc'});
  assert.deepEqual(nextSort({key:'year',dir:'desc'},'name',{name:'asc'}),{key:'name',dir:'asc'});
  assert.deepEqual(nextSort({key:'year',dir:'desc'},'power'),{key:'power',dir:'desc'});
});
