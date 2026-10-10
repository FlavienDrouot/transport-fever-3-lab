import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OPTIMIZER_DEFAULTS,optimizerRequest,optimizerCandidates,optimizeService,evaluateOptimizerCandidate,compareOptimizerResults} from '../src/optimizer.js';
import {buildConsist} from '../src/consists.js';
import {analyseEconomicService} from '../src/rail-freight.js';
import {analyseRoadFleet,analysePassengerRoadService} from '../src/trucks.js';
import {loadOptimizerCatalogue} from '../src/optimizer-catalogue.js';
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
  for(const input of [{rate:0},{year:2000.5},{maxUnits:21},{maxLocomotives:0},{fillRatio:1.1},{maxHeadwaySeconds:0},{minHeadwaySeconds:-1},{minHeadwaySeconds:Infinity},{minHeadwaySeconds:301},{domain:'water'},{ignoreRetirements:'yes'},{category:'unknown'},{cargo:'mixed'},{stopA:{specializedTerminal:'yes'}}])assert.throws(()=>optimizerRequest({routeProfile,...input}));
  run(small,{category:'freight'});assert.equal(JSON.stringify(small),before);assert.equal(JSON.stringify(OPTIMIZER_DEFAULTS),defaults);
  assert.throws(()=>run(small,{}, {limit:0}));
});

test('selected domains alone are enumerated and evaluated, with no access to the other catalogue',()=>{
  const road={units:catalogue.units,buses:small.buses,trucks:small.trucks};
  const rail={units:catalogue.units,trains:small.trains,locomotives:small.locomotives,passengerWagons:small.passengerWagons,freightWagons:small.freightWagons};
  Object.defineProperty(road,'locomotives',{get(){throw Error('Rail accessed');}});
  Object.defineProperty(rail,'trucks',{get(){throw Error('Road accessed');}});
  for(const [domain,data,other] of [['road',road,'rail'],['rail',rail,'road']]){
    const answer=run(data,{domain});assert.ok(answer.best[domain].length>0);assert.deepEqual(answer.best[other],[]);assert.equal(answer.stats.feasible[other],0);
    assert.equal(answer.stats.tested,answer.stats.feasible[domain]);
  }
});

test('catalogue loading requests only the selected domain/category and optionally the retirement index',async()=>{
  for(const domain of ['rail','road','both'])for(const category of ['passengers','freight'])for(const ignoreRetirements of [false,true]){
    const names=[],input={domain,category,ignoreRetirements};
    const data=await loadOptimizerCatalogue(async name=>{names.push(name);return read(name);},input,t);
    const expected=[...domain!=='road'?['rail-locomotives',category==='freight'?'rail-freight-wagons':'rail-passenger-wagons']:[],
      ...domain!=='rail'?[category==='freight'?'trucks':'buses']:[],...ignoreRetirements?[]:['vehicle-availability']];
    assert.deepEqual(names.sort(),expected.sort());
    assert.equal(data.trains.length,domain==='road'?0:t.trains.length);
    if(!ignoreRetirements&&domain!=='rail'&&category==='freight')assert.equal(data.trucks.find(v=>v.id==='man-19304').yearTo,2010);
    if(!ignoreRetirements&&domain!=='road')assert.equal(data.trains.find(v=>v.id==='metroliner').yearTo,2010);
  }
});

