import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {compositionSteadyRunning} from '../src/composition-analysis.js';
import {steadyServiceRows,renderSteadyService} from '../src/steady-service.js';
import {analyseEconomicService} from '../src/rail-freight.js';
import {analysePassengerRoadService} from '../src/trucks.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const data=await read('trains'),trains=data.trains.map(t=>({...t,model:createModel(t,data.source)}));

test('steady Rail rankings reuse Composition and agree with the long-distance Service limit',()=>{
  const settings={infrastructureSpeedKmh:160,gradePercent:0,fillRatio:.75,freight:false};
  const rows=steadyServiceRows(trains,settings);
  for(const {vehicle,steady,capacity} of rows){
    assert.deepEqual(steady,compositionSteadyRunning(vehicle,settings));
    const service=analyseEconomicService(vehicle,{distanceKm:1e6,...settings});
    assert.ok(Math.abs(steady.costPerUnitKm/(service.maintenancePerUnit/1e6)-1)<1e-5);
    assert.equal(capacity,vehicle.passengerCapacity);
    assert.ok(steady.outboundSpeedKmh<=160);
  }
  assert.equal(rows[0].rank,1);
  assert.ok(rows.every((row,i)=>!i||row.steady.costPerUnitKm>=rows[i-1].steady.costPerUnitKm));
  assert.deepEqual(steadyServiceRows(trains,{...settings,distanceKm:3.4}),steadyServiceRows(trains,{...settings,distanceKm:100}));
});

test('Road uses Road motion and preserves rated capacity and speed beside constrained steady values',async()=>{
  const bus=(await read('buses')).buses.at(-1),settings={roadSpeedLimit:40,gradePercent:0,fillRatio:.75,passenger:true};
  const row=steadyServiceRows([bus],settings,{road:true})[0];
  assert.equal(row.capacity,bus.passengerCapacity??bus.cargoCapacity);
  assert.equal(row.vehicle.maxSpeedKmh,bus.maxSpeedKmh);
  assert.equal(row.steady.outboundSpeedKmh,40);
  const result=analysePassengerRoadService([bus],{distanceKm:1e6,motion:true,...settings})[0];
  assert.ok(Math.abs(row.steady.costPerUnitKm/(result.costPerCargo/1e6)-1)<1e-5);
  const truck=(await read('trucks')).trucks.at(-1);
  const empty=steadyServiceRows([truck],{...settings,passenger:false,loadedReturn:false},{road:true})[0];
  const loaded=steadyServiceRows([truck],{...settings,passenger:false,loadedReturn:true},{road:true})[0];
  assert.equal(loaded.steady.costPerUnitKm,empty.steady.costPerUnitKm/2);
  // Rate is per direction: a loaded return halves the cost per delivered unit without changing the Rate.
  assert.equal(loaded.steady.transportOutputPerYear,empty.steady.transportOutputPerYear);
});

test('steady readouts show base metrics, kilometre costs and no finite-route Frequency or fleet values',()=>{
  const heading={},nodes={summary:{},table:{querySelector:()=>heading},body:{},caption:{}};
  const settings={infrastructureSpeedKmh:100,gradePercent:0,fillRatio:.75};
  const train={...trains[0],name:'<Saved train>'};
  renderSteadyService(nodes,[train],settings);
  assert.match(heading.innerHTML,/Capacity/);assert.match(heading.innerHTML,/Running costs/);assert.match(heading.innerHTML,/Maximum speed/);
  assert.match(heading.innerHTML,/capacity·km\/year\/direction/);
  assert.doesNotMatch(heading.innerHTML,/Frequency|Round trip|Fleet/);
  assert.match(nodes.summary.innerHTML,/per capacity \/ km/);
  assert.match(nodes.body.innerHTML,/&lt;Saved train&gt;/);assert.doesNotMatch(nodes.body.innerHTML,/NaN|Infinity/);
  assert.match(nodes.caption.textContent,/Steady running/);
  const zero=steadyServiceRows([train],{...settings,fillRatio:0})[0];
  assert.equal(zero.rank,null);assert.equal(zero.steady.costPerUnitKm,null);
  const blocked=steadyServiceRows(trains,{...settings,gradePercent:20}).find(row=>row.steady.costPerUnitKm===null);
  assert.ok(blocked);assert.equal(blocked.rank,null);
});
