import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {OPTIMIZER_DEFAULTS,optimizerRequest,optimizerCandidates,optimizeService,evaluateOptimizerCandidate,compareOptimizerResults} from '../src/optimizer.js';
import {buildConsist} from '../src/consists.js';
import {analyseEconomicService} from '../src/rail-freight.js';
import {analyseRoadFleet,analysePassengerRoadService} from '../src/trucks.js';
import {loadOptimizerCatalogue} from '../src/optimizer-catalogue.js';
import {renderOptimizerProposals,renderSelectedOptimizerProposal,optimizerProposalAt} from '../src/optimizer-proposals.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [t,l,p,f,b,r]=await Promise.all(['trains','rail-locomotives','rail-passenger-wagons','rail-freight-wagons','buses','trucks'].map(read));
const catalogue={units:t.source,trains:t.trains,locomotives:l.locomotives,passengerWagons:p.wagons,freightWagons:f.wagons,buses:b.buses,trucks:r.trucks};
const routeProfile=[{distanceKm:2,gradePercent:0,speedLimitKmh:80}];
const small={...catalogue,trains:catalogue.trains.slice(0,2),locomotives:catalogue.locomotives.slice(0,2),passengerWagons:catalogue.passengerWagons.slice(0,2),freightWagons:catalogue.freightWagons.slice(0,5),buses:catalogue.buses.slice(0,3),trucks:catalogue.trucks.slice(0,3)};
const run=(data,input,options)=>{const generator=optimizeService(data,{routeProfile,maxWagons:4,minHeadwaySeconds:null,maxHeadwaySeconds:300,...input},options);let next;do{next=generator.next();}while(!next.done);return next.value;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('bounded search finds the cheapest feasible whole-fleet service in each domain',()=>{
  const input={routeProfile,rate:250,minHeadwaySeconds:null,maxHeadwaySeconds:120,fillRatio:.7,maxWagons:4};
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
  const request=optimizerRequest({routeProfile,maxWagons:4,maxTrainLength:100});
  const candidates=[...optimizerCandidates({...small,trains:catalogue.trains.filter(t=>t.id==='draisine')},request)].filter(c=>c.domain==='rail');
  assert.ok(candidates.some(c=>c.definition.components[0].quantity===2&&c.definition.components.length===2));
  assert.ok(candidates.some(c=>c.definition.components.length===1&&c.definition.components[0].quantity===3));
  for(const candidate of candidates){const train=buildConsist(candidate.definition,candidate.catalogue,small.units);assert.ok(train.lengthMetres<=100+1e-8);}
});

test('Rail groups retain the cheapest variants for every feasible powered and wagon model',()=>{
  const input={domain:'rail',rate:250,maxTrainLength:200,maxWagons:4,minHeadwaySeconds:null,maxHeadwaySeconds:120};
  const answer=run(small,input),expected=new Map();
  for(const candidate of optimizerCandidates(small,answer.request)){
    const {result}=evaluateOptimizerCandidate(candidate,small,answer.request);if(!result)continue;
    const key=`${result.poweredModel.id}|${result.wagonModel?.id??'trainsets'}`;
    const variants=expected.get(key)??[];variants.push(result);expected.set(key,variants);
  }
  let retained=0,buckets=0;
  for(const [g,group] of answer.groups.rail.entries()){
    if(g)assert.ok(compareOptimizerResults(answer.groups.rail[g-1].wagons[0].variants[0],group.wagons[0].variants[0])<=0);
    for(const [w,wagon] of group.wagons.entries()){
      buckets++;
      const variants=expected.get(`${group.id}|${wagon.id}`).sort(compareOptimizerResults).slice(0,3);
      assert.deepEqual(wagon.variants,variants);
      if(w)assert.ok(compareOptimizerResults(group.wagons[w-1].variants[0],wagon.variants[0])<=0);
      for(const [i,proposal] of wagon.variants.entries()){
        assert.strictEqual(optimizerProposalAt(answer,{domain:'rail',group:String(g),wagon:String(w),result:String(i)}),proposal);
        retained++;
      }
    }
  }
  assert.equal(buckets,expected.size);
  assert.ok(retained>answer.best.rail.length);
  for(const engine of small.locomotives)assert.ok(answer.groups.rail.some(g=>g.id===`rail:locomotive:${engine.id}`));
  for(const group of answer.groups.rail.filter(g=>g.role==='locomotive'))assert.equal(group.wagons.length,small.passengerWagons.length);
  const html=renderOptimizerProposals(answer,'rail');
  assert.equal((html.match(/<article /g)??[]).length,1);
  assert.equal((html.match(/<table /g)??[]).length,1);
  assert.equal((html.match(/class="optimizer-powered-row"/g)??[]).length,answer.groups.rail.length);
  assert.ok(html.includes('data-group="1"'));
  const altered=structuredClone(answer);altered.groups.rail[0].name='<img src=x onerror=alert(1)>';
  assert.ok(!renderOptimizerProposals(altered,'rail').includes('<img'));
});

test('the selected Rail configuration defaults to the cheapest and can display another wagon variant',()=>{
  const answer=run(small,{domain:'rail',maxTrainLength:200,rate:250});
  const initial=renderSelectedOptimizerProposal(answer);
  assert.ok(initial.includes(answer.best.rail[0].name));
  assert.ok(initial.includes('Selected configuration'));
  const selection={domain:'rail',group:'1',wagon:'1',result:'2'},selected=optimizerProposalAt(answer,selection);
  assert.ok(selected);
  const changed=renderSelectedOptimizerProposal(answer,selection);
  assert.ok(changed.includes(selected.parts.map(p=>`${p.quantity} × ${p.name}`).join(' + ')));
  assert.ok(changed.includes('data-result="2" data-group="1" data-wagon="1"'));
});

test('locomotive count limits do not constrain trainsets, including formations with wagons',()=>{
  const unit=catalogue.trains.find(t=>t.id==='draisine');
  const data={...small,trains:[unit]};
  const candidates=maxLocomotives=>[...optimizerCandidates(data,optimizerRequest({routeProfile,domain:'rail',identicalMUsOnly:false,maxTrainLength:100,maxWagons:2,maxLocomotives}))];
  const low=candidates(1),high=candidates(3),units=list=>list.filter(c=>c.definition.components[0].componentId.includes(':multiple-unit:'));
  assert.deepEqual(units(low).map(c=>c.definition),units(high).map(c=>c.definition));
  assert.ok(units(low).some(c=>c.definition.components[0].quantity>3));
  assert.ok(units(low).some(c=>c.definition.components.length===2));
  assert.ok(low.filter(c=>!units(low).includes(c)).every(c=>c.definition.components[0].quantity===1));
  assert.ok(high.some(c=>c.definition.components.length===2&&c.definition.components[0].quantity===3));
});

test('MU/wagon variants respect terminal length and preserve the exhaustive best for every wagon model',()=>{
  const unit=catalogue.trains.find(t=>t.id==='draisine'),data={...small,trains:[unit],locomotives:[]};
  const terminal={mode:'reuse',existingLength:80,platformTrackCount:2,platformCount:1};
  const request=optimizerRequest({routeProfile,domain:'rail',identicalMUsOnly:false,rate:500,maxTrainLength:200,maxWagons:4,maxLocomotives:1,maxHeadwaySeconds:120,fillRatio:.7,infrastructure:{rail:{stopA:terminal,stopB:terminal}}});
  const candidates=[...optimizerCandidates(data,request)],pairs=candidates.filter(c=>c.definition.components.length===2);
  assert.ok(pairs.some(c=>c.definition.components[0].quantity>1));
  assert.ok(pairs.every(c=>buildConsist(c.definition,c.catalogue,data.units).lengthMetres<=80+1e-9));
  const exhaustive=candidates.map(c=>evaluateOptimizerCandidate(c,data,request).result).filter(Boolean).sort(compareOptimizerResults);
  const answer=run(data,request);
  assert.deepEqual(answer.best.rail,exhaustive.slice(0,3));
  const group=answer.groups.rail.find(g=>g.id.endsWith(':draisine'));assert.ok(group);
  assert.ok(group.wagons.some(w=>w.id!=='trainsets'));
  for(const wagon of group.wagons)assert.deepEqual(wagon.variants,exhaustive.filter(r=>(r.wagonModel?.id??'trainsets')===wagon.id).slice(0,3));
  const candidate=pairs[0],formation=buildConsist(candidate.definition,candidate.catalogue,data.units);
  const expected=candidate.definition.components.reduce((total,p)=>total+p.quantity*candidate.catalogue.find(v=>v.id===p.componentId).loadingUnloadingSpeedMultiplier,0);
  assert.equal(formation.formationLoadingUnloadingSpeedMultiplier,expected);
  assert.ok(renderOptimizerProposals(answer,'rail').includes('optimizer-wagon-row'));
});

test('trainset quantities are limited only by length, including quantities beyond the old caps',()=>{
  const unit=catalogue.trains.find(t=>t.id==='draisine');
  const data={...small,trains:[unit],locomotives:[],passengerWagons:[],freightWagons:[]};
  for(const length of [1,unit.lengthMetres-.000001,unit.lengthMetres,2*unit.lengthMetres,99.99,100,840]){
    const request=optimizerRequest({routeProfile,domain:'rail',maxTrainLength:length});
    const candidates=[...optimizerCandidates(data,request)],maximum=Math.floor((length+1e-9)/unit.lengthMetres);
    assert.deepEqual(candidates.map(c=>c.definition.components[0].quantity),Array.from({length:maximum},(_,i)=>i+1));
    for(const candidate of candidates)assert.ok(buildConsist(candidate.definition,candidate.catalogue,data.units).lengthMetres<=length+1e-9);
  }
  const answer=run(data,{domain:'rail',maxTrainLength:100,rate:250},{limit:1000});
  assert.equal(answer.stats.tested,26);
  assert.ok(answer.best.rail.some(r=>r.definition.components[0].quantity===26));
  const oversized=run(data,{domain:'rail',maxTrainLength:unit.lengthMetres-.000001});
  assert.equal(oversized.stats.tested,0);assert.deepEqual(oversized.best.rail,[]);
});

test('invalid trainset lengths fail before quantity enumeration can become unbounded',()=>{
  for(const lengthMetres of [undefined,0,-1,NaN,Infinity]){
    const data={...small,trains:[{...small.trains[0],lengthMetres}]};
    assert.throws(()=>[...optimizerCandidates(data,optimizerRequest({routeProfile,domain:'rail'}))],/Invalid trainset length/);
  }
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
    const request=optimizerRequest({routeProfile,category:'freight',cargo,year:2000,maxWagons:1});
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
  for(const input of [{rate:0},{year:2000.5},{maxLocomotives:0},{fillRatio:1.1},{maxHeadwaySeconds:0},{minHeadwaySeconds:-1},{minHeadwaySeconds:Infinity},{minHeadwaySeconds:301,maxHeadwaySeconds:300},{domain:'water'},{ignoreRetirements:'yes'},{category:'unknown'},{cargo:'mixed'},{stopA:{specializedTerminal:'yes'}}])assert.throws(()=>optimizerRequest({routeProfile,...input}));
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
      ...domain!=='rail'?[category==='freight'?'trucks':'buses']:[],...domain!=='road'?['trams']:[],...ignoreRetirements?[]:['vehicle-availability']];
    assert.deepEqual(names.sort(),expected.sort());
    assert.equal(data.trains.length,domain==='road'?0:t.trains.length);
    if(!ignoreRetirements&&domain!=='rail'&&category==='freight')assert.equal(data.trucks.find(v=>v.id==='man-19304').yearTo,2010);
    if(!ignoreRetirements&&domain!=='road')assert.equal(data.trains.find(v=>v.id==='metroliner').yearTo,2010);
  }
});

