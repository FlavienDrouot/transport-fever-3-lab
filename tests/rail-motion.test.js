import test from 'node:test';
import assert from 'node:assert/strict';
import {withRailSpeedLimit} from '../src/rail-motion.js';
import {createModel} from '../src/model.js';
import {yearRankingStory} from '../src/economic-crossovers.js';
const units={kgfNewtons:9.80665,horsepowerWatts:735.5};
const train={id:'fast',year:2025,massTonnes:200,powerCh:8000,tractionKgf:20000,maxSpeedKmh:300};train.model=createModel(train,units);
test('Race speed cap changes travel time, preserves sources and reuses stable capped models',()=>{
  const capped=withRailSpeedLimit(train,100);assert.equal(capped.maxSpeedKmh,100);assert.ok(capped.model.timeAt(30)>train.model.timeAt(30));assert.equal(train.maxSpeedKmh,300);
  assert.equal(withRailSpeedLimit(train,90).model.stateAt(10000).speedKmh,90);assert.equal(withRailSpeedLimit(train,100),capped);assert.equal(withRailSpeedLimit(train,350),train);assert.throws(()=>withRailSpeedLimit(train,0));
});
test('Year arrival rankings use capped travel times at the same route distance and exclude future compositions',()=>{
  const old={...train,id:'old',year:1900,maxSpeedKmh:80};old.model=createModel(old,units);
  const ts=[old,train].map(t=>withRailSpeedLimit(t,100));
  const value=(id)=>ts.find(t=>t.id===id).model.timeAt(10),story=yearRankingStory(ts,value);
  assert.equal(story.ranksAt(2024).fast,null);assert.equal(story.ranksAt(2025).fast,1);assert.equal(story.valueAt('fast',2024),null);assert.equal(story.valueAt('fast',2025),value('fast'));
});
