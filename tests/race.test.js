import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {raceHorizon} from '../src/race.js';
const data = JSON.parse(await readFile(new URL('../data/trains.json', import.meta.url)));
const trains = data.trains.map(t => ({...t, model: createModel(t, data.source)}));
test('Time horizon ends exactly when the last selected train reaches the chosen distance', () => {
 for (const distance of [.5, 5, 20, 100]) {
  const {seconds, lastTrain} = raceHorizon(trains, distance);
  assert.ok(Math.abs(lastTrain.model.stateAt(seconds).distanceKm - distance) < 1e-8);
  for (const t of trains) assert.ok(t.model.stateAt(seconds).distanceKm >= distance - 1e-8);
  assert.ok(lastTrain.model.stateAt(seconds - .01).distanceKm < distance);
 }
});
test('The limiting train depends on distance and selection, not catalogue order', () => {
 assert.equal(raceHorizon(trains, 5).lastTrain.id, 'tgv');
 assert.equal(raceHorizon(trains, 20).lastTrain.id, 'metroliner');
 const remaining = trains.filter(t => t.id !== 'metroliner');
 assert.ok(raceHorizon(remaining, 20).seconds < raceHorizon(trains, 20).seconds);
 assert.equal(raceHorizon([...trains].reverse(), 20).seconds, raceHorizon(trains, 20).seconds);
 const one = [trains.find(t => t.id === 'fuxing')];
 assert.equal(raceHorizon(one, 20).seconds, one[0].model.timeAt(20));
});
test('An empty selection has no limiting train; invalid distances are refused', () => {
 assert.deepEqual(raceHorizon([], 20), {seconds: 0, lastTrain: undefined});
 for (const d of [0, -1, Infinity, NaN]) assert.throws(() => raceHorizon(trains, d), RangeError);
});
