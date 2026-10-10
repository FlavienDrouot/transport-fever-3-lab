import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildConsist,lightRailComponents,railComponents,tramComponents} from '../src/consists.js';
import {OPTIMIZER_DEFAULTS,optimizerRequest,optimizerCandidates,optimizeService,evaluateOptimizerCandidate,compareOptimizerResults} from '../src/optimizer.js';
import {loadOptimizerCatalogue} from '../src/optimizer-catalogue.js';
import {segmentTramTiers} from '../src/optimizer-line-infrastructure.js';
import {optimizerProposalRequest} from '../src/optimizer-infrastructure.js';
import {renderOptimizerProposals,optimizerProposalAt} from '../src/optimizer-proposals.js';
import {reverseRouteProfile} from '../src/route-profile.js';
const load=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [source,trams,buses,engines,passengers,freight]=await Promise.all(['trains','trams','buses','tram-locomotives','tram-passenger-wagons','tram-freight-wagons'].map(load));
const routeProfile=[{distanceKm:1,gradePercent:0,speedLimitKmh:80,roadSpeedLimitKmh:80}];
const data={units:source.source,trains:[],locomotives:[],passengerWagons:[],freightWagons:[],trams:trams.trams,freightTrams:trams.freightTrams,buses:buses.buses,trucks:[],tramLocomotives:engines.locomotives,tramPassengerWagons:passengers.wagons,tramFreightWagons:freight.wagons};
const request=values=>optimizerRequest({identicalMUsOnly:false,routeProfile,maxTrainLength:120,maxRoadTramLength:120,rate:1000,...values});
const run=values=>{const search=optimizeService(data,request(values));let step;do{step=search.next();}while(!step.done);return step.value;};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)));

test('identical-only MU coupling is the default and removes only powered/wagon and mixed tram formations',async()=>{
 const [locomotives,wagons]=await Promise.all(['rail-locomotives','rail-passenger-wagons'].map(load));
 const catalogue={...data,trains:source.trains.slice(0,2),locomotives:locomotives.locomotives.slice(0,1),passengerWagons:wagons.wagons.slice(0,2)};
 const strict=optimizerRequest({routeProfile,includeTrams:true,maxTrainLength:120,maxRoadTramLength:80,maxWagons:4});
 assert.equal(strict.identicalMUsOnly,true);assert.equal(OPTIMIZER_DEFAULTS.identicalMUsOnly,true);
 const allowed=[...optimizerCandidates(catalogue,{...strict,identicalMUsOnly:false})],restricted=[...optimizerCandidates(catalogue,strict)];
 const powered=c=>c.definition&&c.catalogue.find(v=>v.id===c.definition.components[0].componentId).role==='powered-carriage';
 const identity=c=>`${c.domain}/${c.definition?.id??c.vehicle.id}`;
 assert.deepEqual(restricted.map(identity),allowed.filter(c=>!powered(c)||c.definition.components.length===1).map(identity));
 assert.ok(allowed.some(c=>c.kind==='mixed-light-rail'));assert.ok(allowed.some(c=>powered(c)&&c.definition.components.some(p=>c.catalogue.find(v=>v.id===p.componentId).role==='wagon')));
 for(const domain of ['rail','road']){
  assert.ok(restricted.some(c=>c.domain===domain&&powered(c)&&c.definition.components[0].quantity>1));
  assert.ok(restricted.some(c=>c.domain===domain&&!powered(c)&&c.definition?.components.length===2));
 }
 assert.throws(()=>optimizerRequest({routeProfile,identicalMUsOnly:'true'}),/MU coupling/);
});

test('the exhaustive captured light-rail list contains exactly seven passenger and two freight whole trams',()=>{
 const before=structuredClone(trams),light=lightRailComponents([...trams.trams,...trams.freightTrams]);
 assert.deepEqual(light.map(v=>v.id.split(':').at(-1)),['duewag-n8c','toyama-8000','bombardier-k4000','skoda-10t','changchun-3000','caf-urbos-3','stadler-citylink','dresden-cargotram','articulated-freight-tram']);
 assert.ok(light.every(v=>v.carrier==='rail'&&v.role==='powered-carriage'));
 const tramCatalogue=tramComponents({locomotives:engines.locomotives,passengerWagons:passengers.wagons,freightWagons:freight.wagons});
 assert.ok(tramCatalogue.every(v=>!v.lightRailCompatible));assert.deepEqual(trams,before);
 const citylink=light.find(v=>v.name==='Stadler Citylink');
 const formation=buildConsist({schemaVersion:1,id:'citylink',name:'Citylink',carrier:'rail',category:'passengers',components:[{componentId:citylink.id,quantity:2}]},light,source.source);
 assert.equal(formation.passengerCapacity,100);assert.equal(formation.formationLoadingUnloadingSpeedMultiplier,16);
 assert.equal(formation.economy.annualMaintenance,2*351161);
});

