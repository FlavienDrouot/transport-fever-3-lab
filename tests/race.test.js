import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {raceHorizon} from '../src/race.js';
const data = JSON.parse(await readFile(new URL('../data/trains.json', import.meta.url)));
const trains = data.trains.filter(t => ['metroliner', 'twindexx', 'tgv', 'fuxing'].includes(t.id)).map(t => ({...t, model: createModel(t, data.source)}));
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

test('Suggested distance covers the last crossing of the current catalogue', async () => {
 const {rankingSettlesAt, suggestedDistanceLimit} = await import('../src/race.js');
 const stable = rankingSettlesAt(trains);
 assert.ok(Math.abs(stable - 7.4324513528586795) < 1e-7);
 assert.equal(suggestedDistanceLimit(trains), 10);
 assert.equal(suggestedDistanceLimit([]), 5);
 const expected = ['fuxing','tgv','twindexx','metroliner'];
 for (const distance of [stable + .001, 10, 30, 1000]) {
  assert.deepEqual([...trains].sort((a,b)=>a.model.timeAt(distance)-b.model.timeAt(distance)).map(t=>t.id), expected);
 }
});
test('Late steady-speed crossings are included and the slider is capped at 30 km', async () => {
 const {rankingSettlesAt, suggestedDistanceLimit} = await import('../src/race.js');
 const fake = (id, speed, offset) => ({id, maxSpeedKmh:speed, model:{speedCapKm:1,timeAt:x=>3600*x/speed+offset}});
 const late = [fake('slow',100,0),fake('fast',200,1800)];
 assert.equal(rankingSettlesAt(late),100);
 assert.equal(suggestedDistanceLimit(late),30);
 assert.equal(rankingSettlesAt([fake('one',100,0),fake('two',100,5)]),0);
});

test('Speed view covers every acceleration with only a 5% margin and responds to selection', async () => {
 const {speedHorizon} = await import('../src/race.js');
 const all = data.trains.map(t=>({...t,model:createModel(t,data.source)}));
 const horizon = speedHorizon(all);
 const latest = all.reduce((a,b)=>a.model.speedCapSeconds>b.model.speedCapSeconds?a:b);
 assert.equal(horizon, latest.model.speedCapSeconds*1.05);
 for (const t of all) assert.ok(Math.abs(t.model.stateAt(horizon).speedKmh-t.maxSpeedKmh)<1e-8);
 assert.ok(speedHorizon(all.filter(t=>t.id!==latest.id))<horizon);
 assert.equal(speedHorizon([latest]),horizon);
 assert.equal(speedHorizon([]),1);
});
