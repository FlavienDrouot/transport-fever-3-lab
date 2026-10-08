import test from 'node:test';
import assert from 'node:assert/strict';
import {compatibleComponents} from '../src/consist-editor.js';
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

test('Configurator has labelled native controls and remains opt-in with tram inclusion',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<details id="tram-configurator"[^>]*hidden/);
  assert.match(html,/<label for="custom-tram-name">Composition name<\/label>/);
  assert.match(html,/id="custom-tram-summary" role="status" aria-live="polite"/);
  assert.match(html,/id="custom-tram-save" type="submit"/);
  assert.match(html,/until the page is reloaded/);
});
