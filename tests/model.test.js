import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
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
test('Valeurs de référence indépendantes issues de la conversation', () => {
  const expected = {metroliner: [117.5, 210.7], twindexx: [118.2, 208.2], tgv: [125, 196.9], fuxing: [120.1, 187]};
  for (const t of data.trains.filter(t => expected[t.id])) {
    const m = createModel(t, data.source);
    close(m.timeAt(5), expected[t.id][0], .12);
    close(m.timeAt(10), expected[t.id][1], .12);
  }
});
test('Chronos vidéo et comparaison à 5 km', () => {
  for (const t of data.trains) for (const m of t.measurements ?? []) assert.ok(m.videoSeconds > data.source.departureVideoSeconds);
  const tgv = createModel(data.trains.find(t => t.id === 'tgv'), data.source);
  const fuxing = createModel(data.trains.find(t => t.id === 'fuxing'), data.source);
  assert.ok(fuxing.timeAt(5) < tgv.timeAt(5));
});