test('source retirements restrict both domains; ignoring them still respects introduction',async()=>{
  const data=await loadOptimizerCatalogue(read,{domain:'both',category:'passengers',ignoreRetirements:false},t);
  const contains=(input,id)=>[...optimizerCandidates(data,optimizerRequest({routeProfile,maxWagons:1,maxUnits:1,...input}))].some(c=>c.domain==='road'?c.vehicle.id===id:c.definition.components.some(p=>p.componentId.endsWith(`:${id}`)));
  assert.equal(contains({year:2009},'metroliner'),true);assert.equal(contains({year:2010},'metroliner'),false);
  assert.equal(contains({year:1914},'droschky'),true);assert.equal(contains({year:1915},'droschky'),false);
  assert.equal(contains({year:2035,ignoreRetirements:true},'droschky'),true);assert.equal(contains({year:1891,ignoreRetirements:true},'droschky'),false);
  for(const c of optimizerCandidates(data,optimizerRequest({routeProfile,year:2000,maxWagons:1,maxUnits:1}))){
    const parts=c.domain==='road'?[c.vehicle]:c.definition.components.map(p=>c.catalogue.find(v=>v.id===p.componentId));
    assert.ok(parts.every(v=>v.yearTo===0||v.yearTo===null||v.yearTo>2000));
  }
  for(const yearTo of [0,null,undefined])assert.ok(run({...small,buses:small.buses.map(v=>({...v,yearTo}))},{domain:'road'}).best.road.length>0);
});

test('minimum intervals filter whole-fleet services, including an equal-bound and a minimum-only search',()=>{
  for(const domain of ['rail','road']){
    const input={domain,rate:250,fillRatio:.7,maxHeadwaySeconds:300};
    const baseline=run(small,input,{limit:1000}).best[domain];assert.ok(baseline.length>1);
    const intervals=baseline.map(r=>r.frequency).sort((a,b)=>a-b),minimum=(intervals[0]+intervals.at(-1))/2;
    const answer=run(small,{...input,minHeadwaySeconds:minimum},{limit:1000});
    assert.deepEqual(answer.best[domain],baseline.filter(r=>r.frequency>=minimum-1e-7));
    assert.ok(answer.best[domain].length>0&&answer.best[domain].length<baseline.length);
    const boundary=baseline[0].frequency;
    assert.ok(run(small,{...input,minHeadwaySeconds:boundary,maxHeadwaySeconds:boundary},{limit:1000}).best[domain].some(r=>r.id===baseline[0].id));
    const uncapped=run(small,{...input,maxHeadwaySeconds:null},{limit:1000}).best[domain];
    const onlyMinimum=run(small,{...input,minHeadwaySeconds:minimum,maxHeadwaySeconds:null},{limit:1000});
    assert.deepEqual(onlyMinimum.best[domain],uncapped.filter(r=>r.frequency>=minimum-1e-7));
    assert.deepEqual(run(small,{...input,minHeadwaySeconds:1e6,maxHeadwaySeconds:null}).best[domain],[]);
  }
});

test('two-sided intervals agree with an exhaustive integer fleet check with Rate-dependent transfers',()=>{
  const vehicle=small.buses[0],data={buses:[vehicle],trucks:[]},fillRatio=.7;
  const full=analysePassengerRoadService([vehicle],{distanceKm:2,routeProfile,fillRatio,motion:true})[0];
  const fixed=full.roundTripSeconds-full.loadingSeconds-full.unloadingSeconds;
  for(const rate of [10,100,500,1000])for(const minimum of [null,30,180,300])for(const maximum of [null,300,600]){
    if(minimum!==null&&maximum!==null&&minimum>maximum)continue;
    const flow=2*rate/1460,transfer=flow*(full.loadingSeconds+full.unloadingSeconds)/full.deliveredPerCycle;
    const feasible=[];
    for(let count=1;count<=20;count++){
      const interval=fixed/(count-transfer),load=flow*interval/full.deliveredPerCycle;
      if(interval>0&&load<=1+1e-9&&(minimum===null||interval>=minimum-1e-7)&&(maximum===null||interval<=maximum+1e-7))feasible.push(count);
    }
    const answer=run(data,{domain:'road',rate,fillRatio,minHeadwaySeconds:minimum,maxHeadwaySeconds:maximum,maxFleet:20});
    assert.equal(answer.best.road.length,feasible.length?1:0);
    if(feasible.length)assert.equal(answer.best.road[0].fleet,feasible[0]);
  }
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
