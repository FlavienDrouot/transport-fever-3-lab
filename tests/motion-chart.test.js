import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {withRailGradient} from '../src/rail-motion.js';
import {speedHorizon,speedDistanceHorizon} from '../src/race.js';
import {motionStateAtAbscissa,motionValue,motionTransitions,renderMotionTransitions,renderModelTransitions,speedOrdinateMaximum,motionCurveEnd} from '../src/motion-chart.js';
import {withRailProfile} from '../src/rail-motion.js';
import {formatNumber,formatTime} from '../src/format.js';
import {createScale} from '../src/scales.js';
const data=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
const trains=data.trains.map(t=>({...t,color:'#147d64',model:createModel(t,data.source)}));
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('finite time curves end at each train’s own arrival instead of drawing a flat tail',()=>{
  const route=[{distanceKm:2,gradePercent:0,speedLimitKmh:160}];
  const fast=withRailProfile(trains.find(t=>t.id==='avelia-liberty'),route);
  const slow=withRailProfile(trains.find(t=>t.id==='draisine'),route);
  const horizon=slow.model.timeAt(2);
  assert.ok(fast.model.timeAt(2)<horizon);
  for(const view of ['distance','speed'])close(motionCurveEnd(fast,view,horizon),fast.model.timeAt(2));
  assert.equal(motionCurveEnd(fast,'speed-distance',horizon),horizon);
  assert.equal(motionCurveEnd(trains[0],'distance',horizon),horizon);
});

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

test('An uphill asymptote is marked as a 99% approach, with its actual coordinates',()=>{
  const train=withRailGradient(trains.find(t=>t.id==='avelia-liberty'),9);
  const point=motionTransitions(train,'speed-distance').at(-1);
  assert.equal(point.label,'99% equilibrium');
  close(point.time,train.model.speedViewSeconds);
  assert.ok(point.time<train.model.speedCapSeconds);
  close(point.y,train.model.effectiveMaxSpeedKmh*.99);
  const rawWeak={...trains.find(t=>t.id==='ice-1'),tractionKgf:100};
  const weak=withRailGradient({...rawWeak,model:createModel(rawWeak,data.source)},9);
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
    for(const fx of [0,.02,.5,.98,1])for(const fy of [0,.02,.5,.98,1]){
      const geometry={view,sx:()=>65+fx*width,sy:()=>45+fy*335,left:65,right:65+width,top:45,bottom:380};
      const svg=renderMotionTransitions(handcar,geometry);
      const boxes=[...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)]
        .map(m=>m.slice(1).map(Number));
      assert.equal(boxes.length,2);
      for(const [x,y,w,h] of boxes){assert.ok(x>=geometry.left&&x+w<=geometry.right);assert.ok(y>=geometry.top&&y+h<=geometry.bottom);}
      const [a,b]=boxes;
      assert.ok(a[0]+a[2]<=b[0]||b[0]+b[2]<=a[0]||a[1]+a[3]<=b[1]||b[1]+b[3]<=a[1],`${view}: labels overlap`);
      const px=geometry.sx(0),py=geometry.sy(0);
      for(const [x,y,w,h] of boxes)assert.ok(x+w<=px-8||x>=px+8||y+h<=py-8||y>=py+8,`${view}: label obscures a transition marker`);
      assert.ok(svg.lastIndexOf('<circle ')>svg.lastIndexOf('</text>'),'Markers remain above every label');
    }
  }
});

test('Transition table shows the actual speed limit and uses the graph equilibrium milestone',()=>{
  const base=trains.find(t=>t.id==='avelia-liberty');
  for(const train of [base,withRailGradient(base,9)]){
    const html=renderModelTransitions([train]),end=motionTransitions(train,'speed').at(-1);
    assert.equal((html.match(/<td>/g)||[]).length,6);
    assert.ok(html.includes(`<td>${formatNumber(train.model.effectiveMaxSpeedKmh,1)}</td>`));
    assert.ok(html.includes(`<td>${formatTime(end.time)}`));
    assert.ok(html.includes(`<td>${formatNumber(train.model.stateAt(end.time).distanceKm,2)}</td>`));
    if(train.model.asymptoticSpeed){
      assert.doesNotMatch(html,/99% equilibrium/,'The criterion belongs in the shared table help');
      assert.ok(train.model.effectiveMaxSpeedKmh<base.maxSpeedKmh);
    }else assert.doesNotMatch(html,/equilibrium/);
  }
});

test('A label near the bottom edge also avoids the other transition point',()=>{
  const train=trains.find(t=>t.id==='avelia-liberty'),points=motionTransitions(train,'speed');
  const xy=[[67.78,376.57],[145.2,373.64]];
  const geometry={view:'speed',sx:x=>xy[points.findIndex(p=>p.x===x)][0],sy:y=>xy[points.findIndex(p=>p.y===y)][1],left:65,right:302,top:45,bottom:380};
  const svg=renderMotionTransitions(train,geometry);
  const boxes=[...svg.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)].map(m=>m.slice(1).map(Number));
  for(const [x,y,w,h] of boxes)for(const [px,py] of xy)
    assert.ok(x+w<=px-8||x>=px+8||y+h<=py-8||y>=py+8,'A label obscures the other transition');
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
