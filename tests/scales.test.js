import test from 'node:test';
import assert from 'node:assert/strict';
import {createScale} from '../src/scales.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('Linear scale retains zero and has a reversible mapping',()=>{
 const s=createScale('linear',300);close(s.position(0),0);close(s.position(150),.5);close(s.invert(.5),150);assert.equal(s.ticks[0],0);
});
test('True logarithms have equal spacing for equal ratios, without an artificial origin',()=>{
 const s=createScale('log',1000,1);close(s.position(1),0);close(s.position(10),1/3);close(s.position(100),2/3);close(s.position(1000),1);
 assert.ok(Number.isNaN(s.position(0)));assert.ok(Number.isNaN(s.position(-1)));assert.ok(Number.isNaN(s.position(.1)));assert.ok(!s.ticks.includes(0));
 for(const n of [1,2,5,10,20,100,500,1000])close(s.invert(s.position(n)),n);
});
test('Sub-unit log domains and ticks preserve physical units',()=>{
 const s=createScale('log',20,.001);close(s.position(.001),0);close(s.invert(s.position(.01)),.01);assert.ok(s.ticks.includes(.001));assert.ok(s.ticks.includes(.01));assert.ok(s.ticks.includes(20));
});
test('Invalid domains fail rather than produce misleading coordinates',()=>{
 for(const args of [['log',300,0],['log',300,300],['linear',0],['linear',NaN],['unknown',10]])assert.throws(()=>createScale(...args),RangeError);
});

test('Linear ceiling ticks stay in the domain despite decimal rounding', () => {
 for (const max of [.55, 18.7, 100 * 1.1]) {
  const scale = createScale('linear', max);
  assert.equal(scale.ticks.at(-1), max);
  for (const tick of scale.ticks) assert.ok(Number.isFinite(scale.position(tick)));
 }
});
