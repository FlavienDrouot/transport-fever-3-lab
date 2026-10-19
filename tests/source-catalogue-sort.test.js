import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {filterSourceVehicles,sortSourceVehicles,sourceRows,sourceName,sourceType} from '../src/source-catalogue.js';

const catalogue=JSON.parse(await readFile(new URL('../data/source-catalogue.json',import.meta.url)));
const vehicles=filterSourceVehicles(catalogue);

test('each model shows one player-facing type',()=>{
  const types=new Set(vehicles.map(sourceType));
  for(const type of ['Locomotive','Freight wagon','Passenger wagon','Powered rail component','Tram component','Bus','Truck','Locomotive formation'])assert.ok(types.has(type),type);
  assert.equal(sourceType({kind:'zeppelin'}),'Airship');
  assert.match(sourceRows(vehicles.slice(0,1)),/^<tr><th scope="row">.*<\/th>(<td>[^<]*<\/td>){9}<\/tr>$/s);
});

test('catalogue columns sort both ways with names breaking ties',()=>{
  const fastest=sortSourceVehicles(vehicles,{key:'speed',dir:'desc'});
  assert.equal(fastest.length,vehicles.length);
  const speed=v=>Number(sourceRows([v]).match(/(?:<td>[^<]*<\/td>){2}<td>([^<]*)<\/td>/)[1].replace(/,/g,''));
  const known=fastest.map(speed).filter(Number.isFinite);
  assert.ok(known.length>100);
  assert.deepEqual(known,[...known].sort((a,b)=>b-a));
  assert.ok(!Number.isFinite(speed(fastest.at(-1)))||known.length===fastest.length);
  const names=sortSourceVehicles(vehicles,{key:'name',dir:'asc'}).map(sourceName);
  assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b,'en')));
  const types=sortSourceVehicles(vehicles,{key:'type',dir:'asc'}).map(sourceType);
  assert.deepEqual(types,[...types].sort((a,b)=>a.localeCompare(b,'en')));
});
