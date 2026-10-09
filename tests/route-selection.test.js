import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteSelection} from '../src/route-selection.js';

const initial={distanceKm:10,gradePercent:0,speedLimitKmh:350};
const custom=[{distanceKm:2,gradePercent:4,speedLimitKmh:120},{distanceKm:.5,gradePercent:-3,speedLimitKmh:80}];

test('switching routes preserves all segments and independent simple settings',()=>{
  const route=createRouteSelection(initial);
  route.updateSimple({distanceKm:7,gradePercent:1,speedLimitKmh:160});
  route.updateCustom(custom);
  assert.equal(route.mode,'custom');
  assert.deepEqual(route.segments,custom);
  route.select('simple');
  assert.deepEqual(route.segments,[{distanceKm:7,gradePercent:1,speedLimitKmh:160}]);
  route.updateSimple({distanceKm:3,speedLimitKmh:50});
  route.select('custom');
  assert.deepEqual(route.segments,custom);
  route.select('simple');
  assert.deepEqual(route.segments,[{distanceKm:3,gradePercent:1,speedLimitKmh:50}]);
});

test('invalid edits or external mutations cannot destroy either route',()=>{
  const route=createRouteSelection(initial);
  const input=custom.map(part=>({...part}));
  route.updateCustom(input);
  input[0].distanceKm=9;
  const external=route.segments;external[0].speedLimitKmh=10;
  assert.equal(route.segments[0].distanceKm,2);
  assert.equal(route.segments[0].speedLimitKmh,120);
  route.select('simple');
  assert.throws(()=>route.updateCustom([]));
  assert.throws(()=>route.updateSimple({distanceKm:101}));
  assert.throws(()=>route.select('missing'));
  assert.equal(route.mode,'simple');
  assert.deepEqual(route.segments,[initial]);
  route.select('custom');
  assert.equal(route.segments[0].distanceKm,2);
});
