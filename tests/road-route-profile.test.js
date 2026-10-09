import test from 'node:test';
import assert from 'node:assert/strict';
import {roadGradientSpeeds} from '../src/gradient.js';
import {analyseTruckService,analysePassengerRoadService,analyseRoadFleet,renderTruckService,roadRouteSpeeds} from '../src/trucks.js';
import {roadPhaseStory,renderRoadPhases} from '../src/road-phases.js';

const truck={id:'strong',name:'Strong',year:2000,massTonnes:10,powerCh:400,tractionKgf:5000,
  maxSpeedKmh:100,cargoCapacity:30,passengerCapacity:25,loadingUnloadingSpeedMultiplier:4,
  economy:{annualMaintenance:24000},freightSpecialization:'general'};
const profile=[
  {distanceKm:2.347,gradePercent:20,speedLimitKmh:100},
  {distanceKm:1.236,gradePercent:-12,speedLimitKmh:45},
  {distanceKm:.087,gradePercent:0,speedLimitKmh:75},
];
const distanceKm=profile.reduce((total,part)=>total+part.distanceKm,0);
const options={distanceKm,routeProfile:profile,fillRatio:.8,roadSpeedLimit:10,gradePercent:0,
  stopA:{specializedTerminal:true},stopB:{specializedWarehouse:true}};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const seconds=parts=>parts.reduce((total,part)=>total+part.distanceKm/roadGradientSpeeds(truck,part.gradePercent,part.speedLimitKmh).outboundSpeedKmh*3600,0);

test('Road segment travel sums capped steady speeds, reverses grades on return and scales exact distances',()=>{
  const before=JSON.stringify(profile),outbound=seconds(profile);
  const back=seconds(profile.toReversed().map(part=>({...part,gradePercent:-part.gradePercent})));
  for(const analyse of [analyseTruckService,analysePassengerRoadService]){
    const baseline=analyse([truck],{...options,routeProfile:null,roadSpeedLimit:100})[0];
    for(const scale of [1,.037/distanceKm,4]){
      const row=analyse([truck],{...options,distanceKm:distanceKm*scale})[0];
      close(row.outboundTravelSeconds,outbound*scale);
      close(row.returnTravelSeconds,back*scale);
      close(row.travelSeconds,(outbound+back)/2*scale);
      close(row.roundTripSeconds,row.outboundTravelSeconds+row.returnTravelSeconds+row.loadingSeconds+row.unloadingSeconds+2*row.terminalDelaySeconds);
      assert.equal(row.loadingSeconds,baseline.loadingSeconds);
      assert.equal(row.unloadingSeconds,baseline.unloadingSeconds);
      assert.equal(row.deliveredPerCycle,baseline.deliveredPerCycle);
      assert.ok(row.effectiveSpeedKmh>10,'segment caps own speed even when the legacy road limit is smaller');
      assert.ok(row.outboundTravelSeconds>row.returnTravelSeconds,'long steep outbound section remains visible');
    }
  }
  assert.equal(JSON.stringify(profile),before);
});

test('A single road segment is the existing uniform model, including signed grades and 20 percent',()=>{
  for(const gradePercent of [-20,-4,0,4,20])for(const analyse of [analyseTruckService,analysePassengerRoadService]){
    const uniform={...options,routeProfile:null,gradePercent,roadSpeedLimit:75};
    const route={...uniform,roadSpeedLimit:10,gradePercent:0,routeProfile:[{distanceKm,gradePercent,speedLimitKmh:75}]};
    assert.deepEqual(analyse([truck],route),analyse([truck],uniform));
  }
});

test('Any unclimbable road segment excludes the vehicle in both trip directions',()=>{
  const weak={...truck,id:'weak',name:'Weak',tractionKgf:500},unknown={...truck,id:'unknown',massTonnes:undefined};
  for(const routeProfile of [profile,profile.toReversed().map(part=>({...part,gradePercent:-part.gradePercent}))]){
    for(const analyse of [analyseTruckService,analysePassengerRoadService])
      assert.deepEqual(analyse([weak,truck,unknown],{...options,routeProfile}).map(row=>row.truck.id),['strong']);
    assert.equal(roadRouteSpeeds(weak,{routeProfile}).eligible,false);
  }
  assert.throws(()=>analyseTruckService([truck],{...options,routeProfile:[{distanceKm:1,gradePercent:20.1,speedLimitKmh:75}]}),RangeError);
});

