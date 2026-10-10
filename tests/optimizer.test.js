import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OPTIMIZER_DEFAULTS,optimizerRequest,optimizerCandidates,optimizeService,evaluateOptimizerCandidate,compareOptimizerResults} from '../src/optimizer.js';
import {buildConsist} from '../src/consists.js';
import {analyseEconomicService} from '../src/rail-freight.js';
import {analyseRoadFleet} from '../src/trucks.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [t,l,p,f,b,r]=await Promise.all(['trains','rail-locomotives','rail-passenger-wagons','rail-freight-wagons','buses','trucks'].map(read));
const catalogue={units:t.source,trains:t.trains,locomotives:l.locomotives,passengerWagons:p.wagons,freightWagons:f.wagons,buses:b.buses,trucks:r.trucks};
const routeProfile=[{distanceKm:2,gradePercent:0,speedLimitKmh:80}];
const small={...catalogue,trains:catalogue.trains.slice(0,2),locomotives:catalogue.locomotives.slice(0,2),passengerWagons:catalogue.passengerWagons.slice(0,2),freightWagons:catalogue.freightWagons.slice(0,5),buses:catalogue.buses.slice(0,3),trucks:catalogue.trucks.slice(0,3)};
const run=(data,input,options)=>{const generator=optimizeService(data,{routeProfile,maxWagons:4,maxUnits:3,...input},options);let next;do{next=generator.next();}while(!next.done);return next.value;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('bounded search finds the cheapest feasible whole-fleet service in each domain',()=>{
  const input={routeProfile,rate:250,maxHeadwaySeconds:120,fillRatio:.7,maxWagons:4,maxUnits:3};
  const request=optimizerRequest(input),answer=run(small,input,{limit:1000});
  const exhaustive={rail:[],road:[]};
  for(const candidate of optimizerCandidates(small,request)){
    const evaluated=evaluateOptimizerCandidate(candidate,small,request);if(evaluated.result)exhaustive[candidate.domain].push(evaluated.result);
  }
  for(const domain of ['rail','road']){
    exhaustive[domain].sort(compareOptimizerResults);assert.deepEqual(answer.best[domain],exhaustive[domain]);assert.ok(answer.best[domain].length>1);
    for(const proposal of answer.best[domain]){
      assert.ok(Number.isInteger(proposal.fleet));assert.ok(proposal.rate>=250-1e-7);assert.ok(proposal.frequency<=120+1e-7);assert.ok(proposal.utilization<=.7+1e-7);
    }
  }
  assert.equal(answer.stats.tested,answer.stats.feasible.rail+answer.stats.feasible.road);
  assert.equal(run(small,input).best.rail.length,3);
});

test('search enumerates multi-engine trains and identical whole trainsets within length bounds',()=>{
  const request=optimizerRequest({routeProfile,maxWagons:4,maxUnits:3,maxTrainLength:100});
  const candidates=[...optimizerCandidates({...small,trains:catalogue.trains.filter(t=>t.id==='draisine')},request)].filter(c=>c.domain==='rail');
  assert.ok(candidates.some(c=>c.definition.components[0].quantity===2&&c.definition.components.length===2));
  assert.ok(candidates.some(c=>c.definition.components.length===1&&c.definition.components[0].quantity===3));
  for(const candidate of candidates){const train=buildConsist(candidate.definition,candidate.catalogue,small.units);assert.ok(train.lengthMetres<=100+1e-8);}
});

test('recommendations reproduce the existing service calculators, including facilities and directional Rate',()=>{
  for(const category of ['passengers','freight']){
    const answer=run(small,{category,rate:500,maxHeadwaySeconds:100,fillRatio:.8,loadedReturn:true,stopA:{specializedTerminal:true},stopB:{specializedWarehouse:true}});
    const request=answer.request;
    for(const domain of ['rail','road'])for(const result of answer.best[domain]){
      let service;
      const common={...request,frequencyMode:'maximum',motion:true};
      if(domain==='rail'){
        const candidate=[...optimizerCandidates(small,request)].find(c=>c.definition?.id===result.id),vehicle=buildConsist(candidate.definition,candidate.catalogue,small.units);
        service=analyseEconomicService(vehicle,{...common,freight:category==='freight',allowMultipleUnits:false,platformLengthMetres:request.maxTrainLength,...(category==='freight'?{demandPerYear:500}:{demandPerDirection:500})});
      }else{
        const vehicle=(category==='freight'?small.trucks:small.buses).find(v=>v.id===result.id);
        service=analyseRoadFleet([vehicle],{...common,passenger:category==='passengers',demandPerYear:category==='passengers'?1000:500})[0];
      }
      close(result.cost,service.fleetMaintenance);close(result.frequency,service.headwaySeconds);close(result.cycle,service.roundTripSeconds);close(result.rate,500);
    }
  }
});

test('category, cargo specialization and year consistently filter both domains',()=>{
  for(const cargo of ['all','bulk','goods','flatbed','liquid']){
    const request=optimizerRequest({routeProfile,category:'freight',cargo,year:2000,maxWagons:1,maxUnits:1});
    for(const c of optimizerCandidates(catalogue,request)){
      const carrying=c.domain==='rail'?c.catalogue.find(v=>v.id===c.definition.components.at(-1).componentId):c.vehicle;
      assert.ok(carrying.year<=2000);assert.ok(carrying.cargoCapacity>0);
      assert.ok(carrying.freightSpecialization==='general'||carrying.freightSpecialization===cargo&&cargo!=='all');
    }
  }
  assert.equal(run(small,{year:1850}).stats.tested,0);
});

test('infeasible route and fleet bounds produce explicit empty results',()=>{
  const answer=run(small,{rate:1e9,maxFleet:1});
  assert.deepEqual(answer.best,{rail:[],road:[]});assert.ok(answer.stats.rejected.fleet>0);
  const impossible={...small,trains:[],locomotives:small.locomotives.slice(0,1).map(v=>({...v,tractionKgf:1})),buses:small.buses.slice(0,1).map(v=>({...v,tractionKgf:1}))};
  const slope=run(impossible,{routeProfile:[{distanceKm:2,gradePercent:20,speedLimitKmh:80}],maxWagons:4});
  assert.ok(slope.stats.rejected.route>0);
});

test('request validation rejects malformed bounds and leaves catalogue and defaults unchanged',()=>{
  const before=JSON.stringify(small),defaults=JSON.stringify(OPTIMIZER_DEFAULTS);
  for(const input of [{rate:0},{year:2000.5},{maxUnits:21},{maxLocomotives:0},{fillRatio:1.1},{maxHeadwaySeconds:0},{category:'unknown'},{cargo:'mixed'},{stopA:{specializedTerminal:'yes'}}])assert.throws(()=>optimizerRequest({routeProfile,...input}));
  run(small,{category:'freight'});assert.equal(JSON.stringify(small),before);assert.equal(JSON.stringify(OPTIMIZER_DEFAULTS),defaults);
  assert.throws(()=>run(small,{}, {limit:0}));
});

test('worker exposes the progress/completion contract and reports validation failures',async()=>{
  const {Worker}=await import('node:worker_threads');
  const workerUrl=new URL('../src/optimizer-worker.js',import.meta.url).href;
  const bootstrap=`import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:message=>parentPort.postMessage(message)};await import(${JSON.stringify(workerUrl)});parentPort.on('message',data=>self.onmessage({data}));`;
  const execute=payload=>new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`));const progress=[];
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('Worker timed out'));},5000);
    worker.on('error',error=>{clearTimeout(timer);worker.terminate();reject(error);});
    worker.on('message',message=>{if(message.type==='progress')progress.push(message);else{clearTimeout(timer);worker.terminate();resolve({message,progress});}});
    worker.postMessage(payload);
  });
  const {message,progress}=await execute({catalogue:small,request:{routeProfile,maxWagons:2,maxUnits:1}});
  assert.equal(message.type,'complete');assert.ok(message.result.best.rail.length>0);assert.ok(progress.length>0);assert.ok(progress.every(p=>Number.isInteger(p.tested)&&Number.isInteger(p.feasible)));
  const invalid=await execute({catalogue:small,request:{routeProfile,rate:-1}});assert.equal(invalid.message.type,'error');assert.match(invalid.message.message,/rate/);
});
