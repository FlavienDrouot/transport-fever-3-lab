import {UI_TERMS} from './ui-terms.js';
import {analyseEconomicService} from './rail-freight.js';
import {serviceEligible,GAME_YEAR_SECONDS} from './line.js';
import {withRailGradient,withRailSpeedLimit} from './rail-motion.js';
import {motionTransitions,renderMotionTransitions} from './motion-chart.js';
import {mountChartInteractions} from './chart-interactions.js';
import {mountControlHelp} from './control-help.js';
import {escapeHtml as escape,formatNumber,formatTime} from './format.js';
import {createScale} from './scales.js';
import {speedDistanceHorizon} from './race.js';
import {gradientAcceleration} from './gradient.js';
import {routeProfileDistance} from './route-profile.js';

/** Adapt shared route settings to the draft category, never automatically couple it. */
export function compositionServiceOptions(train,settings) {
  const {desiredFlow=null,...options}=settings;
  return {...options,allowMultipleUnits:false,freight:train.category==='freight',
    ...(settings.routeProfile?{distanceKm:routeProfileDistance(settings.routeProfile),infrastructureSpeedKmh:null}:{}),
    ...(train.category==='freight'?{demandPerYear:desiredFlow}:{demandPerDirection:desiredFlow})};
}

/** Display domains depend on acceleration/braking, never on the configured route length. */
export function compositionDistanceHorizons(train,settings) {
  const limited=withRailSpeedLimit(train,settings.infrastructureSpeedKmh);
  const outbound=withRailGradient(limited,settings.gradePercent);
  const legs=[outbound,withRailGradient(limited,-settings.gradePercent)];
  const braking=settings.brakingDeceleration??2.5;
  const approachDistances=legs.filter(t=>t.model.canStart!==false).map(t=>{
    const state=t.model.stateAt(t.model.speedViewSeconds??t.model.speedCapSeconds);
    // A stop-to-stop service needs room both to accelerate and to brake.
    const deceleration=braking+gradientAcceleration(t.model.gradePercent??0);
    return state.distanceKm+(state.speedKmh/3.6)**2/(2*deceleration*1000);
  });
  return {speedMaximumDistance:outbound.model.canStart===false ? .1 : speedDistanceHorizon([outbound]),
    maximumDistance:Math.max(.1,...approachDistances)*1.05};
}

/** Cruise-only reference at the utilization setting, averaged over both directions.
 * Distance-dependent fleet/rate targets and terminal handling belong to route results.
 */
export function compositionSteadyRunning(train,settings) {
  const limited=withRailSpeedLimit(train,settings.infrastructureSpeedKmh);
  const speeds=[settings.gradePercent??0,-(settings.gradePercent??0)].map(grade=>{
    const model=withRailGradient(limited,grade).model;
    return model.canStart===false?0:model.effectiveMaxSpeedKmh??limited.maxSpeedKmh;
  });
  const secondsPerKm=speeds.every(v=>v>0)?speeds.reduce((sum,v)=>sum+3600/v,0)/2:null;
  const freight=train.category==='freight';
  const unitsPerCycle=(freight?train.cargoCapacity:train.passengerCapacity)*(settings.fillRatio??1)*
    (freight?1+Number(settings.loadedReturn??false):2);
  const costPerUnitKm=secondsPerKm!==null&&unitsPerCycle>0?
    train.economy.annualMaintenance*2*secondsPerKm/(GAME_YEAR_SECONDS*unitsPerCycle):null;
  // Rate keeps the service convention: passengers per direction, total freight deliveries.
  // Multiplying by one-way distance removes route length in the cruise-only limit.
  const transportOutputPerYear=secondsPerKm===null?null:
    unitsPerCycle*GAME_YEAR_SECONDS/(2*secondsPerKm)*(freight?1:.5);
  return {outboundSpeedKmh:speeds[0],returnSpeedKmh:speeds[1],secondsPerKm,costPerUnitKm,transportOutputPerYear,freight};
}

