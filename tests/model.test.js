import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {canClimbRail} from '../src/gradient.js';
import {withRailGradient,withRailSpeedLimit} from '../src/rail-motion.js';
const data = JSON.parse(await readFile(new URL('../data/trains.json', import.meta.url)));
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
for (const train of data.trains) {
  const model = createModel(train, data.source);
  test(`${train.name}: départ, continuité, inversion et plafond`, () => {
    assert.deepEqual(model.stateAt(0), {speedKmh: 0, distanceKm: 0});
    for (const t of [0.1, 1, model.tractionEndSeconds, model.speedCapSeconds, 300, 600]) {
      const state = model.stateAt(t);
      close(model.timeAt(state.distanceKm), t);
      assert.ok(state.speedKmh <= train.maxSpeedKmh + 1e-8);
    }
    for (const t of [model.tractionEndSeconds, model.speedCapSeconds]) {
      close(model.stateAt(t - 1e-6).distanceKm, model.stateAt(t + 1e-6).distanceKm, 1e-6);
      close(model.stateAt(t - 1e-6).speedKmh, model.stateAt(t + 1e-6).speedKmh, 1e-4);
    }
    close(model.stateAt(600).speedKmh, train.maxSpeedKmh);
    assert.throws(() => model.stateAt(-1), RangeError);
    assert.throws(() => model.timeAt(NaN), RangeError);
  });
}
test('La branche traction seule atteint aussi une Vmax basse', () => {
  const m = createModel({...data.trains[0], maxSpeedKmh: 10}, data.source);
  close(m.tractionEndSeconds, m.speedCapSeconds);
  close(m.timeAt(m.stateAt(100).distanceKm), 100);
});
test('Measured rail increments reproduce eight rounded speeds and four absolute distances', async () => {
  const experiments=JSON.parse(await readFile(new URL('../data/experiments.json',import.meta.url)));
  const calibration=experiments.experiments.find(e=>e.id==='rail-acceleration');
  for(const record of calibration.measurements){
    const train=data.trains.find(t=>t.id===record.vehicleId),before=JSON.stringify(train),model=createModel(train,data.source);
    record.increments.forEach((steps,i)=>assert.equal(Math.round(model.stateAt(steps*.2).speedKmh),record.speedKmh[i]));
    for(const [steps,metres] of Object.entries(record.distanceMetres))close(model.stateAt(Number(steps)*.2).distanceKm*1000,metres,.18);
    assert.equal(JSON.stringify(train),before,'Effective traction never changes captured specifications');
  }
});
test('Chronos vidéo et comparaison à 5 km', () => {
  for (const t of data.trains) for (const m of t.measurements ?? []) assert.ok(m.videoSeconds > data.source.departureVideoSeconds);
  const tgv = createModel(data.trains.find(t => t.id === 'tgv'), data.source);
  const fuxing = createModel(data.trains.find(t => t.id === 'fuxing'), data.source);
  assert.ok(fuxing.timeAt(5) < tgv.timeAt(5));
});

test('Fractional increments invert distance and speed across traction, power and capped motion',()=>{
  for(const source of data.trains)for(const gradePercent of [-9,0,9])for(const limit of [100,160,350]){
    const raw={...source,maxSpeedKmh:Math.min(source.maxSpeedKmh,limit)};
    const model=createModel(raw,data.source,{gradePercent});if(!model.canStart)continue;
    for(const fraction of [.001,.137,.51,.999]){
      const time=model.speedCapSeconds*fraction,state=model.stateAt(time);
      close(model.timeAt(state.distanceKm),time,1e-7*Math.max(1,time));
      const inverse=model.motionAtSpeed(state.speedKmh);
      close(inverse.time,time,1e-7*Math.max(1,time));
      close(inverse.distance,state.distanceKm*1000,1e-7*Math.max(1,inverse.distance));
    }
    const tail=model.stateAt(model.speedCapSeconds+123.45);
    close(model.timeAt(tail.distanceKm),model.speedCapSeconds+123.45,1e-7);
  }
});

test('Flat friction can prevent starting or limit a heavy custom train below its nominal speed',()=>{
  const weak={...data.trains[0],massTonnes:100,tractionKgf:1};
  weak.model=createModel(weak,data.source);
  assert.equal(weak.model.canStart,false);assert.equal(canClimbRail(weak,0),false);
  assert.equal(weak.model.timeAt(0),0);assert.equal(weak.model.timeAt(1),Infinity);
  assert.deepEqual(weak.model.stateAt(100),{speedKmh:0,distanceKm:0});
  const slow={...data.trains[0],massTonnes:100,tractionKgf:20000,powerCh:1};
  slow.model=createModel(slow,data.source);
  const adapted=withRailGradient(slow,0);
  assert.equal(adapted.maxSpeedKmh,slow.model.effectiveMaxSpeedKmh);
  assert.ok(adapted.maxSpeedKmh<slow.maxSpeedKmh);
  close(adapted.model.stateAt(100).speedKmh,adapted.maxSpeedKmh);
  const limited=withRailGradient(withRailSpeedLimit(slow,100),0);
  close(limited.model.timeAt(1),adapted.model.timeAt(1));
  const restored=withRailGradient(withRailGradient(adapted,1),0);
  assert.equal(restored.model.gradePercent,0);
  close(restored.model.timeAt(1),adapted.model.timeAt(1));
});

test('Barely positive starting force skips constant increments without losing finite inversions',()=>{
  const massTonnes=100,tractionKgf=(.02+1e-10)*massTonnes*1000/(2*data.source.kgfNewtons);
  const raw={...data.trains[0],massTonnes,tractionKgf,maxSpeedKmh:1};
  const model=createModel(raw,data.source);
  assert.ok(model.canStart);assert.ok(model.speedCapSeconds>1e9);
  const state=model.stateAt(1000);
  close(model.timeAt(state.distanceKm),1000);
  assert.ok(Number.isFinite(model.speedCapKm));
});

test('Independent 5 km race checkpoint matches both rounded speeds', async () => {
  const experiments=JSON.parse(await readFile(new URL('../data/experiments.json',import.meta.url)));
  const point=experiments.experiments.find(e=>e.id==='rail-acceleration').raceCheckpoint;
  const a=createModel(data.trains.find(t=>t.id===point.referenceVehicleId),data.source);
  const b=createModel(data.trains.find(t=>t.id===point.otherVehicleId),data.source);
  const time=a.timeAt(point.referenceDistanceMetres/1000),stateA=a.stateAt(time),stateB=b.stateAt(time);
  assert.equal(Math.round(stateA.speedKmh),point.referenceSpeedKmh);
  assert.equal(Math.round(stateB.speedKmh),point.otherSpeedKmh);
  // Visual separation also includes the 0.47 m initial nose offset of unknown sign.
  // Only speeds are validated until the positional reference is confirmed.
});
