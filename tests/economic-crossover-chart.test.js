import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createModel} from '../src/model.js';
import {economicStory} from '../src/economic-crossovers.js';
import {renderEconomicCrossovers} from '../src/economic-crossover-chart.js';
const dataset=JSON.parse(readFileSync(new URL('../data/trains.json',import.meta.url)));
const trains=dataset.trains.slice(0,3).map(t=>({...t,model:createModel(t,dataset.source)}));
test('Economic rank and cost adapters share interactions across scales and demand modes',()=>{
  for(const targets of [{},{demandPerDirection:1000}]){
    const story=economicStory(trains,5,.75,targets);
    for(const kind of ['rank','curves'])for(const distanceMode of ['focus','linear'])for(const verticalMode of ['linear','log']){
      const container={id:`economic-${kind}`,clientWidth:900};
      renderEconomicCrossovers(container,{trains,story,fill:.75,kind,distanceMode,verticalMode,targets});
      assert.match(container.innerHTML,/class="train-curve phase-segment/);
      assert.match(container.innerHTML,/class="curve-hit"/);
      assert.match(container.innerHTML,/clip-path="url\(#economic-/);
      assert.doesNotMatch(container.innerHTML,/NaN|Infinity/);
    }
  }
});
