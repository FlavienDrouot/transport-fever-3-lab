import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {renderDataView} from '../src/data-view.js';
import {createModel} from '../src/model.js';
const data=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
const observations=JSON.parse(await readFile(new URL('../data/experiments.json',import.meta.url)));
const trains=data.trains.map(t=>({...t,model:createModel(t,data.source)}));
function render(ts){const nodes=Object.fromEntries(['experiment-cards','motion-validation'].map(id=>[id,{}]));const prior=globalThis.document;globalThis.document={getElementById:id=>nodes[id]};try{renderDataView(data,ts,observations);}finally{globalThis.document=prior;}return nodes;}
test('Catalogue with unmeasured trains still renders all video observations',()=>{
  const nodes=render(trains);assert.equal((nodes['motion-validation'].innerHTML.match(/<tr>/g)||[]).length,9);assert.ok(nodes['motion-validation'].innerHTML.includes('Metroliner'));assert.ok(!nodes['motion-validation'].innerHTML.includes('NaN'));assert.equal(observations.experiments.length,9);assert.doesNotMatch(nodes['experiment-cards'].innerHTML,/Handcar coupling/);assert.match(nodes['experiment-cards'].innerHTML,/Road handling factors/);
});
test('Filtering to an unmeasured train produces an informative empty state',()=>{
  const nodes=render(trains.filter(t=>t.id==='draisine'));assert.match(nodes['motion-validation'].innerHTML,/No video observations/);
});
