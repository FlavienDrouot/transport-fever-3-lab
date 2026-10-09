import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withRoadModel,roadRoundTripMotion} from '../src/road-motion.js';
import {analyseRoadFleet,analyseTruckService,analysePassengerRoadService} from '../src/trucks.js';
import {travelBetweenStops} from '../src/line.js';
import {roadPhaseStory} from '../src/road-phases.js';
import {withRailProfile} from '../src/rail-motion.js';
import {reverseRouteProfile} from '../src/route-profile.js';
import {ROAD_MOTION,RAIL_MOTION,MOTION_UNITS} from '../src/gradient.js';
import {createModel} from '../src/model.js';
const trucks=JSON.parse(await readFile(new URL('../data/trucks.json',import.meta.url))).trucks;
const man=trucks.find(t=>t.id==='man-19304');
const close=(a,b)=>assert.ok(Math.abs(a-b)<Math.max(1,Math.abs(b))*1e-9,`${a} vs ${b}`);
test('road coefficients are independent; flat motion agrees initially with rail and preserves inversion',()=>{
 assert.notEqual(ROAD_MOTION,RAIL_MOTION);
 const road=withRoadModel(man).model,rail=createModel(man,MOTION_UNITS);
 for(const t of [1,2,5,10,100]){assert.deepEqual(road.stateAt(t),rail.stateAt(t));close(road.timeAt(road.stateAt(t).distanceKm),t);}
 assert.ok(road.stateAt(1).speedKmh>0&&road.stateAt(1).speedKmh<man.maxSpeedKmh);
 assert.ok(road.stateAt(100).speedKmh<=man.maxSpeedKmh);
 const adjusted=createModel(man,MOTION_UNITS,{motion:{...ROAD_MOTION,tractionFactor:1}});
 assert.ok(adjusted.stateAt(1).speedKmh<road.stateAt(1).speedKmh);
 assert.equal(adjusted.withGradient(2).withSpeedLimit(50).motionConfig.tractionFactor,1);
});
test('road service includes short-leg acceleration without braking or changing handling',()=>{
 const options={distanceKm:.1,fillRatio:.8};
 const [steady]=analyseTruckService([man],options),[motion]=analyseTruckService([man],{...options,motion:true});
 assert.ok(motion.travelSeconds>steady.travelSeconds);
 close(motion.loadingSeconds,steady.loadingSeconds);close(motion.unloadingSeconds,steady.unloadingSeconds);
 close(motion.roundTripSeconds-steady.roundTripSeconds,2*(motion.travelSeconds-steady.travelSeconds));
 const short=roadRoundTripMotion(man,options),long=roadRoundTripMotion(man,{distanceKm:10});
 assert.ok(short.peakSpeedKmh<man.maxSpeedKmh);close(long.peakSpeedKmh,man.maxSpeedKmh);
 const bus={...man,passengerCapacity:20};
 const [passenger]=analysePassengerRoadService([bus],{...options,motion:true});
 close(passenger.deliveredPerCycle,32);close(passenger.travelSeconds,motion.travelSeconds);
});
test('road caps apply at boundaries without braking; reversal swaps service legs',()=>{
 const profile=[{distanceKm:.6,gradePercent:2,speedLimitKmh:80},{distanceKm:.4,gradePercent:-1,speedLimitKmh:30}];
 const a=roadRoundTripMotion(man,{distanceKm:1,routeProfile:profile});
 const b=roadRoundTripMotion(man,{distanceKm:1,routeProfile:reverseRouteProfile(profile)});
 assert.equal(a.eligible,true);close(a.travelSeconds,b.travelSeconds);close(a.outboundTravelSeconds,b.returnTravelSeconds);
 const race=withRailProfile(withRoadModel(man),profile).model;
 close(race.timeAt(1),a.outboundTravelSeconds);assert.ok(race.stateAt(race.timeAt(1)).speedKmh>0);
 close(race.stateAt(race.timeAt(.6)).speedKmh,30);
 assert.equal(roadRoundTripMotion({...man,tractionKgf:100},{distanceKm:1,gradePercent:20}).eligible,false);
});
test('road phase costs match direct motion and fleet calculations at each swept distance',()=>{
 const vehicles=trucks.filter(t=>['man-19304','faw-j6p'].includes(t.id));
 for(const targets of [{},{demandPerYear:2000,maxHeadwaySeconds:120,frequencyMode:'maximum'}]){
  const options={motion:true,distanceKm:1,fillRatio:.8,...targets};
  const story=roadPhaseStory(vehicles,options,{start:.01,end:5});
  for(const x of [.02,.2,1,4])for(const row of analyseRoadFleet(vehicles,{...options,distanceKm:x}))close(story.valueAt(row.truck.id,x),row.costPerCargo);
 }
});

