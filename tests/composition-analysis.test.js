import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {buildConsist,railComponents} from '../src/consists.js';
import {analyseComposition,compositionServiceOptions,compositionChartSeries,compositionDistanceHorizons,compositionChartScales,compositionCurveLayout} from '../src/composition-analysis.js';
import {motionTransitions} from '../src/motion-chart.js';
import {gradientAcceleration} from '../src/gradient.js';
import {analyseEconomicService} from '../src/rail-freight.js';
import {GAME_YEAR_SECONDS,travelBetweenStops} from '../src/line.js';
import {withRailGradient,withRailSpeedLimit} from '../src/rail-motion.js';

const [trains,locomotives,passengers,freight]=await Promise.all(['trains','rail-locomotives','rail-passenger-wagons','rail-freight-wagons'].map(async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)))));
const catalogue=railComponents({locomotives:locomotives.locomotives,passengerWagons:passengers.wagons,freightWagons:freight.wagons,multipleUnits:trains.trains});
const settings={distanceKm:10,fillRatio:1,gradePercent:0,desiredFlow:null,maxHeadwaySeconds:null,frequencyMode:'maximum',infrastructureSpeedKmh:350,platformLengthMetres:null,loadedReturn:false,stopA:{},stopB:{}};
const draft=(category='freight',quantity=8)=>buildConsist({schemaVersion:1,id:'draft',name:'Unsaved draft',carrier:'rail',category,cargo:'all',components:[
  {componentId:catalogue.find(c=>c.name==='German Class 185').id,quantity:1},
  {componentId:catalogue.find(c=>c.role==='wagon'&&c.maxSpeedKmh>=140&&(category==='freight'?c.cargoCapacity>0&&c.freightSpecialization==='general':c.passengerCapacity>0)).id,quantity}
]},catalogue,trains.source);

test('Unsaved composition analysis exactly matches Economics for passenger and freight targets',()=>{
  for(const category of ['passengers','freight'])for(const loadedReturn of [false,true]){
    const train=draft(category),options={...settings,desiredFlow:3000,maxHeadwaySeconds:150,fillRatio:.8,loadedReturn,stopA:{specializedTerminal:true}};
    const before=JSON.stringify(train),analysis=analyseComposition(train,options);
    const expected=analyseEconomicService(train,compositionServiceOptions(train,options));
    assert.deepEqual(analysis.service,expected);
    const currentPoint=analysis.points.find(p=>p.x===options.distanceKm);
    if(currentPoint)assert.deepEqual(currentPoint.service,analyseEconomicService(train,{...analysis.options,distanceKm:options.distanceKm}));
    else assert.ok(options.distanceKm>analysis.maximumDistance);
    assert.equal(analysis.service.unitsPerTrain,1);
    assert.equal(JSON.stringify(train),before);
    assert.equal(category==='freight'?analysis.serviceOptions.demandPerYear:analysis.serviceOptions.demandPerDirection,3000);
  }
});

test('Speed uses A→B motion while time plots the entire round trip including handling',()=>{
  const train=draft(),options={...settings,gradePercent:1};
  const analysis=analyseComposition(train,options);
  const motion=withRailGradient(withRailSpeedLimit(train,options.infrastructureSpeedKmh),1).model;
  assert.equal(analysis.speedPoints[0].y,0);
  assert.equal(analysis.speedPoints.at(-1).y,motion.stateAt(motion.timeAt(analysis.speedMaximumDistance)).speedKmh);
  assert.ok(analysis.service.outboundTravelSeconds>analysis.service.returnTravelSeconds);
  const time=compositionChartSeries(analysis,'time');
  assert.equal(time.length,1);
  for(let i=0;i<time[0].points.length;i++){
    const p=analysis.points[i];
    assert.equal(time[0].points[i].x,2*p.x);
    assert.equal(time[0].points[i].y,p.service.roundTripSeconds);
    assert.equal(p.service.roundTripSeconds,p.service.outboundTravelSeconds+p.service.returnTravelSeconds+p.service.stationSecondsA+p.service.stationSecondsB);
  }
  assert.ok(analysis.service.outboundTravelSeconds>motion.timeAt(10),'service includes final braking');
});

