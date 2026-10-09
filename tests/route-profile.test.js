import test from 'node:test';
import assert from 'node:assert/strict';
import {createModel} from '../src/model.js';
import {MOTION_UNITS} from '../src/gradient.js';
import {routeTrajectory,routeRoundTrip,reverseRouteProfile,scaledRouteProfile,validateRouteProfile} from '../src/route-profile.js';
import {roundTripMotion,analyseService,serviceEligible} from '../src/line.js';
import {analyseFreightService} from '../src/rail-freight.js';
import {withRailProfile} from '../src/rail-motion.js';
import {pairCrossings} from '../src/race.js';
import {economicStory} from '../src/economic-crossovers.js';
import {crossoverStory,rankWindow} from '../src/crossovers.js';

const raw={id:'profile-test',name:'Profile test',year:2000,massTonnes:100,tractionKgf:20000,powerCh:1000,maxSpeedKmh:120,
  passengerCapacity:100,cargoCapacity:40,carCount:4,lengthMetres:80,loadingUnloadingSpeedMultiplier:3,
  formationLoadingUnloadingSpeedMultiplier:12,economy:{annualMaintenance:1460}};
const train={...raw,model:createModel(raw,MOTION_UNITS)};
const segment=(distanceKm,gradePercent=0,speedLimitKmh=350)=>({distanceKm,gradePercent,speedLimitKmh});
const near=(actual,expected,tolerance=.001)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} differs from ${expected}`);

test('one uniform segment retains the calibrated Race and service timings',()=>{
  for(const grade of [-9,0,5,9]){
    const profile=[segment(10,grade)];
    near(routeTrajectory(train,profile).travelSeconds,train.model.withGradient(grade).timeAt(10));
    near(routeRoundTrip(train,profile).travelSeconds,roundTripMotion(train,{distanceKm:10,gradePercent:grade}).travelSeconds);
  }
});

test('a 10 m route remains valid through Race, passenger and freight service, and economic phases',()=>{
  const distanceKm=.01,profile=[segment(distanceKm)];
  near(routeTrajectory(train,profile).travelSeconds,train.model.timeAt(distanceKm));
  near(routeRoundTrip(train,profile).travelSeconds,roundTripMotion(train,{distanceKm}).travelSeconds);
  assert.ok(Number.isFinite(analyseService(train,{distanceKm}).maintenancePerJourney));
  assert.ok(Number.isFinite(analyseFreightService(train,{distanceKm}).maintenancePerUnit));
  for(const routeProfile of [null,profile]){
    const story=economicStory([train],distanceKm,1,{routeProfile});
    assert.equal(story.start,.001);
    assert.equal(story.end,distanceKm);
    assert.equal(story.phases.length,1);
    assert.ok(Number.isFinite(story.valueAt(train.id,story.start)));
  }
  const ranking=rankWindow(crossoverStory([withRailProfile(train,profile)]),distanceKm/10);
  assert.equal(ranking.intervals.length,1);
  assert.equal(ranking.intervals[0].start,.001);
  assert.equal(ranking.intervals[0].end,distanceKm);
});

test('profile preserves speed and anticipates a lower segment limit',()=>{
  const profile=[segment(5,0,160),segment(5,0,100)];
  const motion=routeTrajectory(train,profile),boundary=motion.timeAt(5);
  assert.ok(motion.events.some(event=>event.label==='Segment 2'&&Math.abs(event.distanceKm-5)<1e-9));
  assert.ok(motion.events.some(event=>event.label==='Braking'));
  near(motion.stateAt(boundary).speedKmh,100,.001);
  assert.ok(motion.stateAt(boundary-.01).speedKmh>motion.stateAt(boundary).speedKmh);
  assert.ok(motion.stateAt(boundary+.01).speedKmh<=100.001);
  near(motion.timeAt(motion.stateAt(boundary-.01).distanceKm),boundary-.01,.02);
  assert.equal(motion.timeAt(10.01),Infinity);
});

test('A→B service stops at B and return reverses grades and limits',()=>{
  const profile=[segment(4,3,100),segment(6,-1,160)];
  assert.deepEqual(reverseRouteProfile(profile),[segment(6,1,160),segment(4,-3,100)]);
  const outbound=routeTrajectory(train,profile,{brakeAtEnd:true});
  const back=routeTrajectory(train,reverseRouteProfile(profile),{brakeAtEnd:true});
  near(outbound.stateAt(outbound.travelSeconds).speedKmh,0,1e-8);
  near(back.stateAt(back.travelSeconds).speedKmh,0,1e-8);
  const round=routeRoundTrip(train,profile);
  near(round.outboundTravelSeconds,outbound.travelSeconds,1e-8);
  near(round.returnTravelSeconds,back.travelSeconds,1e-8);
  near(round.travelSeconds,(outbound.travelSeconds+back.travelSeconds)/2,1e-8);
  assert.notEqual(round.outboundTravelSeconds,round.returnTravelSeconds);
});

test('equal total grade gain with different placement changes outbound travel time',()=>{
  const early=[segment(2,4),segment(8,-1)];
  const late=[segment(8,-1),segment(2,4)];
  assert.equal(early.reduce((sum,s)=>sum+s.distanceKm*s.gradePercent,0),late.reduce((sum,s)=>sum+s.distanceKm*s.gradePercent,0));
  assert.ok(Math.abs(routeTrajectory(train,early).travelSeconds-routeTrajectory(train,late).travelSeconds)>1);
});

test('a short steep ramp can be passed with momentum although the same uphill start fails',()=>{
  const weak={...raw,tractionKgf:2000,powerCh:2500};weak.model=createModel(weak,MOTION_UNITS);
  const flying=[segment(2,-2),segment(.1,4),segment(2,-2)];
  assert.equal(routeTrajectory(weak,[segment(.1,4)]).stalled,true);
  assert.equal(routeTrajectory(weak,flying).stalled,false);
  assert.equal(serviceEligible(weak,{routeProfile:flying}),true);
});

test('passenger and freight cycles use the same finite profile with fleet costs',()=>{
  const profile=[segment(4,2,100),segment(6,-1,160)];
  const options={distanceKm:10,routeProfile:profile,fillRatio:.8,infrastructureSpeedKmh:null};
  const passengers=analyseService(train,{...options,demandPerDirection:1000});
  const freight=analyseFreightService(train,{...options,demandPerYear:1000});
  assert.equal(passengers.eligible,true);assert.equal(freight.eligible,true);
  near(passengers.outboundTravelSeconds,freight.outboundTravelSeconds,1e-8);
  near(passengers.returnTravelSeconds,freight.returnTravelSeconds,1e-8);
  assert.ok(passengers.roundTripSeconds>2*passengers.travelSeconds);
  assert.ok(freight.roundTripSeconds>2*freight.travelSeconds);
  assert.ok(Number.isFinite(passengers.maintenancePerJourney));
  assert.ok(Number.isFinite(freight.maintenancePerUnit));
  near(scaledRouteProfile(profile,5).reduce((sum,p)=>sum+p.distanceKm,0),5,1e-9);
});

test('finite Race crossover roots cannot extrapolate beyond terminal B',()=>{
  const profile=[segment(2,0,160),segment(3,3,100)];
  const rival={...raw,id:'rival',powerCh:1600,massTonnes:130};rival.model=createModel(rival,MOTION_UNITS);
  const roots=pairCrossings(withRailProfile(train,profile),withRailProfile(rival,profile));
  assert.ok(roots.every(root=>root>=0&&root<=5));
});

test('profile validation rejects missing, nonfinite and out-of-range segment values',()=>{
  for(const bad of [[],[segment(0)],[segment(NaN)],[segment(1,9.1)],[segment(1,0,351)],Array.from({length:25},()=>segment(1))])
    assert.throws(()=>validateRouteProfile(bad),RangeError);
});
