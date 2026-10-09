import {ANALYSIS_VIEWS,initialNavigation,resolveNavigation} from './navigation.js';
import {mountServiceControls,syncRouteSpeedControls} from './service-controls.js';
import {UI_TERMS} from './ui-terms.js';
import {motionValue,motionStateAtAbscissa,motionTransitions,renderMotionTransitions,renderModelTransitions,speedOrdinateMaximum,motionCurveEnd} from './motion-chart.js';
import {mountGradientControl} from './gradient-control.js';
import {mountRouteProfileControls,renderRouteProfileStatus} from './route-profile-control.js';
import {createRouteSelection,mountRouteChoice} from './route-selection.js';
import {canClimbRail} from './gradient.js';
import {createDataLoader} from './data-loader.js';
import {mountControlHelp} from './control-help.js';
import {validateNumberInputs,syncNumberInput,mountDistanceControl,mountYearControl} from './numeric-controls.js';
import {mountChartInteractions,setChartHighlight} from './chart-interactions.js';
import {escapeHtml as escape, formatNumber} from './format.js';
import {renderPhaseDiagram,rankPhaseSegments,observePhaseHighlight} from './phase-diagram.js';
import {renderRoadPhases} from './road-phases.js';
import {mountTablePreviews,updateTablePreview} from './table-preview.js';
import {syncAnalysisPanels,mountPanelDrawers} from './panels.js';
import {mountVehicleSelector,selectAll,selectResults} from './vehicle-selector.js';
import {mountTransportCategory,mountFreightFilter,speedPresets} from './transport-category.js';
import {renderServiceSummary} from './service-summary.js';
import {styleVehicleCatalogues} from './vehicle-styles.js';
import {mountSourceCatalogue} from './source-catalogue.js';
import {tramComponents,railComponents} from './consists.js';
import {mountConsistEditor} from './consist-editor.js';
import {mountCompositionAnalysis} from './composition-analysis-controls.js';
import {renderTruckService, selectRoadVehicles} from './trucks.js';
import {renderDataView} from './data-view.js';
import {curveLabels, trainLegend} from './chart-labels.js';
import {economicStory,yearRankingStory} from './economic-crossovers.js';
import {withRailSpeedLimit,withRailGradient,withRailProfile} from './rail-motion.js';
import {renderEconomicCrossovers} from './economic-crossover-chart.js';
import {renderEconomicChart} from './economic-chart.js';
import {serviceEligible} from './line.js';
import {analyseEconomicService as analyseLine} from './rail-freight.js';
import {economicCandidates,economicSelection,economicEmptyContent} from './economic-selection.js';
import {withRoadModel} from './road-motion.js';
import {createModel} from './model.js';
import {createScale} from './scales.js';
import {createPhaseScale, leadershipWeights} from './phase-scale.js';
import {crossoverStory, leaderCurveWindow, rankWindow} from './crossovers.js';
import {formatTime} from './format.js';
import {raceHorizon, speedHorizon, speedDistanceHorizon} from './race.js';
const $ = id => document.getElementById(id);
const loadData=createDataLoader(fetch,import.meta.url);
let roadLoaded=false,roadLoading,configurationLoading,dataLoading,sourceMounted=false,updateRoadCategory;
const fmt = (n, digits = 1) => formatNumber(n,digits,true);
const fmtKm = n => formatNumber(n,n<.01?4:n<.1?3:n<1?2:1);
const scaleMode = (axis, kind = 'race') => document.querySelector(`input[name="${kind === 'speed' ? 'speed-' : ''}${axis}-scale"]:checked`).value;
const views = {
  distance: {title: 'Distance over time', x: 'Time since departure (m:ss)', y: 'Distance travelled (km)', unit: 's', xFloor: 10, yFloor: .1, yUnit: 'km', help: 'The highest curve shows the leading vehicle.'},
  speed: {title: 'Speed over time', x: 'Time since departure (m:ss)', y: 'Speed (km/h)', unit: 's', xFloor: 10, yFloor: 10, yUnit: 'km/h', help: 'The curves show how each vehicle accelerates to its top speed.'},
  'speed-distance': {title:'Speed over distance',x:'Distance travelled (km)',y:'Speed (km/h)',unit:'km',xFloor:.1,yFloor:10,yUnit:'km/h',help:'The curves show how each vehicle accelerates along the route.'},
  time: {title: 'Time over distance', x: 'Distance travelled (km)', y: 'Time since departure (m:ss)', unit: 'km', xFloor: .1, yFloor: 10, yUnit: 's', help: 'The lowest curve shows the vehicle that reaches the distance first.'}
};
let speedView='speed';
let economicStoryKey, currentEconomicStory;
let navigation=initialNavigation(),liveComposition=null,comparisonComposition=null,profileControl;
let consistEditor,compositionAnalysis,raceGradientControl,baseTrains,trainSelector,roadSelector;
let comparisonCategoryControl;
let selectedRoad=new Set(),knownCustom=new Set();
let busDataset, tramDataset, includeTrams = false;
let truckDataset, truckYear = 2035, truckCargo = 'all';
let roadFlow=null,roadHeadway=null,roadFrequencyMode='maximum';
function roadTargets(){return {demandPerYear:roadFlow===null?null:roadFlow*(comparisonCategory==='passengers'?2:1),maxHeadwaySeconds:roadHeadway,frequencyMode:roadFrequencyMode};}
let truckService = {distanceKm:1,fillRatio:1,loadedReturn:false,specializedTerminal:false,specializedWarehouse:false};
let dataset, experiments, trains, selected, highlighted, raceView = 'distance', routeDistance = 10, catalogueYear = 2035, lineFill = 1, desiredFlow = null, maxHeadwaySeconds = null, frequencyMode = 'maximum', infrastructureSpeedKmh = 350, allowMultipleUnits = false, platformLengthMetres = null;
let comparisonCategory='passengers',economicCargo='all';
const routeSelection=createRouteSelection({distanceKm:10,gradePercent:0,speedLimitKmh:350});
let railGradePercent=0,railRouteProfile=routeSelection.segments;
let railFreight={loadedReturn:false,stopA:{},stopB:{}};
function setComparisonCategory(category){
  comparisonCategory=category;
  comparisonCategoryControl?.setValue(category);
  updateRoadCategory?.();
}
function syncRouteDistanceControls(){
  const range=$('route-distance'),limit=routeSelection.mode==='simple'?Math.max(10,routeDistance):routeDistance;
  range.max=limit;range.min=Math.min(.001,routeDistance);range.value=routeDistance;
  syncNumberInput($('distance-input'),routeDistance);
  range.setAttribute('aria-valuetext',`${fmtKm(routeDistance)} kilometres; use the number field for longer routes`);
  $('distance-note').textContent=routeSelection.mode==='custom'?'Route distance is the sum of the configured segments.':`Slider up to ${fmtKm(limit)} km; enter a larger distance in the field.`;
}
function syncRouteSelection({restore=false}={}){
  railRouteProfile=routeSelection.segments;
  routeDistance=railRouteProfile.reduce((total,part)=>total+part.distanceKm,0);
  const custom=routeSelection.mode==='custom',single=railRouteProfile[0];
  if(railRouteProfile.length===1){railGradePercent=single.gradePercent;infrastructureSpeedKmh=single.speedLimitKmh;}
  for(const id of ['distance-input','route-distance','route-speed-input','race-gradient-input'])$(id).disabled=custom;
  $('route-distance').closest('.horizon-control').hidden=custom;
  $('race-gradient').hidden=custom;
  syncRouteSpeedControls(document,{domain:navigation.domain,speed:single.speedLimitKmh,multiple:custom});
  raceGradientControl.setValue(railGradePercent);
  if(restore){$('distance-input').value=routeDistance;$('route-speed-input').value=single.speedLimitKmh;}
  syncRouteDistanceControls();
  for(const input of $('comparison-route-choice').querySelectorAll('input'))input.checked=input.value===routeSelection.mode;
  $('profile-use-route').disabled=custom;
  $('profile-use-route').textContent=custom?'Route in use':'Use this route';
  $('race-input-error').hidden=true;$('race-input-error').textContent='';
  renderRouteProfileStatus($('race-profile-status'),railRouteProfile);
  truckService={...truckService,distanceKm:routeDistance};
  crossoverCache.clear();raceYearKey=null;economicStoryKey=null;render();
}
function updateSimpleRoute(part){if(routeSelection.mode!=='simple')return;routeSelection.updateSimple(part);syncRouteSelection();}
function serviceTargets(){return {gradePercent:railGradePercent,routeProfile:railRouteProfile,maxHeadwaySeconds,frequencyMode,infrastructureSpeedKmh:railRouteProfile?null:infrastructureSpeedKmh,platformLengthMetres,...(comparisonCategory==='freight'?{freight:true,demandPerYear:desiredFlow,allowMultipleUnits:false,...railFreight}:{demandPerDirection:desiredFlow,allowMultipleUnits})};}
function compositionSettings(){return {distanceKm:routeDistance,fillRatio:lineFill,gradePercent:railGradePercent,routeProfile:railRouteProfile,routeMode:routeSelection.mode,desiredFlow,maxHeadwaySeconds,frequencyMode,infrastructureSpeedKmh,platformLengthMetres,...railFreight};}
function updateCompositionSettings(settings){
  lineFill=settings.fillRatio;railGradePercent=settings.gradePercent;
  desiredFlow=settings.desiredFlow;maxHeadwaySeconds=settings.maxHeadwaySeconds;frequencyMode=settings.frequencyMode;
  infrastructureSpeedKmh=settings.infrastructureSpeedKmh;platformLengthMetres=settings.platformLengthMetres;
  railFreight={loadedReturn:settings.loadedReturn,stopA:settings.stopA,stopB:settings.stopB};
  raceGradientControl.setValue(railGradePercent);
  syncNumberInput($('distance-input'),routeDistance);
  $('enable-flow').checked=desiredFlow!==null;$('desired-flow').disabled=desiredFlow===null;
  if(desiredFlow!==null)syncNumberInput($('desired-flow'),desiredFlow);
  $('enable-frequency').checked=maxHeadwaySeconds!==null;$('desired-headway').disabled=maxHeadwaySeconds===null;
  $('frequency-mode').disabled=maxHeadwaySeconds===null;
  if(maxHeadwaySeconds!==null)syncNumberInput($('desired-headway'),maxHeadwaySeconds/60);
  $('frequency-mode').querySelector(`input[value="${frequencyMode}"]`).checked=true;
  $('enable-platform-limit').checked=platformLengthMetres!==null;$('platform-length').disabled=platformLengthMetres===null;
  if(platformLengthMetres!==null)syncNumberInput($('platform-length'),platformLengthMetres);
  $('line-fill').value=lineFill*100;
  syncRouteSpeedControls(document,{domain:navigation.domain,speed:infrastructureSpeedKmh,multiple:routeSelection.mode==='custom'});
  $('rail-loaded-return').checked=railFreight.loadedReturn;
  for(const [stop,options] of [['a',railFreight.stopA],['b',railFreight.stopB]]){
    $(`rail-terminal-${stop}`).checked=!!options.specializedTerminal;$(`rail-warehouse-${stop}`).checked=!!options.specializedWarehouse;
  }
  $('allow-multiple-units').disabled=desiredFlow===null||maxHeadwaySeconds===null||comparisonCategory==='freight';
  allowMultipleUnits=!$('allow-multiple-units').disabled&&$('allow-multiple-units').checked;
  if(routeSelection.mode==='simple'){routeSelection.updateSimple({distanceKm:settings.distanceKm,gradePercent:settings.gradePercent,speedLimitKmh:settings.infrastructureSpeedKmh});syncRouteSelection({restore:true});}
  else {crossoverCache.clear();raceYearKey=null;economicStoryKey=null;render();}
}
function economicSelectionOptions(){return {freight:comparisonCategory==='freight',cargo:economicCargo,year:catalogueYear,platformLengthMetres,gradePercent:railGradePercent,routeProfile:railRouteProfile};}
function speedUsesProfile(){return railRouteProfile?.some(part=>part.gradePercent!==railRouteProfile[0].gradePercent||part.speedLimitKmh!==railRouteProfile[0].speedLimitKmh);}
function raceCandidates(allYears=false){return navigation.domain==='road'?selectRoadVehicles(roadDatasets(),{category:comparisonCategory,includeTrams,cargo:truckCargo,year:allYears?2035:truckYear}).filter(t=>selectedRoad.has(t.id)).map(withRoadModel):trainCandidates(allYears?Infinity:catalogueYear).filter(t=>selected.has(t.id));}
function active(view='') {
  const uniformSpeed=view.startsWith('speed')&&railRouteProfile&&!speedUsesProfile();
  const profile=railRouteProfile&&!uniformSpeed;
  const grade=uniformSpeed?railRouteProfile[0].gradePercent:railGradePercent;
  const cap=uniformSpeed?railRouteProfile[0].speedLimitKmh:infrastructureSpeedKmh;
  return raceCandidates().filter(t=>$('economics').hidden||economicCandidates([t],economicSelectionOptions()).length)
    .map(t=>{const limited=profile?t:withRailSpeedLimit(t,cap);return profile?withRailProfile(limited,railRouteProfile):withRailGradient(limited,grade);})
    .filter(t=>t.model.canStart!==false);
}
function arrivalName(t, view) {return view.startsWith('speed') ? t.name : `${t.name} · ${formatTime(t.model.timeAt(routeDistance))}`;}
function renderSelectionCount() {trainSelector.updateCount();}
const value=motionValue;
function trainCandidates(year=catalogueYear) {return economicCandidates(trains,{...economicSelectionOptions(),year});}
function visible() {return trainSelector.getVisible();}
function renderCatalogue() {
  $('train-count').textContent = trainCandidates().length;
  $('catalogue-year-value').textContent = catalogueYear;
  $('catalogue-year').value = catalogueYear;
  $('year-previous').disabled = catalogueYear <= 1900;
  $('year-next').disabled = catalogueYear >= Number($('catalogue-year').max);
  trainSelector.render();
}
function roadDatasets(selectedOnly=false){
  const custom=[...(consistEditor?.getCompositions()??[]),...(comparisonComposition?[comparisonComposition]:[])].filter(t=>t.carrier==='tram');
  const sources=styleVehicleCatalogues({trucks:truckDataset?.trucks??[],buses:busDataset?.buses??[],trams:[...(tramDataset?.trams??[]),...custom.filter(t=>t.category==='passengers')],freightTrams:[...(tramDataset?.freightTrams??[]),...custom.filter(t=>t.category==='freight')]});
  return selectedOnly?Object.fromEntries(Object.entries(sources).map(([key,items])=>[key,items.filter(t=>selectedRoad.has(t.id))])):sources;
}
function roadCandidates(){return selectRoadVehicles(roadDatasets(),{category:comparisonCategory,includeTrams,cargo:truckCargo,year:truckYear});}
function renderRoadCatalogue(){$('road-vehicle-count').textContent=roadCandidates().length;roadSelector.render();}
function syncCustomCompositions(change={}){
  const custom=consistEditor.getCompositions();
  for(const id of knownCustom)if(!custom.some(t=>t.id===id)){selected.delete(id);selectedRoad.delete(id);}
  for(const t of custom)if(!knownCustom.has(t.id))(t.carrier==='rail'?selected:selectedRoad).add(t.id);
  knownCustom=new Set(custom.map(t=>t.id));
  trains=[...baseTrains,...(comparisonComposition?.carrier==='rail'?[comparisonComposition]:[]),...custom.filter(t=>t.carrier==='rail').map((t,i)=>({...t,color:['#147d64','#ad5a28','#9270b9','#3897a7'][i%4]}))];
  crossoverCache.clear();economicStoryKey=null;raceYearKey=null;
  if(change.item?.carrier==='rail'){
    catalogueYear=Math.max(catalogueYear,change.item.year);
    setComparisonCategory(change.item.category);
    economicCargo=change.item.freightSpecialization==='general'?'all':change.item.freightSpecialization??'all';
    $('rail-cargo').querySelector(`input[value="${economicCargo}"]`).checked=true;
  }
  renderCatalogue();render();
}
function editComposition(id){
  location.hash='#composition-builder';syncAnalysisView();if(id===comparisonComposition?.id)consistEditor.restoreDraft(comparisonComposition);else consistEditor.edit(id);
}
function sample(t, xScale, yScale, view, horizon) {
  const curveEnd=motionCurveEnd(t,view,horizon);
  // Find where the curve enters the positive log domain, rather than inventing zero.
  let start = xScale.min;
  if(start>curveEnd)return [];
  if (value(t, start, view) < yScale.min) {
    let low = start, high = curveEnd;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      if (value(t, mid, view) < yScale.min) low = mid; else high = mid;
    }
    start = high;
  }
  // Stop precisely at the displayed ceiling instead of flattening the curve there.
  let end = curveEnd;
  if (value(t, end, view) > yScale.max) {
    let low = 0, high = end;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      if (value(t, mid, view) < yScale.max) low = mid; else high = mid;
    }
    end = low;
  }
  if (start > end) return [];
  const xs = new Set([start, end]);
  for(const point of motionTransitions(t,view))if(point.x>=start&&point.x<=end)xs.add(point.x);
  for (let i = 0; i <= 400; i++) {
    const x = xScale.mode === 'log' ? xScale.invert(i / 400) : i * horizon / 400;
    if (x >= start && x <= end) xs.add(x);
    // Extra samples resolve the first seconds on a logarithmic vertical axis.
    if (yScale.mode === 'log' && start > 0) xs.add(start * (end / start) ** (i / 400));
  }
  return [...xs].sort((a,b) => a-b).map(x => [x,value(t,x,view)]).filter(([x,y]) => Number.isFinite(xScale.position(x)) && Number.isFinite(yScale.position(y)));
}
function tickLabel(n) {return fmt(n, n > 0 && n < 1 ? Math.min(4, Math.ceil(-Math.log10(n))) : n % 1 ? 1 : 0);}
function chartHorizon(view, ts = active(view)) {
  return view === 'time' ? routeDistance : view === 'speed-distance'&&ts.some(t=>t.model.routeProfile)?routeDistance:view === 'speed-distance'?speedDistanceHorizon(ts):view === 'speed' ? speedHorizon(ts) : Math.max(1, raceHorizon(ts, routeDistance).seconds);
}
function renderChart(kind, width) {
  const view = kind === 'speed' ? speedView : raceView;
  const el = id => $(kind === 'speed' ? `speed-${id}` : id);
  const clipId = `${kind}-plot-clip`;
  const W = typeof width === 'number' ? width : Math.max(320, el('chart').clientWidth || 1000);
  const ts = active(view), spec = views[view];
  const labelSpace = view === 'distance' ? Math.max(120, Math.ceil(Math.max(0,...ts.map(t=>arrivalName(t, view).length))*7/Math.sqrt(2))+24) : 0;
  const H = (W < 700 ? 430 : 610) + labelSpace, L = 65, R = W < 700 || view === 'distance' ? 18 : 220, T = 45 + labelSpace, B = 50;
  const horizon = chartHorizon(view, ts);
  el('chart-heading').textContent = spec.title;
  const xName = view === 'time'||view==='speed-distance' ? 'Distance' : 'Time', yName = view === 'time' ? 'Time' : view.startsWith('speed') ? 'Speed' : 'Distance';
  for (const [axis,name] of [['x',xName],['y',yName]]) {el(`${axis}-scale-label`).textContent=name;el(`${axis}-scale-legend`).textContent=`${name} scale`;}
  el('chart-help').textContent = speedUsesProfile()&&view.startsWith('speed')?(navigation.domain==='road'?'Speed follows the route to B; lower limits apply instantly. Road braking is omitted.':'Speed responds to each segment grade and limit, with advance braking for lower limits. Race ends at B without a terminal stop.'):view.startsWith('speed')&&ts.some(t=>t.model.asymptoticSpeed)?'Uphill power-limited vehicles approach an equilibrium speed. This view covers at least 99% of that limit; race and service timings retain full precision.':spec.help;
  if(view.startsWith('speed')&&!speedUsesProfile())el('chart-help').textContent+=' This acceleration window is independent of route length.';
  el('chart-help').textContent+=' Hover or focus a vehicle to see transitions and coordinates.';
  const missingFreight=navigation.domain==='rail'&&comparisonCategory==='freight'&&!trainCandidates(Infinity).length;
  el('empty').innerHTML=missingFreight?'No freight train yet. <a href="#configurator" data-economic-configure>Compose your freight train ↗</a>':'Select at least one vehicle to display the curves.';
  el('empty').hidden = !!ts.length; el('chart').hidden=!ts.length; el('csv').disabled = el('svg').disabled = !ts.length;
  const max = Math.max(1,...ts.map(t=>value(t,horizon,view)));
  const step = 10 ** Math.floor(Math.log10(max / 5));
  const ymax = view.startsWith('speed') ? speedOrdinateMaximum(ts,horizon,view) : view === 'distance' ? routeDistance * 1.1 : Math.ceil(max / 5 / step) * step * 5;
  const xScale = createScale(scaleMode('x', kind), horizon, Math.min(spec.xFloor, horizon / 10));
  const yScale = createScale(scaleMode('y', kind), ymax, Math.min(spec.yFloor, ymax / 10));
  const notes = [];
  if (xScale.mode === 'log') notes.push(`X starts at ${tickLabel(xScale.min)} ${spec.unit}`);
  if (yScale.mode === 'log') notes.push(`Y starts at ${tickLabel(yScale.min)} ${spec.yUnit}`);
  el('scale-note').hidden = !notes.length;
  el('scale-note').textContent = `Small values are cropped on logarithmic axes. ${notes.join('; ')}. The readout and CSV retain the full values.`;
  const sx = x => L + xScale.position(x) * (W-L-R);
  const sy = y => H-B-yScale.position(y) * (H-T-B);
  let content = `<title>${spec.title}</title><desc>Theoretical curves. X axis: ${xScale.mode}; Y axis: ${yScale.mode}. Log domains: X starts at ${xScale.min} ${spec.unit}; Y starts at ${yScale.min} ${spec.yUnit}. Use the race readout for exact values, including zero.</desc><rect width="${W}" height="${H}" fill="white"/><defs><clipPath id="${clipId}"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs><text x="${L}" y="20">${spec.y}${yScale.mode==='log' ? ' · log scale' : ''}</text>`;
  // Limit label density while retaining enough log ticks to expose multiplicative spacing.
  let lastY = -Infinity;
  for(const y of [...yScale.ticks].reverse()) {
    const pos = sy(y);
    if(pos-lastY < 23) continue; lastY=pos;
    content+=`<line x1="${L}" x2="${W-R}" y1="${pos}" y2="${pos}" stroke="#e5e9e4" stroke-dasharray="2 5"/><text x="${L-12}" y="${pos+4}" text-anchor="end">${view === 'time' ? formatTime(y) : tickLabel(y)}</text>`;
  }
  let lastX=-Infinity;
  for(const x of xScale.ticks) {
    const pos=sx(x);
    if(pos-lastX < 42) continue; lastX=pos;
    content+=`<text x="${pos}" y="${H-B+23}" text-anchor="middle">${view === 'time'||view==='speed-distance' ? tickLabel(x) : formatTime(x)}</text>`;
  }
  content+=`<line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" stroke="#ccd4cc"/><text x="${(W+L-R)/2}" y="${H-6}" text-anchor="middle">${spec.x}${xScale.mode==='log' ? ' · log scale' : ''}</text>`;
  if (view === 'distance' && Number.isFinite(sy(routeDistance))) {
    const y = sy(routeDistance);
    content += `<line class="distance-target" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#8a5f2b" stroke-dasharray="6 5"/><text x="${L+8}" y="${y-7}" style="fill:#8a5f2b">${fmtKm(routeDistance)} km target</text>`;
  }
  for(const t of ts) {
    const d=sample(t,xScale,yScale,view,horizon).map(([x,y],i)=>`${i?'L':'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join(' ');
    const emphasis = !highlighted || highlighted === t.id;
    content+=`<path class="train-curve" data-train="${escape(t.id)}" clip-path="url(#${clipId})" d="${d}" fill="none" stroke="${t.color}" stroke-width="${highlighted===t.id?3:2}" opacity="${emphasis?1:.16}" stroke-dasharray="${t.dash}"><title>${escape(t.name)} — model</title></path><path class="curve-hit" data-train="${escape(t.id)}" clip-path="url(#${clipId})" d="${d}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`;
  }
  if (view === 'distance') {
    const y = sy(routeDistance);
    const labelled = ts
      .map(t => ({t, x: sx(t.model.timeAt(routeDistance))}))
      .filter(({x}) => Number.isFinite(x)).sort((a,b) => a.x-b.x);
    // Spread neighbouring names; markers keep the exact arrival position.
    for (let i=0; i<labelled.length; i++) labelled[i].labelX=Math.max(labelled[i].x, arrivalName(labelled[i].t, view).length*7/Math.sqrt(2)+8, i ? labelled[i-1].labelX+20 : L+5);
    for (let i=labelled.length-1; i>=0; i--) labelled[i].labelX=Math.min(labelled[i].labelX, i===labelled.length-1 ? W-R-5 : labelled[i+1].labelX-20);
    for (const {t,x,labelX} of labelled) {
      const opacity = !highlighted || highlighted === t.id ? 1 : .25;
      content += `<circle class="arrival-marker" data-train="${escape(t.id)}" cx="${x}" cy="${y}" r="3" fill="${t.color}" opacity="${opacity}"/><line x1="${x}" y1="${y}" x2="${labelX}" y2="${T-12}" stroke="${t.color}" opacity=".35"/><text class="arrival-label end-label" data-train="${escape(t.id)}" x="${labelX}" y="${T-16}" transform="rotate(45 ${labelX} ${T-16})" text-anchor="end" style="fill:${t.color}" opacity="${opacity}">${escape(arrivalName(t, view))}</text>`;
    }
  } else if(W>=700) {
    const labelled = ts.map(t=>{const end=motionCurveEnd(t,view,horizon);return {t,x:sx(end),y:sy(Math.min(ymax,value(t,end,view)))};}).filter(t=>Number.isFinite(t.y)).sort((a,b)=>a.y-b.y);
    for(let i=0;i<labelled.length;i++) labelled[i].labelY=Math.max(labelled[i].y,i ? labelled[i-1].labelY+20 : T+5);
    for(let i=labelled.length-1;i>=0;i--) labelled[i].labelY=Math.min(labelled[i].labelY,i===labelled.length-1?H-B-5:labelled[i+1].labelY-20);
    for(const {t,x,y,labelY} of labelled) content+=`${ts.some(t=>t.model.routeProfile)&&view==='speed'?`<circle cx="${x}" cy="${y}" r="3" fill="${t.color}"/>`:``}<line x1="${x}" y1="${y}" x2="${W-R+12}" y2="${labelY}" stroke="${t.color}" opacity=".35"/><text class="end-label" data-train="${escape(t.id)}" x="${W-R+17}" y="${labelY+4}" style="fill:${t.color}" opacity="${!highlighted||highlighted===t.id?1:.25}">${escape(arrivalName(t, view))}</text>`;
  }
  content+='<g class="motion-transition-overlay" pointer-events="none"></g>';
  el('chart').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${spec.title}; X ${xScale.mode}, Y ${yScale.mode}">${content}</svg>${trainLegend(ts,W,highlighted)}`;
  const overlay=el('chart').querySelector('.motion-transition-overlay');
  mountChartInteractions(el('chart'),{group:navigation.domain,highlighted,onHighlight:id=>{overlay.innerHTML=renderMotionTransitions(ts.find(t=>t.id===id),{view,sx,sy,left:L,right:W-R,top:T,bottom:H-B});overlay.parentNode.appendChild(overlay);}});
}
let raceYearKey,raceYearStory;
function renderRaceYear(kind){
  const ts=raceCandidates(true).map(t=>{const limited=railRouteProfile?t:withRailSpeedLimit(t,infrastructureSpeedKmh);return railRouteProfile?withRailProfile(limited,railRouteProfile):withRailGradient(limited,railGradePercent);}).filter(t=>t.model.canStart!==false);
  const key=JSON.stringify([ts.map(t=>[t.id,t.year,t.massTonnes,t.powerCh,t.tractionKgf,t.maxSpeedKmh]),routeDistance]);
  if(key!==raceYearKey){
    const valueAt=(id,x)=>{const train=ts.find(t=>t.id===id);return train.year<=x?train.model.timeAt(routeDistance):null;};
    raceYearStory={...yearRankingStory(ts,valueAt),valueAt,axis:'year',label:'Game year',current:navigation.domain==='road'?truckYear:catalogueYear,discontinuous:true};raceYearKey=key;
  }
  raceYearStory.current=navigation.domain==='road'?truckYear:catalogueYear;
  renderEconomicCrossovers($(kind==='rank'?'crossover-chart':'crossover-curves-chart'),{trains:ts,story:raceYearStory,kind,fill:1,highlighted,group:navigation.domain,
    distanceMode:document.querySelector(`input[name="${kind==='rank'?'rank-distance-scale':'focus-distance'}"]:checked`).value,
    ordinateTitle:'Arrival time (m:ss)',ordinateFormat:formatTime,chartTitle:'Arrival time by introduction year',rankTitle:'Arrival ranking by introduction year',emphasize:$('emphasize-leaders').checked});
  $('crossover-curves-empty').hidden=$('crossover-empty').hidden=!!ts.length;
  $('crossover-curves-help').textContent=`Arrival time over ${fmtKm(routeDistance)} km; vehicles enter at their introduction year. Track speed limit: ${infrastructureSpeedKmh} km/h.`;
  $('crossover-readout').innerHTML=raceYearStory.phases.map(p=>`<tr><td>${Math.round(p.start)}–${Math.round(p.end)}</td><td>${p.leaders.map(id=>escape(ts.find(t=>t.id===id).name)).join(' / ')||'No available train'}</td><td>${p.leaders.length?formatTime(Math.min(...p.leaders.map(id=>raceYearStory.valueAt(id,p.start)))):'—'}</td></tr>`).join('');
}
const crossoverCache = new Map();
function renderCrossovers() {
  const byYear=$('race-phase-axis').querySelector('input:checked').value==='year';
  $('crossover-readout').closest('table').querySelector('th').textContent=byYear?'Year range':'Distance range (km)';
  if(byYear){renderRaceYear('rank');return;}
  const ts = active(), key = ts.map(t=>t.id).sort().join('|');
  if (!crossoverCache.has(key)) crossoverCache.set(key, crossoverStory(ts));
  const minimum=Math.min(.1,routeDistance/10);
  const {phases, intervals, end} = rankWindow(crossoverCache.get(key),minimum);
  $('crossover-empty').hidden = !!ts.length;
  $('crossover-readout').innerHTML = phases.map(p=>`<tr><td>${fmtKm(p.start)} – ${p.unbounded ? '∞' : fmtKm(p.end)}</td><td>${p.leaders.map(id=>escape(ts.find(t=>t.id===id).name)).join(' / ')}</td><td>${formatTime(Math.min(...ts.map(t=>t.model.timeAt(p.start))))}</td></tr>`).join('');
  if (!ts.length) {$('crossover-chart').innerHTML='';return;}
  const W=Math.max(320,$('crossover-chart').clientWidth),L=65,R=W>=700?220:18,T=55,B=60;
  const H=Math.max(300,Math.min(650,ts.length*35+T+B));
  const mode=document.querySelector('input[name="rank-distance-scale"]:checked').value;
  const knots=[minimum,...intervals.map(p=>p.end)];
  const phaseAxis=mode==='linear'?createPhaseScale([minimum,end]):createPhaseScale(knots,leadershipWeights(intervals.length));
  $('rank-scale-note').textContent=mode==='linear'?`Distance uses a uniform linear scale. Crossovers below ${fmtKm(minimum)} km are omitted.`:railRouteProfile?`From ${fmtKm(minimum)} km, crossovers are shown only up to terminal B.`:`From ${fmtKm(minimum)} km, each crossover between any selected trains gets an equally spaced position. Real distances are shown at the ticks; the final stable tail is compressed.`;
  const sx=distance=>L+phaseAxis.position(distance)*(W-L-R);
  const sy=rank=>T+(rank-1)*(H-T-B)/Math.max(1,ts.length-1);
  let content=`<title>Rank crossovers</title><desc>Arrival ranking by distance. Axis: ${mode}. Rank crossovers from ${fmtKm(minimum)} kilometres are included, even when the leading train stays the same. ${railRouteProfile?'The route ends at B.':'The final ranking holds at longer distances.'}</desc><text x="${L}" y="20">Arrival rank · first place at the top</text>`;
  phases.forEach((p,i)=>{
    const x=sx(p.start);
    content+=`<line x1="${x}" x2="${x}" y1="${T-15}" y2="${H-B+10}" stroke="#ccd4cc" stroke-dasharray="3 5"/>`;
  });
  // Mark every change of ranking, even when it does not change the leader.
  const roots=knots.slice(1,-1), labelGap=W<700?75:65;
  let lastLabel=L;
  content+=`<text x="${L}" y="${H-B+30}" text-anchor="start">${fmtKm(minimum)} km</text>`;
  roots.forEach((distance,i)=>{
    const x=sx(distance),label=fmtKm(distance)+' km';
    content+=`<line class="rank-crossover" data-distance="${distance}" x1="${x}" x2="${x}" y1="${T-15}" y2="${H-B+10}" stroke="#b9c7bf" stroke-dasharray="2 5"><title>Crossover at ${label}</title></line><circle class="rank-crossover-tick" data-distance="${distance}" cx="${x}" cy="${H-B+10}" r="2.5" fill="#758079"><title>${label}</title></circle>`;
    if(x-lastLabel>=labelGap && W-R-x>=100){content+=`<text x="${x}" y="${H-B+30}" text-anchor="middle">${label}</text>`;lastLabel=x;}
  });
  content+=`<text x="${W-R}" y="${H-B+30}" text-anchor="end">${railRouteProfile?`${fmtKm(routeDistance)} km · B`:'Further → ∞'}</text>`;
  for(let rank=1;rank<=ts.length;rank++)content+=`<line x1="${L}" x2="${W-R}" y1="${sy(rank)}" y2="${sy(rank)}" stroke="#e5e9e4" stroke-dasharray="2 5"/><text x="${L-12}" y="${sy(rank)+4}" text-anchor="end">${rank}</text>`;
  renderPhaseDiagram($('crossover-chart'),{trains:ts,segments:rankPhaseSegments(ts,phases,intervals,sx,sy),frame:content,group:navigation.domain,width:W,height:H,left:L,right:R,top:T,bottom:B,title:`Arrival ranking by distance; ${mode}`,highlighted,
    bands:phases.map(p=>({leaders:p.leaders,width:phaseAxis.position(p.end)-phaseAxis.position(p.start)})),
    endpoints:ts.map(t=>({t,y:sy(intervals.at(-1).ranks[t.id]),winner:phases.at(-1).leaders.includes(t.id)}))});

}
function renderCrossoverCurves() {
  if($('race-phase-axis').querySelector('input:checked').value==='year'){renderRaceYear('curves');return;}
  const ts=active(), key=ts.map(t=>t.id).sort().join('|');
  const {phases,end}=leaderCurveWindow(ts,crossoverCache.get(key));
  $('crossover-curves-empty').hidden=!!ts.length;
  if(!ts.length){$('crossover-curves-chart').innerHTML='';return;}
  const distances=[0,...phases.map(p=>p.end)], times=distances.map(d=>Math.min(...ts.map(t=>t.model.timeAt(d))));
  const distanceMode=document.querySelector('input[name="focus-distance"]:checked').value;
  const timeMode=document.querySelector('input[name="focus-time"]:checked').value;
  const inverted=document.querySelector('input[name="crossover-orientation"]:checked').value==='distance';
  const emphasize=$('emphasize-leaders').checked;
  $('crossover-curves-help').textContent=inverted?'The highest curve leads the race.':'The lowest curve arrives first.';
  // Keep the explanation in the flow while the year changes.
  $('crossover-axis-note').hidden=false;
  const distanceAxis=createPhaseScale(distanceMode==='focus'?distances:[0,end],distanceMode==='focus'?leadershipWeights(phases.length):[1]);
  const timeAxis=createPhaseScale(timeMode==='focus'?times:[0,times.at(-1)],timeMode==='focus'?leadershipWeights(phases.length):[1]);
  const xAxis=inverted?timeAxis:distanceAxis, yAxis=inverted?distanceAxis:timeAxis;
  const xKnots=inverted?times:distances,yKnots=inverted?distances:times;
  const xMode=inverted?timeMode:distanceMode,yMode=inverted?distanceMode:timeMode;
  const xLabel=inverted?'Time (m:ss)':'Distance (km)',yLabel=inverted?'Distance (km)':'Arrival time (m:ss)';
  const xFormat=inverted?formatTime:fmtKm,yFormat=inverted?fmtKm:formatTime;
  const W=Math.max(320,$('crossover-curves-chart').clientWidth),H=W<700?620:820,L=65,R=W>=700?220:18,T=45,B=65;
  const sx=x=>L+xAxis.position(x)*(W-L-R),sy=y=>H-B-yAxis.position(y)/1.12*(H-T-B);
  const value=(t,x)=>inverted?t.model.stateAt(x).distanceKm:t.model.timeAt(x);
  const bounds=p=>inverted?[times[phases.indexOf(p)],times[phases.indexOf(p)+1]]:[p.start,p.end];
  let content=`<title>Arrival curves around crossovers</title><desc>Real model curves with continuous piecewise-linear axes. Distance: ${distanceMode}. Time: ${timeMode}. ${inverted?'Higher':'Lower'} curves lead. Winning segments ${emphasize?'emphasized':'shown normally'}.</desc><text x="${L}" y="20">${yLabel} · ${yMode==='focus'?'phase focus':'linear'}</text>`;
  const ticks=axis=>Array.from({length:phases.length*4+1},(_,i)=>axis.invert(i/(phases.length*4)));
  const majors=xKnots.map(sx);
  for(const x of [...new Set([...xKnots,...ticks(xAxis)])].sort((a,b)=>a-b)){
    const pos=sx(x),major=xKnots.includes(x);
    content+=`<line x1="${pos}" x2="${pos}" y1="${T}" y2="${H-B}" stroke="${major && x>0 && x<xKnots.at(-1) && xMode==='focus'?'#aa6a22':major?'#c1ccc5':'#e5e9e4'}" stroke-dasharray="3 5"/>`;
    if(major || majors.every(p=>Math.abs(p-pos)>65))content+=`<text x="${pos}" y="${H-B+24}" text-anchor="${x===0?'start':x===xKnots.at(-1)?'end':'middle'}">${x===xKnots.at(-1)?(railRouteProfile?'B': 'Further → ∞'):xFormat(x)}</text>`;
  }
  // Keep the vertical labels at phase boundaries, rather than filling every interval.
  const verticalTicks=phases.length===1 ? [0,yAxis.invert(.5),yKnots.at(-1)] : yKnots;
  let lastY=-Infinity;
  for(const y of [...verticalTicks].sort((a,b)=>b-a)){
    const pos=sy(y),boundary=yKnots.slice(1,-1).includes(y),change=boundary && yMode==='focus';
    content+=`<line class="${change?'scale-change-grid':'phase-grid'}" x1="${L}" x2="${W-R}" y1="${pos}" y2="${pos}" stroke="${change?'#aa6a22':'#e5e9e4'}" stroke-dasharray="${change?'6 5':'3 5'}"/>`;
    if(pos-lastY>=32){content+=`<text class="vertical-tick" x="${L-10}" y="${pos+4}" text-anchor="end" style="${change?'fill:#8a5f2b;font-weight:600':''}">${yFormat(y)}</text>`;lastY=pos;}
    if(change)content+=`<path class="scale-change-y" d="M${L-5},${pos+5} l10,-5 M${L-5},${pos} l10,-5" stroke="#aa6a22" stroke-width="2" fill="none"><title>Vertical axis scale changes at ${yFormat(y)}</title></path>`;
  }
  if(xMode==='focus')for(const x of xKnots.slice(1,-1)){
    const pos=sx(x);content+=`<path class="scale-change-x" d="M${pos-5},${H-B+5} l5,-10 M${pos},${H-B+5} l5,-10" stroke="#aa6a22" stroke-width="2" fill="none"><title>Horizontal axis scale changes at ${xFormat(x)}</title></path>`;
  }
  const segments=[];
  for(const t of ts)for(const p of phases){
    const [start,stop]=bounds(p),xs=new Set([start,stop]);
    for(let i=0;i<=300;i++){xs.add(start+(stop-start)*i/300);if(start===0)xs.add(stop*(i/300)**3);}
    const cap=inverted?t.model.speedCapSeconds:t.model.speedCapKm;
    if(cap>start && cap<stop)xs.add(cap);
    // Include where this train crosses each vertical-axis scale boundary.
    for(const y of yKnots){const x=inverted?t.model.timeAt(y):t.model.stateAt(y).distanceKm;if(x>start && x<stop)xs.add(x);}
    const d=[...xs].sort((a,b)=>a-b).map((x,i)=>`${i?'L':'M'}${sx(x)},${sy(value(t,x))}`).join(' ');
    segments.push({t,p,d,winner:p.leaders.includes(t.id)});
  }
  let overlay='';
  phases.slice(1).forEach((p,i)=>{const x=inverted?times[i+1]:p.start,y=inverted?p.start:times[i+1];overlay+=`<circle cx="${sx(x)}" cy="${sy(y)}" r="4" fill="white" stroke="#27332e"><title>Leader changes at ${fmtKm(p.start)} km · ${formatTime(times[i+1])}</title></circle>`;});
  overlay+=`<text x="${(W+L-R)/2}" y="${H-8}" text-anchor="middle">${xLabel} · ${xMode==='focus'?'phase focus':'linear'}</text>`;
  renderPhaseDiagram($('crossover-curves-chart'),{trains:ts,segments,frame:content,overlay,group:navigation.domain,width:W,height:H,left:L,right:R,top:T,bottom:B,title:`${inverted?'Distance over time':'Time over distance'} around crossovers; distance ${distanceMode}, time ${timeMode}`,highlighted,emphasize,
    bands:phases.map(p=>{const [start,stop]=bounds(p);return {leaders:p.leaders,width:xAxis.position(stop)-xAxis.position(start)};}),
    endpoints:ts.map(t=>({t,y:sy(value(t,xKnots.at(-1))),winner:phases.at(-1).leaders.includes(t.id)}))});

}
function renderEconomicControls() {
  const freight=comparisonCategory==='freight',unit=UI_TERMS.capacityUnit;
  $('rail-freight-handling').hidden=!freight;
  $('rail-freight-filter').hidden=$('economics').hidden||!freight;
  $('rail-service-note').hidden=$('economics').hidden;
  $('rail-service-note').textContent=freight?'Saved freight compositions':'Passenger services';
  $('economic-coupling-control').hidden=freight;
  $('allow-multiple-units').disabled=freight||maxHeadwaySeconds===null||desiredFlow===null;

  $('economic-length-unit').textContent=freight?'m of train':'m of platform';
  $('economic-flow-unit').textContent=`${UI_TERMS.capacityUnit}/year${freight?'':'/direction'}`;
  $('desired-flow').setAttribute('aria-label',`Target rate in ${UI_TERMS.capacityUnit} per game year${freight?'':' per direction'}`);
  $('service-targets-description').previousElementSibling.title=freight?'Optional: size a fleet for the total delivered cargo per year, or an interval between trains.':'Optional: choose a passenger rate per direction or interval target to size a fleet.';
  $('economic-metric-help').textContent=`Running cost per ${unit} — lower is better.`;
  $('economic-cost-formula').textContent=freight?'Cost per capacity = fleet running costs / capacity transported per game year. Empty return trips still incur running costs.':'Cost per capacity = fleet running costs / capacity transported per game year. Each boarding counts once: A→B and B→A are separate journeys.';
  $('economic-calendar-help').textContent=freight?'Calendar: 4 simulation seconds per game day; 365 days = 1,460 simulation seconds per game year. A target rate counts all cargo delivered, including both directions when loaded return is enabled.':'Calendar: 4 simulation seconds per game day; 365 days = 1,460 simulation seconds per game year. Per-direction throughput is half the total A–B–A throughput.';
  $('economic-passenger-revenue').hidden=freight;
  $('economic-passenger-assumptions').hidden=freight;
  $('economic-freight-assumptions').hidden=!freight;
  $('economic-efficiency-scale').querySelector(':scope > span').textContent=`Running cost / ${UI_TERMS.capacityUnit}`;
  $('economic-distance-help').textContent=`Running cost per ${unit}. Lower is better; values do not depend on the selected competitors.`;
  $('economic-curves-help').textContent='Cheapest train emphasized in each phase; hover to compare.';
  $('economic-rank-help').textContent=`Ranking by running cost per ${unit}; first place at the top.`;
}
function renderLineAnalysis() {
  renderEconomicControls();
  const freight=comparisonCategory==='freight',unit=UI_TERMS.capacityUnit;
  $('occupancy-label').textContent=desiredFlow===null?'Utilization':'Utilization limit';
  $('utilization-help').textContent=desiredFlow===null?'Share of capacity used on each loaded leg.':'Maximum utilization of capacity when sizing the fleet.';
  $('utilization-info').title=$('utilization-help').textContent;
  $('service-options-summary').textContent=[desiredFlow===null?'No rate target':`${fmt(desiredFlow,0)} ${UI_TERMS.capacityUnit}/year${freight?'':'/direction'}`,maxHeadwaySeconds===null?'No frequency target':`${formatTime(maxHeadwaySeconds)} ${frequencyMode==='maximum'?'maximum interval':'target interval'}`,freight?(railFreight.loadedReturn?'Loaded return':'Empty return'):(allowMultipleUnits?'Coupling allowed':'Single units'),platformLengthMetres===null?'No length limit':`${fmt(platformLengthMetres,0)} m maximum`].join(' · ');
  $('line-fill-value').textContent = `${Math.round(lineFill * 100)}%`;
  const selection=economicSelection(trains,selected,economicSelectionOptions());
  const rows=selection.eligible.map(t=>({t,result:analyseLine(t,{distanceKm:routeDistance,fillRatio:lineFill,...serviceTargets()})})).sort((a,b)=>b.result.efficiency-a.result.efficiency);
  const best=rows[0]?.result.efficiency||0;
  const winners=rows.filter(({result})=>best>0&&Math.abs(result.efficiency/best-1)<1e-9);
  renderServiceSummary($('line-summary'),{names:winners.map(({t})=>t.name),cost:winners[0]?.result.maintenancePerUnit,unit,
    emptyMessage:!rows.length?(selection.excluded.length?'No selected train fits the length or gradient constraints.':'No selected train is available in this year.'):`Utilization is zero: no transported ${UI_TERMS.capacityUnit} and no best service choice.`});
  $('line-caption').textContent=`A–B–A at ${fmtKm(routeDistance)} km per leg${railRouteProfile?' · segment profile (theoretical)':railGradePercent?` · ${fmt(railGradePercent,1)}% A→B (theoretical)`:''} · ${freight?(railFreight.loadedReturn?'loaded return · ':'empty return · '):''}normal-difficulty running costs`;
  const headings=freight?[
    ['Rank'],['Train'],[`Cost / ${UI_TERMS.capacityUnit}`,'$ · lower is better'],['Trains'],[UI_TERMS.frequency,'m:ss'],[UI_TERMS.rate,`${UI_TERMS.capacityUnit} / year`],
    ['Length','m / train'],[UI_TERMS.capacity,`${UI_TERMS.capacityUnit} / train`],[UI_TERMS.utilization,'%'],[UI_TERMS.runningCosts,'$ / year (fleet)'],['Load / loaded leg',UI_TERMS.capacityUnit],['Handling A / B',`${UI_TERMS.capacityUnit} / s`],[railGradePercent||railRouteProfile?'Travel A→B / B→A':'Travel / leg','m:ss'],['Stop A / B','m:ss'],['Round trip','m:ss']
  ]:[
    ['Rank'],['Train'],[`Cost / ${UI_TERMS.capacityUnit}`,'$ · lower is better'],['Trains'],[UI_TERMS.frequency,'m:ss'],[UI_TERMS.rate,`${UI_TERMS.capacityUnit} / year / direction`],
    ['MU / train'],['Length','m / train'],[UI_TERMS.capacity,`${UI_TERMS.capacityUnit} / train`],[UI_TERMS.utilization,'%'],[UI_TERMS.runningCosts,'$ / year (fleet)'],['Load / leg',UI_TERMS.capacityUnit],['Handling',`multiplier → ${UI_TERMS.capacityUnit} / s`],[railGradePercent||railRouteProfile?'Travel A→B / B→A':'Travel / leg','m:ss'],['Stop / terminal','m:ss'],['Round trip','m:ss']
  ];
  $('line-readout').closest('table').querySelector('thead tr').innerHTML=headings.map(([label,units],i)=>`<th scope="col"${i>=6?' class="service-detail"':''}>${label}${units?`<span class="table-unit">${units}</span>`:''}</th>`).join('');
  let rank=0,prior;
  $('line-readout').innerHTML=rows.map(({t,result:r},i)=>{
    const score=r.maintenancePerUnit;
    if(prior===undefined||Math.abs(score-prior)>Math.max(1e-7,Math.abs(score||0)*1e-9))rank=i+1;
    prior=score;
    const cells=freight?[
      score===null?'—':fmt(score,2),r.trainCount,formatTime(r.headwaySeconds),fmt(r.deliveredPerYear,0),fmt(r.trainLengthMetres,1),r.capacityPerTrain,`${fmt(r.actualOccupancyRatio*100,1)}%`,fmt(r.fleetMaintenance,0),
      fmt(r.cargoPerLeg),`${fmt(r.handlingRateA,2)} / ${fmt(r.handlingRateB,2)}`,(railGradePercent||railRouteProfile)?`${formatTime(r.outboundTravelSeconds)} / ${formatTime(r.returnTravelSeconds)}`:formatTime(r.travelSeconds),`${formatTime(r.stationSecondsA)} / ${formatTime(r.stationSecondsB)}`,formatTime(r.roundTripSeconds)
    ]:[
      score===null?'—':fmt(score,2),r.trainCount,formatTime(r.headwaySeconds),fmt(r.perDirectionJourneysPerYear,0),r.unitsPerTrain,fmt(r.trainLengthMetres,1),r.capacityPerTrain,`${fmt(r.actualOccupancyRatio*100,1)}%`,fmt(r.fleetMaintenance,0),fmt(r.passengers),
      `${t.formationLoadingUnloadingSpeedMultiplier!=null?`${fmt(t.formationLoadingUnloadingSpeedMultiplier*r.unitsPerTrain)} total`:`${r.carCount} × ${fmt(t.loadingUnloadingSpeedMultiplier)}`} → ${fmt(r.rate,2)}`,(railGradePercent||railRouteProfile)?`${formatTime(r.outboundTravelSeconds)} / ${formatTime(r.returnTravelSeconds)}`:formatTime(r.travelSeconds),formatTime(r.stationSeconds),formatTime(r.roundTripSeconds)
    ];
    return `<tr data-train="${escape(t.id)}" class="${t.id===highlighted?'is-highlighted':''}"><td>${best?rank:'—'}</td><td><span class="train-key" style="--train-color:${t.color}"></span>${escape(t.name)}</td>${cells.map((c,i)=>`<td${i===0?` title="${score===null?'':score.toFixed(6)}"`:""}${i>=4?' class="service-detail"':''}>${c}</td>`).join('')}</tr>`;
  }).join('')+selection.excluded.map(t=>`<tr><td>—</td><td>${escape(t.name)}</td><td class="service-exclusion" colspan="${$('show-service-details').checked?headings.length-2:4}">Excluded: ${!serviceEligible(t,{gradePercent:railGradePercent,routeProfile:railRouteProfile})?'cannot complete this route.':`${fmt(t.lengthMetres,1)} m exceeds the ${fmt(platformLengthMetres,1)} m length limit.`}</td></tr>`).join('');
  updateTablePreview(document,'line-readout');
  return selection;
}
function updateStickyOffsets() {
    const header = document.querySelector('.app-header');
    const headerHeight = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--app-header-offset', `${headerHeight}px`);
    document.documentElement.style.setProperty('--economic-controls-height', '0px');
}
function syncAnalysisView() {
  const target=document.getElementById(location.hash.slice(1));
  const owner=target?.closest('.analysis-view')?.id??(target?.closest('#configuration-sidebar')?'configurator':target?.closest('#profile-sidebar')?'route-profile':target?.closest('#road-sidebar')?'trucks':target?.closest('#line-capacity')?'economics':target?.closest('#train-race-settings')?'race':null);
  navigation=resolveNavigation(navigation,{hash:location.hash,owner,dataSection:target?.closest('[data-reference-pane]')?.dataset.referencePane});
  const {view,space,domain,dataView}=navigation;
  for(const name of ANALYSIS_VIEWS)$(name).hidden=name!==view;
  for(const name of ['compare','design','data']){
    $(`${name}-navigation`).hidden=name!==space;
    const link=document.querySelector(`[data-space="${name}"]`);
    if(name===space)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  for(const link of document.querySelectorAll('[data-analysis],[data-reference]')){
    const current=link.dataset.analysis===view||(view==='data'&&link.dataset.reference===dataView);
    if(current)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  for(const pane of document.querySelectorAll('[data-reference-pane]'))pane.hidden=pane.dataset.referencePane!==dataView;
  document.querySelector(`#compare-domain input[value="${domain}"]`).checked=true;
  document.querySelector('[data-analysis="race"]').hidden=false;
  (space==='compare'&&domain==='road'?$('road-compare-mode'):$('rail-compare-mode')).append($('compare-domain'),$('comparison-category'));
  (space==='compare'&&domain==='road'?$('road-route-slot'):$('rail-route-slot')).append($('train-race-settings'));
  $('road-service-settings').hidden=view!=='trucks';
  syncRouteSpeedControls(document,{domain,speed:railRouteProfile[0].speedLimitKmh,multiple:routeSelection.mode==='custom'});
  profileControl?.refresh();
  document.querySelector('[data-analysis="race"]').href=domain==='road'?'#road-race':'#race';
  $('profile-compare-race').href=domain==='road'?'#road-race':'#race';
  $('profile-compare-service').href=domain==='road'?'#trucks':'#economics';
  $('road-load-slot').append($('road-load-status'),$('road-retry'));
  $('race-heading').textContent=domain==='road'?'The road race':'The train race';
  $('race-intro').textContent=`Start together. Change the ${domain==='road'?'vehicles':'trains'} or the route and find out who takes the lead.`;
  $('road-motion-note').hidden=domain!=='road';$('quick-races').hidden=domain==='road';
  highlighted=undefined;crossoverCache.clear();raceYearKey=null;
  document.querySelector('[data-analysis="economics"]').href=domain==='road'?'#trucks':'#economics';
  if(view==='trucks')document.querySelector('[data-analysis="economics"]').setAttribute('aria-current','page');
  const action=$('workspace-action');action.hidden=space==='data';
  action.href=space==='design'?'#compare':'#configurator';
  action.textContent=space==='design'?'Compare results ↗':'Design a composition ↗';
  for(let disclosure=target?.closest('details');disclosure;disclosure=disclosure.parentElement.closest('details'))disclosure.open=true;
  if(target&&['model','economic-method'].includes(target.id))target.querySelector('details').open=true;
  syncAnalysisPanels(document,view,{domain});renderCatalogue();
  const destination=view==='route-profile'?'profile-overview':view==='configurator'?'component-catalogue':view==='data'?dataView==='models'?'model':dataView==='checks'?'experimental-models':'source-catalogue':view==='race'?'speed-explorer':view==='trucks'?'truck-service':'line-results';
  document.querySelector('.skip').textContent='Skip to content';document.querySelector('.skip').href=`#${destination}`;
  if(space==='compare'&&domain==='road')void ensureRoad();if(view==='configurator')void ensureConfigurator();if(view==='data')void ensureData();
  $('comparison-preview').hidden=space!=='compare'||!comparisonComposition||(domain==='rail')!==(comparisonComposition.carrier==='rail');
  render();updateStickyOffsets();target?.scrollIntoView();
}
function compareComposition(){
  if(!liveComposition)return;
  // A deliberate snapshot is visible in comparisons without writing browser storage.
  selected.delete(comparisonComposition?.id);selectedRoad.delete(comparisonComposition?.id);
  comparisonComposition={...liveComposition,id:'custom:preview:composition',draftName:liveComposition.name,sourceCompositionId:liveComposition.id,name:`${liveComposition.name} · preview`,color:'#20a6b2'};
  const item=comparisonComposition;
  if(item.carrier==='rail'){
    selected.add(item.id);catalogueYear=Math.max(catalogueYear,item.year);
    setComparisonCategory(item.category);economicCargo=item.freightSpecialization==='general'?'all':item.freightSpecialization??'all';
    $('rail-cargo').querySelector(`input[value="${economicCargo}"]`).checked=true;
  }else{
    selectedRoad.add(item.id);setComparisonCategory(item.category);includeTrams=true;truckYear=Math.max(truckYear,item.year);
    truckCargo=item.freightSpecialization==='general'?'all':item.freightSpecialization??'all';
    $('truck-cargo-specialization').querySelector(`input[value="${truckCargo}"]`).checked=true;$('road-include-trams').checked=true;$('truck-year').value=truckYear;$('truck-year-value').textContent=truckYear;updateRoadCategory();
  }
  if(item.carrier==='rail')trainSelector.clearSearch();else roadSelector.clearSearch();
  syncCustomCompositions();$('comparison-preview-name').textContent=liveComposition.name;
  location.hash=item.carrier==='tram'?'#trucks':item.category==='freight'||navigation.railView==='economics'?'#economics':'#race';syncAnalysisView();
}

let roadPhaseTimer,economicProfileTimer;
function render() {
  if (!$('route-profile').hidden)return;
  if (!$('configurator').hidden){compositionAnalysis?.refresh();return;}
  if (!$('data').hidden){renderDataView(dataset,baseTrains,experiments??{experiments:[]});return;}
  if (!$('trucks').hidden) {
    if(!roadLoaded)return;
    const passenger=comparisonCategory==='passengers';
    renderRoadCatalogue();
    const sources=roadDatasets(true);
    const selection={category:comparisonCategory,includeTrams,cargo:truckCargo,year:truckYear};
    const vehicles=selectRoadVehicles(sources,selection);
    const options={...truckService,...roadTargets(),motion:true,distanceKm:routeDistance,routeProfile:railRouteProfile,passenger};
    renderTruckService(document,vehicles,options);
    clearTimeout(roadPhaseTimer);
    const phasePanel=$('road-phases');
    if(options.demandPerYear!==null){
      phasePanel.setAttribute('aria-busy','true');
      roadPhaseTimer=setTimeout(()=>{
        if(!$('trucks').hidden)renderRoadPhases(document,sources,selection,options);
        phasePanel.removeAttribute('aria-busy');
      },150);
    }else{
      phasePanel.removeAttribute('aria-busy');renderRoadPhases(document,sources,selection,options);
    }
    return;
  }
  if (!$('economics').hidden) {
    clearTimeout(economicProfileTimer);
    const economic=renderLineAnalysis();
    const phaseAxis=$('economic-phase-axis').querySelector('input:checked').value;
    const economicTrains=phaseAxis==='year'?economic.phaseItems:economic.eligible;
    const showEmpty=!!economic.empty&&!(economic.empty==='year'&&phaseAxis==='year'&&economicTrains.length);
    $('economic-empty').hidden=!showEmpty;
    $('economic-results').hidden=showEmpty;
    if(showEmpty){
      $('economic-empty').innerHTML=economicEmptyContent(economic.empty,comparisonCategory==='freight',!!railRouteProfile);
      for(const id of ['economic-efficiency-chart','economic-crossover-curves-chart','economic-crossovers-chart'])$(id).replaceChildren();
      return;
    }
    $('economic-efficiency').hidden=!economic.eligible.length;
    const drawEconomicCharts=()=>{
    renderEconomicChart($('economic-efficiency-chart'), {trains:economic.eligible,distance:routeDistance,fill:lineFill,targets:serviceTargets(),highlighted,mode:document.querySelector('input[name="economic-efficiency-scale"]:checked').value});
    const key=JSON.stringify([economicTrains.map(t=>[t.id,t.name,t.color,t.dash,t.year,t.massTonnes,t.powerCh,t.tractionKgf,t.maxSpeedKmh,t.lengthMetres,t.passengerCapacity,t.cargoCapacity,t.carCount,t.loadingUnloadingSpeedMultiplier,t.formationLoadingUnloadingSpeedMultiplier,t.economy]),routeDistance,lineFill,serviceTargets(),phaseAxis,catalogueYear]);
    if(key!==economicStoryKey){economicStoryKey=key;currentEconomicStory=economicStory(economicTrains,routeDistance,lineFill,serviceTargets(),{axis:phaseAxis,year:catalogueYear});}
    $('economic-rank-scale').querySelector(':scope > span').textContent=currentEconomicStory.label;
    const phaseValue=value=>phaseAxis==='year'?value:phaseAxis==='distance'?fmtKm(value):fmt(value,2);
    $('economic-phase-help').textContent=`${currentEconomicStory.label} varies over ${phaseValue(currentEconomicStory.start)}–${phaseValue(currentEconomicStory.end)}; other settings remain fixed. Dashed line: current setting when applicable. ${phaseAxis==='demand'||phaseAxis==='headway'?'This target applies to these diagrams even if its service checkbox is off. ':''}Utilization is a ceiling when a rate target applies; demand is assumed, not predicted.`;
    $('economic-phase-info').title=$('economic-phase-help').textContent;
    renderEconomicCrossovers($('economic-crossover-curves-chart'),{trains:economicTrains,story:currentEconomicStory,fill:lineFill,targets:serviceTargets(),kind:'curves',ordinateTitle:`Running cost / ${UI_TERMS.capacityUnit} ($)`,highlighted,distanceMode:document.querySelector('input[name="economic-focus-scale"]:checked').value,verticalMode:document.querySelector('input[name="economic-focus-y"]:checked').value});
    renderEconomicCrossovers($('economic-crossovers-chart'),{trains:economicTrains,story:currentEconomicStory,fill:lineFill,targets:serviceTargets(),kind:'rank',highlighted,distanceMode:document.querySelector('input[name="economic-rank-scale"]:checked').value});
    $('economic-phases').closest('table').querySelector('th').textContent=currentEconomicStory.label;
    $('economic-phases').innerHTML=currentEconomicStory.phases.map(p=>`<tr><td>${phaseValue(p.start)} – ${phaseValue(p.end)}</td><td>${p.leaders.map(id=>escape(economicTrains.find(t=>t.id===id).name)).join(' / ')||'No available train'}</td></tr>`).join('');
    $('economic-results').removeAttribute('aria-busy');
    };
    if(railRouteProfile){$('economic-results').setAttribute('aria-busy','true');economicProfileTimer=setTimeout(()=>{if(!$('economics').hidden)drawEconomicCharts();},150);}else drawEconomicCharts();
    return;
  }
  if(navigation.domain==='road')renderRoadCatalogue();
  $('rail-freight-filter').hidden=comparisonCategory!=='freight';
  const byYear=$('race-phase-axis').querySelector('input:checked').value==='year';
  $('crossover-orientation').hidden=$('focus-time').hidden=byYear;
  $('crossover-axis-note').hidden=byYear;
  for(const id of ['focus-distance','rank-distance-scale'])$(id).querySelector(':scope > span').textContent=byYear?'Game year':'Distance';
  const ts = active();
  syncRouteDistanceControls();
  for (const row of $('trains').querySelectorAll('[data-train]')) row.classList.toggle('is-highlighted',row.dataset.train===highlighted);
  renderChart('speed');
  renderChart('race');
  renderCrossovers();
  renderCrossoverCurves();
  const ranking=ts.map(t=>({t,time:t.model.timeAt(routeDistance)})).sort((a,b)=>a.time-b.time);
  $('race-summary').textContent=ranking.length?`${ranking[0].t.name} arrives first at ${fmtKm(routeDistance)} km in ${formatTime(ranking[0].time)}${ranking.length>1?`; ${formatTime(ranking[1].time-ranking[0].time)} ahead of ${ranking[1].t.name}`:''}. ${navigation.domain==='road'?'Experimental grade effects; braking is omitted.':railRouteProfile?'Segment grades and speed-limit braking are theoretical; no stop at B in Race.':`Gradient A→B: ${fmt(railGradePercent,1)}% (theoretical); braking is excluded.`}`:'Select at least one vehicle to compare travel times.';
  const blocked=raceCandidates().filter(t=>!(railRouteProfile?withRailProfile(t,railRouteProfile).model.canStart:canClimbRail(t,railGradePercent)));
  if(blocked.length)$('race-summary').textContent+=` ${railRouteProfile?'Cannot complete this route':'Cannot overcome resistance on this route'}: ${blocked.map(t=>t.name).join(', ')}.`;
  $('ranking-caption').textContent=`Theoretical arrival ranking at ${fmtKm(routeDistance)} km`;
  $('value-heading').textContent='Arrival time (m:ss)'; $('extra-heading').textContent='Speed at arrival (km/h)';
  $('ranking').innerHTML=ranking.map(({t,time},i)=>`<tr><td>${i+1}</td><td><span class="train-key" style="--train-color:${t.color}"></span>${escape(t.name)}</td><td>${formatTime(time)}</td><td>${fmt(t.model.stateAt(time).speedKmh)}</td></tr>`).join('');
  const transitionPanel=$('transitions').closest('details'),transitionHeadings=transitionPanel.querySelectorAll('thead th');
  transitionPanel.querySelector('.chart-help').textContent=speedUsesProfile()?(navigation.domain==='road'?'Maximum speed is the highest speed reached before B. Traction-to-power and segment points appear on hover. Braking is omitted.':'Maximum speed is the highest speed reached before B. Traction-to-power and braking/segment points appear on hover. Arrival is at B; no terminal stop is modelled in Race.'):'Maximum speed is the vehicle/track cap or the lower equilibrium limit. Approach times and distances use the same milestones as the graph: the speed cap, or 99% of equilibrium. They are independent of route distance.';
  transitionHeadings[3].textContent=speedUsesProfile()?'Highest speed reached (km/h)':'Maximum speed (km/h)';
  transitionHeadings[4].textContent=speedUsesProfile()?'Arrival at B (m:ss)':'Approach time (m:ss)';
  transitionHeadings[5].textContent=speedUsesProfile()?'Route length (km)':'Approach distance (km)';
  $('transitions').innerHTML=renderModelTransitions(active(speedView));
}
function download(content,type,filename) {
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent=`Export ready: ${filename}`;
}

function initTheme() {
  const system=matchMedia('(prefers-color-scheme: dark)');
  let chosen;
  try {chosen=localStorage.getItem('tf3-theme');} catch {}
  const apply=theme=>{
    document.documentElement.dataset.theme=theme;
    const dark=theme==='dark';
    $('theme-toggle').title=dark?'Switch to light mode':'Switch to dark mode';
    $('theme-toggle').setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
    $('theme-toggle').setAttribute('aria-pressed',String(dark));
  };
  apply(chosen || (system.matches?'dark':'light'));
  $('theme-toggle').addEventListener('click',()=>{
    chosen=document.documentElement.dataset.theme==='dark'?'light':'dark';
    try {localStorage.setItem('tf3-theme',chosen);} catch {}
    apply(chosen);
  });
  system.addEventListener('change',event=>{if(!chosen)apply(event.matches?'dark':'light');});
}
initTheme();

async function ensureRoad(){
  if(roadLoaded||roadLoading)return roadLoading;
  $('road-load-status').hidden=false;$('road-load-status').textContent='Loading road and tram comparisons…';$('road-retry').hidden=true;
  roadLoading=(async()=>{
    try{
      [truckDataset,busDataset,tramDataset]=await Promise.all(['trucks','buses','trams'].map(loadData));
      for(const t of [...truckDataset.trucks,...busDataset.buses,...tramDataset.trams,...tramDataset.freightTrams])selectedRoad.add(t.id);
      roadLoaded=true;document.querySelector('.road-settings').inert=false;$('road-load-status').hidden=true;
      for(const id of ['truck-service','truck-cost-chart','road-phases'])$(id).hidden=false;
      renderRoadCatalogue();if(navigation.space==='compare'&&navigation.domain==='road')render();
    }catch(error){$('road-load-status').textContent='Unable to load road data. Train comparisons remain available.';$('road-retry').hidden=false;console.error(error);}
    finally{roadLoading=null;}
  })();return roadLoading;
}

async function ensureConfigurator(){
  if(consistEditor||configurationLoading)return configurationLoading;
  $('configuration-load-status').hidden=false;$('configuration-load-status').textContent='Loading composition catalogue…';$('configuration-retry').hidden=true;
  configurationLoading=(async()=>{
    try{
      const componentFiles=['tram-locomotives','tram-passenger-wagons','tram-freight-wagons','rail-locomotives','rail-passenger-wagons','rail-freight-wagons'];
      const [tram,components,thumbnails]=await Promise.all([loadData('trams'),Promise.all(componentFiles.map(loadData)),loadData('vehicle-thumbnails').catch(error=>{console.error(error);return null;})]);
      tramDataset=tram;
      let compositionStorage;try{compositionStorage=window.localStorage;}catch{}
      compositionAnalysis=mountCompositionAnalysis(document,{getSettings:compositionSettings,onSettingsChange:updateCompositionSettings,onRouteModeChange:mode=>{routeSelection.select(mode);syncRouteSelection({restore:true});}});
      consistEditor=mountConsistEditor(document,{catalogue:[...tramComponents({locomotives:components[0].locomotives,passengerWagons:components[1].wagons,freightWagons:components[2].wagons,passengerTrams:tramDataset.trams,freightTrams:tramDataset.freightTrams}),...railComponents({locomotives:components[3].locomotives,passengerWagons:components[4].wagons,freightWagons:components[5].wagons,multipleUnits:dataset.trains})],units:dataset.source,storage:compositionStorage,thumbnails,onPreview:preview=>{liveComposition=preview;$('composition-compare').disabled=!preview;compositionAnalysis.setDraft(preview);},onChange:change=>{
        if(change.item?.carrier==='tram'){
          setComparisonCategory(change.item.category);truckCargo=change.item.freightSpecialization==='general'?'all':change.item.freightSpecialization??'all';includeTrams=true;truckYear=Math.max(truckYear,change.item.year);
          $('truck-cargo-specialization').querySelector(`input[value="${truckCargo}"]`).checked=true;$('road-include-trams').checked=true;$('truck-year').value=truckYear;$('truck-year-value').textContent=truckYear;updateRoadCategory();
        }
        syncCustomCompositions(change);
      }});
      syncCustomCompositions();

      document.querySelector('.configuration-filters').inert=false;
      $('configuration-load-status').hidden=!!thumbnails;
      if(!thumbnails)$('configuration-load-status').textContent='Vehicle images could not be loaded. Building and comparing compositions remain available.';
      $('component-catalogue').hidden=false;$('composition-builder').hidden=false;$('composition-analysis').hidden=false;
      compositionAnalysis.refresh();
    }catch(error){$('configuration-load-status').textContent='Unable to load composition data. Standard comparisons remain available.';$('configuration-retry').hidden=false;console.error(error);}
    finally{configurationLoading=null;}
  })();return configurationLoading;
}

async function ensureData(){
  if(dataLoading)return dataLoading;
  const tasks=[];
  if(!sourceMounted)tasks.push((async()=>{
    $('source-load-status').hidden=false;$('source-load-status').textContent='Loading vehicle catalogue…';$('source-retry').hidden=true;
    for(const input of document.querySelectorAll('.source-filters input,.source-filters select'))input.disabled=true;
    try{
      const catalogue=await loadData('source-catalogue');
      for(const input of document.querySelectorAll('.source-filters input,.source-filters select'))input.disabled=false;
      mountSourceCatalogue(document,catalogue);sourceMounted=true;$('source-load-status').hidden=true;
    }catch(error){$('source-load-status').textContent='Unable to load the catalogue. Comparators remain available.';$('source-retry').hidden=false;console.error(error);}
  })());
  if(!experiments)tasks.push((async()=>{
    $('experiment-load-status').hidden=false;$('experiment-load-status').textContent='Loading experimental checks…';$('experiment-retry').hidden=true;
    try{experiments=await loadData('experiments');$('experiment-load-status').hidden=true;if(!$('data').hidden)renderDataView(dataset,baseTrains,experiments);}
    catch(error){$('experiment-load-status').textContent='Unable to load experimental checks. Catalogue and calculations remain available.';$('experiment-retry').hidden=false;console.error(error);}
  })());
  renderDataView(dataset,baseTrains,experiments??{experiments:[]});
  dataLoading=Promise.all(tasks).finally(()=>{dataLoading=null;});return dataLoading;
}

async function init() {
  mountServiceControls(document,'rail');mountServiceControls(document,'road');
  for(const [id,name] of [['rail-cargo','rail-cargo'],['truck-cargo-specialization','truck-cargo'],['configuration-cargo','configuration-cargo']])mountFreightFilter($(id),{name});
  mountTablePreviews(document);
  mountControlHelp(document);
  dataset=await loadData('trains');
  baseTrains=dataset.trains.map(t=>({...t,model:createModel(t,dataset.source)}));trains=[...baseTrains];selected=new Set(trains.map(t=>t.id));
  trainSelector=mountVehicleSelector($('train-selector'),{
    ids:{search:'train-search',sort:'train-sort',count:'selection-count',select:'select-visible',clear:'clear-visible',list:'trains',empty:'no-results'},
    getItems:trainCandidates,getSelected:()=>selected,
    describe:t=>`${t.massTonnes} t · ${fmt(t.powerCh * dataset.source.horsepowerWatts / 1000)} kW · ${fmt(t.tractionKgf*dataset.source.kgfNewtons,0)} N`,
    onHighlight:id=>setChartHighlight(document,'rail',id),
    onChange:()=>{highlighted=undefined;render();},onEdit:editComposition
  });
  $('train-selector').querySelector('.selection-actions').append($('explore-history'));
  roadSelector=mountVehicleSelector($('road-selector'),{
    ids:{search:'road-vehicle-search',sort:'road-sort',count:'road-selection-count',select:'road-select-visible',clear:'road-clear-visible',list:'road-vehicles',empty:'road-no-results'},
    getItems:roadCandidates,getSelected:()=>selectedRoad,
    describe:t=>`${t.vehicleType} · ${t.passengerCapacity??t.cargoCapacity} ${UI_TERMS.capacityUnit} · $${fmt(t.economy.annualMaintenance,0)}/year`,
    onHighlight:id=>setChartHighlight(document,'road',id),
    onChange:()=>{highlighted=undefined;render();},onEdit:editComposition
  });
  updateRoadCategory=()=>{
    const passenger=comparisonCategory==='passengers';
    $('road-metric-help').textContent=`Running cost per ${UI_TERMS.capacityUnit} — lower is better.`;
    $('road-intro').textContent=passenger?`Compare buses${includeTrams?' and passenger trams':''} on A–B–A, with equal utilization in both directions. Fixed passenger handling factor: 1.`:`Compare trucks${includeTrams?' and freight trams':''} on A–B–A. Fixed freight handling factor: 0.0625 (1/16).`;
    for(const id of ['road-freight-filter','road-return-control','road-freight-facilities'])$(id).hidden=passenger;
    $('road-passenger-warning').hidden=!passenger;
    $('road-flow-unit').textContent=`${UI_TERMS.capacityUnit}/year${passenger?'/direction':''}`;
    $('truck-service-readout').closest('table').querySelector('.road-fleet-column:nth-last-child(2)').innerHTML=`${UI_TERMS.rate}<span class="table-unit">${UI_TERMS.capacityUnit}/year</span>`;
    $('road-utilization-label').textContent=roadFlow===null?'Utilization':'Utilization limit';
    $('road-utilization-help').textContent=roadFlow===null?'Share of capacity used on each loaded leg.':'Maximum utilization of capacity when sizing the fleet.';
    $('road-utilization-info').title=$('road-utilization-help').textContent;
    $('road-service-options-summary').textContent=[roadFlow===null?'No rate target':`${fmt(roadFlow,0)} ${UI_TERMS.capacityUnit}/year${passenger?'/direction':''}`,roadHeadway===null?'No frequency target':`${formatTime(roadHeadway)} ${roadFrequencyMode==='maximum'?'maximum interval':'target interval'}`].join(' · ');
    $('road-handling-calibration').textContent=passenger?'Passenger handling: 1 passenger/s per vehicle multiplier. Fixed pauses: 2 s before alighting, 2 s before boarding and 2 s before departure (6 s per terminal). Bus and tram timings have not been independently measured.':'Freight handling: 0.0625 cargo units/s per vehicle multiplier (1/16 of the passenger factor), consistent with approximate MAN 19.304 timings. Fixed pauses: 2 s before each active transfer operation and departure. Loading plus unloading: 6 s per terminal; one operation only: 4 s.';
    $('road-chart-help').textContent=`Shorter bars are better · $ / ${UI_TERMS.capacityUnit} · starts at zero`;
    $('truck-chart-heading').textContent=`Running cost per ${UI_TERMS.capacityUnit}`;
    $('road-cost-column').innerHTML=`Cost / ${UI_TERMS.capacityUnit}<br>($) ↓`;
    $('road-source-download').href=passenger?'./data/buses.json':'./data/trucks.json';
    $('road-source-download').textContent=`Download ${passenger?'bus':'truck'} source data JSON ↓`;
    $('road-tram-source-download').hidden=!includeTrams;
    $('road-handling-group').hidden=passenger;
  };
  const validateRoad=()=>validateNumberInputs(['road-desired-flow','road-desired-headway'].map($),$('road-input-error'));
  const updateTruckService=()=>{
    const useFlow=$('road-enable-flow').checked,useFrequency=$('road-enable-frequency').checked;
    $('road-desired-flow').disabled=!useFlow;$('road-desired-headway').disabled=!useFrequency;$('road-frequency-mode').disabled=!useFrequency;
    if(!validateRoad())return;
    const distanceKm=routeDistance,fillRatio=$('truck-utilization').valueAsNumber/100;
    roadFlow=useFlow?$('road-desired-flow').valueAsNumber:null;
    roadHeadway=useFrequency?$('road-desired-headway').valueAsNumber*60:null;
    roadFrequencyMode=$('road-frequency-mode').querySelector('input:checked').value;
    $('truck-utilization-value').textContent=`${Math.round(fillRatio*100)}%`;
    truckService={distanceKm,fillRatio,loadedReturn:$('truck-loaded-return').checked,stopA:{specializedTerminal:$('truck-specialized-terminal').checked,specializedWarehouse:$('truck-specialized-warehouse').checked},stopB:{specializedTerminal:$('truck-specialized-terminal-b').checked,specializedWarehouse:$('truck-specialized-warehouse-b').checked}};
    updateRoadCategory();render();
  };
  for(const id of ['road-enable-flow','road-enable-frequency','road-frequency-mode'])$(id).addEventListener('change',updateTruckService);
  for(const id of ['road-desired-flow','road-desired-headway'])$(id).addEventListener('input',updateTruckService);
  comparisonCategoryControl=mountTransportCategory($('comparison-category'),{value:comparisonCategory,legend:'Transport',showLegend:true,onChange:category=>{
    setComparisonCategory(category);highlighted=undefined;renderCatalogue();render();
  }});
  $('road-include-trams').addEventListener('change',()=>{includeTrams=$('road-include-trams').checked;updateRoadCategory();render();});
  updateRoadCategory();
  $('truck-cargo-specialization').addEventListener('change',()=>{
    truckCargo=document.querySelector('input[name="truck-cargo"]:checked').value;render();
  });
  const updateTruckYear=mountYearControl({range:$('truck-year'),output:$('truck-year-value'),previous:$('truck-year-previous'),next:$('truck-year-next'),onChange:year=>{truckYear=year;render();}});
  for(const id of ['truck-utilization','truck-loaded-return','truck-specialized-terminal','truck-specialized-warehouse','truck-specialized-terminal-b','truck-specialized-warehouse-b'])$(id).addEventListener('input',updateTruckService);
  for(const id of ['road-phase-axis','road-cost-scale','road-rank-scale','race-phase-axis','economic-phase-axis'])$(id).addEventListener('change',render);
  renderCatalogue();mountPanelDrawers(document,window.matchMedia('(max-width:700px)'));
  observePhaseHighlight(document,'rail',id=>{
    highlighted=id;trainSelector.highlight(id);
    for(const row of $('line-readout').querySelectorAll('[data-train]'))row.classList.toggle('is-highlighted',row.dataset.train===id);
  });
  observePhaseHighlight(document,'road',id=>{roadSelector.highlight(id);if(navigation.domain==='road')highlighted=id;});
  const setCatalogueYear = year => {catalogueYear=Math.max(Number($('catalogue-year').min),Math.min(Number($('catalogue-year').max),year));highlighted=undefined;renderCatalogue();render();};
  mountYearControl({range:$('catalogue-year'),output:$('catalogue-year-value'),previous:$('year-previous'),next:$('year-next'),onChange:setCatalogueYear});
  $('explore-history').addEventListener('click',()=>{document.body.classList.add('history-exploration');selected=new Set(trains.map(t=>t.id));$('train-search').value='';setCatalogueYear(1900);});
  $('reset').addEventListener('click',()=>{document.body.classList.remove('history-exploration');selectAll(selected,trains);trainSelector.clearSearch();catalogueYear=Number($('catalogue-year').max);highlighted=undefined;renderCatalogue();render();});
  $('road-reset').addEventListener('click',()=>{selectAll(selectedRoad,Object.values(roadDatasets()).flat());roadSelector.clearSearch();$('truck-year').value=$('truck-year').max;updateTruckYear();});
  $('speed-orientation').addEventListener('change',()=>{speedView=$('speed-orientation').querySelector('input:checked').value;render();});
  $('race-orientation').addEventListener('change',e=>{
    const previous=raceView;raceView=e.target.value;highlighted=undefined;
    if(previous!==raceView){const x=scaleMode('x'),y=scaleMode('y');document.querySelector(`input[name="x-scale"][value="${y}"]`).checked=true;document.querySelector(`input[name="y-scale"][value="${x}"]`).checked=true;}
    render();
  });
  const validateEconomics=()=>validateNumberInputs(['desired-flow','desired-headway','platform-length'].map($),$('economic-input-error'));
  const updateTargets=()=>{
    const flow=Number($('desired-flow').value), interval=Number($('desired-headway').value);
    const flowEnabled=$('enable-flow').checked, frequencyEnabled=$('enable-frequency').checked;
    const platformEnabled=$('enable-platform-limit').checked, length=$('platform-length').valueAsNumber;
    $('platform-length').disabled=!platformEnabled;
    $('desired-flow').disabled=!flowEnabled;
    $('desired-headway').disabled=!frequencyEnabled;
    $('frequency-mode').disabled=!frequencyEnabled;
    $('allow-multiple-units').disabled=!(frequencyEnabled&&flowEnabled)||comparisonCategory==='freight';
    if(!validateEconomics())return;
    lineFill=$('line-fill').valueAsNumber/100;
    desiredFlow=$('enable-flow').checked?flow:null;
    maxHeadwaySeconds=$('enable-frequency').checked?interval*60:null;
    frequencyMode=document.querySelector('input[name="frequency-mode"]:checked').value;
    crossoverCache.clear();raceYearKey=null;economicStoryKey=null;
    allowMultipleUnits=frequencyEnabled&&flowEnabled&&$('allow-multiple-units').checked;
    platformLengthMetres=platformEnabled?length:null;
    $('frequency-mode').disabled=maxHeadwaySeconds===null;
    $('desired-flow').disabled=desiredFlow===null;
    $('desired-headway').disabled=maxHeadwaySeconds===null;
    render();
  };
  const validateRace=()=>validateNumberInputs([$('distance-input'),$('race-gradient-input'),$('route-speed-input')],$('race-input-error'));
  raceGradientControl=mountGradientControl(document,$('race-gradient'),{rail:true,noticeId:'race-input-error',validate:validateRace,onChange:grade=>updateSimpleRoute({gradePercent:grade})});
  profileControl=mountRouteProfileControls($('route-profile-control'),{
    initial:railRouteProfile,
    getSpeedPresets:()=>speedPresets(navigation.domain),
    visual:$('route-profile-visual'),scaleControl:$('profile-horizontal-scale'),scaleNote:$('profile-scale-note'),segmentList:$('profile-segment-list'),
    onChange:state=>{routeSelection.updateCustom(state.segments);syncRouteSelection({restore:true});}
  });
  mountRouteChoice($('comparison-route-choice'),{value:routeSelection.mode,onChange:mode=>{routeSelection.select(mode);syncRouteSelection({restore:true});}});
  $('profile-use-route').addEventListener('click',()=>{routeSelection.select('custom');syncRouteSelection({restore:true});});
  syncRouteSelection();
  $('route-speed-input').addEventListener('input',()=>{if(validateRace())updateSimpleRoute({speedLimitKmh:$('route-speed-input').valueAsNumber});});
  $('race-infrastructure-speed').addEventListener('change',()=>{
    const speed=$('race-infrastructure-speed').querySelector('input:checked').value;
    $('route-speed-input').value=speed;
    if(validateRace())updateSimpleRoute({speedLimitKmh:Number(speed)});
  });
  for(const id of ['enable-flow','enable-frequency','frequency-mode','allow-multiple-units','enable-platform-limit'])$(id).addEventListener('change',updateTargets);
  for(const id of ['desired-flow','desired-headway','platform-length'])$(id).addEventListener('input',updateTargets);
  $('show-service-details').addEventListener('change',e=>{
    document.querySelector('.line-table').classList.toggle('show-details',e.target.checked);
    renderLineAnalysis();
  });
  $('rail-cargo').addEventListener('change',()=>{
    economicCargo=$('rail-cargo').querySelector('input:checked').value;
    highlighted=undefined;renderCatalogue();render();
  });
  for(const id of ['rail-loaded-return','rail-terminal-a','rail-warehouse-a','rail-terminal-b','rail-warehouse-b'])$(id).addEventListener('change',()=>{
    railFreight={loadedReturn:$('rail-loaded-return').checked,
      stopA:{specializedTerminal:$('rail-terminal-a').checked,specializedWarehouse:$('rail-warehouse-a').checked},
      stopB:{specializedTerminal:$('rail-terminal-b').checked,specializedWarehouse:$('rail-warehouse-b').checked}};
    render();
  });
  $('economic-empty').addEventListener('click',event=>{
    if(event.target.closest('#economic-empty-select')){selectResults(selected,economicCandidates(trains,economicSelectionOptions()),true);renderCatalogue();render();}
  });
  document.addEventListener('click',async event=>{
    if(event.target.closest('[data-economic-configure]')){
      const context={carrier:'rail',category:comparisonCategory,cargo:economicCargo,year:catalogueYear};
      await ensureConfigurator();
      consistEditor?.openContext(context);
    }
  });
  $('service-options').addEventListener('toggle',updateStickyOffsets);
  $('line-fill').addEventListener('input',updateTargets);
  mountDistanceControl({number:$('distance-input'),range:$('route-distance'),validate:validateRace,onChange:distance=>updateSimpleRoute({distanceKm:distance}),event:'input'});
  for(const id of ['x-scale','y-scale','speed-x-scale','speed-y-scale','focus-distance','focus-time','crossover-orientation','emphasize-leaders','rank-distance-scale','economic-efficiency-scale','economic-focus-scale','economic-focus-y','economic-rank-scale']) $(id).addEventListener('change',()=>render());
  for (const kind of ['speed','race']) {
  const el = id => $(kind === 'speed' ? `speed-${id}` : id);
  el('svg').addEventListener('click',()=>{
    const view = kind === 'speed' ? speedView : raceView, horizon = chartHorizon(view);
    const prior=highlighted;highlighted=undefined;renderChart(kind,1400);const svg=el('chart').querySelector('svg').cloneNode(true);svg.querySelectorAll('.curve-hit').forEach(path=>path.remove());highlighted=prior;render();
    const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent='text{font-family:system-ui,sans-serif;font-size:12px;fill:#56665d}.end-label{font-weight:600}';svg.prepend(style);
    // Wrap the legend so exports remain usable with a large selection.
    const routeLabel=speedUsesProfile()?`${railRouteProfile.length} segments · varying grades and limits`:`Gradient A→B: ${fmt(railRouteProfile[0].gradePercent,1)}%`;
    const lines=[`Modelled motion · ${routeLabel} · Route distance: ${fmtKm(routeDistance)} km · Horizontal axis: ${views[view].x} · Up to ${fmt(horizon,2)} ${views[view].unit}`,...active(view).map(t=>`${t.name} (${t.maxSpeedKmh} km/h)`)]
    const chartHeight=Number(svg.getAttribute('viewBox').split(' ')[3]);
    lines.forEach((line,i)=>{const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',65);text.setAttribute('y',chartHeight+30+i*18);text.textContent=line;svg.append(text);});
    svg.setAttribute('viewBox',`0 0 1400 ${chartHeight+40+lines.length*18}`);
    download(new XMLSerializer().serializeToString(svg),'image/svg+xml',`tf3-${view}-${scaleMode('x',kind)}-${scaleMode('y',kind)}.svg`);
  });
  el('csv').addEventListener('click',()=>{const view = kind === 'speed' ? speedView : raceView, horizon = chartHorizon(view);const rows=[['vehicle','time_s','distance_km','speed_kmh']];for(const t of active(view)){const end=motionCurveEnd(t,view,horizon);for(let i=0;i<=300;i++){const x=i*end/300,state=motionStateAtAbscissa(t,x,view),time=state.time;rows.push([t.name,time.toFixed(4),state.distanceKm.toFixed(6),state.speedKmh.toFixed(4)]);}}download(rows.map(row=>row.map(cell=>`"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv;charset=utf-8',`tf3-${view}.csv`);});
  }
  const stickyObserver = new ResizeObserver(updateStickyOffsets);
  stickyObserver.observe(document.querySelector('.app-header'));
  stickyObserver.observe($('line-capacity'));
  updateStickyOffsets();
  window.addEventListener('resize',()=>render());
  $('road-retry').addEventListener('click',()=>void ensureRoad());
  $('configuration-retry').addEventListener('click',()=>void ensureConfigurator());
  $('source-retry').addEventListener('click',()=>void ensureData());
  $('experiment-retry').addEventListener('click',()=>void ensureData());
  $('quick-races').addEventListener('click',event=>{
    const button=event.target.closest('[data-duel]');if(!button)return;
    setComparisonCategory('passengers');
    selected=new Set(['avelia-liberty',button.dataset.duel]);highlighted=undefined;
    catalogueYear=Math.max(catalogueYear,...trains.filter(t=>selected.has(t.id)).map(t=>t.year));
    trainSelector.clearSearch();renderCatalogue();render();
  });
  $('composition-compare').addEventListener('click',compareComposition);
  $('comparison-preview').querySelector('a').addEventListener('click',event=>{event.preventDefault();editComposition(comparisonComposition.id);});
  $('compare-domain').addEventListener('change',event=>{location.hash=navigation.view==='race'?(event.target.value==='road'?'#road-race':'#race'):(event.target.value==='road'?'#trucks':'#economics');});
  window.addEventListener('hashchange',syncAnalysisView);syncAnalysisView();
  try{if(localStorage.getItem('tf3-compositions-v1'))void ensureConfigurator();}catch{}
}
init().catch(error=>{$('status').textContent='Unable to load the lab. Serve the site over HTTP and try again.';console.error(error);});