test('corrected MAN 19.304 observations support the provisional flat-road acceleration locally',()=>{
 const model=withRoadModel(man).model;
 for(const [ticks,observed] of [[10,31],[20,48],[50,80]])assert.ok(Math.abs(model.stateAt(ticks*.2).speedKmh-observed)<=1.1);
 assert.ok(model.speedCapSeconds<=10);
});

test('road braking is omitted for every vehicle in uniform and segmented service and Race',()=>{
 for(const vehicle of trucks.filter(t=>['man-19304','faw-j6p'].includes(t.id))){
  const model=withRoadModel(vehicle).model;
  const distanceKm=.1,travelSeconds=model.timeAt(distanceKm);
  const short=roadRoundTripMotion(vehicle,{distanceKm});
  close(short.travelSeconds,travelSeconds);
  close(short.peakSpeedKmh,model.stateAt(travelSeconds).speedKmh);
  const profile=roadRoundTripMotion(vehicle,{distanceKm,routeProfile:[{distanceKm:.05,gradePercent:0,speedLimitKmh:350},{distanceKm:.05,gradePercent:0,speedLimitKmh:349.999}]});
  assert.ok(Math.abs(short.travelSeconds-profile.travelSeconds)<.02);
  const rail=createModel(vehicle,MOTION_UNITS);
  assert.ok(travelBetweenStops({...vehicle,model:rail},{distanceKm}).travelSeconds>short.travelSeconds);
 }
 const profile=[{distanceKm:1,gradePercent:0,speedLimitKmh:80},{distanceKm:.2,gradePercent:0,speedLimitKmh:30}];
 const race=withRailProfile(withRoadModel(man),profile).model;
 assert.ok(race.stateAt(race.timeAt(.99)).speedKmh>79.9,'No advance braking');
 assert.equal(race.profileEvents.some(e=>e.label==='Braking'),false);
});

test('MAN uphill runs share grade scaling across road, rail and segmented motion',()=>{
 const road=withRoadModel(man),model=road.model.withGradient(10);
 const checkpoints=[[1,15],[2,29],[5,51],[10,73],[12.4,80]];
 for(const [seconds,speed] of checkpoints)assert.ok(Math.abs(model.stateAt(seconds).speedKmh-speed)<.6);
 assert.ok(Math.abs(model.speedCapSeconds-12.4)<=.2+1e-9);
 const route=[{distanceKm:.1,gradePercent:10,speedLimitKmh:80},{distanceKm:.9,gradePercent:10,speedLimitKmh:79.999}];
 const profile=withRailProfile(road,route).model;
 for(const [seconds] of checkpoints)assert.ok(Math.abs(profile.stateAt(seconds).speedKmh-model.stateAt(seconds).speedKmh)<.05);
 const uniform=roadRoundTripMotion(man,{distanceKm:1,gradePercent:10});
 const segmented=roadRoundTripMotion(man,{distanceKm:1,routeProfile:route});
 assert.ok(Math.abs(uniform.outboundTravelSeconds-segmented.outboundTravelSeconds)<.02);
 assert.ok(Math.abs(uniform.returnTravelSeconds-segmented.returnTravelSeconds)<.02);
 const rail=createModel(man,MOTION_UNITS,{gradePercent:10});
 assert.deepEqual(rail.stateAt(12.4),model.stateAt(12.4));
 const steeper=road.model.withGradient(20);
 for(const [seconds,speed] of [[1,14],[2,27],[5,48],[10,66],[16.4,80]])assert.ok(Math.abs(steeper.stateAt(seconds).speedKmh-speed)<.6);
 assert.ok(Math.abs(steeper.speedCapSeconds-16.4)<=.2+1e-9);
});