test('Rail considers homogeneous and all mixed light-rail formations without pairing with railway stock',()=>{
 const req=request({domain:'rail',maxLocomotives:1});
 const candidates=[...optimizerCandidates(data,req)];assert.equal(candidates.length,310);
 assert.ok(candidates.some(c=>c.definition.components.length===4));
 assert.ok(candidates.some(c=>c.definition.components[0].quantity===8));
 assert.ok(candidates.every(c=>c.definition.components.every(p=>p.componentId.startsWith('rail:light-rail:'))));
 assert.deepEqual(candidates.map(c=>c.definition),[...optimizerCandidates(data,{...req,maxLocomotives:8})].map(c=>c.definition));
 const catalogue=[...lightRailComponents(trams.trams),...railComponents({locomotives:[],passengerWagons:[],freightWagons:[],multipleUnits:source.trains.slice(0,1)})];
 assert.throws(()=>buildConsist({schemaVersion:1,id:'invalid',name:'Invalid mixed stock',carrier:'rail',category:'passengers',components:[{componentId:catalogue[0].id,quantity:1},{componentId:catalogue.at(-1).id,quantity:1}]},catalogue,source.source),/only be coupled/);
 const old=request({domain:'rail',year:1977});assert.equal([...optimizerCandidates(data,old)].length,0);
 const freightCandidates=[...optimizerCandidates(data,request({domain:'rail',category:'freight',year:2035}))];
 assert.ok(freightCandidates.some(c=>c.definition.components.length===2));assert.ok(freightCandidates.every(c=>c.catalogue.filter(v=>c.definition.components.some(p=>p.componentId===v.id)).every(v=>v.cargoCapacity>0)));
});

test('mixed search retains the exact exhaustive best variants, including the verified 14.4% saving',()=>{
 const infrastructure={rail:{stopA:{mode:'reuse',existingLength:120,platformTrackCount:2,platformCount:1},stopB:{mode:'reuse',existingLength:120,platformTrackCount:2,platformCount:1}}};
 for(const settings of [{rate:1000},{rate:5000,minHeadwaySeconds:30,maxHeadwaySeconds:120,fillRatio:.7}]){
  const req=request({domain:'rail',infrastructure,...settings}),answer=run(req);
  const exhaustive=[...optimizerCandidates(data,req)].map(c=>evaluateOptimizerCandidate(c,data,req).result).filter(Boolean).sort(compareOptimizerResults);
  assert.deepEqual(answer.best.rail,exhaustive.slice(0,3));
  const group=answer.groups.rail.find(g=>g.id==='mixed-light-rail');
  if(group)assert.deepEqual(group.wagons[0].variants,exhaustive.filter(r=>r.poweredModel.id==='mixed-light-rail').slice(0,3));
  if(settings.rate===1000){
   const mixed=answer.best.rail[0],homogeneous=exhaustive.find(r=>r.poweredModel.id!=='mixed-light-rail');
   assert.equal(mixed.cost,631994);assert.equal(homogeneous.cost,738310);assert.equal(mixed.capacity,107);assert.equal(mixed.length,87);
   close((homogeneous.cost-mixed.cost)/homogeneous.cost,.1439991331554496);
   assert.ok(Object.values(mixed.terminalEstimates).every(e=>!e.overloaded));
  }
 }
});

