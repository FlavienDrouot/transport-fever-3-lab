import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {analyseLine,analyseService,GAME_YEAR_SECONDS} from '../src/line.js';
const data=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
const train={...data.trains[0],model:createModel(data.trains[0],data.source)};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${a} ≠ ${b}`);
test('No service targets preserve the single-train cost and occupancy',()=>{
  const base=analyseLine(train,{distanceKm:10,fillRatio:.7}),service=analyseService(train,{distanceKm:10,fillRatio:.7});
  close(service.maintenancePerJourney,base.maintenancePerJourney);close(service.actualOccupancyRatio,.7);assert.equal(service.trainCount,1);close(service.headwaySeconds,base.roundTripSeconds);
});
test('Annual directional demand uses a whole fleet and adjusts transfers and occupancy',()=>{
  const r=analyseService(train,{distanceKm:10,fillRatio:.8,demandPerDirection:1000});
  assert.ok(Number.isInteger(r.trainCount));assert.ok(r.actualOccupancyRatio<=.8);close(r.perDirectionJourneysPerYear,1000);close(r.maintenancePerJourney,r.fleetMaintenance/2000);
  close(r.headwaySeconds*r.trainCount,r.roundTripSeconds);close(r.loadingSeconds,r.passengers/r.rate);
  if(r.trainCount>1){const smaller=analyseLine(train,{distanceKm:10,fillRatio:.8});assert.ok(smaller.journeysPerHour/3600*GAME_YEAR_SECONDS/2*(r.trainCount-1)<1000);}
});
test('A tighter station interval can increase fleet size and reduce actual occupancy',()=>{
  const options={distanceKm:10,fillRatio:1,demandPerDirection:200};const base=analyseService(train,options),r=analyseService(train,{...options,maxHeadwaySeconds:30});
  assert.ok(r.headwaySeconds<=30+1e-7);assert.ok(r.trainCount>base.trainCount);assert.ok(r.actualOccupancyRatio<base.actualOccupancyRatio);close(r.perDirectionJourneysPerYear,200);assert.ok(r.maintenancePerJourney>base.maintenancePerJourney);
});
test('Closest interval evaluates both adjacent feasible whole fleets',()=>{
  const base=analyseLine(train,{distanceKm:10,fillRatio:1});const target=base.roundTripSeconds/.9;
  const r=analyseService(train,{distanceKm:10,maxHeadwaySeconds:target,frequencyMode:'closest'});assert.equal(r.trainCount,1);
  const options={distanceKm:10,demandPerDirection:1000,maxHeadwaySeconds:180,frequencyMode:'closest'};const chosen=analyseService(train,options);close(chosen.perDirectionJourneysPerYear,1000);
  const fixed=2*chosen.travelSeconds+12, flow=1000/GAME_YEAR_SECONDS, transfer=4*flow/chosen.rate;
  for(const n of [chosen.trainCount-1,chosen.trainCount+1].filter(n=>n>=1&&n>transfer)){
    const passengers=flow*fixed/(n-transfer);if(passengers<=train.passengerCapacity)assert.ok(Math.abs(chosen.headwaySeconds-180)<=Math.abs(fixed/(n-transfer)-180)+1e-7);
  }
});
test('Frequency alone preserves occupancy and scales capacity and maintenance together',()=>{
  const options={distanceKm:10,fillRatio:.5};const base=analyseLine(train,options);const r=analyseService(train,{...options,maxHeadwaySeconds:30});assert.ok(r.headwaySeconds<=30);close(r.actualOccupancyRatio,.5);close(r.maintenancePerJourney,base.maintenancePerJourney);close(r.fleetMaintenance,train.economy.annualMaintenance*r.trainCount);
});
test('Invalid demand and interval policies are rejected',()=>{
  for(const extra of [{demandPerDirection:0},{demandPerDirection:NaN},{maxHeadwaySeconds:-1},{frequencyMode:'exact'},{demandPerDirection:100,fillRatio:0}])assert.throws(()=>analyseService(train,{distanceKm:10,...extra}),RangeError);
});

test('Infrastructure limits speed and lengthens a long journey without changing source data',()=>{
  const raw=data.trains.find(t=>t.id==='fuxing'), fast={...raw,model:createModel(raw,data.source)};
  const options={distanceKm:30,fillRatio:.7};
  const unrestricted=analyseService(fast,options);
  for(const speed of [10,90,100,160,350]){
    const r=analyseService(fast,{...options,infrastructureSpeedKmh:speed});
    assert.ok(r.peakSpeedKmh<=speed+1e-7);assert.ok(r.travelSeconds>=unrestricted.travelSeconds-1e-7);
  }
  assert.equal(fast.maxSpeedKmh,350);
  assert.throws(()=>analyseService(fast,{...options,infrastructureSpeedKmh:351}),RangeError);
});
test('A platform limit rejects one overlong unit but includes an exact fit',()=>{
  const options={distanceKm:10,platformLengthMetres:train.lengthMetres};
  assert.equal(analyseService(train,options).eligible,true);
  const excluded=analyseService(train,{...options,platformLengthMetres:train.lengthMetres-1});
  assert.equal(excluded.eligible,false);assert.equal(excluded.maintenancePerJourney,null);
  assert.throws(()=>analyseService(train,{...options,platformLengthMetres:0}),RangeError);
});
test('Coupling scales capacity, length, rates and costs and keeps the same motion',()=>{
  const raw=data.trains.find(t=>t.id==='talent-1'), t={...raw,model:createModel(raw,data.source)};
  const options={distanceKm:10,demandPerDirection:1100,maxHeadwaySeconds:180,frequencyMode:'closest',infrastructureSpeedKmh:160};
  const single=analyseService(t,options), coupled=analyseService(t,{...options,allowMultipleUnits:true,platformLengthMetres:192});
  assert.ok(coupled.unitsPerTrain>1);assert.ok(coupled.trainLengthMetres<=192);
  assert.ok(Math.abs(coupled.headwaySeconds-180)<Math.abs(single.headwaySeconds-180));
  close(coupled.travelSeconds,single.travelSeconds);close(coupled.perDirectionJourneysPerYear,1100);
  close(coupled.capacityPerTrain,t.passengerCapacity*coupled.unitsPerTrain);
  close(coupled.rate,single.rate*coupled.unitsPerTrain);
  close(coupled.fleetMaintenance,t.economy.annualMaintenance*coupled.trainCount*coupled.unitsPerTrain);
  close(coupled.trainLengthMetres,t.lengthMetres*coupled.unitsPerTrain);
  assert.ok(coupled.actualOccupancyRatio<=1);
  const maximum=analyseService(t,{...options,frequencyMode:'maximum',allowMultipleUnits:true,platformLengthMetres:192});
  assert.ok(maximum.headwaySeconds<=180+1e-7);
});
test('Coupling is inactive without frequency or without rate',()=>{
  const options={distanceKm:10,demandPerDirection:1000,allowMultipleUnits:true};
  assert.equal(analyseService(train,options).unitsPerTrain,1);
  assert.equal(analyseService(train,{distanceKm:10,maxHeadwaySeconds:180,allowMultipleUnits:true}).unitsPerTrain,1);
});

test('Frequency takes precedence over lower costs when coupling is enabled',()=>{
  const raw=data.trains.find(t=>t.id==='talent-1'), t={...raw,model:createModel(raw,data.source)};
  const options={distanceKm:10,demandPerDirection:1000,maxHeadwaySeconds:180,frequencyMode:'closest',platformLengthMetres:192};
  const single=analyseService(t,options), chosen=analyseService(t,{...options,allowMultipleUnits:true});
  assert.ok(chosen.unitsPerTrain>1);assert.ok(chosen.fleetMaintenance>single.fleetMaintenance);
  assert.ok(Math.abs(Math.round(chosen.headwaySeconds)-180)<Math.abs(Math.round(single.headwaySeconds)-180));
});
test('Handcars and Uerdingen can couple for a five-minute service without a platform limit',()=>{
  for(const id of ['draisine','uerdingen']){
    const raw=data.trains.find(t=>t.id===id), t={...raw,model:createModel(raw,data.source)};
    const options={distanceKm:10,demandPerDirection:1000,maxHeadwaySeconds:300,allowMultipleUnits:true};
    const r=analyseService(t,options);assert.ok(r.unitsPerTrain>1);assert.ok(r.headwaySeconds>240&&r.headwaySeconds<=300);
    close(r.perDirectionJourneysPerYear,1000);assert.ok(r.actualOccupancyRatio<=1+1e-9);
    const limited=analyseService(t,{...options,platformLengthMetres:100});assert.ok(limited.trainLengthMetres<=100+1e-9);
  }
});
test('Analytical coupling agrees with exhaustive bounded compositions and fleets',()=>{
  for(const id of ['draisine','uerdingen','talent-1']){
    const raw=data.trains.find(t=>t.id===id), t={...raw,model:createModel(raw,data.source)};
    for(const frequencyMode of ['maximum','closest'])for(const target of [45,180,300]){
      const options={distanceKm:2.5,fillRatio:.8,demandPerDirection:350,maxHeadwaySeconds:target,frequencyMode,allowMultipleUnits:true,platformLengthMetres:raw.lengthMetres*6};
      const chosen=analyseService(t,options), base=analyseLine(t,options),flow=350/GAME_YEAR_SECONDS;
      const fixed=2*base.travelSeconds+12,A=4*flow/base.rate;
      let expected=null;
      for(let k=1;k<=6;k++)for(let n=1;n<=200;n++){
        if(n<=A/k)continue;
        const h=fixed/(n-A/k),passengers=flow*h;
        if(passengers>raw.passengerCapacity*.8*k+1e-8 || (frequencyMode==='maximum'&&h>target+1e-7))continue;
        const candidate={error:Math.abs(Math.round(h)-target),cost:n*k*raw.economy.annualMaintenance,k,n};
        if(!expected||candidate.error<expected.error||(candidate.error===expected.error&&(candidate.cost<expected.cost||(candidate.cost===expected.cost&&k<expected.k))))expected=candidate;
      }
      assert.ok(expected);assert.equal(Math.abs(Math.round(chosen.headwaySeconds)-target),expected.error,`${id} ${frequencyMode} ${target}`);
      close(chosen.fleetMaintenance,expected.cost);assert.equal(chosen.unitsPerTrain,expected.k);
    }
  }
});