test('Segmented passenger and freight fleets retain target, utilization and handling semantics',()=>{
  for(const passenger of [false,true])for(const loadedReturn of [false,true])for(const frequencyMode of ['maximum','closest']){
    const targeted={...options,passenger,loadedReturn,frequencyMode,demandPerYear:3000,maxHeadwaySeconds:120};
    const row=analyseRoadFleet([truck],targeted)[0];
    close(row.deliveredPerYear,3000);
    close(row.costPerCargo,row.fleetMaintenance/3000);
    assert.ok(row.actualFillRatio>0&&row.actualFillRatio<=options.fillRatio);
    assert.ok(Number.isInteger(row.vehicleCount)&&row.vehicleCount>1);
    if(frequencyMode==='maximum')assert.ok(row.headwaySeconds<=120+1e-8);
    const direct=(passenger?analysePassengerRoadService:analyseTruckService)([truck],{...targeted,fillRatio:row.actualFillRatio})[0];
    close(row.roundTripSeconds,direct.roundTripSeconds);
    close(row.headwaySeconds,direct.roundTripSeconds/row.vehicleCount);
    close(row.outboundTravelSeconds,seconds(profile));
    if(passenger){assert.equal(row.handlingMultiplierA,1);assert.equal(row.handlingMultiplierB,1);}
  }
});

test('Road profile phase values match exact calculator sweeps for all axes and fleet targets',()=>{
  const vehicles=[truck,{...truck,id:'other',name:'Other',year:2010,powerCh:250,cargoCapacity:40,passengerCapacity:40,economy:{annualMaintenance:30000}}];
  for(const passenger of [false,true])for(const demandPerYear of [null,3000])for(const axis of ['distance','utilization','year']){
    const opts={...options,passenger,demandPerYear,maxHeadwaySeconds:120,frequencyMode:'closest'};
    const domain=axis==='year'?{start:1900,end:2035}:axis==='distance'?{start:.01,end:15}:{start:1,end:100};
    const story=roadPhaseStory(vehicles,opts,{axis,...domain});
    for(const x of axis==='year'?[2000,2035]:axis==='distance'?[.037,distanceKm,12]:[1,37,100]){
      const rows=analyseRoadFleet(vehicles,{...opts,...(axis==='distance'?{distanceKm:x}:axis==='utilization'?{fillRatio:x/100}:{})});
      for(const row of rows){
        if(axis==='year'&&row.truck.year>x)assert.equal(story.valueAt(row.truck.id,x),null);
        else close(story.valueAt(row.truck.id,x),row.costPerCargo);
      }
    }
  }
});

test('Profile road renders and phase eligibility use route segments and show direction-specific times',()=>{
  const nodes=Object.fromEntries(['truck-service-summary','truck-service-readout','truck-bars','road-service-caption','road-gradient-exclusions','road-travel-column',
    'road-phase-axis','road-cost-scale','road-rank-scale','road-phase-help','road-cost-phases-chart','road-rank-phases-chart']
    .map(id=>[id,{id,value:'focus',clientWidth:900,closest:()=>({classList:{toggle(){}}}),querySelector(){return {value:this.value};}}]));
  nodes['road-phase-axis'].value='distance';
  const document={getElementById:id=>nodes[id]},weak={...truck,id:'weak',name:'Weak',tractionKgf:500};
  renderTruckService(document,[truck,weak],options);
  assert.match(nodes['road-service-caption'].textContent,/3\.67 km per leg · 3 segments \(theoretical steady speeds\)/);
  assert.equal(nodes['road-travel-column'].textContent,'Travel A→B / B→A');
  assert.match(nodes['truck-service-readout'].innerHTML,/<td>\d+:\d+ \/ \d+:\d+<\/td>/);
  assert.doesNotMatch(nodes['truck-service-readout'].innerHTML,/Weak|NaN|Infinity/);
  assert.match(nodes['road-gradient-exclusions'].textContent,/Excluded on this route.*Weak/);
  renderRoadPhases(document,{trucks:[truck,weak],buses:[],trams:[],freightTrams:[]},{category:'freight',year:2035},options);
  assert.match(nodes['road-phase-help'].textContent,/All segment lengths scale together/);
  for(const id of ['road-cost-phases-chart','road-rank-phases-chart']){
    assert.match(nodes[id].innerHTML,/Strong/);assert.doesNotMatch(nodes[id].innerHTML,/Weak|NaN|Infinity/);
  }
});