export function renderCompositionSteadySummary(root,analysis) {
  const s=analysis.steady;
  if(!s){root.replaceChildren();return;}
  const different=Math.abs(s.outboundSpeedKmh-s.returnSpeedKmh)>1e-6;
  const rows=[
    [different?'Maximum speed A→B / B→A':'Maximum speed',different?
      `${formatNumber(s.outboundSpeedKmh,1)} / ${formatNumber(s.returnSpeedKmh,1)} km/h`:`${formatNumber(s.outboundSpeedKmh,1)} km/h`],
    [`${UI_TERMS.rate} × distance`,s.transportOutputPerYear===null?'—':`${formatNumber(s.transportOutputPerYear,0)} ${UI_TERMS.capacityUnit}·km/year${s.freight?'':'/direction'}`,
      'Transport output at steady speed: doubling distance halves Rate, so Rate × distance stays constant.'],
    [`Cost / ${UI_TERMS.capacityUnit} / km`,
      s.costPerUnitKm===null?'—':`$${formatNumber(s.costPerUnitKm,4)}`]
  ];
  root.innerHTML=`<dl class="consist-totals">${rows.map(([label,value,help])=>`<div><dt>${label}${help?` <button class="control-info" type="button" title="${escape(help)}" aria-label="Help: Rate × distance">ⓘ</button>`:''}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  if(root.ownerDocument)mountControlHelp(root.ownerDocument,root);
}

/** Reuse the service engine for exact readouts and bounded distance samples. */
export function analyseComposition(train,settings,{samples=81}={}) {
  if(!train?.serviceReady)return {empty:true,message:'Add a powered vehicle and compatible capacity to analyse your composition.'};
  const serviceOptions=compositionServiceOptions(train,settings),distance=serviceOptions.distanceKm;
  // Composition curves describe one train at the chosen utilization. Fleet targets
  // and platform constraints apply only to the selected-route service summary.
  const {routeProfile,...uniformOptions}=serviceOptions;
  const options={...uniformOptions,infrastructureSpeedKmh:settings.infrastructureSpeedKmh,demandPerYear:null,demandPerDirection:null,
    maxHeadwaySeconds:null,frequencyMode:'maximum',platformLengthMetres:null};
  const motionTrain={...withRailGradient(withRailSpeedLimit(train,settings.infrastructureSpeedKmh),settings.gradePercent),color:'#2385ad'};
  const {speedMaximumDistance,maximumDistance}=compositionDistanceHorizons(train,settings);
  const canStart=motionTrain.model.canStart!==false;
  const speedDistances=new Set(Array.from({length:samples},(_,i)=>speedMaximumDistance*i/(samples-1)));
  if(distance<=speedMaximumDistance)speedDistances.add(distance);
  for(const transition of motionTransitions(motionTrain,'speed-distance'))if(transition.x<=speedMaximumDistance)speedDistances.add(transition.x);
  const speedPoints=canStart?[...speedDistances].sort((a,b)=>a-b).map(x=>({x,y:motionTrain.model.stateAt(motionTrain.model.timeAt(x)).speedKmh})):[];
  let service=null,message='';
  if(!serviceEligible(train,serviceOptions))message=settings.platformLengthMetres!==null&&train.lengthMetres>settings.platformLengthMetres?
    `Train length ${formatNumber(train.lengthMetres,1)} m exceeds the ${formatNumber(settings.platformLengthMetres,1)} m platform limit.`:
    settings.routeProfile?'This composition cannot complete the configured route profile.':
    'This composition cannot start against resistance on the uphill leg of the round trip.';
  else {
    try{service=analyseEconomicService(train,serviceOptions);}catch(error){if(!(error instanceof RangeError))throw error;message=error.message;}
  }
  const analysisReady=serviceEligible(train,options);
  // Service curves stop around the approach to the limit on the slower leg, including braking.
  // No fixed lower distance cutoff: quadratic spacing resolves the near-origin transients.
  // Zero-length routes have no physical service; the graph starts at the first positive sample.
  const distances=new Set(Array.from({length:samples},(_,i)=>maximumDistance*((i+1)/samples)**2));
  if(distance>0&&distance<=maximumDistance)distances.add(distance);
  const points=analysisReady?[...distances].sort((a,b)=>a-b).map(x=>({x,service:analyseEconomicService(train,{...options,distanceKm:x})})):[];
  const steady=compositionSteadyRunning(train,settings);
  const services=new Map(points.map(p=>[p.x,p.service]));
  const serviceAt=x=>{
    if(!services.has(x))services.set(x,analyseEconomicService(train,{...options,distanceKm:x}));
    return services.get(x);
  };
  // Economic convergence needs to amortize station handling and motion overhead,
  // well beyond the acceleration horizon, at fixed utilization for one train.
  let normalizedMaximumDistance=maximumDistance;
  if(analysisReady&&steady.transportOutputPerYear>0&&steady.costPerUnitKm>0){
    for(let i=0;i<32;i++){
      const baseline=serviceAt(normalizedMaximumDistance);
      const rate=options.freight?baseline.deliveredPerYear:baseline.perDirectionJourneysPerYear;
      if(rate/baseline.trainCount*normalizedMaximumDistance>=steady.transportOutputPerYear*.99&&
        baseline.maintenancePerUnit/normalizedMaximumDistance<=steady.costPerUnitKm*1.01)break;
      if(i<31)normalizedMaximumDistance*=2;
    }
  }
  // Ten metres of total round-trip length keeps the logarithmic domain useful.
  const minimum=.005;
  const normalizedDistances=new Set(Array.from({length:samples},(_,i)=>i===0?minimum:i===samples-1?normalizedMaximumDistance:
    minimum*(normalizedMaximumDistance/minimum)**(i/(samples-1))));
  if(distance>=minimum&&distance<=normalizedMaximumDistance)normalizedDistances.add(distance);
  const normalizedPoints=analysisReady?[...normalizedDistances].sort((a,b)=>a-b).map(x=>({x,service:serviceAt(x)})):[];
  return {train:motionTrain,service,message,speedPoints,points,normalizedPoints,distance,speedMaximumDistance,
    maximumDistance,normalizedMaximumDistance,options,serviceOptions,steady};
}

