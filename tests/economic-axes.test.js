import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createModel} from '../src/model.js';
import {analyseService} from '../src/line.js';
import {economicStory,yearRankingStory} from '../src/economic-crossovers.js';
import {renderEconomicCrossovers} from '../src/economic-crossover-chart.js';
const dataset=JSON.parse(readFileSync(new URL('../data/trains.json',import.meta.url)));
const trains=dataset.trains.slice(0,3).map(t=>({...t,model:createModel(t,dataset.source)}));

test('Each Economics axis varies only its parameter and agrees with the service model',()=>{
  const targets={demandPerDirection:1250,maxHeadwaySeconds:120,infrastructureSpeedKmh:100};
  const original=structuredClone(targets);
  const scenarios={distance:[.1,3,8],utilization:[1,50,100],demand:[1,1000,1250],headway:[.1,2,10]};
  for(const [axis,values] of Object.entries(scenarios)){
    const story=economicStory(trains,8,.75,targets,{axis,year:2000});
    for(const x of values)for(const train of trains){
      const options={distanceKm:8,fillRatio:.75,...targets};
      if(axis==='distance')options.distanceKm=x;
      if(axis==='utilization')options.fillRatio=x/100;
      if(axis==='demand')options.demandPerDirection=x;
      if(axis==='headway')options.maxHeadwaySeconds=x*60;
      assert.equal(story.valueAt(train.id,x),analyseService(train,options).maintenancePerJourney);
    }
    assert.equal(story.year,2000);
  }
  assert.deepEqual(targets,original);
  for(const [axis,value,key] of [['demand',100,'demandPerDirection'],['headway',2,'maxHeadwaySeconds']]){
    const story=economicStory(trains,8,.75,{}, {axis});
    assert.equal(story.valueAt(trains[0].id,value),analyseService(trains[0],{distanceKm:8,fillRatio:.75,[key]:axis==='headway'?value*60:value}).maintenancePerJourney);
  }
});

test('Year ranking excludes future vehicles, and includes a debut at the 2035 endpoint',()=>{
  const items=[{id:'early',year:1900},{id:'future',year:2000},{id:'last',year:2035}];
  const story=yearRankingStory(items,id=>({early:30,future:20,last:10})[id]);
  assert.deepEqual(story.intervals[0].ranks,{early:1,future:null,last:null});
  assert.deepEqual(story.ranksAt(2000),{early:2,future:1,last:null});
  assert.deepEqual(story.ranksAt(2035),{early:3,future:2,last:1});
  assert.equal(story.valueAt('future',1999),null);
  assert.equal(story.valueAt('last',2035),10);
  assert.equal(story.intervals.at(-1).end,2035);
  const economic=economicStory(trains.map(t=>({...t,year:2035})),8,.75,{}, {axis:'year',year:2000});
  assert.equal(economic.valueAt(trains[0].id,2034),null);
  assert.equal(economic.valueAt(trains[0].id,2035),analyseService(trains[0],{distanceKm:8,fillRatio:.75}).maintenancePerJourney);
  for(const kind of ['curves','rank']){
    const container={id:'last-year',clientWidth:900};
    renderEconomicCrossovers(container,{trains,story:economic,fill:.75,kind,distanceMode:'linear'});
    assert.doesNotMatch(container.innerHTML,/NaN|Infinity/);
    assert.match(container.innerHTML,/class="end-label/);
  }
});

test('Axis diagrams keep finite paths, steps, interactions and custom ordinate formats',()=>{
  for(const axis of ['year','utilization','demand','headway']){
    const story=economicStory(trains,8,.75,{}, {axis});
    for(const kind of ['curves','rank'])for(const distanceMode of ['linear','focus'])for(const verticalMode of ['linear','log']){
      const container={id:'axis-test',clientWidth:900};
      renderEconomicCrossovers(container,{trains,story,fill:.75,kind,distanceMode,verticalMode});
      assert.doesNotMatch(container.innerHTML,/NaN|Infinity/);
      assert.match(container.innerHTML,/curve-hit/);
      assert.match(container.innerHTML,new RegExp(story.label.replace(/[()]/g,'\\$&')));
      if(kind==='curves'&&story.discontinuous)assert.match(container.innerHTML,/H[\d.]+ V[\d.]+/);
    }
  }
  const race=yearRankingStory(trains,()=>90);
  const container={id:'race-year',clientWidth:900};
  renderEconomicCrossovers(container,{trains,story:race,kind:'curves',distanceMode:'linear',ordinateTitle:'Arrival time',ordinateFormat:()=> '1:30'});
  assert.match(container.innerHTML,/Arrival time/);
  assert.match(container.innerHTML,/1:30/);
  assert.doesNotMatch(container.innerHTML,/NaN|Infinity/);
});

test('Editing a composition with the same ID refreshes plotted costs',()=>{
  const container={id:'cost-edit',clientWidth:900};
  const render=vehicles=>renderEconomicCrossovers(container,{trains:vehicles,story:economicStory(vehicles,8,.75),fill:.75,kind:'curves',distanceMode:'linear'});
  render(trains);const before=container.innerHTML;
  render(trains.map((t,i)=>i? t:{...t,economy:{...t.economy,annualMaintenance:t.economy.annualMaintenance*10}}));
  assert.notEqual(container.innerHTML,before);
});
