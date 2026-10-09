import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {withRailGradient} from '../src/rail-motion.js';
import {speedHorizon,speedDistanceHorizon} from '../src/race.js';
import {motionStateAtAbscissa,motionValue,motionTransitions,renderMotionTransitions,speedOrdinateMaximum} from '../src/motion-chart.js';
import {createScale} from '../src/scales.js';
const data=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
const trains=data.trains.map(t=>({...t,color:'#147d64',model:createModel(t,data.source)}));
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('Speed/distance follows physical distance inversion including gradients and export timing',()=>{
  for(const grade of [0,-9,9])for(const base of trains){
    const train=withRailGradient(base,grade);if(!train.model.canStart)continue;
    for(const distance of [.001,.1,1,10]){
      const state=motionStateAtAbscissa(train,distance,'speed-distance');
      close(state.distanceKm,distance);close(state.time,train.model.timeAt(distance));
      close(motionValue(train,distance,'speed-distance'),state.speedKmh);
      close(motionValue(train,state.time,'speed'),state.speedKmh);
      close(motionValue(train,state.time,'distance'),distance);
      close(motionValue(train,distance,'time'),state.time);
    }
  }
});

test('Distance horizon covers the displayed acceleration milestones and responds to selection',()=>{
  for(const grade of [0,3]){
    const ts=trains.map(t=>withRailGradient(t,grade)).filter(t=>t.model.canStart);
    const end=speedDistanceHorizon(ts);
    for(const t of ts)for(const point of motionTransitions(t,'speed-distance'))assert.ok(point.x<=end+1e-8);
    const largest=ts.reduce((a,b)=>speedDistanceHorizon([a])>speedDistanceHorizon([b])?a:b);
    assert.equal(end,speedDistanceHorizon([largest]));
    assert.ok(speedDistanceHorizon(ts.filter(t=>t.id!==largest.id))<end);
  }
  assert.equal(speedDistanceHorizon([]),.1);
});

test('Transition coordinates follow all four axis layouts, and traction-only caps are not duplicated',()=>{
  const train=trains.find(t=>t.id==='avelia-liberty');
  for(const view of ['speed','speed-distance','distance','time']){
    const points=motionTransitions(train,view);assert.equal(points.length,2);
    assert.deepEqual(points.map(p=>p.label),['Traction → power','Speed limit']);
    close(points[0].time,train.model.tractionEndSeconds);close(points[1].time,train.model.speedCapSeconds);
    for(const p of points)close(motionValue(train,p.x,view),p.y);
  }
  const raw={...data.trains[0],maxSpeedKmh:1};
  const slow={...raw,model:createModel(raw,data.source)};
  assert.deepEqual(motionTransitions(slow,'speed').map(p=>p.label),['Speed limit']);
});

test('An uphill asymptote is marked as a 99.9% approach, with its actual coordinates',()=>{
  const train=withRailGradient(trains.find(t=>t.id==='avelia-liberty'),9);
  const point=motionTransitions(train,'speed-distance').at(-1);
  assert.equal(point.label,'99.9% equilibrium');
  close(point.time,train.model.speedViewSeconds);
  assert.ok(point.time<train.model.speedCapSeconds);
  close(point.y,train.model.effectiveMaxSpeedKmh*.999);
  const weak=withRailGradient(trains.find(t=>t.id==='ice-1'),9);
  assert.deepEqual(motionTransitions(weak,'speed'),[]);
});

test('Overlays show coordinates only in the visible domain and escape train names',()=>{
  const train={...trains.find(t=>t.id==='metroliner'),name:'<unsafe & name>'};
  for(const mode of ['linear','log']){
    const x=createScale(mode,500,10),y=createScale(mode,250,10);
    const geometry={view:'speed',sx:n=>65+x.position(n)*700,sy:n=>560-y.position(n)*515,left:65,right:765,top:45,bottom:560};
    const svg=renderMotionTransitions(train,geometry);
    assert.ok(!svg.includes('NaN'));assert.ok(!svg.includes('Infinity'));assert.match(svg,/v = .*km\/h/);
    assert.match(svg,/&lt;unsafe &amp; name&gt;/);assert.doesNotMatch(svg,/<unsafe/);
    const visible=motionTransitions(train,'speed').filter(p=>Number.isFinite(x.position(p.x))&&Number.isFinite(y.position(p.y)));
    assert.equal((svg.match(/<circle /g)||[]).length,visible.length);
  }
  const clipped={view:'speed',sx:()=>NaN,sy:()=>NaN,left:65,right:765,top:45,bottom:560};
  assert.equal(renderMotionTransitions(train,clipped),'');assert.equal(renderMotionTransitions(undefined,clipped),'');
});

test('Nearby transitions at plot edges retain separate bounded labels on narrow and wide charts',()=>{
  const handcar=withRailGradient(trains.find(t=>t.id==='draisine'),8.3);
  assert.equal(motionTransitions(handcar,'speed-distance').length,2);
  for(const width of [240,900])for(const view of ['speed','speed-distance','distance','time']){
    // Reproduce two almost coincident points at each corner and the centre.
    for(const [fx,fy] of [[0,0],[0,1],[1,0],[1,1],[.5,.5]]){
      const geometry={view,sx:()=>65+fx*width,sy:()=>45+fy*335,left:65,right:65+width,top:45,bottom:380};
      const svg=renderMotionTransitions(handcar,geometry);
      const boxes=[...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)]
        .map(m=>m.slice(1).map(Number));
      assert.equal(boxes.length,2);
      for(const [x,y,w,h] of boxes){assert.ok(x>=geometry.left&&x+w<=geometry.right);assert.ok(y>=geometry.top&&y+h<=geometry.bottom);}
      const [a,b]=boxes;
      assert.ok(a[0]+a[2]<=b[0]||b[0]+b[2]<=a[0]||a[1]+a[3]<=b[1]||b[1]+b[3]<=a[1],`${view}: labels overlap`);
    }
  }
});

test('Speed ordinate domains contain reached speeds with at most 5% rounding headroom',()=>{
  for(const grade of [-9,0,3,8.3,9]){
    const ts=trains.map(t=>withRailGradient(t,grade)).filter(t=>t.model.canStart!==false);
    for(const view of ['speed','speed-distance']){
      const horizon=view==='speed'?speedHorizon(ts):speedDistanceHorizon(ts);
      const maximum=Math.max(...ts.map(t=>motionValue(t,horizon,view)));
      const bound=speedOrdinateMaximum(ts,horizon,view);
      assert.ok(bound>=maximum);assert.ok(bound<=maximum*1.05);
      for(const mode of ['linear','log'])assert.ok(Number.isFinite(createScale(mode,bound,Math.min(10,bound/10)).position(maximum)));
    }
  }
  // Crossing a round-number boundary must not expand 100 km/h to 150.
  const fake={model:{stateAt:()=>({speedKmh:100.01})}};
  assert.equal(speedOrdinateMaximum([fake],1,'speed'),105);
  assert.equal(speedOrdinateMaximum([],1,'speed'),1);
});