test('Round-trip cost counts passenger journeys on both legs and deliveries on loaded legs',()=>{
  for(const category of ['passengers','freight'])for(const loadedReturn of [false,true]){
    const result=analyseComposition(draft(category),{...settings,desiredFlow:3000,fillRatio:.7,maxHeadwaySeconds:150,loadedReturn});
    const curve=compositionChartSeries(result,'cost')[0];
    for(let i=0;i<curve.points.length;i++){
      const p=result.points[i],s=p.service;
      const cycleCost=s.fleetMaintenance/s.trainCount*s.roundTripSeconds/GAME_YEAR_SECONDS;
      const units=category==='passengers'?2*s.passengers:s.deliveredPerCycle;
      assert.equal(curve.points[i].x,2*p.x);
      assert.ok(Math.abs(curve.points[i].y-cycleCost/units)<1e-8);
      if(category==='passengers')assert.ok(Math.abs(2*curve.points[i].y-cycleCost/s.passengers)<1e-8,'one passenger making a return trip would cost twice as much');
    }
  }
});

test('Round-trip graph selected distance corresponds to twice the one-way route input',()=>{
  const result=analyseComposition(draft('passengers'),{...settings,distanceKm:.5});
  for(const view of ['time','cost']){
    const current=compositionChartSeries(result,view)[0].points.find(p=>p.x===1);
    assert.ok(current);
    assert.equal(current.y,view==='time'?result.service.roundTripSeconds:result.service.maintenancePerUnit);
  }
});

test('Changing wagon count changes travel, capacity and service economics without saving',()=>{
  const small=analyseComposition(draft('freight',2),{...settings,desiredFlow:5000});
  const large=analyseComposition(draft('freight',12),{...settings,desiredFlow:5000});
  assert.ok(large.service.capacityPerTrain>small.service.capacityPerTrain);
  assert.ok(large.service.travelSeconds>small.service.travelSeconds);
  assert.notEqual(large.service.fleetMaintenance,small.service.fleetMaintenance);
});

test('An overlong composition retains acceleration analysis and explains service exclusion',()=>{
  const train=draft(),result=analyseComposition(train,{...settings,platformLengthMetres:train.lengthMetres-1});
  assert.match(result.message,/exceeds.*platform limit/);
  assert.equal(result.service,null);assert.ok(result.points.length>0);
  assert.ok(result.speedPoints.length>0);
});

test('A train unable to start uphill produces an explanation, not an infinite curve',()=>{
  const train=draft('freight',1000),analysis=analyseComposition(train,{...settings,gradePercent:9});
  assert.match(analysis.message,/cannot start/);
  assert.equal(analysis.service,null);assert.equal(analysis.speedPoints.length,0);assert.equal(analysis.points.length,0);
  const downhill=analyseComposition(train,{...settings,gradePercent:-9});
  assert.ok(downhill.speedPoints.length>0);assert.equal(downhill.service,null,'return must also be feasible');
});

test('Zero utilization preserves time and speed but never invents a unit cost',()=>{
  const train=draft(),analysis=analyseComposition(train,{...settings,fillRatio:0});
  assert.ok(analysis.service.travelSeconds>0);
  assert.equal(analysis.service.maintenancePerUnit,null);
  assert.ok(compositionChartSeries(analysis,'cost')[0].points.every(p=>p.y===null));
  const targeted=analyseComposition(train,{...settings,fillRatio:0,desiredFlow:1000});
  assert.equal(targeted.service,null);assert.match(targeted.message,/positive occupancy/);
});

test('Empty and incomplete drafts have a useful empty state',()=>{
  assert.equal(analyseComposition(null,settings).empty,true);
  assert.equal(analyseComposition({serviceReady:false},settings).empty,true);
});

