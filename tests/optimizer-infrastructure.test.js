import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {optimizerRequest,optimizerCandidates,evaluateOptimizerCandidate,optimizeService} from '../src/optimizer.js';
import {railTerminalRunningCosts,roadTerminalRunningCosts,optimizerProposalRequest,optimizerTrainLengthLimit,optimizerTerminalChoices} from '../src/optimizer-infrastructure.js';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const [trains,trucks]=await Promise.all(['trains','trucks'].map(read));
const data={units:trains.source,trains:trains.trains.filter(t=>t.id==='draisine'),locomotives:[],passengerWagons:[],freightWagons:[],trucks:[trucks.trucks.find(t=>t.id==='man-19304')],buses:[]};
const routeProfile=[{distanceKm:2,gradePercent:0,speedLimitKmh:80}];
const input={routeProfile,domain:'road',category:'freight',rate:10000,minHeadwaySeconds:null,maxHeadwaySeconds:null};
const plan=(values={})=>({id:'terminal',name:'Terminal',annualMaintenance:1000,constructionCost:null,maxTrainLength:160,existing:false,specializedTerminal:false,specializedWarehouse:false,...values});
const infrastructure=(domain,a,b=a)=>({[domain]:{stopA:a,stopB:b}});
const evaluate=request=>evaluateOptimizerCandidate([...optimizerCandidates(data,request)][0],data,request).result;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${a} != ${b}`);

test('40 m Rail section tariffs combine one track and one platform, with separately entered extras',()=>{
  const terminal=plan({maxTrainLength:160,additionalAnnualMaintenance:0});
  assert.equal(railTerminalRunningCosts(terminal,'passengers'),378000);
  assert.equal(railTerminalRunningCosts(terminal,'freight'),258000);
  assert.equal(railTerminalRunningCosts({...terminal,specializedTerminal:true},'freight'),378000);
  assert.equal(railTerminalRunningCosts({...terminal,specializedTerminal:true,additionalAnnualMaintenance:12000},'freight'),390000);
  assert.throws(()=>railTerminalRunningCosts({...terminal,maxTrainLength:170},'freight'),/whole 40 m/);
  assert.throws(()=>railTerminalRunningCosts({...terminal,additionalAnnualMaintenance:null},'freight'),/additional/);
});

test('validation recomputes confirmed tariffs for the requested category without mutating inputs',()=>{
  const infra=infrastructure('rail',[plan({maintenanceBasis:'railSections',additionalAnnualMaintenance:0,annualMaintenance:1})]);
  const before=JSON.stringify(infra);
  for(const [category,annual] of [['passengers',378000],['freight',258000]]){
    const request=optimizerRequest({...input,domain:'rail',category,infrastructure:infra});
    assert.equal(request.infrastructure.rail.stopA[0].annualMaintenance,annual);
    assert.deepEqual(optimizerRequest(request),request);
  }
  assert.equal(JSON.stringify(infra),before);
  assert.throws(()=>optimizerRequest({...input,infrastructure:infrastructure('road',[plan({annualMaintenance:null})])}),/annual infrastructure/);
  assert.throws(()=>optimizerRequest({...input,infrastructure:infrastructure('road',[plan({maintenanceBasis:'railSections'})])}),/cost model/);
  assert.ok(optimizerRequest({...input,infrastructure:{...infrastructure('road',[plan()]),rail:{stopA:[],stopB:[]}}}).infrastructure.road);
});

test('Road platforms charge per 10 m, starting with 20 m, without separate track upkeep',()=>{
  const terminal=plan({maintenanceBasis:'roadPlatforms',platformCount:1,additionalAnnualMaintenance:0,maxTrainLength:1});
  assert.equal(roadTerminalRunningCosts(terminal,'passengers'),162000);
  assert.equal(roadTerminalRunningCosts(terminal,'freight'),102000);
  assert.equal(roadTerminalRunningCosts({...terminal,specializedTerminal:true},'freight'),162000);
  assert.equal(roadTerminalRunningCosts({...terminal,platformCount:2,additionalAnnualMaintenance:12000},'freight'),174000);
  assert.throws(()=>roadTerminalRunningCosts({...terminal,platformCount:1.5},'freight'),/whole number/);
  const one=evaluate(optimizerRequest({...input,rate:100,infrastructure:infrastructure('road',[terminal])}));
  const two=evaluate(optimizerRequest({...input,rate:100,infrastructure:infrastructure('road',[{...terminal,platformCount:2}])}));
  assert.ok(one);assert.equal(one.fleet,two.fleet);assert.equal(one.cycle,two.cycle);
  assert.equal(two.cost-one.cost,120000);
  assert.equal(two.infrastructure.stopA.maxTrainLength,null);
});

test('both terminal upkeep costs are added once, while construction prices never affect ranking',()=>{
  const base=evaluate(optimizerRequest({...input,infrastructure:infrastructure('road',[plan({annualMaintenance:0})])}));
  const request=optimizerRequest({...input,infrastructure:infrastructure('road',[plan({existing:true,constructionCost:1e9})],[plan({annualMaintenance:2000})])});
  const result=evaluate(request);
  assert.equal(result.vehicleRunningCosts,base.cost);
  assert.equal(result.infrastructureRunningCosts,3000);
  assert.equal(result.cost,base.cost+3000);
  close(result.unitCost,base.unitCost+3000/base.rate);
  assert.equal(result.infrastructure.stopA.constructionCost,1e9);
  const other=evaluate(optimizerRequest({...input,infrastructure:infrastructure('road',[plan({constructionCost:0})],[plan({annualMaintenance:2000})])}));
  assert.equal(result.cost,other.cost);assert.equal(result.fleet,other.fleet);
});

test('handling improvements can win or lose depending on their annual upkeep',()=>{
  const standard=plan(),specialized=plan({id:'specialized',specializedTerminal:true,specializedWarehouse:true});
  const plain=evaluate(optimizerRequest({...input,infrastructure:infrastructure('road',[standard])}));
  const improved=evaluate(optimizerRequest({...input,infrastructure:infrastructure('road',[specialized])}));
  assert.ok(improved.vehicleRunningCosts<plain.vehicleRunningCosts);
  const cheap=evaluate(optimizerRequest({...input,infrastructure:infrastructure('road',[standard,specialized])}));
  assert.equal(cheap.infrastructure.stopA.id,'specialized');assert.equal(cheap.infrastructure.stopB.id,'specialized');
  const expensive={...specialized,annualMaintenance:plain.cost+1};
  const choice=evaluate(optimizerRequest({...input,infrastructure:infrastructure('road',[standard,expensive])}));
  assert.equal(choice.infrastructure.stopA.id,'terminal');assert.equal(choice.infrastructure.stopB.id,'terminal');
});

test('Rail search obeys both physical terminal limits and retains existing terminal total upkeep',()=>{
  const infra=infrastructure('rail',[plan({id:'short',maxTrainLength:40,annualMaintenance:1000}),plan({id:'long',maxTrainLength:160,annualMaintenance:500000})],[plan({maxTrainLength:80,annualMaintenance:10000,existing:true})]);
  const request=optimizerRequest({...input,domain:'rail',category:'passengers',rate:250,infrastructure:infra});
  assert.equal(optimizerTrainLengthLimit(request),80);
  const candidates=[...optimizerCandidates(data,request)];
  const results=candidates.map(c=>evaluateOptimizerCandidate(c,data,request).result).filter(Boolean);
  assert.ok(results.some(r=>r.length>40));
  for(const result of results){
    assert.ok(result.length<=80+1e-9);
    assert.equal(result.infrastructure.stopB.annualMaintenance,10000);
    assert.equal(result.infrastructure.stopA.id,result.length<=40?'short':'long');
    close(result.unitCost,result.cost/(2*result.rate));
  }
  const shortCandidate=candidates.at(-1);
  const tooShort=optimizerRequest({...request,infrastructure:infrastructure('rail',[plan({maxTrainLength:1})])});
  assert.equal(evaluateOptimizerCandidate(shortCandidate,data,tooShort).rejected,'infrastructure');
});

test('handoff applies the chosen handling and physical limits without changing the original request',()=>{
  const request=optimizerRequest({...input,domain:'rail',infrastructure:{...infrastructure('rail',[plan({maxTrainLength:80,specializedTerminal:true})],[plan({maxTrainLength:120})]),sites:{stopB:{type:'warehouse',warehouseSpecialization:'specialized'}}}});
  const before=JSON.stringify(request),result={domain:'rail',capacity:1000,infrastructure:[...optimizerTerminalChoices(request,'rail',1000)][0].selection},opened=optimizerProposalRequest(result,request);
  assert.equal(opened.fillRatio,.5);
  assert.equal(opened.maxTrainLength,80);assert.equal(opened.stopA.specializedTerminal,true);assert.equal(opened.stopB.specializedWarehouse,true);
  assert.equal(JSON.stringify(request),before);
});

test('each distinct design is ranked by its least expensive feasible terminal combination',()=>{
  const infra=infrastructure('rail',[plan({id:'short',maxTrainLength:40,annualMaintenance:1000}),plan({id:'long',maxTrainLength:160,annualMaintenance:200000})]);
  const request=optimizerRequest({...input,domain:'rail',category:'passengers',rate:250,infrastructure:infra});
  const generator=optimizeService(data,request,{limit:1000});let next;do{next=generator.next();}while(!next.done);
  const results=next.value.best.rail;
  assert.equal(new Set(results.map(r=>r.id)).size,results.length);
  assert.ok(results.length>1);
  assert.ok(results.every((r,i)=>i===0||r.cost>=results[i-1].cost));
  assert.ok(results.every(r=>r.cost===r.vehicleRunningCosts+r.infrastructureRunningCosts));
});

test('factory Road terminals are specialized and free, while Rail still needs a paid station',()=>{
  const terminal=plan({maintenanceBasis:'roadPlatforms',platformCount:1,additionalAnnualMaintenance:0});
  const request=optimizerRequest({...input,rate:100,infrastructure:{...infrastructure('road',[terminal]),sites:{stopA:{type:'factory'},stopB:{type:'industrial'}}}});
  assert.equal(request.infrastructure.road.stopA[0].annualMaintenance,0);
  assert.equal(request.infrastructure.road.stopA[0].specializedTerminal,true);
  assert.equal(request.infrastructure.road.stopB[0].annualMaintenance,102000);
  assert.equal(request.infrastructure.road.stopB[0].specializedWarehouse,false);
  assert.equal(evaluate(request).infrastructureRunningCosts,102000);
  const rail=optimizerRequest({...input,domain:'rail',infrastructure:{...infrastructure('rail',[plan({maintenanceBasis:'railSections',additionalAnnualMaintenance:0})]),sites:{stopA:{type:'factory'}}}});
  assert.equal(rail.infrastructure.rail.stopA[0].annualMaintenance,258000);
  assert.equal(rail.infrastructure.rail.stopA[0].specializedTerminal,false);
});

test('parallel Road platforms have no additional lane surcharge',()=>{
  const terminal=plan({platformCount:2,additionalLanes:1,additionalAnnualMaintenance:0});
  assert.equal(roadTerminalRunningCosts(terminal,'freight'),162000);
  assert.equal(roadTerminalRunningCosts(terminal,'passengers'),282000);
  assert.throws(()=>roadTerminalRunningCosts({...terminal,additionalLanes:3},'freight'),/no greater/);
});

test('warehouses are fixed endpoints, retaining existing capacity and enumerating specialization and extensions',()=>{
  const infra={...infrastructure('road',[plan()]),sites:{stopA:{type:'warehouse',warehouseCapacity:1000,maxWarehouseCapacity:3000},stopB:{type:'warehouse',warehouseCapacity:500,maxWarehouseCapacity:1000,warehouseSpecialization:'generic'}}};
  const request=optimizerRequest({...input,fillRatio:.7,infrastructure:infra});
  const choices=[...optimizerTerminalChoices(request,'road',2000)];
  assert.deepEqual([...new Set(choices.map(c=>c.stopA.warehouseCapacity))],[1000,1500]);
  assert.deepEqual([...new Set(choices.map(c=>c.stopB.warehouseCapacity))],[500,1000]);
  assert.equal(choices.length,8);
  for(const c of choices){
    assert.ok(c.stopA.warehouseCapacity>=1000);assert.ok(c.stopB.warehouseCapacity>=500);
    assert.equal(c.stopA.warehouseRunningCosts,c.stopA.warehouseCapacity/500*(c.stopA.specializedWarehouse?300000:150000));
    assert.equal(c.stopB.specializedWarehouse,false);
    assert.equal(c.selection.annualMaintenance,2000+c.stopA.warehouseRunningCosts+c.stopB.warehouseRunningCosts);
  }
  const small=[...optimizerTerminalChoices(request,'road',20)];
  assert.equal(small.length,2);assert.equal(small[0].stopA.warehouseCapacity,1000);
  for(const change of [{warehouseCapacity:null},{warehouseCapacity:750},{maxWarehouseCapacity:500}]){
    assert.throws(()=>optimizerRequest({...input,infrastructure:{...infra,sites:{...infra.sites,stopA:{...infra.sites.stopA,...change}}}}),/Warehouse|warehouse/);
  }
});

test('warehouse specialization is chosen only when reduced fleet upkeep offsets its extra maintenance',()=>{
  const infra={...infrastructure('road',[plan()]),sites:{stopA:{type:'warehouse',maxWarehouseCapacity:500},stopB:{type:'warehouse',maxWarehouseCapacity:500}}};
  const low=evaluate(optimizerRequest({...input,rate:50,infrastructure:infra}));
  assert.equal(low.infrastructure.stopA.specializedWarehouse,false);assert.equal(low.infrastructure.stopB.specializedWarehouse,false);
  assert.equal(low.infrastructureRunningCosts,302000);
  const busy=evaluate(optimizerRequest({...input,infrastructure:infra}));
  assert.equal(busy.infrastructure.stopA.specializedWarehouse,true);assert.equal(busy.infrastructure.stopB.specializedWarehouse,true);
  assert.equal(busy.infrastructureRunningCosts,602000);
});

test('storage limits load rather than nominal capacity, and expansion trades warehouse upkeep against fleet upkeep',()=>{
  const truck={...data.trucks[0],cargoCapacity:1000,loadingUnloadingSpeedMultiplier:100,economy:{...data.trucks[0].economy,annualMaintenance:1e7}};
  const candidate={domain:'road',vehicle:truck};
  const infra=max=>({...infrastructure('road',[plan()]),sites:{stopA:{type:'warehouse',maxWarehouseCapacity:max,warehouseSpecialization:'generic'},stopB:{type:'warehouse',maxWarehouseCapacity:max,warehouseSpecialization:'generic'}}});
  const base={...input,rate:10000};
  const limited=evaluateOptimizerCandidate(candidate,data,optimizerRequest({...base,infrastructure:infra(500)})).result;
  const expanded=evaluateOptimizerCandidate(candidate,data,optimizerRequest({...base,infrastructure:infra(1000)})).result;
  assert.ok(limited);assert.ok(expanded);
  assert.ok(limited.capacity*limited.utilization<=500+1e-7);
  assert.equal(limited.infrastructure.stopA.warehouseCapacity,500);
  assert.equal(expanded.infrastructure.stopA.warehouseCapacity,1000);
  assert.equal(expanded.infrastructure.stopB.warehouseCapacity,1000);
  assert.ok(expanded.fleet<limited.fleet);assert.ok(expanded.cost<limited.cost);
  const cheap={...truck,economy:{...truck.economy,annualMaintenance:1}};
  const smaller=evaluateOptimizerCandidate({domain:'road',vehicle:cheap},data,optimizerRequest({...base,infrastructure:infra(1000)})).result;
  assert.equal(smaller.infrastructure.stopA.warehouseCapacity,500);
  assert.equal(smaller.infrastructure.stopB.warehouseCapacity,500);
});

test('a real freight formation above 500 capacity can operate within a 500 capacity warehouse by reducing load',async()=>{
  const [locomotives,wagons]=await Promise.all(['rail-locomotives','rail-freight-wagons'].map(read));
  const rail={...data,trains:[],locomotives:locomotives.locomotives.filter(l=>l.id==='chinese-class-hxd3b'),freightWagons:wagons.wagons.filter(w=>w.id==='freight-wagon-1999')};
  const request=optimizerRequest({...input,domain:'rail',rate:5000,maxLocomotives:1,maxWagons:40,maxTrainLength:840,
    infrastructure:{...infrastructure('rail',[plan({maxTrainLength:840})]),sites:{stopA:{type:'warehouse',maxWarehouseCapacity:500},stopB:{type:'warehouse',maxWarehouseCapacity:500}}}});
  const candidate=[...optimizerCandidates(rail,request)].at(-1),result=evaluateOptimizerCandidate(candidate,rail,request).result;
  assert.ok(result);assert.ok(result.capacity>500);assert.ok(result.capacity*result.utilization<=500+1e-7);
  assert.equal(result.infrastructure.stopA.warehouseCapacity,500);assert.equal(result.infrastructure.stopB.warehouseCapacity,500);
  const opened=optimizerProposalRequest(result,request);
  assert.equal(opened.fillRatio,500/result.capacity);
  const reevaluated=evaluateOptimizerCandidate(candidate,rail,optimizerRequest(opened)).result;
  assert.equal(reevaluated.fleet,result.fleet);close(reevaluated.cycle,result.cycle);
});

const access=(mode,values={})=>({mode,existingLength:160,maxTrainLength:320,
  allowExtension:false,specializedTerminal:false,allowSpecialization:false,additionalAnnualMaintenance:0,...values});
const accessRequest=(domain,category,a,b=a,sites={})=>optimizerRequest({...input,domain,category,infrastructure:{...infrastructure(domain,a,b),sites}});
const choices=(request,length=0,capacity=20)=>[...optimizerTerminalChoices(request,request.domain,capacity,length)];

test('reused platforms can be free for the project while their physical and handling constraints remain',()=>{
  const request=accessRequest('rail','freight',access('reuse',{specializedTerminal:true}));
  const before=JSON.stringify(request),choice=choices(request,100)[0];
  assert.equal(choice.maxTrainLength,160);assert.equal(choice.selection.annualMaintenance,0);
  assert.equal(choice.stopA.specializedTerminal,true);assert.equal(choice.stopA.excludedExistingRunningCosts,378000);
  assert.equal(choices(request,161).length,0);
  const counted=choices(accessRequest('rail','freight',access('reuse',{specializedTerminal:true,includeExistingCosts:true})),100)[0];
  assert.equal(counted.selection.annualMaintenance,0);
  assert.equal(counted.stopA.addedRunningCosts,0);assert.equal(counted.stopA.existingRunningCosts,0);
  assert.equal(Object.hasOwn(counted.stopA,'includeExistingCosts'),false);
  assert.deepEqual(optimizerRequest(request),request);assert.equal(JSON.stringify(request),before);
});

test('a required new platform counts its track/lane and platform without recounting the existing station',()=>{
  const rail=choices(accessRequest('rail','freight',access('add')),81)[0];
  assert.equal(rail.stopA.mode,'add');assert.equal(rail.stopA.maxTrainLength,120);assert.equal(rail.stopA.annualMaintenance,180000);
  assert.equal(rail.stopA.excludedExistingRunningCosts,18000);
  const included=choices(accessRequest('rail','freight',access('add',{includeExistingCosts:true})),81)[0];
  assert.equal(included.stopA.annualMaintenance,180000);
  const road=choices(accessRequest('road','freight',access('add')))[0];
  assert.equal(road.stopA.annualMaintenance,60000);assert.deepEqual(road.stopA.platformLengths,[20]);
  const newStation=choices(accessRequest('road','freight',access('new')))[0];
  assert.equal(newStation.stopA.annualMaintenance,102000);assert.equal(newStation.stopA.existingRunningCosts,0);
  const countedRoad=choices(accessRequest('road','freight',access('add',{includeExistingCosts:true})))[0];
  assert.equal(countedRoad.stopA.annualMaintenance,60000);
});

test('the search sizes required Rail platforms and charges only permitted extensions and specialization upgrades',()=>{
  const reused=access('reuse',{allowExtension:true,allowSpecialization:true,maxTrainLength:240});
  const request=accessRequest('rail','freight',reused);
  const options=choices(request,161);
  assert.equal(options.length,4);
  const standard=options.find(c=>!c.stopA.specializedTerminal&&!c.stopB.specializedTerminal);
  assert.equal(standard.stopA.maxTrainLength,200);assert.equal(standard.stopA.platformExtended,true);
  assert.equal(standard.stopA.annualMaintenance,60000);
  const specialized=options.find(c=>c.stopA.specializedTerminal&&c.stopB.specializedTerminal);
  assert.equal(specialized.stopA.annualMaintenance,210000); // One new section plus specializing all five platform sections.
  assert.equal(specialized.stopA.existingRunningCosts,0);
  assert.equal(choices(request,241).length,0);
  const newPlatform=choices(accessRequest('rail','passengers',access('new')),81)[0];
  assert.equal(newPlatform.stopA.maxTrainLength,120);assert.equal(newPlatform.stopA.annualMaintenance,288000);
  assert.equal(choices(accessRequest('rail','passengers',access('new',{maxTrainLength:160})),160+1e-10)[0].maxTrainLength,160);
  const noChanges=choices(accessRequest('rail','freight',access('reuse')),80);
  assert.equal(noChanges.length,1);assert.equal(noChanges[0].stopA.maxTrainLength,160);
});

test('existing warehouses may be excluded but expansion and specialization costs remain attributed',()=>{
  const sites={stopA:{type:'warehouse',warehouseCapacity:500,maxWarehouseCapacity:1000},stopB:{type:'industrial'}};
  const options=choices(accessRequest('road','freight',access('reuse'),undefined,sites),0,1000);
  assert.equal(options.length,4);
  const cost=(capacity,specialized)=>options.find(c=>c.stopA.warehouseCapacity===capacity&&c.stopA.specializedWarehouse===specialized).stopA;
  assert.equal(cost(500,false).annualMaintenance,0);
  assert.equal(cost(500,true).annualMaintenance,150000);
  assert.equal(cost(1000,false).annualMaintenance,150000);
  assert.equal(cost(1000,true).annualMaintenance,450000);
  assert.equal(cost(1000,true).warehouseExistingRunningCosts,0);
  assert.equal(cost(1000,true).warehouseAddedRunningCosts,450000);
  const specializedSites={...sites,stopA:{...sites.stopA,existingSpecializedWarehouse:true}};
  const retained=choices(accessRequest('road','freight',access('reuse'),undefined,specializedSites),0,1000);
  assert.equal(retained.length,2);assert.ok(retained.every(c=>c.stopA.specializedWarehouse));
  assert.equal(retained[0].stopA.annualMaintenance,0);assert.equal(retained[1].stopA.annualMaintenance,300000);
});

test('terminal access is imposed by the user; invalid lengths or missing choices cannot produce a solution',()=>{
  for(const terminal of [access(''),access('guess'),access('factory'),access('reuse',{existingLength:150}),access('reuse',{allowExtension:true,maxTrainLength:120}),access('new',{maxTrainLength:150})]){
    assert.throws(()=>accessRequest('rail','freight',terminal));
  }
  const request=accessRequest('rail','passengers',access('reuse',{allowExtension:true,maxTrainLength:240}),access('add',{maxTrainLength:80}));
  assert.equal(optimizerTrainLengthLimit(request),80);
  const factory=accessRequest('road','freight',access('factory'),access('new'),{stopA:{type:'factory'}});
  assert.equal(factory.infrastructure.road.stopA.mode,'factory');assert.equal(choices(factory)[0].stopA.annualMaintenance,0);
  assert.throws(()=>accessRequest('road','freight',access(''),access('new'),{stopA:{type:'factory'}}));
  const separate=choices(accessRequest('road','freight',access('new'),access('new'),{stopA:{type:'factory'}}))[0];
  assert.equal(separate.stopA.annualMaintenance,102000);assert.equal(separate.stopA.specializedTerminal,false);
});

test('optional physical platform maxima leave the general train length bound in force',()=>{
  const reused=access('reuse',{allowExtension:true,maxTrainLength:null});
  const request=accessRequest('rail','passengers',reused,access('new',{maxTrainLength:null}));
  assert.equal(optimizerTrainLengthLimit(request),request.maxTrainLength);
  const [choice]=choices(request,300);
  assert.equal(choice.stopA.maxTrainLength,320);
  assert.equal(choice.stopB.maxTrainLength,320);
  assert.equal(choice.stopA.platformExtended,true);
  assert.equal(choice.stopA.annualMaintenance,360000);
  assert.deepEqual(optimizerRequest(request),request);
  const alternatives=optimizerRequest({...request,infrastructure:{...request.infrastructure,rail:{
    stopA:[access('reuse',{existingLength:40,maxTrainLength:40}),reused],stopB:access('new',{maxTrainLength:160})
  }}});
  assert.equal(optimizerTrainLengthLimit(alternatives),160);
  const noExtension=accessRequest('rail','passengers',access('reuse',{maxTrainLength:null}),access('new',{maxTrainLength:null}));
  assert.equal(optimizerTrainLengthLimit(noExtension),160);
  assert.equal(choices(noExtension,200).length,0);
});

test('real Road service ranking uses project costs and handoff retains free reused handling bonuses',()=>{
  const free=optimizerRequest({...accessRequest('road','freight',access('reuse',{specializedTerminal:true})),rate:500});
  const result=evaluate(free);
  assert.ok(result);assert.equal(result.infrastructureRunningCosts,0);assert.equal(result.cost,result.vehicleRunningCosts);
  const counted=evaluate(optimizerRequest({...accessRequest('road','freight',access('reuse',{specializedTerminal:true,includeExistingCosts:true})),rate:500}));
  assert.equal(counted.cost,result.cost);assert.equal(counted.fleet,result.fleet);
  const proposal=optimizerProposalRequest(result,free);
  assert.equal(proposal.stopA.specializedTerminal,true);
  const station=evaluate(optimizerRequest({...accessRequest('road','freight',access('new',{allowSpecialization:true})),rate:500}));
  assert.equal(station.infrastructure.stopA.mode,'new');assert.equal(station.infrastructure.stopB.mode,'new');
  assert.ok(station.infrastructure.stopA.annualMaintenance>=102000);
});

test('Rail candidate evaluation chooses the minimum allowed platform and preserves the selected physical limit on opening',()=>{
  const request=optimizerRequest({...accessRequest('rail','passengers',access('new',{maxTrainLength:160})),rate:100});
  const candidate=[...optimizerCandidates(data,request)].at(-1);
  const result=evaluateOptimizerCandidate(candidate,data,request).result;
  assert.ok(result);
  const expectedLength=Math.ceil(result.length/40)*40;
  assert.equal(result.infrastructure.stopA.maxTrainLength,expectedLength);
  assert.equal(result.infrastructure.stopB.maxTrainLength,expectedLength);
  assert.equal(result.infrastructureRunningCosts,2*(18000+expectedLength/40*90000));
  assert.equal(result.cost,result.vehicleRunningCosts+result.infrastructureRunningCosts);
  const opened=optimizerProposalRequest(result,request);
  assert.equal(opened.maxTrainLength,expectedLength);
  const repeated=evaluateOptimizerCandidate(candidate,data,optimizerRequest(opened)).result;
  assert.equal(repeated.cost,result.cost);assert.equal(repeated.fleet,result.fleet);
});

test('declared reusable infrastructures are alternative constrained locations, without an undeclared new-station fallback',()=>{
  const request=optimizerRequest({...input,domain:'rail',category:'passengers',infrastructure:{rail:{
    stopA:[access('reuse',{id:'short-platform',existingLength:40}),access('reuse',{id:'long-platform',existingLength:160})],
    stopB:access('new',{maxTrainLength:160})
  }}});
  assert.equal(optimizerTrainLengthLimit(request),160);
  const short=choices(request,30),long=choices(request,120);
  assert.equal(short.length,2);assert.equal(long.length,1);
  assert.match(long[0].stopA.id,/long-platform/);assert.equal(long[0].stopA.annualMaintenance,0);
  assert.equal(long[0].stopB.annualMaintenance,288000);
  assert.equal(choices(request,161).length,0);
  assert.deepEqual(optimizerRequest(request),request);
  assert.throws(()=>optimizerRequest({...request,infrastructure:{rail:{...request.infrastructure.rail,stopA:[access('reuse',{id:'same'}),access('add',{id:'same'})]}}}),/unique/);
});

test('an existing station without an available platform charges an additional platform, while unspecified stops build stations',()=>{
  const request=optimizerRequest({...input,rate:100,infrastructure:{road:{stopA:[access('add',{id:'station-only'})],stopB:access('new')}}});
  const result=evaluate(request);
  assert.ok(result);assert.equal(result.infrastructure.stopA.mode,'add');assert.equal(result.infrastructure.stopB.mode,'new');
  assert.equal(result.infrastructure.stopA.annualMaintenance,60000);
  assert.equal(result.infrastructure.stopB.annualMaintenance,102000);
  assert.equal(result.infrastructureRunningCosts,162000);
});


test('the game platform maximum of 840 m bounds default and unrestricted Rail infrastructure',()=>{
  const request=optimizerRequest({...input,domain:'rail'});
  assert.equal(request.maxTrainLength,840);
  assert.throws(()=>optimizerRequest({...input,domain:'rail',maxTrainLength:841}));
  const unconstrained=accessRequest('rail','passengers',access('new',{maxTrainLength:null}));
  assert.equal(choices(unconstrained,840)[0].maxTrainLength,840);
  assert.equal(choices(unconstrained,841).length,0);
  assert.throws(()=>accessRequest('rail','passengers',access('new',{maxTrainLength:880})));
  assert.throws(()=>accessRequest('rail','passengers',access('reuse',{existingLength:880,maxTrainLength:null})));
  const short=accessRequest('rail','passengers',access('new',{maxTrainLength:80}));
  assert.equal(choices(short,81).length,0);
});
