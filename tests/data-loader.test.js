import test from 'node:test';
import assert from 'node:assert/strict';
import {createDataLoader} from '../src/data-loader.js';

test('Datasets are lazy, share in-flight requests and remain cached after success',async()=>{
  const requests=[];
  let resolve;
  const load=createDataLoader(url=>{requests.push(url.pathname);return new Promise(done=>{resolve=done;});},'https://example.test/lab/src/app.js');
  assert.equal(requests.length,0);
  const first=load('trains'), second=load('trains');
  assert.equal(first,second);
  await Promise.resolve();
  assert.deepEqual(requests,['/lab/data/trains.json']);
  const dataset={trains:[]};resolve({ok:true,json:async()=>dataset});
  assert.equal(await first,dataset);
  assert.equal(await load('trains'),dataset);
  assert.equal(requests.length,1);
});

test('HTTP, network and JSON failures can be retried without losing other datasets',async()=>{
  for(const failure of ['http','network','json']){
    const attempts=new Map();
    const load=createDataLoader(async url=>{
      const name=url.pathname.split('/').at(-1);
      const attempt=(attempts.get(name)??0)+1;attempts.set(name,attempt);
      if(name==='source-catalogue.json'&&attempt===1){
        if(failure==='network')throw new Error('offline');
        return {ok:failure!=='http',json:async()=>{throw new Error('invalid JSON');}};
      }
      return {ok:true,json:async()=>({name})};
    },'https://example.test/src/app.js');
    const trains=await load('trains');
    await assert.rejects(load('source-catalogue'));
    assert.deepEqual(await load('source-catalogue'),{name:'source-catalogue.json'});
    assert.equal(await load('trains'),trains);
    assert.equal(attempts.get('trains.json'),1);
    assert.equal(attempts.get('source-catalogue.json'),2);
  }
});
