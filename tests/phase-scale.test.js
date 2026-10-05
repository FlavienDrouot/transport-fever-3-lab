import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhaseScale} from '../src/phase-scale.js';
test('Phase focus expands short intervals without changing real values or discontinuities',()=>{
 const axis=createPhaseScale([0,2,10,100]);
 assert.equal(axis.position(2),1/3);assert.equal(axis.position(10),2/3);
 for(const x of [0,.1,1,2,3,10,50,100,112])assert.ok(Math.abs(axis.invert(axis.position(x))-x)<1e-10);
 for(const x of [2,10])assert.ok(Math.abs(axis.position(x-1e-8)-axis.position(x+1e-8))<1e-7);
 assert.ok(axis.position(3)-axis.position(2)>axis.position(11)-axis.position(10));
});
test('Single-phase scale is linear and invalid knots fail explicitly',()=>{
 assert.equal(createPhaseScale([0,10]).position(5),.5);
 for(const knots of [[],[0],[0,0],[1,0],[0,NaN]])assert.throws(()=>createPhaseScale(knots),RangeError);
});

test('Final leadership tail gets 30% of an earlier phase and remains reversible',async()=>{
 const {leadershipWeights}=await import('../src/phase-scale.js');
 const axis=createPhaseScale([0,2,10,100],leadershipWeights(3));
 assert.ok(Math.abs((axis.position(100)-axis.position(10))/(axis.position(2)-axis.position(0))-.3)<1e-12);
 for(const x of [0,1,2,5,10,50,100,120])assert.ok(Math.abs(axis.invert(axis.position(x))-x)<1e-10);
 assert.deepEqual(leadershipWeights(1),[1]);
 for(const weights of [[1],[1,0],[-1,1],[1,Infinity]])assert.throws(()=>createPhaseScale([0,2,10],weights),RangeError);
});
