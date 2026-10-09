import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {withRailGradient,withRailSpeedLimit} from '../src/rail-motion.js';
import {pairCrossings,rankingSettlesAt,speedHorizon} from '../src/race.js';
import {crossoverStory} from '../src/crossovers.js';
const data=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
const make=(id,grade=3)=>{const source=data.trains.find(t=>t.id===id);return withRailGradient({...source,model:createModel(source,data.source)},grade);};
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test('Distance limits and both phase diagrams reuse pair roots without repeating motion samples',()=>{
  let calls=0;
  const counted=id=>{const train=make(id);return {...train,model:{...train.model,timeAt:x=>{calls++;return train.model.timeAt(x);}}};};
  const a=counted('metroliner'),b=counted('fuxing');
  const roots=pairCrossings(a,b);assert.ok(roots.length);assert.ok(calls>0);
  const initial=calls;
  close(rankingSettlesAt([a,b]),Math.max(...roots));assert.equal(calls,initial);
  assert.deepEqual(pairCrossings(b,a),roots);assert.equal(calls,initial);
  roots.push(9999);assert.ok(!pairCrossings(a,b).includes(9999));assert.equal(calls,initial);
  const first=crossoverStory([a,b]),after=calls;
  const second=crossoverStory([b,a]);
  assert.deepEqual(first,second);
  assert.ok(calls-after<50,'Only phase midpoint rankings should be sampled again');
});

test('Root cache follows model replacement, changed speed caps and new timing functions',()=>{
  let calls=0;
  const fake=(speed,offset)=>({maxSpeedKmh:speed,model:{speedCapKm:1,timeAt:x=>{calls++;return 3600*x/speed+offset;}}});
  const a=fake(100,0),b=fake(200,36);
  assert.deepEqual(pairCrossings(a,b),[2]);const first=calls;
  assert.deepEqual(pairCrossings(a,b),[2]);assert.equal(calls,first);
  b.model={...b.model,timeAt:x=>{calls++;return 18*x+54;}};
  assert.deepEqual(pairCrossings(a,b),[3]);assert.ok(calls>first);
  const next=calls;b.maxSpeedKmh=180;
  pairCrossings(a,b);assert.ok(calls>next);
  const current=calls;b.model.timeAt=x=>{calls++;return 18*x+72;};
  pairCrossings(a,b);assert.ok(calls>current);
});

test('Provably dominant and identical formations need no crossover search',()=>{
  for(const grade of [-3,0,3]) {
    const weak=make('draisine',grade),strong=make('fuxing',grade);
    for(const distance of [.001,.1,1,10,100])assert.ok(strong.model.timeAt(distance)<=weak.model.timeAt(distance));
    let calls=0;
    const count=t=>({...t,model:{...t.model,timeAt:x=>{calls++;return t.model.timeAt(x);}}});
    assert.deepEqual(pairCrossings(count(weak),count(strong)),[]);assert.equal(calls,0);
    assert.deepEqual(pairCrossings(count(strong),count(strong)),[]);assert.equal(calls,0);
  }
});

test('The speed plot ends near equilibrium without shortening the physical model',()=>{
  const train=make('etr-450',1.4),model=train.model;
  assert.equal(model.asymptoticSpeed,true);
  assert.ok(model.speedViewSeconds<model.speedCapSeconds/2);
  close(model.stateAt(model.speedViewSeconds).speedKmh,model.effectiveMaxSpeedKmh*.999);
  assert.equal(speedHorizon([train]),model.speedViewSeconds*1.05);
  for(const t of [model.speedViewSeconds,model.speedCapSeconds*.9,model.speedCapSeconds,model.speedCapSeconds*2])close(model.timeAt(model.stateAt(t).distanceKm),t,1e-5);
  const limited=withRailGradient(withRailSpeedLimit(make('etr-450',0),100),1.4);
  assert.equal(limited.model.asymptoticSpeed,false);
  assert.equal(limited.model.speedViewSeconds,limited.model.speedCapSeconds);
});

test('Steep uphill comparisons keep their known roots and retain the full distant tail',()=>{
  const ts=data.trains.map(t=>withRailGradient({...t,model:createModel(t,data.source)},3)).filter(t=>t.model.canStart);
  const story=crossoverStory(ts);
  close(rankingSettlesAt(ts),1311.308513093201,1e-6);
  assert.deepEqual(story.phases.map(p=>p.leaders),[['metroliner'],['twindexx'],['avelia-liberty']]);
  const distance=2000,interval=story.intervals.at(-1);
  for(const t of ts){const time=t.model.timeAt(distance);const rank=1+ts.filter(other=>other.model.timeAt(distance)<time-Math.max(1e-9,time*1e-10)).length;assert.equal(interval.ranks[t.id],rank);}
});
