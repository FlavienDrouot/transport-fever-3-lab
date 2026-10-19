import test from 'node:test';
import assert from 'node:assert/strict';
import {SHARE_DEFAULTS,encodeShareState,decodeShareState} from '../src/share-state.js';

const route=[{distanceKm:10,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:120}];

test('an untouched comparison keeps a bare link',()=>{
  assert.equal(encodeShareState({...SHARE_DEFAULTS,segments:route}),'');
});

test('a shared comparison round-trips its route, filters, Utilization and vehicles',()=>{
  const state={...SHARE_DEFAULTS,category:'freight',scope:'distance',segments:[{distanceKm:42.5,gradePercent:-1.5,speedLimitKmh:160,roadSpeedLimitKmh:80}],
    railYear:1995,roadYear:1980,railCargo:'liquid',roadCargo:'bulk',includeTrams:true,railFill:.75,roadFill:.5,
    railSelection:['tgv','rail:light-rail:stadler-citylink','custom:mine'],roadSelection:[]};
  const query=encodeShareState(state);
  assert.equal(query,'c=f&s=distance&r=42.5~-1.5~160~80&y=1995&yr=1980&rc=liquid&tc=bulk&t=1&u=75&ur=50&v=tgv.rail:light-rail:stadler-citylink&vr=-');
  const decoded=decodeShareState(`?${query}`);
  assert.equal(decoded.category,'freight');
  assert.equal(decoded.scope,'distance');
  assert.deepEqual(decoded.segments.map(({distanceKm,gradePercent,speedLimitKmh,roadSpeedLimitKmh})=>({distanceKm,gradePercent,speedLimitKmh,roadSpeedLimitKmh})),state.segments);
  assert.deepEqual([decoded.railYear,decoded.roadYear,decoded.railCargo,decoded.roadCargo,decoded.includeTrams,decoded.railFill,decoded.roadFill],[1995,1980,'liquid','bulk',true,.75,.5]);
  // Compositions stay in their browser; an explicit empty list stays empty.
  assert.deepEqual(decoded.railSelection,['tgv','rail:light-rail:stadler-citylink']);
  assert.deepEqual(decoded.roadSelection,[]);
});

test('custom routes keep every segment',()=>{
  const segments=[{distanceKm:3,gradePercent:2,speedLimitKmh:100,roadSpeedLimitKmh:50},{distanceKm:7,gradePercent:-1,speedLimitKmh:160,roadSpeedLimitKmh:120}];
  const decoded=decodeShareState(encodeShareState({...SHARE_DEFAULTS,scope:'custom',segments}));
  assert.equal(decoded.scope,'custom');
  assert.equal(decoded.segments.length,2);
  assert.equal(decoded.segments[1].gradePercent,-1);
});

test('invalid fields are ignored',()=>{
  const decoded=decodeShareState('?r=500~0~350~120&y=1500&u=140&s=everything&v=ok.<script>');
  assert.equal(decoded.segments,undefined);
  assert.equal(decoded.railYear,undefined);
  assert.equal(decoded.railFill,undefined);
  assert.equal(decoded.scope,undefined);
  assert.deepEqual(decoded.railSelection,['ok']);
});
