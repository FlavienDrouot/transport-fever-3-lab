import test from 'node:test';
import assert from 'node:assert/strict';
import {rankingStory} from '../src/economic-crossovers.js';
test('Economic ranking keeps loser crossovers separately from leadership changes',()=>{
  const scores={a:x=>10-x,b:x=>6,c:x=>x};
  const story=rankingStory(['a','b','c'],(id,x)=>scores[id](x),.1,8);
  assert.equal(story.roots.length,3);
  for(const [i,expected] of [4,5,6].entries()) assert.ok(Math.abs(story.roots[i]-expected)<1e-7);
  assert.deepEqual(story.phases.map(p=>p.leaders),[['a'],['b'],['c']]);
  assert.equal(story.intervals.length,4);
});
test('A route bounds the economic story without implying persistence to infinity',()=>{
  const story=rankingStory(['a','b'],(id,x)=>id==='a'?1:x,.1,.5);
  assert.equal(story.roots.length,0);
  assert.equal(story.phases.length,1);
  assert.equal(story.end,.5);
});
test('Ties, exact sample roots, zero occupancy and empty selections remain meaningful',()=>{
  assert.equal(rankingStory(['a','b'],()=>1,.1,10).roots.length,0);
  assert.deepEqual(rankingStory(['a','b'],()=>1,.1,10).phases[0].leaders,['a','b']);
  assert.equal(rankingStory(['a','b'],(id,x)=>id==='a'?1.1:x,.1,2.1).roots.length,1);
  assert.equal(rankingStory(['a'],()=>0,.1,1,false).phases.length,0);
  assert.equal(rankingStory([],()=>1,.1,1).phases.length,0);
});
