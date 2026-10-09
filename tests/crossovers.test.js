import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {crossoverStory} from '../src/crossovers.js';
const fake = (id,speed,offset) => ({id,maxSpeedKmh:speed,model:{speedCapKm:1,timeAt:x=>3600*x/speed+offset}});
test('Three leaders change at their actual distances; non-leading crossings do not add phases',()=>{
  const ts=[fake('a',100,0),fake('b',200,18),fake('c',400,45)];
  const story=crossoverStory(ts);
  assert.deepEqual(story.phases.map(p=>p.leaders),[['a'],['b'],['c']]);
  assert.equal(story.phases[0].end,1);assert.equal(story.phases[1].end,3);
  assert.equal(story.phases.at(-1).unbounded,true);
  for(const interval of story.intervals){const d=(interval.start+interval.end)/2;const expected=[...ts].sort((a,b)=>a.model.timeAt(d)-b.model.timeAt(d));expected.forEach((t,i)=>assert.equal(interval.ranks[t.id],i+1));}
});
test('The supplied Metroliner / Twindexx / Fuxing example has three leadership phases after acceleration calibration',async()=>{
  const data=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
  const ts=data.trains.filter(t=>['metroliner','twindexx','fuxing'].includes(t.id)).map(t=>({...t,model:createModel(t,data.source)}));
  const story=crossoverStory(ts);
  assert.deepEqual(story.phases.map(p=>p.leaders),[['metroliner'],['twindexx'],['fuxing']]);
  for(const phase of story.phases.slice(0,-1)){
    const before=[...ts].sort((a,b)=>a.model.timeAt(phase.end-1e-4)-b.model.timeAt(phase.end-1e-4))[0];
    assert.equal(before.id,phase.leaders[0]);
  }
  for(const distance of [10,100,10000])assert.equal([...ts].sort((a,b)=>a.model.timeAt(distance)-b.model.timeAt(distance))[0].id,'fuxing');
});
test('Empty, single and tied trains have meaningful phases without spurious leader changes',()=>{
  assert.deepEqual(crossoverStory([]).phases,[]);
  assert.deepEqual(crossoverStory([fake('one',100,0)]).phases[0].leaders,['one']);
  const tie=crossoverStory([fake('b',100,0),fake('a',100,0)]);
  assert.equal(tie.phases.length,1);assert.deepEqual(tie.phases[0].leaders,['a','b']);assert.deepEqual(tie.intervals[0].ranks,{a:1,b:1});
});

test('Leader curve domain ignores late crossings between losing trains',async()=>{
 const {leaderCurveWindow}=await import('../src/crossovers.js');
 const leader=fake('leader',1000,0),losers=[fake('slow',100,0),fake('fast',200,1800)];
 const story=crossoverStory([leader,...losers]);
 assert.ok(story.end>=100);
 assert.equal(leaderCurveWindow([leader,...losers],story).end,leaderCurveWindow([leader]).end);
 const leaders=[fake('a',100,0),fake('b',200,18),fake('c',400,45)];
 const window=leaderCurveWindow(leaders);
 assert.ok(Math.abs(window.end-3*1.15)<1e-10);
 assert.equal(window.phases.at(-1).end,window.end);
 assert.equal(window.phases.at(-1).unbounded,true);
 assert.deepEqual(leaderCurveWindow([]),{phases:[],end:1});
});

test('Ranking display omits crossings below 100 m and keeps the correct initial ranks',async()=>{
 const {rankWindow}=await import('../src/crossovers.js');
 const trains=[fake('a',100,0),fake('b',200,.9),fake('c',400,3.6)];
 const original=crossoverStory(trains), cropped=rankWindow(original);
 assert.ok(original.intervals.some(p=>p.start>0 && p.start<.1));
 assert.equal(cropped.intervals[0].start,.1);
 assert.equal(cropped.intervals[0].ranks.b,1);
 assert.ok(cropped.intervals.every(p=>p.start>=.1));
 assert.equal(original.intervals[0].start,0);
 assert.deepEqual(cropped.intervals.slice(1),original.intervals.filter(p=>p.start>.1));
 assert.deepEqual(rankWindow(crossoverStory([])).intervals,[]);
});