export function compositionChartSeries(analysis,view) {
  if(view==='speed')return [{key:'speed',name:'A→B acceleration',axis:'Speed',unit:'km/h',color:'#2385ad',points:analysis.speedPoints}];
  const graded=!!analysis.options.gradePercent;
  const points=view==='normalized'?analysis.normalizedPoints:analysis.points;
  const peak={key:'peak-speed',name:graded?'Peak speed A→B':'Peak speed during the round trip',axis:'Speed',
    readoutLabel:graded?'Speed A→B':'Speed',unit:'km/h',color:'#2385ad',
    points:points.map(p=>({x:2*p.x,y:graded?p.service.outboundPeakSpeedKmh:p.service.peakSpeedKmh}))};
  const back={key:'return-speed',name:'Peak speed B→A',axis:'Speed',readoutLabel:'Speed B→A',unit:'km/h',color:'#7c60b7',dash:'3 3',
    points:points.map(p=>({x:2*p.x,y:p.service.returnPeakSpeedKmh}))};
  const time={key:'time',name:'Round-trip time incl. handling',axis:'Time',unit:'m:ss',color:'#bd6b22',dash:'6 3',
    points:points.map(p=>({x:2*p.x,y:p.service.roundTripSeconds}))};
  const cost={key:'cost',name:`Round-trip cost / ${UI_TERMS.capacityUnit}`,axis:'Cost',unit:'$',color:'#137968',dash:'2 2',
    points:points.map(p=>({x:2*p.x,y:p.service.maintenancePerUnit}))};
  if(view==='normalized'){
    const output={key:'transport-output',name:'Rate × distance / train',axis:'Rate × distance',unit:'capacity·km/year',
      color:'#bd6b22',dash:'6 3',reference:analysis.steady.transportOutputPerYear,points:points.map(p=>({x:2*p.x,
        y:(analysis.options.freight?p.service.deliveredPerYear:p.service.perDirectionJourneysPerYear)/p.service.trainCount*p.x}))};
    const costPerKm={...cost,key:'cost-per-km',name:`Cost / ${UI_TERMS.capacityUnit} / km`,unit:'$/km',scaleMode:'log',reference:analysis.steady.costPerUnitKm,
      points:points.map(p=>({x:2*p.x,y:p.service.maintenancePerUnit===null?null:p.service.maintenancePerUnit/p.x}))};
    return [peak,output,costPerKm,...(graded?[back]:[])];
  }
  return view==='combined'?[peak,time,cost,...(graded?[back]:[])]:[view==='time'?time:cost];
}

/** Each physical quantity has its own domain, even when curves share a plot. */
export function compositionChartScales(series) {
  const scales=new Map();
  for(const s of series){
    if(scales.has(s.axis))continue;
    const grouped=series.filter(other=>other.axis===s.axis);
    const finite=grouped.flatMap(other=>other.points.map(p=>p.y)).filter(Number.isFinite);
    const references=grouped.map(other=>other.reference).filter(v=>Number.isFinite(v)&&v>0);
    const values=[...finite,...references],maximum=values.length?Math.max(1e-9,...values)*1.03:1;
    const positive=values.filter(v=>v>0);
    const mode=s.scaleMode==='log'&&positive.length?'log':'linear';
    scales.set(s.axis,createScale(mode,maximum,mode==='log'?Math.min(...positive)*.95:1));
  }
  return series.map(s=>scales.get(s.axis));
}

