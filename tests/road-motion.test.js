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
test('road service includes short-leg acceleration and braking without changing handling',()=>{
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
test('road segment caps are anticipated; reversal swaps service legs and Race does not stop at B',()=>{
 const profile=[{distanceKm:.6,gradePercent:2,speedLimitKmh:80},{distanceKm:.4,gradePercent:-1,speedLimitKmh:30}];
 const a=roadRoundTripMotion(man,{distanceKm:1,routeProfile:profile});
 const b=roadRoundTripMotion(man,{distanceKm:1,routeProfile:reverseRouteProfile(profile)});
 assert.equal(a.eligible,true);close(a.travelSeconds,b.travelSeconds);close(a.outboundTravelSeconds,b.returnTravelSeconds);
 const race=withRailProfile(withRoadModel(man),profile).model;
 assert.ok(race.timeAt(1)<a.outboundTravelSeconds);assert.ok(race.stateAt(race.timeAt(1)).speedKmh>0);
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

test('MAN natural-stop repeat sets road braking independently for uniform and segmented services',()=>{
 const measuredSpeed=80/3.6;
 const ticks=measuredSpeed/ROAD_MOTION.brakingDeceleration/ROAD_MOTION.stepSeconds;
 assert.ok(Math.abs(ticks-18)<.1);
 const short=roadRoundTripMotion(man,{distanceKm:.1});
 const profile=roadRoundTripMotion(man,{distanceKm:.1,routeProfile:[{distanceKm:.05,gradePercent:0,speedLimitKmh:80},{distanceKm:.05,gradePercent:0,speedLimitKmh:79.999}]});
 // The tiny cap difference selects the numerical profile path without materially
 // changing speed: both service paths must use the road braking coefficient.
 assert.ok(Math.abs(short.travelSeconds-profile.travelSeconds)<.02);
 const oldRoad=createModel(man,MOTION_UNITS,{motion:{...ROAD_MOTION,brakingDeceleration:2.5}});
 const train=createModel(man,MOTION_UNITS);
 // Default rail stop timing remains tied to 2.5 m/s².
 const railStop=travelBetweenStops({...man,model:train},{distanceKm:.1});
 const previousRoadStop=travelBetweenStops({...man,model:oldRoad},{distanceKm:.1});
 close(railStop.travelSeconds,previousRoadStop.travelSeconds);
 assert.ok(short.travelSeconds<railStop.travelSeconds);
});

test('displayed 10% MAN run fits road grade scaling in uniform and segmented motion; rail stays unscaled',()=>{
 const road=withRoadModel(man),model=road.model.withGradient(10);
 const checkpoints=[[1,15],[2,29],[5,51],[10,73],[12.4,80]];
 for(const [seconds,speed] of checkpoints)assert.ok(Math.abs(model.stateAt(seconds).speedKmh-speed)<.5);
 close(model.speedCapSeconds,12.4);
 const route=[{distanceKm:.1,gradePercent:10,speedLimitKmh:80},{distanceKm:.9,gradePercent:10,speedLimitKmh:79.999}];
 const profile=withRailProfile(road,route).model;
 for(const [seconds] of checkpoints)assert.ok(Math.abs(profile.stateAt(seconds).speedKmh-model.stateAt(seconds).speedKmh)<.05);
 const uniform=roadRoundTripMotion(man,{distanceKm:1,gradePercent:10});
 const segmented=roadRoundTripMotion(man,{distanceKm:1,routeProfile:route});
 assert.ok(Math.abs(uniform.outboundTravelSeconds-segmented.outboundTravelSeconds)<.02);
 assert.ok(Math.abs(uniform.returnTravelSeconds-segmented.returnTravelSeconds)<.02);
 const rail=createModel(man,MOTION_UNITS,{gradePercent:10});
 assert.ok(Math.abs(rail.stateAt(12.4).speedKmh-65.66114199040541)<1e-9);
});
