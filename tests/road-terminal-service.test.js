import test from 'node:test';
import assert from 'node:assert/strict';
import {roadTerminalEstimate,sizeRoadTerminalFleet,ROAD_MANEUVER_SECONDS} from '../src/road-terminal-service.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${a} != ${b}`);

// Independent chronological oracle used only in tests, not in configuration searches.
function regularSerialWait(places,duration,headway,maneuver){
  let priorStart=-Infinity,priorBatchDeparture=0,total=0,count=0;
  for(let group=0;group<100;group++){
    for(let position=0;position<places;position++){
      const arrival=(group*places+position)*headway;
      const entry=Math.max(arrival,priorStart,position===0?priorBatchDeparture:0);
      const start=entry+maneuver;
      if(group>=20){total+=entry-arrival;count++;}
      priorStart=start;
    }
    priorBatchDeparture=priorStart+duration;
  }
  return total/count;
}

test('closed-form mean waits match serial access, including saturated arrivals and maneuver spacing',()=>{
  assert.equal(ROAD_MANEUVER_SECONDS,5);
  for(const places of [1,2,3,4,5])for(const duration of [15,45,120])for(const margin of [0,3,30]){
    const headway=duration/places+5+margin;
    const estimate=roadTerminalEstimate(duration,headway,{vehicleSlots:places});
    assert.equal(estimate.overloaded,false);
    close(estimate.waitingSeconds,regularSerialWait(places,duration,headway,5));
  }
  close(roadTerminalEstimate(45,30,{vehicleSlots:2}).waitingSeconds,10);
  assert.equal(roadTerminalEstimate(45,27,{vehicleSlots:2}).overloaded,true);
});

test('parallel access wins for 10 m vehicles, while a long platform can win for 12 m vehicles',()=>{
  const long10=roadTerminalEstimate(45,30,{vehicleSlots:4});
  const parallel10=roadTerminalEstimate(45,30,{vehicleSlots:4,platformCount:2});
  assert.ok(parallel10.maxVehiclesPerSecond>long10.maxVehiclesPerSecond);
  assert.ok(parallel10.waitingSeconds<long10.waitingSeconds);
  close(roadTerminalEstimate(45,30,{vehicleSlots:3}).maxVehiclesPerSecond*60,3);
  close(roadTerminalEstimate(45,30,{vehicleSlots:2,platformCount:2}).maxVehiclesPerSecond*60,2.4);
  const mixed=roadTerminalEstimate(45,30,{vehicleSlots:5,platformSlots:[2,3]});
  close(mixed.maxVehiclesPerSecond,2/55+3/60);
  assert.ok(mixed.waitingSeconds>=0);
});

test('fleet sizing includes waiting, actual demand-dependent load and maneuvering once per visit',()=>{
  const model={cycleSeconds:250,transferSeconds:120,transferSecondsA:80,transferSecondsB:40,fixedStopSeconds:4,maneuverSeconds:5,unitsPerCycle:40,yearSeconds:1460};
  const options={demandPerYear:1000,maxHeadwaySeconds:30,frequencyMode:'maximum'};
  const stops={stopA:{vehicleSlots:3},stopB:{vehicleSlots:2,platformCount:2}};
  const result=sizeRoadTerminalFleet(model,options,stops);
  close(result.count*result.headwaySeconds,result.cycleSeconds);
  close(model.unitsPerCycle*result.loadScale/result.headwaySeconds*model.yearSeconds,options.demandPerYear);
  close(result.cycleSeconds,model.cycleSeconds-model.transferSeconds+model.transferSeconds*result.loadScale+result.stopA.waitingSeconds+result.stopB.waitingSeconds);
  assert.ok(result.headwaySeconds<=30);
  assert.ok(result.stopA.waitingSeconds>0);
  const fewer=sizeRoadTerminalFleet(model,{...options,maxHeadwaySeconds:null},stops);
  assert.ok(fewer.count<=result.count);
});