/** One physical curve can carry both time and cost scales at fixed utilization. */
export function compositionCurveLayout(analysis,view) {
  let series=compositionChartSeries(analysis,view);
  const scales=compositionChartScales(series);
  const fixedFill=analysis.options.demandPerYear==null&&analysis.options.demandPerDirection==null;
  const mergedTimeCost=view==='combined'&&fixedFill&&series[1].points.length>0&&series[1].points.every((p,i)=>{
    const cost=series[2].points[i];
    return Number.isFinite(p.y)&&Number.isFinite(cost.y)&&p.x===cost.x&&
      Math.abs(scales[1].position(p.y)-scales[2].position(cost.y))<1e-9;
  });
  if(mergedTimeCost)series=series.map((s,i)=>i===1?{...s,name:'Round-trip time / unit running cost'}:
    i===2?{...s,color:series[1].color,dash:series[1].dash}:s);
  const curveIndices=series.map((s,i)=>i).filter(i=>!(mergedTimeCost&&i===2)&&series[i].points.some(p=>Number.isFinite(p.y)))
    .sort((a,b)=>Number(series[b].axis==='Speed')-Number(series[a].axis==='Speed')||a-b);
  return {series,curveIndices,mergedTimeCost};
}

export function renderCompositionSummary(root,analysis) {
  const s=analysis.service;
  if(!s){root.replaceChildren();return;}
  const freight=analysis.options.freight;
  const throughput=freight?s.deliveredPerYear:s.perDirectionJourneysPerYear;
  const profile=!!analysis.serviceOptions.routeProfile;
  const rows=[['Travel A→B / B→A',`${formatTime(s.outboundTravelSeconds)} / ${formatTime(s.returnTravelSeconds)}`],
    [profile?'Peak service speed A→B / B→A':'Peak service speed',profile?
      `${formatNumber(s.outboundPeakSpeedKmh,1)} / ${formatNumber(s.returnPeakSpeedKmh,1)} km/h`:
      `${formatNumber(s.peakSpeedKmh,1)} km/h`],['Round trip incl. handling',formatTime(s.roundTripSeconds)],
    ['Trains',`${s.trainCount} ${s.trainCount===1?'train':'trains'}`],[UI_TERMS.frequency,formatTime(s.headwaySeconds)],
    [UI_TERMS.rate,`${formatNumber(throughput,0)} ${UI_TERMS.capacityUnit}/year${freight?'':'/direction'}`],
    [UI_TERMS.utilization,`${formatNumber(s.actualOccupancyRatio*100,1)}%`],[UI_TERMS.runningCosts,`$${formatNumber(s.fleetMaintenance,0)}/year`],
    [`Cost / ${UI_TERMS.capacityUnit}`,s.maintenancePerUnit===null?'—':`$${formatNumber(s.maintenancePerUnit,2)}`]];
  root.innerHTML=`<dl class="consist-totals">${rows.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

export function renderCompositionChart(root,analysis,view) {
  const {series,curveIndices,mergedTimeCost}=compositionCurveLayout(analysis,view),normalized=view==='normalized',combined=view==='combined'||normalized;
  if(!series.some(s=>s.points.some(p=>Number.isFinite(p.y)))){
    root.textContent=view==='cost'&&analysis.service?'No transported units at zero utilization. Choose positive utilization to show running cost.':analysis.message||'Complete your composition to display this analysis.';return;
  }
  const width=Math.max(300,root.clientWidth||900),height=width<600?300:340;
  const left=combined?(width<600?43:65):70,right=combined?(width<600?115:155):20,top=combined?52:35,bottom=height-55;
  const maxDistance=view==='speed'?analysis.speedMaximumDistance:2*(normalized?analysis.normalizedMaximumDistance:analysis.maximumDistance);
  const selectedDistance=view==='speed'?analysis.distance:2*analysis.distance;
  const distanceLabel=view==='speed'?'Distance travelled':'Round-trip length';
  const scales=compositionChartScales(series);
  const axisIndices=series.map((s,i)=>i).filter(i=>series.findIndex(s=>s.axis===series[i].axis)===i);
  const distanceScale=createScale(normalized?'log':'linear',maxDistance,normalized?series[0].points[0].x:1);
  const sx=x=>left+distanceScale.positionUnbounded(x)*(width-left-right);
  const formatDistance=x=>normalized&&x>0&&x<.001?x.toPrecision(2):formatNumber(x,3);
  const sy=(index,y)=>bottom-scales[index].position(y)*(bottom-top);
  const formatY=(s,y)=>s.key==='time'?formatTime(y):s.key==='cost'||s.key==='cost-per-km'?`$${formatNumber(y,2)}${s.key==='cost-per-km'?'/km':''}`:
    s.key==='transport-output'?`${formatNumber(y,1)} capacity·km/year${analysis.options.freight?'':'/direction'}`:`${formatNumber(y,1)} km/h`;
  const ordinate=normalized?'Peak speed, transport output per train and cost per kilometre':combined?'Peak speed, round-trip time and cost':view==='speed'?'Speed (km/h)':view==='time'?'Round-trip time incl. handling (m:ss)':`Round-trip cost / ${UI_TERMS.capacityUnit} ($)`;
  let svg=`<title>${escape(ordinate)} over ${distanceLabel.toLowerCase()}</title><desc>${view==='speed'?'Acceleration without final braking along A to B.':'A–B–A cycles with acceleration, braking and handling at both terminals. Peak speed is the maximum reached in the cycle. Costs count journeys or deliveries across both legs.'}${combined?' Each quantity uses its own coloured vertical scale.':''}${normalized?' Distance and cost use logarithmic scales. The window includes station-handling amortization and the approach to the fixed-utilization reference. Rate multiplied by one-way distance is per train, per direction for passengers and across loaded legs for freight. Cost is divided by one-way distance; speed includes final braking.':''}${mergedTimeCost?' At fixed utilization, time and cost are proportional and share one orange curve with two scales.':''}</desc><rect width="${width}" height="${height}" fill="white"/>`;
  if(!combined)svg+=`<text x="${left}" y="19">${escape(ordinate)}</text>`;
  for(let tick=0;tick<=5;tick++){
    const y=bottom-tick/5*(bottom-top);
    svg+=`<line x1="${left}" x2="${width-right}" y1="${y}" y2="${y}" stroke="#e4e8e4" stroke-dasharray="2 5"/>`;
    axisIndices.forEach(index=>{
      const s=series[index];
      const x=!combined||index===0?left-8:index===1?width-right+10:width-48;
      const anchor=!combined||index===0?'end':'start';
      const value=scales[index].invert(tick/5);
      const label=!s.points.some(p=>Number.isFinite(p.y))?'—':s.key==='time'?formatTime(value):value.toLocaleString('en-GB',{notation:combined?'compact':'standard',maximumFractionDigits:1});
      svg+=`<text class="composition-axis" x="${x}" y="${y+4}" text-anchor="${anchor}" style="fill:${s.color};font-size:${combined?10:12}px">${label}</text>`;
    });
  }
  if(combined)axisIndices.forEach(index=>{
    const s=series[index];
    const x=index===0?left-8:index===1?width-right+10:width-48,anchor=index===0?'end':'start';
    svg+=`<line x1="${index===0?left:x-4}" x2="${index===0?left:x-4}" y1="${top}" y2="${bottom}" stroke="${s.color}" opacity=".5"/><text class="composition-axis" x="${x}" y="18" text-anchor="${anchor}" style="fill:${s.color};font-size:${normalized&&width<600?8:11}px;font-weight:600">${s.axis}${scales[index].mode==='log'?' (log)':''}</text><text class="composition-axis" x="${x}" y="33" text-anchor="${anchor}" style="fill:${s.color};font-size:${normalized&&width<600?8:10}px">${s.unit}</text>`;
  });
  for(let i=0;i<=5;i++){const x=distanceScale.invert(i/5);svg+=`<text x="${sx(x)}" y="${bottom+23}" text-anchor="middle">${formatDistance(x)}</text>`;}
  if(selectedDistance>=distanceScale.min&&selectedDistance<=maxDistance)svg+=`<line x1="${sx(selectedDistance)}" x2="${sx(selectedDistance)}" y1="${top}" y2="${bottom}" stroke="#8a5f2b" stroke-dasharray="6 5"/><text x="${Math.max(left,sx(selectedDistance)-4)}" y="${top-5}" text-anchor="${selectedDistance<maxDistance*.25?'start':'end'}">${formatNumber(selectedDistance,3)} km ${view==='speed'?'route':'round trip'}</text>`;
  curveIndices.forEach(index=>{
    const s=series[index];
    let path='',pen=false;
    const stepped=s.key==='cost'&&(analysis.options.demandPerYear!=null||analysis.options.demandPerDirection!=null);
    for(const p of s.points){if(!Number.isFinite(p.y)){pen=false;continue;}path+=`${pen?(stepped?'H':'L'):'M'}${sx(p.x).toFixed(2)}${pen&&stepped?' V':','}${sy(index,p.y).toFixed(2)} `;pen=true;}
    const id=`${analysis.train.id}:${s.key}`;
    svg+=`<path class="train-curve" data-train="${escape(id)}" d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-dasharray="${s.dash||''}"/><path data-train="${escape(id)}" d="${path}" fill="none" stroke="transparent" stroke-width="14" tabindex="0" role="img" aria-label="${escape(s.name)}"><title>${escape(s.name)}</title></path>`;
  });
  svg+=`<text x="${(left+width-right)/2}" y="${height-8}" text-anchor="middle">${distanceLabel} (km${normalized?' · log':''})</text><g class="composition-inspection" pointer-events="none"></g><g class="motion-transition-overlay" pointer-events="none"></g>`;
  root.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(ordinate)} over ${distanceLabel.toLowerCase()}">${svg}</svg><div class="composition-chart-toolbar"><div class="composition-chart-legend train-legend">${curveIndices.map(i=>series[i]).map(s=>`<span data-train="${escape(`${analysis.train.id}:${s.key}`)}" style="color:${s.color}"><i style="--train-color:${s.color};border-top-style:${s.dash?'dashed':'solid'}"></i>${s.name}</span>`).join('')}</div><output class="composition-chart-readout" aria-live="off"></output></div>${combined&&series[2].points.every(p=>p.y===null)?'<p class="chart-help">Cost unavailable at zero utilization; other measures remain visible.</p>':''}`;
  const overlay=root.querySelector('.motion-transition-overlay');
  mountChartInteractions(root,{group:'composition',onHighlight:id=>{overlay.innerHTML=view==='speed'&&id?renderMotionTransitions(analysis.train,{view:'speed-distance',sx,sy:y=>sy(0,y),left,right:width-right,top,bottom}):'';overlay.parentNode.appendChild(root.querySelector('.composition-inspection'));overlay.parentNode.appendChild(overlay);}});
  const graph=root.querySelector('svg'),readout=root.querySelector('output'),inspection=root.querySelector('.composition-inspection');
  let inspectedIndex=0;
  graph.setAttribute('tabindex','0');
  graph.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight Home End');
  function inspect(index){
    const x=series[0].points[index].x;
    readout.innerHTML=`<span>${formatDistance(x)} km${view==='speed'?'':' round trip'}</span>${series.map(s=>`<span style="color:${s.color}">${s.readoutLabel??s.axis}: ${Number.isFinite(s.points[index].y)?formatY(s,s.points[index].y):'—'}</span>`).join('')}`;
    inspectedIndex=index;
    inspection.innerHTML=`<line x1="${sx(x)}" x2="${sx(x)}" y1="${top}" y2="${bottom}" stroke="#758079" stroke-dasharray="3 4"/>${curveIndices.map(i=>{const s=series[i];return Number.isFinite(s.points[index].y)?`<circle data-train="${escape(`${analysis.train.id}:${s.key}`)}" cx="${sx(x)}" cy="${sy(i,s.points[index].y)}" r="4" fill="${s.color}" stroke="white"/>`:'';}).join('')}`;
  }
  graph.addEventListener('keydown',event=>{
    const last=series[0].points.length-1;
    const next={ArrowLeft:Math.max(0,inspectedIndex-1),ArrowRight:Math.min(last,inspectedIndex+1),Home:0,End:last}[event.key];
    if(next===undefined)return;
    event.preventDefault();readout.setAttribute('aria-live','polite');inspect(next);
  });
  graph.addEventListener('pointermove',event=>{
    readout.setAttribute('aria-live','off');
    const rect=event.currentTarget.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,((event.clientX-rect.left)*width/rect.width-left)/(width-left-right))),x=distanceScale.invert(fraction);
    const nearest=series[0].points.reduce((best,p,i)=>Math.abs(p.x-x)<Math.abs(series[0].points[best].x-x)?i:best,0);inspect(nearest);
  });
  inspect(series[0].points.reduce((best,p,i)=>Math.abs(p.x-selectedDistance)<Math.abs(series[0].points[best].x-selectedDistance)?i:best,0));
}
