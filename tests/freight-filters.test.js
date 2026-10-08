import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compatibleComponents,compositionDefinition,restoreCompositions} from '../src/consist-editor.js';
import {railComponents,tramComponents,buildConsist} from '../src/consists.js';
import {selectRoadVehicles} from '../src/trucks.js';
const load=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [railLocos,railPassenger,railFreight,trains,tramLocos,tramPassenger,tramFreight,trams,trucks,buses]=await Promise.all(
  ['rail-locomotives','rail-passenger-wagons','rail-freight-wagons','trains','tram-locomotives','tram-passenger-wagons','tram-freight-wagons','trams','trucks','buses'].map(load));
const catalogue=[...railComponents({locomotives:railLocos.locomotives,passengerWagons:railPassenger.wagons,freightWagons:railFreight.wagons,multipleUnits:trains.trains}),
  ...tramComponents({locomotives:tramLocos.locomotives,passengerWagons:tramPassenger.wagons,freightWagons:tramFreight.wagons,passengerTrams:trams.trams,freightTrams:trams.freightTrams})];

test('All freight includes the entire eligible catalogue; specific groups keep general-purpose vehicles',()=>{
  for(const carrier of ['rail','tram'])for(const year of [1900,2020,2035]){
    const available=catalogue.filter(c=>c.carrier===carrier&&c.year<=year&&(c.role==='locomotive'||c.cargoCapacity>0));
    assert.deepEqual(compatibleComponents(catalogue,{carrier,category:'freight',cargo:'all',year}),available);
    for(const cargo of ['bulk','goods','flatbed','liquid']){
      assert.deepEqual(compatibleComponents(catalogue,{carrier,category:'freight',cargo,year}),available.filter(c=>c.role==='locomotive'||['general',cargo].includes(c.freightSpecialization)));
    }
  }
  const datasets={trucks:trucks.trucks,buses:buses.buses,trams:trams.trams,freightTrams:trams.freightTrams};
  for(const year of [1900,2020,2035])for(const includeTrams of [false,true]){
    const expected=[...trucks.trucks,...(includeTrams?trams.freightTrams:[])].filter(c=>c.year<=year);
    assert.deepEqual(selectRoadVehicles(datasets,{category:'freight',cargo:'all',year,includeTrams}).map(c=>c.id),expected.map(c=>c.id));
  }
});

test('Compositions built from All freight retain their inferred specialization after save and restore',()=>{
  for(const carrier of ['rail','tram'])for(const cargo of ['bulk','goods','flatbed','liquid']){
    const choices=compatibleComponents(catalogue,{carrier,category:'freight',cargo:'all'});
    const motor=choices.find(c=>c.role==='locomotive');
    const general=choices.find(c=>c.role==='wagon'&&c.freightSpecialization==='general');
    const specialized=choices.find(c=>c.role==='wagon'&&c.freightSpecialization===cargo);
    const definition={schemaVersion:1,id:`custom:${carrier}:${cargo}`,name:'Specialized service',carrier,category:'freight',cargo:'all',components:[motor,specialized,general].map(c=>({componentId:c.id,quantity:1}))};
    const result=buildConsist(definition,catalogue,trains.source);
    assert.equal(result.serviceReady,true);assert.equal(result.freightSpecialization,cargo);
    const recipe=compositionDefinition(result);assert.equal(recipe.cargo,cargo);
    const restored=restoreCompositions(JSON.stringify({schemaVersion:1,compositions:[recipe]}),catalogue,trains.source);
    assert.equal(restored.skipped,0);assert.equal(restored.compositions[0].freightSpecialization,cargo);
    const incompatible=choices.find(c=>c.role==='wagon'&&c.freightSpecialization!=='general'&&c.freightSpecialization!==cargo);
    assert.throws(()=>buildConsist({...definition,components:[...definition.components,{componentId:incompatible.id,quantity:1}]},catalogue,trains.source),/one specialization/);
  }
});