test('Distance sweep is bounded and remains fast with grade and fleet constraints',()=>{
  const train=draft(),started=performance.now();
  for(const gradePercent of [0,1,4,9,-4]){
    const result=analyseComposition(train,{...settings,gradePercent,desiredFlow:10000,maxHeadwaySeconds:120});
    assert.ok(result.points.length<=82);assert.ok(result.speedPoints.length<=84);
    for(const p of result.points)assert.ok(Number.isFinite(p.service.roundTripSeconds));
  }
  assert.ok(performance.now()-started<1500,'bounded single-draft sweeps must not freeze interaction');
});

test('Transient domains stay fixed when the configured route is shorter or much longer',()=>{
  const train=draft(),short=analyseComposition(train,{...settings,distanceKm:.5}),long=analyseComposition(train,{...settings,distanceKm:100});
  assert.equal(short.speedMaximumDistance,long.speedMaximumDistance);
  assert.equal(short.maximumDistance,long.maximumDistance);
  assert.ok(long.maximumDistance<100);
  assert.ok(long.speedPoints.every(p=>p.x<=long.speedMaximumDistance));
  assert.ok(long.points.every(p=>p.x<=long.maximumDistance));
  assert.notEqual(short.service.travelSeconds,long.service.travelSeconds,'full route summary remains exact');
  assert.equal(long.service.outboundTravelSeconds,analyseEconomicService(train,compositionServiceOptions(train,{...settings,distanceKm:100})).outboundTravelSeconds);
  assert.deepEqual(short.points.find(p=>p.x===.5).service,short.service,'selected route within the view is sampled exactly');
});

test('Speed domain covers both transitions and stops at the practical equilibrium approach',()=>{
  const train=draft('freight',20),options={...settings,gradePercent:9};
  const result=analyseComposition(train,options);
  assert.ok(result.train.model.asymptoticSpeed);
  const end=motionTransitions(result.train,'speed-distance').at(-1);
  assert.equal(end.label,'99% equilibrium');
  assert.ok(result.speedMaximumDistance>=end.x);
  assert.ok(result.speedMaximumDistance<result.train.model.speedCapKm,'long numerical asymptote tail is excluded');
  assert.ok(result.speedPoints.some(p=>p.x===end.x),'phase point is sampled exactly');
});

test('Time/cost horizon includes acceleration and braking for both route directions',()=>{
  const train=draft(),options={...settings,gradePercent:-1};
  const horizons=compositionDistanceHorizons(train,options);
  for(const grade of [1,-1]){
    const model=withRailGradient(withRailSpeedLimit(train,options.infrastructureSpeedKmh),grade).model;
    const state=model.stateAt(model.speedViewSeconds);
    const required=state.distanceKm+(state.speedKmh/3.6)**2/(2*(2.5+gradientAcceleration(grade))*1000);
    assert.ok(horizons.maximumDistance>=required);
    assert.ok(horizons.maximumDistance>=horizons.speedMaximumDistance);
  }
});

test('Combined view uses shared round-trip lengths, actual peak service speed and independent coloured scales',()=>{
  const result=analyseComposition(draft('passengers'),{...settings,distanceKm:.0005});
  const series=compositionChartSeries(result,'combined'),scales=compositionChartScales(series);
  assert.equal(series.length,3);assert.equal(new Set(series.map(s=>s.color)).size,3);
  assert.deepEqual(series.map(s=>s.key),['peak-speed','time','cost']);
  assert.ok(series[0].points.some(p=>p.x===.001),'sub-metre route selection is sampled exactly');
  for(let i=0;i<result.points.length;i++){
    const p=result.points[i];
    assert.deepEqual(series.map(s=>s.points[i].x),[2*p.x,2*p.x,2*p.x]);
    assert.equal(series[0].points[i].y,p.service.peakSpeedKmh);
    assert.equal(series[1].points[i].y,p.service.roundTripSeconds);
    assert.equal(series[2].points[i].y,p.service.maintenancePerUnit);
  }
  for(let i=0;i<3;i++){
    const maximum=Math.max(...series[i].points.map(p=>p.y));
    assert.equal(scales[i].max,maximum*1.03);
    assert.ok(Math.abs(scales[i].position(maximum)-1/1.03)<1e-12);
  }
  assert.ok(result.points.some(p=>p.x<.01),'distance sampling includes the early transients');
});

