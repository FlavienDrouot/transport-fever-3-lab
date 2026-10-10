import test from 'node:test';
import assert from 'node:assert/strict';
import {initialNavigation,resolveNavigation} from '../src/navigation.js';
test('spaces remember analyses and editors while legacy links remain valid',()=>{
  let state=resolveNavigation(initialNavigation(),{hash:'#economic-efficiency',owner:'economics'});
  assert.equal(state.space,'compare');assert.equal(state.railView,'economics');
  state=resolveNavigation(state,{hash:'#route-profile'});
  assert.equal(state.space,'design');
  state=resolveNavigation(state,{hash:'#compare'});assert.equal(state.view,'economics');
  state=resolveNavigation(state,{hash:'#design'});assert.equal(state.view,'route-profile');
  state=resolveNavigation(state,{hash:'#trucks'});
  assert.equal(resolveNavigation(state,{hash:'#compare'}).view,'trucks');
});
test('reference deep links select the right reference pane; support leaves context intact',()=>{
  const state=resolveNavigation(initialNavigation(),{owner:'data',dataSection:'models',hash:'#economic-method'});
  assert.equal(state.dataView,'models');assert.equal(state.space,'data');
  assert.equal(resolveNavigation(state,{hash:'#support'}),state);
  assert.equal(resolveNavigation(state,{hash:'#checks'}).dataView,'checks');
  assert.equal(resolveNavigation(state,{hash:'#data'}).dataView,'catalogue');
});

test('Road Race remembers its domain across Design and Compare; legacy Race remains rail',()=>{
 let state=resolveNavigation(initialNavigation(),{hash:'#road-race'});
 assert.equal(state.view,'race');assert.equal(state.domain,'road');assert.equal(state.roadView,'race');
 state=resolveNavigation(state,{hash:'#design'});state=resolveNavigation(state,{hash:'#compare'});
 assert.equal(state.view,'race');assert.equal(state.domain,'road');
 state=resolveNavigation(state,{hash:'#trucks'});assert.equal(state.roadView,'trucks');
 state=resolveNavigation(state,{hash:'#race'});assert.equal(state.domain,'rail');
});

test('Design remembers Optimizer without changing comparison domain',()=>{
  let state=resolveNavigation(initialNavigation(),{hash:'#trucks'});
  state=resolveNavigation(state,{hash:'#optimizer'});assert.equal(state.space,'design');assert.equal(state.domain,'road');
  state=resolveNavigation(state,{hash:'#compare'});assert.equal(state.view,'trucks');
  state=resolveNavigation(state,{hash:'#design'});assert.equal(state.view,'optimizer');
});
