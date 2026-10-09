import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderDataView} from '../src/data-view.js';
import {createModel} from '../src/model.js';
const data=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
const observations=JSON.parse(await readFile(new URL('../data/experiments.json',import.meta.url)));
const trains=data.trains.map(t=>({...t,model:createModel(t,data.source)}));
function render(ts,experiments=observations){
  const nodes=Object.fromEntries(['experiment-cards','motion-validation','motion-checkpoints','motion-checkpoint-note'].map(id=>[id,{}]));
  const prior=globalThis.document;globalThis.document={getElementById:id=>nodes[id]};
  try{renderDataView(data,ts,experiments);}finally{globalThis.document=prior;}return nodes;
}
test('Direct increment measurements replace video checks and distinguish unmeasured distances',()=>{
  const nodes=render(trains),html=nodes['motion-validation'].innerHTML;
  assert.equal((html.match(/<tr>/g)||[]).length,8);
  assert.match(html,/Avelia Liberty/);assert.match(html,/TGV Duplex/);
  assert.doesNotMatch(html,/Metroliner|NaN|Infinity/);
  assert.match(html,/<td>9\.85<\/td><td>9\.89<\/td><td>0\.04<\/td>/);
  assert.match(html,/<td>—<\/td><td>[\d,.]+<\/td><td>—<\/td>/);
  assert.equal((nodes['experiment-cards'].innerHTML.match(/class="experiment-card"/g)||[]).length,observations.experiments.length);
  assert.match(nodes['experiment-cards'].innerHTML,/Road handling factors/);
  assert.match(nodes['experiment-cards'].innerHTML,/Rail acceleration/);
});
test('Race checkpoints display signed residuals and identify the inferred initial offset',()=>{
  const nodes=render(trains),html=nodes['motion-checkpoints'].innerHTML;
  assert.equal((html.match(/<tr>/g)||[]).length,5);
  assert.match(html,/247\.19 km\/h/);assert.match(html,/204\.88 km\/h/);
  assert.match(html,/240\.22 m<\/td><td>240\.59 m<\/td><td>0\.37 m/);
  assert.match(html,/768\.4–769\.34 m/);
  assert.match(html,/0\.47 m ahead \(inferred\)/);
  assert.match(html,/83 → 84<\/td><td>83 → 84/);
  assert.match(nodes['motion-checkpoint-note'].textContent,/not separately confirmed/);
});
test('Experimental checks retain the flat standard setup even when supplied models have a gradient or cap',()=>{
  const modified=trains.map(t=>({...t,model:createModel({...t,maxSpeedKmh:100},data.source,{gradePercent:9})}));
  const normal=render(trains),changed=render(modified);
  for(const id of ['motion-validation','motion-checkpoints'])assert.equal(changed[id].innerHTML,normal[id].innerHTML);
});
test('Missing or filtered observations produce explicit empty states and do not invent a paired race',()=>{
  const empty=render(trains.filter(t=>t.id==='draisine'));
  assert.match(empty['motion-validation'].innerHTML,/No increment measurements/);
  assert.match(empty['motion-checkpoints'].innerHTML,/No race checkpoints/);
  const single=render(trains.filter(t=>t.id==='avelia-liberty'));
  assert.equal((single['motion-validation'].innerHTML.match(/<tr>/g)||[]).length,4);
  assert.equal((single['motion-checkpoints'].innerHTML.match(/<tr>/g)||[]).length,2);
  assert.doesNotMatch(single['motion-checkpoints'].innerHTML,/crossover|Nose-to-nose/);
  const loading=render(trains,{experiments:[]});
  assert.match(loading['motion-validation'].innerHTML,/No increment measurements/);
  assert.equal(loading['motion-checkpoint-note'].textContent,'');
});
