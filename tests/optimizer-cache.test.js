import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultOptimizerRequest,isDefaultOptimizerRequest,optimizerCacheKey,loadDefaultOptimizerResult} from '../src/optimizer-cache.js';

const catalogue={trains:[{id:'example',economy:{annualMaintenance:30000}}],units:{kgfNewtons:9.81}};
const request=defaultOptimizerRequest();
const asset=`optimizer-default-${'a'.repeat(64)}.json`;
const answer={request,stats:{tested:1},best:{rail:[],road:[]}};
const response=value=>({ok:true,json:async()=>value});

test('Default cache identity normalizes property order but retains every search bound and catalogue value',async()=>{
  assert.equal(isDefaultOptimizerRequest({...request,rate:1001}),false);
  assert.equal(isDefaultOptimizerRequest({...request,ignoreRetirements:false}),false);
  assert.equal(isDefaultOptimizerRequest({...request,routeProfile:[{...request.routeProfile[0],gradePercent:.1}]}),false);
  const reversed=Object.fromEntries(Object.entries(request).reverse());
  assert.equal(isDefaultOptimizerRequest(reversed),true);
  const key=await optimizerCacheKey(request,catalogue);
  assert.equal(await optimizerCacheKey(reversed,{units:catalogue.units,trains:catalogue.trains}),key);
  assert.notEqual(await optimizerCacheKey(request,{...catalogue,trains:[{id:'example',economy:{annualMaintenance:60000}}]}),key);
});

test('Default result revalidates the small manifest and reuses its immutable result asset',async()=>{
  const calls=[],key=await optimizerCacheKey(request,catalogue);
  const result=await loadDefaultOptimizerResult(request,catalogue,{fetch:async(url,options)=>{
    calls.push({path:url.pathname,cache:options.cache});
    return response(calls.length===1?{version:1,key,asset}:answer);
  }});
  assert.equal(result,answer);
  assert.deepEqual(calls.map(call=>call.cache),['no-cache','force-cache']);
  assert.ok(calls[1].path.endsWith(`/data/${asset}`));
});

test('Nondefault requests never fetch; missing, obsolete, incompatible and broken caches fall back',async()=>{
  let calls=0;
  const unexpected=async()=>{calls++;throw Error('Unexpected fetch');};
  assert.equal(await loadDefaultOptimizerResult({...request,domain:'road'},catalogue,{fetch:unexpected}),null);
  assert.equal(calls,0);
  const key=await optimizerCacheKey(request,catalogue);
  for(const manifest of [{version:2,key,asset},{version:1,key:'outdated',asset},{version:1,key,asset:'https://example.com/cache.json'}]){
    calls=0;
    assert.equal(await loadDefaultOptimizerResult(request,catalogue,{fetch:async()=>{calls++;return response(manifest);}}),null);
    assert.equal(calls,1);
  }
  assert.equal(await loadDefaultOptimizerResult(request,catalogue,{fetch:async()=>({ok:false})}),null);
  assert.equal(await loadDefaultOptimizerResult(request,catalogue,{fetch:async()=>{throw Error('Offline');}}),null);
  for(const badAnswer of [{}, {...answer,request:{...request,rate:2000}}]){
    calls=0;
    assert.equal(await loadDefaultOptimizerResult(request,catalogue,{fetch:async()=>response(++calls===1?{version:1,key,asset}:badAnswer)}),null);
  }
});