test('Road trams are opt-in, couple whole vehicles, and retain locomotive/wagon choices plus every bus model',()=>{
 assert.ok([...optimizerCandidates(data,request({domain:'road'}))].every(c=>!c.definition));
 const answer=run({domain:'road',includeTrams:true,maxTrainLength:80,maxRoadTramLength:80,rate:100});
 assert.ok(answer.groups.road.filter(g=>g.vehicleType==='Bus').length>5);
 assert.ok(answer.groups.road.some(g=>g.vehicleType==='Tram'&&g.role==='locomotive'));
 assert.ok(answer.groups.road.some(g=>g.role==='powered-carriage'&&g.wagons.some(w=>w.id!=='trainsets')));
 assert.ok(answer.groups.road.some(g=>g.id==='mixed-light-rail'));
 const candidate=[...optimizerCandidates(data,answer.request)].find(c=>c.definition?.components[0].componentId.endsWith(':skoda-10t')&&c.definition.components[0].quantity===2);
 const result=evaluateOptimizerCandidate(candidate,data,answer.request).result;
 assert.equal(result.capacity,50);assert.equal(result.vehicleType,'Tram');assert.equal(result.definition.carrier,'tram');
 assert.ok(answer.groups.road.every(g=>g.wagons.every(w=>w.variants.every(v=>v.domain==='road'))));
});

test('Road formation pruning preserves every powered/wagon bucket against exhaustive evaluation',()=>{
 for(const settings of [{category:'passengers',rate:500,maxHeadwaySeconds:120,fillRatio:.7},{category:'freight',rate:300,loadedReturn:true,lineInfrastructure:{}}]){
  const req=request({domain:'road',includeTrams:true,maxTrainLength:80,maxRoadTramLength:80,maxWagons:4,...settings}),answer=run(req);
  const exhaustive=[...optimizerCandidates(data,req)].map(c=>evaluateOptimizerCandidate(c,data,req).result).filter(Boolean).sort(compareOptimizerResults);
  assert.deepEqual(answer.best.road,exhaustive.slice(0,3));
  const buckets=new Map();
  for(const result of exhaustive){
   const key=`${result.poweredModel.id}/${result.wagonModel?.id??'trainsets'}`;
   const variants=buckets.get(key)??[];buckets.set(key,variants);if(variants.length<3)variants.push(result);
  }
  assert.equal(answer.groups.road.reduce((n,g)=>n+g.wagons.length,0),buckets.size);
  for(const group of answer.groups.road)for(const wagon of group.wagons)assert.deepEqual(wagon.variants,buckets.get(`${group.id}/${wagon.id}`));
  const lightIds=new Set(trams.trams.filter(v=>v.lightRailCompatible).map(v=>`tram:passenger-motor:${v.id}`));
  assert.ok(exhaustive.every(r=>!lightIds.has(r.poweredModel.id)||!r.wagonModel));
 }
});

test('Road tram practical length defaults to 80 m and is independent of Rail and platform geometry',()=>{
 assert.equal(OPTIMIZER_DEFAULTS.maxRoadTramLength,80);
 const railTerminal={mode:'new',maxTrainLength:120};
 const profile={rail:{stopA:railTerminal,stopB:railTerminal},road:{stopA:{mode:'new',maxPlatformLength:40,maxPlatforms:2},stopB:{mode:'new',maxPlatformLength:40,maxPlatforms:2}}};
 for(const length of [40,80,120]){
  const req=optimizerRequest({domain:'both',includeTrams:true,routeProfile,maxTrainLength:120,maxRoadTramLength:length,infrastructure:profile});
  const candidates=[...optimizerCandidates(data,req)];
  const trams=candidates.filter(c=>c.domain==='road'&&c.definition);
  assert.ok(trams.length>0);assert.ok(trams.every(c=>buildConsist(c.definition,c.catalogue,data.units).lengthMetres<=length+1e-9));
  assert.ok(candidates.some(c=>c.domain==='rail'&&buildConsist(c.definition,c.catalogue,data.units).lengthMetres>80));
  assert.equal(candidates.filter(c=>c.domain==='road'&&!c.definition).length,data.buses.length);
 }
 assert.throws(()=>request({maxRoadTramLength:0}),/maxRoadTramLength/);
 assert.throws(()=>request({maxRoadTramLength:NaN}),/maxRoadTramLength/);
});