test('Combined view retains speed and time when cost is undefined at zero utilization',()=>{
  const result=analyseComposition(draft(),{...settings,fillRatio:0});
  const series=compositionChartSeries(result,'combined'),scales=compositionChartScales(series);
  assert.ok(series[0].points.every(p=>Number.isFinite(p.y)));
  assert.ok(series[1].points.every(p=>Number.isFinite(p.y)));
  assert.ok(series[2].points.every(p=>p.y===null));
  assert.ok(scales.every(s=>Number.isFinite(s.max)));
});

test('Fixed-utilization quick analysis draws time/cost once and preserves both scales and values',()=>{
  for(const category of ['passengers','freight'])for(const loadedReturn of [false,true])for(const maxHeadwaySeconds of [null,30]){
    const analysis=analyseComposition(draft(category),{...settings,fillRatio:.6,loadedReturn,maxHeadwaySeconds});
    const layout=compositionCurveLayout(analysis,'combined');
    assert.equal(layout.mergedTimeCost,true);
    assert.deepEqual(layout.curveIndices,[0,1]);
    assert.equal(layout.series.length,3);
    assert.equal(layout.series[1].color,layout.series[2].color);
    assert.match(layout.series[1].name,/time.*cost/);
    assert.deepEqual(layout.series[2].points,compositionChartSeries(analysis,'cost')[0].points);
    const scales=compositionChartScales(layout.series);
    for(let i=0;i<analysis.points.length;i++)assert.ok(Math.abs(scales[1].position(layout.series[1].points[i].y)-scales[2].position(layout.series[2].points[i].y))<1e-9);
  }
});

test('A rate target affects route results while quick analysis keeps fixed-utilization time and cost proportional',()=>{
  for(const category of ['passengers','freight']){
    const analysis=analyseComposition(draft(category),{...settings,desiredFlow:3000});
    const layout=compositionCurveLayout(analysis,'combined');
    assert.equal(layout.mergedTimeCost,true);assert.deepEqual(layout.curveIndices,[0,1]);
    assert.equal(layout.series[1].color,layout.series[2].color);
    for(const view of ['time','cost'])assert.deepEqual(compositionCurveLayout(analysis,view).curveIndices,[0]);
  }
  const zero=compositionCurveLayout(analyseComposition(draft(),{...settings,fillRatio:0}),'combined');
  assert.equal(zero.mergedTimeCost,false);assert.deepEqual(zero.curveIndices,[0,1]);
});


test('Signed gradients expose each service leg and share one speed scale without masking the slow leg',()=>{
  for(const category of ['passengers','freight'])for(const gradePercent of [-1.4,1.4]){
    const train=draft(category),options={...settings,gradePercent};
    const analysis=analyseComposition(train,options),series=compositionChartSeries(analysis,'combined');
    const speeds=series.filter(s=>s.axis==='Speed');
    assert.equal(speeds.length,2);
    const scales=compositionChartScales(series);
    assert.equal(scales[0],scales[3]);
    const limited=withRailSpeedLimit(train,options.infrastructureSpeedKmh);
    for(const index of [0,Math.floor(analysis.points.length/2),analysis.points.length-1]){
      const point=analysis.points[index];
      const out=travelBetweenStops(withRailGradient(limited,gradePercent),{distanceKm:point.x});
      const back=travelBetweenStops(withRailGradient(limited,-gradePercent),{distanceKm:point.x});
      assert.equal(speeds[0].points[index].y,out.peakSpeedKmh);
      assert.equal(speeds[1].points[index].y,back.peakSpeedKmh);
      assert.equal(point.service.peakSpeedKmh,Math.max(out.peakSpeedKmh,back.peakSpeedKmh));
    }
    assert.ok(speeds[0].points.some((p,i)=>Math.abs(p.y-speeds[1].points[i].y)>1e-6));
    assert.deepEqual(compositionCurveLayout(analysis,'combined').curveIndices,[0,3,1]);
    const targeted=analyseComposition(train,{...options,desiredFlow:3000});
    assert.deepEqual(compositionCurveLayout(targeted,'combined').curveIndices,[0,3,1]);
  }
  const flat=compositionChartSeries(analyseComposition(draft(),settings),'combined');
  assert.equal(flat.filter(s=>s.axis==='Speed').length,1);
});