test('source retirements restrict both domains; ignoring them still respects introduction',async()=>{
  const data=await loadOptimizerCatalogue(read,{domain:'both',category:'passengers',ignoreRetirements:false},t);
  const contains=(input,id)=>[...optimizerCandidates(data,optimizerRequest({routeProfile,maxTrainLength:160,maxWagons:1,ignoreRetirements:false,...input}))].some(c=>c.domain==='road'?c.vehicle.id===id:c.definition.components.some(p=>p.componentId.endsWith(`:${id}`)));
  assert.equal(contains({year:2009},'metroliner'),true);assert.equal(contains({year:2010},'metroliner'),false);
  assert.equal(contains({year:1914},'droschky'),true);assert.equal(contains({year:1915},'droschky'),false);
  assert.equal(contains({year:2035,ignoreRetirements:true},'droschky'),true);assert.equal(contains({year:1891,ignoreRetirements:true},'droschky'),false);
  for(const c of optimizerCandidates(data,optimizerRequest({routeProfile,maxTrainLength:160,year:2000,maxWagons:1,ignoreRetirements:false}))){
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
  const {message,progress}=await execute({catalogue:small,request:{routeProfile,maxWagons:2}});
  assert.equal(message.type,'complete');assert.ok(message.result.best.rail.length>0);assert.ok(progress.length>0);assert.ok(progress.every(p=>Number.isInteger(p.tested)&&Number.isInteger(p.feasible)));
  const invalid=await execute({catalogue:small,request:{routeProfile,rate:-1}});assert.equal(invalid.message.type,'error');assert.match(invalid.message.message,/rate/);
});


test('optimizer evaluates each domain with its independent route speed limits',()=>{
  const profile=[{distanceKm:2,gradePercent:0,speedLimitKmh:80,roadSpeedLimitKmh:50}];
  const input={routeProfile:profile,rate:10,minHeadwaySeconds:null,maxHeadwaySeconds:null,ignoreRetirements:true};
  const request=optimizerRequest(input);
  const rail=optimizerCandidates(small,request).next().value;
  const road={domain:'road',vehicle:catalogue.buses.find(v=>v.maxSpeedKmh>50)};
  const evaluate=(candidate,routeProfile)=>evaluateOptimizerCandidate(candidate,small,optimizerRequest({...input,routeProfile})).result;
  const baseRail=evaluate(rail,profile),baseRoad=evaluate(road,profile);
  assert.ok(baseRail&&baseRoad);
  const lowerRail=profile.map(p=>({...p,speedLimitKmh:10}));
  const lowerRoad=profile.map(p=>({...p,roadSpeedLimitKmh:30}));
  close(evaluate(rail,lowerRoad).cycle,baseRail.cycle);
  close(evaluate(road,lowerRail).cycle,baseRoad.cycle);
  assert.ok(evaluate(rail,lowerRail).cycle>baseRail.cycle);
  assert.ok(evaluate(road,lowerRoad).cycle>baseRoad.cycle);
});


test('maximum leg time checks the slower direction and reports exact limiting constraints',()=>{
  const profile=[{distanceKm:2,gradePercent:2,speedLimitKmh:120,roadSpeedLimitKmh:80}];
  const input={routeProfile:profile,rate:10,minHeadwaySeconds:null,maxHeadwaySeconds:null,ignoreRetirements:true};
  const request=optimizerRequest(input);
  const candidates=[optimizerCandidates(small,request).next().value,{domain:'road',vehicle:catalogue.buses.find(v=>v.maxSpeedKmh>80)}];
  for(const candidate of candidates){
    const baseline=evaluateOptimizerCandidate(candidate,small,request).result;
    assert.ok(baseline);
    const slower=Math.max(baseline.outboundTravelSeconds,baseline.returnTravelSeconds),faster=Math.min(baseline.outboundTravelSeconds,baseline.returnTravelSeconds);
    assert.ok(slower>faster);
    assert.ok(evaluateOptimizerCandidate(candidate,small,optimizerRequest({...input,maxLegSeconds:slower})).result);
    const blocked=evaluateOptimizerCandidate(candidate,small,optimizerRequest({...input,maxLegSeconds:(slower+faster)/2}));
    const slowerDirection=baseline.outboundTravelSeconds>baseline.returnTravelSeconds?'maxOutboundLegSeconds':'maxReturnLegSeconds';
    assert.deepEqual(blocked.limitingConstraints,[slowerDirection]);
    assert.deepEqual(blocked.singleConstraints,[slowerDirection]);
    const both=evaluateOptimizerCandidate(candidate,small,optimizerRequest({...input,maxLegSeconds:1,minHeadwaySeconds:baseline.frequency+1}));
    assert.deepEqual(new Set(both.limitingConstraints),new Set(['maxOutboundLegSeconds','maxReturnLegSeconds','minHeadwaySeconds']));
    assert.deepEqual(both.singleConstraints,[]);
  }
  for(const maxLegSeconds of [0,-1,Infinity,NaN])assert.throws(()=>optimizerRequest({...input,maxLegSeconds}));
});

test('empty searches identify a minimum interval that excludes otherwise feasible designs per domain',()=>{
  const answer=run(small,{domain:'road',rate:100,minHeadwaySeconds:1e6,maxHeadwaySeconds:null,ignoreRetirements:true});
  assert.equal(answer.best.road.length,0);
  assert.ok(answer.stats.singleConstraintByDomain.road.minHeadwaySeconds>0);
  assert.deepEqual(answer.stats.rejectedByDomain.rail,{});
  assert.equal(answer.stats.singleConstraintByDomain.road.minHeadwaySeconds,answer.stats.rejectedByDomain.road.minHeadwaySeconds);
});


test('directional leg time limits can differ and be enabled independently',()=>{
  const input={routeProfile:[{distanceKm:2,gradePercent:2,speedLimitKmh:120,roadSpeedLimitKmh:80}],rate:10,minHeadwaySeconds:null,maxHeadwaySeconds:null,ignoreRetirements:true};
  const request=optimizerRequest(input);
  const candidates=[optimizerCandidates(small,request).next().value,{domain:'road',vehicle:catalogue.buses.find(v=>v.maxSpeedKmh>80)}];
  for(const candidate of candidates){
    const result=evaluateOptimizerCandidate(candidate,small,request).result;
    const outbound=result.outboundTravelSeconds,back=result.returnTravelSeconds;
    const evaluate=limits=>evaluateOptimizerCandidate(candidate,small,optimizerRequest({...input,...limits}));
    assert.ok(evaluate({maxOutboundLegSeconds:outbound,maxReturnLegSeconds:back}).result);
    assert.ok(evaluate({maxOutboundLegSeconds:null,maxReturnLegSeconds:back}).result);
    assert.ok(evaluate({maxOutboundLegSeconds:outbound,maxReturnLegSeconds:null}).result);
    assert.deepEqual(evaluate({maxOutboundLegSeconds:outbound-1}).singleConstraints,['maxOutboundLegSeconds']);
    assert.deepEqual(evaluate({maxReturnLegSeconds:back-1}).singleConstraints,['maxReturnLegSeconds']);
  }
  for(const key of ['maxOutboundLegSeconds','maxReturnLegSeconds'])for(const value of [0,-1,Infinity,NaN])assert.throws(()=>optimizerRequest({...input,[key]:value}));
  const legacy=optimizerRequest({...input,maxLegSeconds:600,maxOutboundLegSeconds:null});
  assert.equal(legacy.maxOutboundLegSeconds,null);assert.equal(legacy.maxReturnLegSeconds,600);
  assert.deepEqual(optimizerRequest(legacy),legacy);
});