test('tram tracks exclude highway tiers, preserve curve/city caps and charge dedicated upkeep once for both tracks',()=>{
 const part={distanceKm:2,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:120,roadLanes:4};
 const req=request({routeProfile:[part],includeTrams:true,lineInfrastructure:{}});
 const options=segmentTramTiers(part,req);
 assert.deepEqual(options.map(v=>[v.tramInfrastructure,v.tierSpeedKmh,v.annualMaintenance]),[['road',80,120000],['dedicated',100,40000]]);
 for(const speed of [50,60,90])assert.ok(segmentTramTiers({...part,roadSpeedLimitKmh:speed},req).every(v=>v.speedLimitKmh<=speed));
 assert.deepEqual(segmentTramTiers({...part,tramInfrastructure:'road'}, {...req,lineInfrastructure:null}),[]);
 assert.deepEqual(segmentTramTiers({...part,roadSpeedLimitKmh:50,roadSpeedConstraintKmh:100,tramInfrastructure:'road'}, {...req,lineInfrastructure:null}),[]);
 assert.equal(segmentTramTiers({...part,roadSpeedLimitKmh:80,roadLanes:2,tramInfrastructure:'road'},req)[0].annualMaintenance,60000);
 assert.ok(segmentTramTiers({...part,roadSpeedLimitKmh:80}, {...req,lineInfrastructure:null}).every(v=>v.annualMaintenance===0&&v.speedLimitKmh<=80));
});

test('selected tram infrastructure respects per-segment constraints, costs and proposal handoff',()=>{
 const profile=[{...routeProfile[0],tramInfrastructure:'dedicated'},{...routeProfile[0],tramInfrastructure:'road'}];
 const req=request({domain:'road',includeTrams:true,routeProfile:profile,maxTrainLength:40,maxRoadTramLength:40,lineInfrastructure:{},rate:100});
 const candidate=[...optimizerCandidates(data,req)].find(c=>c.definition?.components[0].componentId.endsWith(':toyama-8000'));
 const result=evaluateOptimizerCandidate(candidate,data,req).result;
 assert.equal(result.routeRunningCosts,50000);assert.deepEqual(result.routeInfrastructure.segments.map(p=>p.tramInfrastructure),['dedicated','road']);
 assert.equal(result.cost,result.vehicleRunningCosts+result.routeRunningCosts);
 const transfer=optimizerProposalRequest(result,req);assert.deepEqual(transfer.routeProfile.map(p=>p.tramInfrastructure),['dedicated','road']);
 assert.deepEqual(reverseRouteProfile(reverseRouteProfile(transfer.routeProfile)),transfer.routeProfile);
 const excluded=evaluateOptimizerCandidate(candidate,data,{...req,lineInfrastructure:null}).result;
 assert.equal(excluded.routeRunningCosts,0);assert.equal(excluded.routeInfrastructure.costsIncluded,false);
 const forcedHighway=request({domain:'road',includeTrams:true,routeProfile:[{...profile[0],roadSpeedLimitKmh:100,tramInfrastructure:'road'}],maxTrainLength:40,maxRoadTramLength:40});
 assert.equal(evaluateOptimizerCandidate(candidate,data,forcedHighway).result,undefined);
});

test('Rail and Road tables have independent selection/identities, five model rows and more models retained',()=>{
 const answer=run({domain:'both',includeTrams:true,maxTrainLength:80,maxRoadTramLength:80,rate:100});
 const html=['rail','road'].map(d=>renderOptimizerProposals(answer,d)).join('');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 assert.equal((html.match(/<article /g)??[]).length,2);assert.equal((html.match(/<table /g)??[]).length,2);
 assert.ok(html.includes('data-selected-road'));assert.ok(html.includes('data-more-proposals'));
 assert.ok(html.includes('Road + Tram'));assert.ok(html.includes('Open composition'));
 for(const domain of ['rail','road'])for(const [g,group] of answer.groups[domain].entries())for(const [w,wagon] of group.wagons.entries())for(const [i,variant] of wagon.variants.entries())assert.strictEqual(optimizerProposalAt(answer,{domain,group:String(g),wagon:String(w),result:String(i)}),variant);
});

test('catalogue loading and source retirements also cover tram motors, locomotives and wagons',async()=>{
 const names=[];const catalogue=await loadOptimizerCatalogue(async name=>{names.push(name);return load(name);},{domain:'road',category:'freight',includeTrams:true,ignoreRetirements:false},source);
 assert.deepEqual(names.sort(),['trucks','trams','tram-locomotives','tram-freight-wagons','vehicle-availability'].sort());
 assert.ok(catalogue.freightTrams.every(v=>Object.hasOwn(v,'yearTo')));assert.equal(catalogue.tramPassengerWagons.length,0);
 const synthetic={...data,trams:data.trams.map(v=>({...v,yearTo:2023}))};
 const available=[...optimizerCandidates(synthetic,request({domain:'rail',year:2023,ignoreRetirements:false}))];assert.deepEqual(available,[]);
 assert.throws(()=>request({includeTrams:'true'}),/tram setting/);
});
