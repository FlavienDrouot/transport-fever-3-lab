import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createModel} from '../src/model.js';
import {MOTION_UNITS,gradientAcceleration,roadGradientSpeeds} from '../src/gradient.js';
import {withRailGradient,withRailSpeedLimit} from '../src/rail-motion.js';
import {analyseService,roundTripMotion,travelBetweenStops,serviceEligible} from '../src/line.js';
import {analyseFreightService} from '../src/rail-freight.js';
import {analyseTruckService,analyseRoadFleet} from '../src/trucks.js';
import {roadPhaseStory} from '../src/road-phases.js';
import {economicSelection,economicEmptyContent} from '../src/economic-selection.js';

const units=MOTION_UNITS;
const raw={id:'test',name:'Test',year:2000,massTonnes:100,tractionKgf:20000,powerCh:1000,maxSpeedKmh:120,
  passengerCapacity:100,cargoCapacity:40,carCount:4,lengthMetres:80,loadingUnloadingSpeedMultiplier:3,
  formationLoadingUnloadingSpeedMultiplier:12,economy:{annualMaintenance:1460}};
const train={...raw,model:createModel(raw,units)};
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} != ${b}`);

// Unoptimized step-by-step reference, independent of the model's compact table
// and bulk constant-traction shortcut. Service termination is bounded to one step.
function numericalMotion(vehicle,grade,{seconds=null,distanceKm=null}={}) {
  const mass=vehicle.massTonnes*1000,force=2*vehicle.tractionKgf*9.80665,power=vehicle.powerCh*735.5;
  const gravity=9.80665*Math.sin(Math.atan(grade/100)),resistance=.02+gravity;
  const terminal=resistance>0?power/mass/resistance:Infinity;
  const cap=Math.min(vehicle.maxSpeedKmh/3.6,terminal*(1-1e-8));
  let time=0,speed=0,distance=0;const dt=.2,brake=2.5+gravity;
  while(seconds!==null?time<seconds-1e-9:distance+speed*speed/(2*brake)<distanceKm*1000) {
    const h=seconds===null?dt:Math.min(dt,seconds-time);
    const acceleration=Math.min(force,speed>0?power/speed:Infinity)/mass-resistance;
    const next=Math.min(cap,speed+h*acceleration);
    if(distanceKm!==null&&distance+h*(speed+next)/2+next*next/(2*brake)>=distanceKm*1000){
      let low=0,high=h;
      for(let k=0;k<50;k++){
        const s=(low+high)/2,v=speed+(next-speed)*s/h;
        const x=distance+speed*s+(next-speed)*s*s/(2*h);
        if(x+v*v/(2*brake)<distanceKm*1000)low=s;else high=s;
      }
      const s=(low+high)/2,v=speed+(next-speed)*s/h;
      return {travelSeconds:time+s+v/brake};
    }
    distance+=h*(speed+next)/2;speed=next;time+=h;
    assert.ok(time<10000,'numerical reference must terminate');
  }
  return {speedKmh:speed*3.6,distanceKm:distance/1000,travelSeconds:time+speed/brake};
}

test('Signed grade follows independent force integration, caps and inverse timing',()=>{
  for(const grade of [-20,-9,-.1,.1,5,9,20]) {
    const model=createModel(raw,units,{gradePercent:grade});
    for(const seconds of [10,50,300]) {
      const reference=numericalMotion(raw,grade,{seconds}),state=model.stateAt(seconds);
      close(state.speedKmh,reference.speedKmh,2e-5);close(state.distanceKm,reference.distanceKm,2e-5);
      close(model.timeAt(state.distanceKm),seconds);
      assert.ok(state.speedKmh<=raw.maxSpeedKmh+1e-8);
    }
    for(const seconds of [model.tractionEndSeconds,model.speedCapSeconds,model.speedCapSeconds+100]) {
      assert.ok(Number.isFinite(seconds));close(model.timeAt(model.stateAt(seconds).distanceKm),seconds);
    }
  }
  assert.ok(createModel(raw,units,{gradePercent:5}).timeAt(1)>train.model.timeAt(1));
  assert.ok(createModel(raw,units,{gradePercent:-5}).timeAt(1)<train.model.timeAt(1));
  const uphill=createModel(raw,units,{gradePercent:9});
  const terminal=raw.powerCh*735.5/(raw.massTonnes*1000*(.02+9.80665*Math.sin(Math.atan(.09))))*3.6;
  close(uphill.stateAt(10000).speedKmh,terminal,2e-8);
});

test('Near-zero gradients converge to the calibrated flat model; invalid inputs are rejected',()=>{
  for(const grade of [-1e-8,1e-8])for(const km of [.001,1,10])close(createModel(raw,units,{gradePercent:grade}).timeAt(km),train.model.timeAt(km));
  assert.deepEqual(createModel(raw,units,{gradePercent:0}).stateAt(300),train.model.stateAt(300));
  for(const grade of [NaN,Infinity,20.1])assert.throws(()=>createModel(raw,units,{gradePercent:grade}),RangeError);
  assert.throws(()=>withRailGradient(train,20.1),RangeError);
  assert.throws(()=>analyseTruckService([raw],{distanceKm:1,gradePercent:-20.1}),RangeError);
});

test('Short and cruising service legs include gravity during acceleration and braking',()=>{
  for(const grade of [-9,5])for(const distanceKm of [.01,1,20]) {
    const vehicle=withRailGradient(train,grade),motion=travelBetweenStops(vehicle,{distanceKm});
    const reference=numericalMotion(raw,grade,{distanceKm});
    assert.ok(Math.abs(motion.travelSeconds-reference.travelSeconds)<1e-7);
    close(motion.brakingSeconds,motion.peakSpeedKmh/3.6/(2.5+gradientAcceleration(grade)));
  }
  assert.throws(()=>travelBetweenStops(withRailGradient(train,-9),{distanceKm:1,brakingDeceleration:.1}),RangeError);
});

test('A–B–A uses opposite grades, capped infrastructure and identical empty mass for both services',()=>{
  for(const gradePercent of [0,5,-5,9,-9]) {
    const options={distanceKm:10,gradePercent,infrastructureSpeedKmh:100,demandPerDirection:1000};
    const passenger=analyseService(train,options),freight=analyseFreightService(train,{...options,demandPerYear:1000});
    const motion=roundTripMotion(withRailSpeedLimit(train,100),options);
    for(const field of ['outboundTravelSeconds','returnTravelSeconds','travelSeconds']) {
      close(passenger[field],motion[field]);close(freight[field],motion[field]);
    }
    assert.ok(passenger.peakSpeedKmh<=100+1e-8);
    close(passenger.maintenancePerJourney,passenger.fleetMaintenance/(passenger.perDirectionJourneysPerYear*2));
    const reverse=analyseFreightService(train,{...options,gradePercent:-gradePercent,demandPerYear:1000});
    close(reverse.roundTripSeconds,freight.roundTripSeconds);close(reverse.returnTravelSeconds,freight.outboundTravelSeconds);
  }
  const flat=analyseService(train,{distanceKm:10}),graded=analyseService(train,{distanceKm:10,gradePercent:9});
  assert.ok(graded.roundTripSeconds>flat.roundTripSeconds);
  assert.strictEqual(withRailGradient(train,5),withRailGradient(train,5));
  assert.equal(train.model.gradePercent,0);
});

test('Stalled trains never enter service or phase cohorts; a downhill race can still start',()=>{
  const weak={...raw,tractionKgf:1000};weak.model=createModel(weak,units);
  assert.equal(withRailGradient(weak,9).model.canStart,false);
  assert.equal(withRailGradient(weak,9).model.timeAt(1),Infinity);
  assert.equal(withRailGradient(weak,-9).model.canStart,true);
  assert.equal(serviceEligible(weak,{gradePercent:-9}),false);
  assert.equal(analyseService(weak,{distanceKm:1,gradePercent:9}).eligible,false);
  assert.equal(analyseFreightService(weak,{distanceKm:1,gradePercent:-9}).eligible,false);
  const selection=economicSelection([weak],new Set([weak.id]),{gradePercent:9});
  assert.equal(selection.empty,'gradient');assert.deepEqual(selection.eligible,[]);assert.deepEqual(selection.phaseItems,[]);
  assert.match(economicEmptyContent('gradient',false),/Adjust gradient/);
});

test('Road power limits uphill steady speed; the round trip swaps times without changing cost',()=>{
  const truck={...raw,massTonnes:10,tractionKgf:4000,powerCh:20,loadingUnloadingSpeedMultiplier:3};
  const options={distanceKm:2,gradePercent:20,fillRatio:.8};
  const speeds=roadGradientSpeeds(truck,20,80);
  const uphill=20*735.5/(10000*9.80665*Math.sin(Math.atan(.2)))*3.6;
  close(speeds.outboundSpeedKmh,uphill);assert.equal(speeds.returnSpeedKmh,80);
  const [row]=analyseTruckService([truck],{...options,roadSpeedLimit:80});
  close(row.outboundTravelSeconds,7200/uphill);close(row.returnTravelSeconds,90);
  close(row.travelSeconds*2,row.outboundTravelSeconds+row.returnTravelSeconds);
  const [reverse]=analyseTruckService([truck],{...options,gradePercent:-20,roadSpeedLimit:80});
  close(reverse.costPerCargo,row.costPerCargo);close(reverse.outboundTravelSeconds,row.returnTravelSeconds);
  const fleet=analyseRoadFleet([truck],{...options,demandPerYear:1000})[0];
  close(fleet.fleetMaintenance/fleet.deliveredPerYear,fleet.costPerCargo);
  assert.ok(fleet.vehicleCount>1);
});

test('Road phase curves use the same graded cycle and remove blocked or unknown vehicles',()=>{
  const weak={...raw,id:'weak',tractionKgf:1},unknown={...raw,id:'unknown',massTonnes:undefined};
  const options={distanceKm:1,gradePercent:20};
  assert.equal(roadGradientSpeeds(weak,20).eligible,false);
  assert.equal(roadGradientSpeeds(unknown,20).eligible,false);
  // Flat calculations remain available for legacy inputs without mechanical fields.
  assert.equal(analyseTruckService([unknown],{distanceKm:1}).length,1);
  const strong={...raw,id:'strong',tractionKgf:30000};
  for(const axis of ['distance','year','utilization']) {
    const story=roadPhaseStory([weak,unknown,strong],options,{axis,start:axis==='year'?1990:1,end:axis==='year'?2035:10});
    assert.equal(story.valueAt('weak',5),null);assert.equal(story.valueAt('unknown',5),null);
    assert.ok(story.phases.every(p=>p.leaders.every(id=>id==='strong')));
    const x=axis==='year'?2005:5;
    const actual=analyseTruckService([strong],{...options,...(axis==='distance'?{distanceKm:x}:axis==='utilization'?{fillRatio:x/100}:{})})[0];
    close(story.valueAt('strong',x),actual.costPerCargo);
  }
});

test('All captured road vehicles have the mechanical inputs needed for the theoretical gradient',async()=>{
  for(const filename of ['trucks','buses','trams']) {
    const data=JSON.parse(await readFile(new URL(`../data/${filename}.json`,import.meta.url)));
    for(const collection of Object.values(data).filter(Array.isArray))for(const vehicle of collection)if(vehicle.maxSpeedKmh) {
      for(const field of ['massTonnes','powerCh','tractionKgf'])assert.ok(Number.isFinite(vehicle[field])&&vehicle[field]>0,`${vehicle.name}: ${field}`);
    }
  }
});