test('Normalized diagram preserves speed and compares per-train transport output and one-way-kilometre cost',()=>{
  for(const category of ['passengers','freight'])for(const desiredFlow of [null,3000]){
    const analysis=analyseComposition(draft(category),{...settings,desiredFlow,gradePercent:1.4});
    const normalized=compositionChartSeries(analysis,'normalized');
    for(let i=0;i<analysis.normalizedPoints.length;i++){
      const {x,service}=analysis.normalizedPoints[i];
      const rate=category==='freight'?service.deliveredPerYear:service.perDirectionJourneysPerYear;
      assert.equal(normalized[0].points[i].x,2*x);
      assert.equal(normalized[0].points[i].y,service.outboundPeakSpeedKmh);
      assert.equal(normalized[3].points[i].y,service.returnPeakSpeedKmh);
      assert.equal(normalized[1].points[i].x,2*x);
      assert.equal(normalized[1].points[i].y,rate/service.trainCount*x);
      assert.equal(normalized[2].points[i].y,service.maintenancePerUnit/x);
    }
    assert.equal(compositionCurveLayout(analysis,'normalized').mergedTimeCost,false);
    assert.deepEqual(compositionCurveLayout(analysis,'normalized').curveIndices,[0,3,1,2]);
  }
  const zero=compositionChartSeries(analyseComposition(draft(),{...settings,fillRatio:0}),'normalized');
  assert.ok(zero[1].points.every(p=>p.y===0));
  assert.ok(zero[2].points.every(p=>p.y===null));
});

test('Normalized window amortizes stops and keeps near-zero cost on a finite logarithmic scale',()=>{
  const analysis=analyseComposition(draft('passengers'),settings);
  const series=compositionChartSeries(analysis,'normalized'),scales=compositionChartScales(series);
  assert.ok(analysis.normalizedMaximumDistance>analysis.maximumDistance);
  assert.equal(2*analysis.normalizedPoints[0].x,.01,'normalized plot starts at 10 m round trip');
  assert.ok(series[1].points.at(-1).y>=analysis.steady.transportOutputPerYear*.99);
  assert.ok(series[2].points.at(-1).y<=analysis.steady.costPerUnitKm*1.01);
  assert.equal(scales[2].mode,'log');
  for(const point of series[2].points)assert.ok(Number.isFinite(scales[2].position(point.y)));
  assert.ok(Number.isFinite(scales[2].position(analysis.steady.costPerUnitKm)));
  const selected=analysis.normalizedPoints.find(p=>p.x===settings.distanceKm);
  assert.deepEqual(selected.service,analysis.service);
});

test('Steady and transient composition analysis is independent of fleet targets and platform constraints',()=>{
  for(const category of ['passengers','freight']){
    const train=draft(category),reference=analyseComposition(train,settings);
    for(const constraints of [
      {desiredFlow:3000},
      {maxHeadwaySeconds:30,frequencyMode:'closest'},
      {desiredFlow:3000,maxHeadwaySeconds:30,frequencyMode:'maximum'},
      {platformLengthMetres:train.lengthMetres-1},
    ]){
      const analysis=analyseComposition(train,{...settings,...constraints});
      assert.deepEqual(analysis.steady,reference.steady);
      assert.equal(analysis.normalizedMaximumDistance,reference.normalizedMaximumDistance);
      for(const view of ['combined','normalized'])
        assert.deepEqual(compositionChartSeries(analysis,view),compositionChartSeries(reference,view));
      assert.ok(analysis.points.every(p=>p.service.trainCount===1));
    }
    const targeted=analyseComposition(train,{...settings,desiredFlow:3000,maxHeadwaySeconds:30});
    assert.ok(targeted.service.trainCount>reference.service.trainCount,'route service still sizes the fleet');
    assert.ok(targeted.service.actualOccupancyRatio<settings.fillRatio,'route service still adjusts utilization');
  }
});
