import {renderTruckService, selectRoadVehicles} from './trucks.js';
import {renderDataView} from './data-view.js';
import {curveLabels, trainLegend} from './chart-labels.js';
import {economicStory} from './economic-crossovers.js';
import {renderEconomicCrossovers} from './economic-crossover-chart.js';
import {renderEconomicChart} from './economic-chart.js';
import {analyseService as analyseLine} from './line.js';
import {createModel} from './model.js';
import {createScale} from './scales.js';
import {createPhaseScale, leadershipWeights} from './phase-scale.js';
import {crossoverStory, leaderCurveWindow, rankWindow} from './crossovers.js';
import {formatTime} from './format.js';
import {raceHorizon, rankingSettlesAt, suggestedDistanceLimit, speedHorizon} from './race.js';
const $ = id => document.getElementById(id);
const fmt = (n, digits = 1) => n.toLocaleString('en-GB', {minimumFractionDigits: digits, maximumFractionDigits: digits});
const scaleMode = (axis, kind = 'race') => document.querySelector(`input[name="${kind === 'speed' ? 'speed-' : ''}${axis}-scale"]:checked`).value;
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const views = {
  distance: {title: 'Distance over time', x: 'Time since departure (m:ss)', y: 'Distance travelled (km)', unit: 's', xFloor: 10, yFloor: .1, yUnit: 'km', help: 'The highest curve shows the leading train.'},
  speed: {title: 'Speed over time', x: 'Time since departure (m:ss)', y: 'Speed (km/h)', unit: 's', xFloor: 10, yFloor: 10, yUnit: 'km/h', help: 'The curves show how each train accelerates to its top speed.'},
  time: {title: 'Time over distance', x: 'Distance travelled (km)', y: 'Time since departure (m:ss)', unit: 'km', xFloor: .1, yFloor: 10, yUnit: 's', help: 'The lowest curve shows the train that reaches the distance first.'}
};
const distanceLimits = new Map();
function selectionLimits(ts) {
  const key = ts.map(t => t.id).sort().join('|');
  if (!distanceLimits.has(key)) distanceLimits.set(key, {stable: rankingSettlesAt(ts), limit: suggestedDistanceLimit(ts)});
  return distanceLimits.get(key);
}
let economicStoryKey, currentEconomicStory;
let busDataset, tramDataset, roadCategory = 'freight', includeTrams = false;
let truckDataset, truckRoadSpeedLimit = null, truckYear = 2020, truckCargo = 'all';
let truckService = {distanceKm:1,fillRatio:1,loadedReturn:false,specializedTerminal:false,specializedWarehouse:false};
let dataset, experiments, trains, selected, defaults, highlighted, raceView = 'distance', routeDistance = 10, catalogueYear = 2020, lineFill = 1, desiredFlow = null, maxHeadwaySeconds = null, frequencyMode = 'maximum';
function serviceTargets(){return {demandPerDirection:desiredFlow,maxHeadwaySeconds,frequencyMode};}
function active() {return trains.filter(t => selected.has(t.id) && t.year <= catalogueYear);}
function arrivalName(t, view) {return view === 'speed' ? t.name : `${t.name} · ${formatTime(t.model.timeAt(routeDistance))}`;}
function renderSelectionCount() {
  const shown = active().length, hidden = selected.size-shown;
  $('selection-count').textContent = `${shown} selected${hidden ? ` · ${hidden} hidden by year` : ''} · ${visible().length} of ${trains.length} shown`;
}
function value(t, x, view) {return view === 'time' ? t.model.timeAt(x) : t.model.stateAt(x)[view === 'speed' ? 'speedKmh' : 'distanceKm'];}
function visible() {
  const query = $('train-search').value.trim().toLowerCase();
  const sort = $('train-sort').value;
  return trains.filter(t => t.year <= catalogueYear && `${t.name} ${t.year}`.toLowerCase().includes(query)).sort((a,b) => sort === 'speed' ? b.maxSpeedKmh - a.maxSpeedKmh : sort === 'year' ? b.year - a.year : a.name.localeCompare(b.name));
}
function renderCatalogue() {
  const results = visible();
  $('train-count').textContent = trains.length;
  renderSelectionCount();
  $('catalogue-year-value').textContent = catalogueYear;
  $('catalogue-year').value = catalogueYear;
  $('year-previous').disabled = catalogueYear <= 1900;
  $('year-next').disabled = catalogueYear >= 2020;
  $('no-results').hidden = !!results.length;
  $('select-visible').disabled = $('clear-visible').disabled = !results.length;
  $('trains').innerHTML = results.map(t => `<label class="train-row" data-train="${escape(t.id)}" style="--train-color:${t.color}"><input type="checkbox" value="${escape(t.id)}" ${selected.has(t.id) ? 'checked' : ''} aria-label="Compare ${escape(t.name)}"><span class="train-info"><span class="train-name">${escape(t.name)}</span><span class="train-spec">${t.year} · ${t.maxSpeedKmh} km/h</span><span class="train-power">${t.massTonnes} t · ${fmt(t.powerCh * dataset.source.horsepowerWatts / 1000)} kW · ${fmt(t.tractionKgf, 0)} kgf</span></span></label>`).join('');
}
function sample(t, xScale, yScale, view, horizon) {
  // Find where the curve enters the positive log domain, rather than inventing zero.
  let start = xScale.min;
  if (value(t, start, view) < yScale.min) {
    let low = start, high = horizon;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      if (value(t, mid, view) < yScale.min) low = mid; else high = mid;
    }
    start = high;
  }
  // Stop precisely at the displayed ceiling instead of flattening the curve there.
  let end = horizon;
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
  for (let i = 0; i <= 400; i++) {
    const x = xScale.mode === 'log' ? xScale.invert(i / 400) : i * horizon / 400;
    if (x >= start && x <= end) xs.add(x);
    // Extra samples resolve the first seconds on a logarithmic vertical axis.
    if (yScale.mode === 'log' && start > 0) xs.add(start * (end / start) ** (i / 400));
  }
  return [...xs].sort((a,b) => a-b).map(x => [x,value(t,x,view)]).filter(([x,y]) => Number.isFinite(xScale.position(x)) && Number.isFinite(yScale.position(y)));
}
function tickLabel(n) {return fmt(n, n > 0 && n < 1 ? Math.min(4, Math.ceil(-Math.log10(n))) : n % 1 ? 1 : 0);}
function chartHorizon(view, ts = active()) {
  return view === 'time' ? routeDistance : view === 'speed' ? speedHorizon(ts) : Math.max(1, raceHorizon(ts, routeDistance).seconds);
}
function renderChart(kind, width) {
  const view = kind === 'speed' ? 'speed' : raceView;
  const el = id => $(kind === 'speed' ? `speed-${id}` : id);
  const clipId = `${kind}-plot-clip`;
  const W = typeof width === 'number' ? width : Math.max(320, el('chart').clientWidth || 1000);
  const ts = active(), spec = views[view];
  const labelSpace = view === 'distance' ? Math.max(120, Math.ceil(Math.max(0,...trains.map(t=>arrivalName(t, view).length))*7/Math.sqrt(2))+24) : 0;
  const H = (W < 700 ? 430 : 610) + labelSpace, L = 65, R = W < 700 || view === 'distance' ? 18 : 220, T = 45 + labelSpace, B = 50;
  const horizon = chartHorizon(view, ts);
  el('chart-heading').textContent = spec.title;
  const xName = view === 'time' ? 'Distance' : 'Time', yName = view === 'time' ? 'Time' : view === 'speed' ? 'Speed' : 'Distance';
  for (const [axis,name] of [['x',xName],['y',yName]]) {el(`${axis}-scale-label`).textContent=name;el(`${axis}-scale-legend`).textContent=`${name} scale`;}
  el('chart-help').textContent = spec.help;
  el('empty').hidden = !!ts.length; el('csv').disabled = el('svg').disabled = !ts.length;
  const max = Math.max(1,...ts.map(t=>value(t,horizon,view)));
  const step = 10 ** Math.floor(Math.log10(max / 5));
  const ymax = view === 'distance' ? routeDistance * 1.1 : Math.ceil(max / 5 / step) * step * 5;
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
    content+=`<text x="${pos}" y="${H-B+23}" text-anchor="middle">${view !== 'time' ? formatTime(x) : tickLabel(x)}</text>`;
  }
  content+=`<line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" stroke="#ccd4cc"/><text x="${(W+L-R)/2}" y="${H-6}" text-anchor="middle">${spec.x}${xScale.mode==='log' ? ' · log scale' : ''}</text>`;
  if (view === 'distance' && Number.isFinite(sy(routeDistance))) {
    const y = sy(routeDistance);
    content += `<line class="distance-target" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" stroke="#8a5f2b" stroke-dasharray="6 5"/><text x="${L+8}" y="${y-7}" style="fill:#8a5f2b">${fmt(routeDistance)} km target</text>`;
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
    const labelled = ts.map(t=>{const end=view==='distance'?Math.min(horizon,t.model.timeAt(ymax)):horizon;return {t,x:sx(end),y:sy(Math.min(ymax,value(t,end,view)))};}).filter(t=>Number.isFinite(t.y)).sort((a,b)=>a.y-b.y);
    for(let i=0;i<labelled.length;i++) labelled[i].labelY=Math.max(labelled[i].y,i ? labelled[i-1].labelY+20 : T+5);
    for(let i=labelled.length-1;i>=0;i--) labelled[i].labelY=Math.min(labelled[i].labelY,i===labelled.length-1?H-B-5:labelled[i+1].labelY-20);
    for(const {t,x,y,labelY} of labelled) content+=`<line x1="${x}" y1="${y}" x2="${W-R+12}" y2="${labelY}" stroke="${t.color}" opacity=".35"/><text class="end-label" data-train="${escape(t.id)}" x="${W-R+17}" y="${labelY+4}" style="fill:${t.color}" opacity="${!highlighted||highlighted===t.id?1:.25}">${escape(arrivalName(t, view))}</text>`;
  }
  el('chart').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${spec.title}; X ${xScale.mode}, Y ${yScale.mode}">${content}</svg>${trainLegend(ts,W,highlighted)}`;
}
const crossoverCache = new Map();
function renderCrossovers() {
  const ts = active(), key = ts.map(t=>t.id).sort().join('|');
  if (!crossoverCache.has(key)) crossoverCache.set(key, crossoverStory(ts));
  const {phases, intervals, end} = rankWindow(crossoverCache.get(key));
  $('crossover-empty').hidden = !!ts.length;
  $('crossover-readout').innerHTML = phases.map(p=>`<tr><td>${fmt(p.start,2)} – ${p.unbounded ? '∞' : fmt(p.end,2)}</td><td>${p.leaders.map(id=>escape(ts.find(t=>t.id===id).name)).join(' / ')}</td><td>${formatTime(Math.min(...ts.map(t=>t.model.timeAt(p.start))))}</td></tr>`).join('');
  if (!ts.length) {$('crossover-chart').innerHTML='';return;}
  const W=Math.max(320,$('crossover-chart').clientWidth), L=65, R=W>=700?220:18, T=55, B=60;
  const H=Math.max(300, Math.min(650, ts.length*35+T+B));
  const mode=document.querySelector('input[name="rank-distance-scale"]:checked').value;
  const minimum=.1, knots=[minimum,...intervals.map(p=>p.end)];
  const phaseAxis=mode==='linear'?createPhaseScale([minimum,end]):createPhaseScale(knots,leadershipWeights(intervals.length));
  $('rank-scale-note').textContent=mode==='linear'?'Distance uses a uniform linear scale. Crossovers below 100 m are omitted.':'From 100 m, each crossover between any selected trains gets an equally spaced position. Real distances are shown at the ticks; the final stable tail is compressed.';
  const sx=distance=>L+phaseAxis.position(distance)*(W-L-R);
  const sy=rank=>T+(rank-1)*(H-T-B)/Math.max(1,ts.length-1);
  let content=`<title>Rank crossovers</title><desc>Arrival ranking by distance. Axis: ${mode}. Rank crossovers from 100 metres are included, even when the leading train stays the same. The final ranking holds at longer distances.</desc><rect width="${W}" height="${H}" fill="white"/><text x="${L}" y="20">Arrival rank · first place at the top</text>`;
  phases.forEach((p,i)=>{
    const x=sx(p.start), phaseWidth=sx(p.end)-x, leader=ts.find(t=>t.id===p.leaders[0]);
    content+=`<rect x="${x}" y="${T-15}" width="${phaseWidth}" height="${H-T-B+30}" fill="${leader.color}" opacity=".06"/><line x1="${x}" x2="${x}" y1="${T-15}" y2="${H-B+10}" stroke="#ccd4cc" stroke-dasharray="3 5"/>`;
  });
  // Mark every change of ranking, even when it does not change the leader.
  const roots=knots.slice(1,-1), labelGap=W<700?75:65;
  let lastLabel=L;
  content+=`<text x="${L}" y="${H-B+30}" text-anchor="start">0.10 km</text>`;
  roots.forEach((distance,i)=>{
    const x=sx(distance),label=fmt(distance,2)+' km';
    content+=`<line class="rank-crossover" data-distance="${distance}" x1="${x}" x2="${x}" y1="${T-15}" y2="${H-B+10}" stroke="#b9c7bf" stroke-dasharray="2 5"><title>Crossover at ${label}</title></line><circle class="rank-crossover-tick" data-distance="${distance}" cx="${x}" cy="${H-B+10}" r="2.5" fill="#758079"><title>${label}</title></circle>`;
    if(x-lastLabel>=labelGap && W-R-x>=100){content+=`<text x="${x}" y="${H-B+30}" text-anchor="middle">${label}</text>`;lastLabel=x;}
  });
  content+=`<text x="${W-R}" y="${H-B+30}" text-anchor="end">Further → ∞</text>`;
  for(let rank=1;rank<=ts.length;rank++)content+=`<line x1="${L}" x2="${W-R}" y1="${sy(rank)}" y2="${sy(rank)}" stroke="#e5e9e4" stroke-dasharray="2 5"/><text x="${L-12}" y="${sy(rank)+4}" text-anchor="end">${rank}</text>`;
  for(const t of ts){
    const d=intervals.map((p,i)=>`${i?'L':'M'}${sx(p.start)},${sy(p.ranks[t.id])} L${sx(p.end)},${sy(p.ranks[t.id])}`).join(' ');
    const opacity=!highlighted||highlighted===t.id?1:.16;
    content+=`<path class="train-curve" data-train="${escape(t.id)}" d="${d}" fill="none" stroke="${t.color}" stroke-width="${highlighted===t.id?3:2}" stroke-dasharray="${t.dash}" opacity="${opacity}"><title>${escape(t.name)}</title></path><path class="curve-hit" data-train="${escape(t.id)}" d="${d}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`;
  }
  content+=curveLabels(ts.map(t=>({t,y:sy(intervals.at(-1).ranks[t.id])})),{width:W,right:R,top:T,bottom:H-B,highlighted});
  $('crossover-chart').innerHTML=`<div class="phase-leaders" style="padding-left:${L}px;padding-right:${R}px">${phases.map(p=>`<div style="flex:0 0 ${(phaseAxis.position(p.end)-phaseAxis.position(p.start))*100}%">${p.leaders.map(id=>{const t=ts.find(t=>t.id===id);return `<span data-train="${escape(id)}" style="color:${t.color}">${escape(t.name)}</span>`;}).join(' / ')}</div>`).join('')}</div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Arrival ranking by distance; ${mode==='linear'?'linear scale':'all crossovers equally spaced'}">${content}</svg>${trainLegend(ts,W,highlighted)}`;
}
function renderCrossoverCurves() {
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
  const xFormat=inverted?formatTime:d=>fmt(d,2),yFormat=inverted?d=>fmt(d,2):formatTime;
  const W=Math.max(320,$('crossover-curves-chart').clientWidth),H=W<700?620:820,L=65,R=W>=700?220:18,T=45,B=65;
  const sx=x=>L+xAxis.position(x)*(W-L-R),sy=y=>H-B-yAxis.position(y)/1.12*(H-T-B);
  const value=(t,x)=>inverted?t.model.stateAt(x).distanceKm:t.model.timeAt(x);
  const bounds=p=>inverted?[times[phases.indexOf(p)],times[phases.indexOf(p)+1]]:[p.start,p.end];
  let content=`<title>Arrival curves around crossovers</title><desc>Real model curves with continuous piecewise-linear axes. Distance: ${distanceMode}. Time: ${timeMode}. ${inverted?'Higher':'Lower'} curves lead. Winning segments ${emphasize?'emphasized':'shown normally'}.</desc><rect width="${W}" height="${H}" fill="white"/><defs><clipPath id="crossover-curves-clip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs><text x="${L}" y="20">${yLabel} · ${yMode==='focus'?'phase focus':'linear'}</text>`;
  phases.forEach(p=>{const leader=ts.find(t=>t.id===p.leaders[0]),[start,stop]=bounds(p);content+=`<rect x="${sx(start)}" y="${T}" width="${sx(stop)-sx(start)}" height="${H-T-B}" fill="${leader.color}" opacity=".06"/>`;});
  const ticks=axis=>Array.from({length:phases.length*4+1},(_,i)=>axis.invert(i/(phases.length*4)));
  const majors=xKnots.map(sx);
  for(const x of [...new Set([...xKnots,...ticks(xAxis)])].sort((a,b)=>a-b)){
    const pos=sx(x),major=xKnots.includes(x);
    content+=`<line x1="${pos}" x2="${pos}" y1="${T}" y2="${H-B}" stroke="${major && x>0 && x<xKnots.at(-1) && xMode==='focus'?'#aa6a22':major?'#c1ccc5':'#e5e9e4'}" stroke-dasharray="3 5"/>`;
    if(major || majors.every(p=>Math.abs(p-pos)>65))content+=`<text x="${pos}" y="${H-B+24}" text-anchor="${x===0?'start':x===xKnots.at(-1)?'end':'middle'}">${x===xKnots.at(-1)?'Further → ∞':xFormat(x)}</text>`;
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
  // Winners and the hovered train are painted last, so their curves remain readable.
  segments.sort((a,b)=>Number(a.t.id===highlighted)-Number(b.t.id===highlighted) || Number(a.winner)-Number(b.winner));
  for(const {t,p,d,winner} of segments){
    const opacity=highlighted ? (highlighted===t.id?1:.12) : emphasize && !winner ? .2 : 1;
    const width=highlighted===t.id?4:emphasize && winner?3.5:1.7;
    content+=`<path class="train-curve ${winner?'winning-segment':'other-segment'}" data-train="${escape(t.id)}" data-phase="${phases.indexOf(p)}" clip-path="url(#crossover-curves-clip)" d="${d}" fill="none" stroke="${t.color}" stroke-width="${width}" stroke-dasharray="${t.dash}" opacity="${opacity}"><title>${escape(t.name)}${winner?' · leading phase':''}</title></path><path class="curve-hit" data-train="${escape(t.id)}" clip-path="url(#crossover-curves-clip)" d="${d}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"/>`;
  }
  phases.slice(1).forEach((p,i)=>{const x=inverted?times[i+1]:p.start,y=inverted?p.start:times[i+1];content+=`<circle cx="${sx(x)}" cy="${sy(y)}" r="4" fill="white" stroke="#27332e"><title>Leader changes at ${fmt(p.start,2)} km · ${formatTime(times[i+1])}</title></circle>`;});
  content+=`<text x="${(W+L-R)/2}" y="${H-8}" text-anchor="middle">${xLabel} · ${xMode==='focus'?'phase focus':'linear'}</text>`;
  content+=curveLabels(ts.map(t=>({t,y:sy(value(t,xKnots.at(-1)))})),{width:W,right:R,top:T,bottom:H-B,highlighted});
  $('crossover-curves-chart').innerHTML=`<div class="phase-leaders" style="padding-left:${L}px;padding-right:${R}px">${phases.map(p=>{const [start,stop]=bounds(p);return `<div style="flex:0 0 ${(xAxis.position(stop)-xAxis.position(start))*100}%">${p.leaders.map(id=>{const t=ts.find(t=>t.id===id);return `<span data-train="${escape(id)}" style="color:${t.color}">${escape(t.name)}</span>`;}).join(' / ')}</div>`;}).join('')}</div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${inverted?'Distance over time':'Time over distance'} around crossovers; distance ${distanceMode}, time ${timeMode}">${content}</svg>${trainLegend(ts,W,highlighted)}`;
}
function renderLineAnalysis() {
  $('line-distance').max = Math.max(30, Math.ceil(routeDistance));
  $('line-distance').value = routeDistance;
  $('line-distance-input').value = routeDistance;
  $('line-distance').setAttribute('aria-valuetext', `${fmt(routeDistance)} kilometres`);
  $('occupancy-label').textContent=desiredFlow===null?'Utilization':'Utilization limit';
  $('line-fill-value').textContent = `${Math.round(lineFill * 100)}%`;
  const rows = active().map(t => ({t, result: analyseLine(t, {distanceKm: routeDistance, fillRatio: lineFill,...serviceTargets()})})).sort((a,b) => b.result.efficiency - a.result.efficiency);
  const best = rows[0]?.result.efficiency || 0;
  const winners = rows.filter(({result}) => best > 0 && Math.abs(result.efficiency / best - 1) < 1e-9);
  $('line-summary').textContent = !rows.length ? 'Select at least one train to compare line capacity.' : !best ? 'Utilization is zero: no passenger journeys and no best service choice.' : `Lowest running cost per passenger journey: ${winners.map(({t}) => t.name).join(' / ')} at ${fmt(routeDistance)} km and ${desiredFlow===null?'':'up to '}${Math.round(lineFill * 100)}% utilization.`;
  $('line-caption').textContent = `A–B–A at ${fmt(routeDistance)} km per leg · normal-difficulty running costs`;
  let rank = 0, prior;
  $('line-readout').innerHTML = rows.map(({t,result:r},i) => {
    const score = r.maintenancePerJourney;
    if (prior === undefined || Math.abs(score - prior) > Math.max(1e-7, Math.abs(score || 0)*1e-9)) rank = i + 1;
    prior = score;
    return `<tr class="${t.id===highlighted?'is-highlighted':''}"><td>${best ? rank : '—'}</td><td><span class="train-key" style="--train-color:${t.color}"></span>${escape(t.name)}</td><td>${score === null ? '—' : fmt(score,0)}</td><td>${r.trainCount}</td><td>${formatTime(r.headwaySeconds)}</td><td>${fmt(r.actualOccupancyRatio*100,1)}%</td><td>${fmt(r.perDirectionJourneysPerYear,0)}</td><td>${fmt(r.fleetMaintenance,0)}</td><td>${fmt(r.passengers)}</td><td>${t.carCount} × ${fmt(t.loadingUnloadingSpeedMultiplier)} → ${fmt(r.rate,2)}</td><td>${formatTime(r.travelSeconds)}</td><td>${formatTime(r.stationSeconds)}</td><td>${formatTime(r.roundTripSeconds)}</td></tr>`;
  }).join('');
}
function updateStickyOffsets() {
    const header = document.querySelector('.app-header');
    const headerHeight = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--app-header-offset', `${headerHeight}px`);
    document.documentElement.style.setProperty('--economic-controls-height', `${$('line-capacity').getBoundingClientRect().height}px`);
}
function syncAnalysisView() {
  const target = document.getElementById(location.hash.slice(1));
  // Following a link to an explanation reveals it; normal chart visits stay compact.
  for (let disclosure=target?.closest('details');disclosure;disclosure=disclosure.parentElement.closest('details')) disclosure.open=true;
  if (target && ['model','economic-method'].includes(target.id)) target.querySelector('details').open=true;
  const view = target?.closest('#trucks') ? 'trucks' : target?.closest('#data') ? 'data' : target?.closest('#economics') ? 'economics' : target?.closest('#race') ? 'race' : document.querySelector('[data-analysis][aria-current="page"]')?.dataset.analysis || 'race';
  for (const name of ['race', 'economics', 'data', 'trucks']) {
    $(name).hidden = name !== view;
    $(name === 'economics' ? 'economic-links' : `${name}-links`).hidden = name !== view;
    const link = document.querySelector(`[data-analysis="${name}"]`);
    if (name === view) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  }
  document.querySelector('.workspace').classList.toggle('truck-view',view==='trucks');
  $('catalogue').hidden=view==='trucks';
  $('picker-toggle').hidden=view==='trucks';
  if(view==='trucks'&&$('train-drawer').open)$('train-drawer').close();
  document.querySelector('.skip').textContent=view==='trucks'?'Skip to truck ranking':'Skip to charts';
  document.querySelector('.skip').href = view === 'race' ? '#speed-explorer' : view === 'data' ? '#raw-data' : view === 'trucks' ? '#truck-service' : '#line-capacity';
  render();
  updateStickyOffsets();
  target?.scrollIntoView();
}
function render() {
  if (!$('trucks').hidden) {
    const passenger=roadCategory==='passengers';
    const vehicles=selectRoadVehicles({trucks:truckDataset.trucks,buses:busDataset.buses,trams:tramDataset.trams,freightTrams:tramDataset.freightTrams},{category:roadCategory,includeTrams,cargo:truckCargo,year:truckYear});
    renderTruckService(document,vehicles,{...truckService,roadSpeedLimit:truckRoadSpeedLimit,passenger});return;
  }
  const ts = active();
  const {limit, stable} = selectionLimits(ts);
  $('route-distance').max = limit;
  $('route-distance').value = Math.min(routeDistance, limit);
  $('distance-input').value = routeDistance;
  $('route-distance').setAttribute('aria-valuetext', `${fmt(Math.min(routeDistance, limit))} kilometres; use the number field for longer routes`);
  $('distance-note').textContent = ts.length > 1 ? `Arrival order settles at approximately ${fmt(stable, 2)} km. Slider up to ${limit} km; enter a larger distance in the field.` : `Slider up to ${limit} km; enter a larger distance in the field.`;
  for (const row of $('trains').querySelectorAll('[data-train]')) row.classList.toggle('is-highlighted',row.dataset.train===highlighted);
  if (!$('data').hidden) renderDataView(dataset,visible(),experiments);
  renderLineAnalysis();
  if (!$('economics').hidden) {
    renderEconomicChart($('economic-efficiency-chart'), {trains:ts,distance:routeDistance,fill:lineFill,targets:serviceTargets(),highlighted,mode:document.querySelector('input[name="economic-efficiency-scale"]:checked').value});
    const key=JSON.stringify([ts.map(t=>t.id),routeDistance,lineFill,desiredFlow,maxHeadwaySeconds,frequencyMode]);
    if(key!==economicStoryKey){economicStoryKey=key;currentEconomicStory=economicStory(ts,routeDistance,lineFill,serviceTargets());}
    renderEconomicCrossovers($('economic-crossover-curves-chart'),{trains:ts,story:currentEconomicStory,fill:lineFill,targets:serviceTargets(),kind:'curves',highlighted,distanceMode:document.querySelector('input[name="economic-focus-scale"]:checked').value,verticalMode:document.querySelector('input[name="economic-focus-y"]:checked').value});
    renderEconomicCrossovers($('economic-crossovers-chart'),{trains:ts,story:currentEconomicStory,fill:lineFill,targets:serviceTargets(),kind:'rank',highlighted,distanceMode:document.querySelector('input[name="economic-rank-scale"]:checked').value});
    $('economic-phases').innerHTML=currentEconomicStory.phases.map(p=>`<tr><td>${fmt(p.start,2)} – ${fmt(p.end,2)}</td><td>${p.leaders.map(id=>escape(ts.find(t=>t.id===id).name)).join(' / ')}</td></tr>`).join('');
  }
  renderChart('speed');
  renderChart('race');
  renderCrossovers();
  renderCrossoverCurves();
  const ranking=ts.map(t=>({t,time:t.model.timeAt(routeDistance)})).sort((a,b)=>a.time-b.time);
  $('ranking-caption').textContent=`Theoretical arrival ranking at ${fmt(routeDistance)} km`;
  $('value-heading').textContent='Arrival time (m:ss)'; $('extra-heading').textContent='Speed at arrival (km/h)';
  $('ranking').innerHTML=ranking.map(({t,time},i)=>`<tr><td>${i+1}</td><td><span class="train-key" style="--train-color:${t.color}"></span>${escape(t.name)}</td><td>${formatTime(time)}</td><td>${fmt(t.model.stateAt(time).speedKmh)}</td></tr>`).join('');
  $('transitions').innerHTML=ts.map(t=>`<tr><td>${escape(t.name)}</td><td>${formatTime(t.model.tractionEndSeconds)}</td><td>${fmt(t.model.stateAt(t.model.tractionEndSeconds).distanceKm*1000,0)}</td><td>${formatTime(t.model.speedCapSeconds)}</td><td>${fmt(t.model.speedCapKm,2)}</td></tr>`).join('');
}
function download(content,type,filename) {
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent=`Export ready: ${filename}`;
}
function initPickerDrawer() {
  const mobile=window.matchMedia('(max-width:700px)'),drawer=$('train-drawer'),catalogue=$('catalogue'),toggle=$('picker-toggle');
  const sync=()=>{
    if(mobile.matches) drawer.append(catalogue);
    else {if(drawer.open) drawer.close();$('catalogue-anchor').before(catalogue);}
  };
  toggle.addEventListener('click',()=>{drawer.showModal();toggle.setAttribute('aria-expanded','true');document.body.classList.add('picker-open');$('train-search').focus();});
  $('picker-close').addEventListener('click',()=>drawer.close());
  drawer.addEventListener('click',event=>{const box=drawer.getBoundingClientRect();if(event.target===drawer && (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom)) drawer.close();});
  drawer.addEventListener('close',()=>{toggle.setAttribute('aria-expanded','false');document.body.classList.remove('picker-open');if(mobile.matches)toggle.focus();});
  mobile.addEventListener('change',sync);sync();
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

async function init() {
  const response=await fetch(new URL('../data/trains.json',import.meta.url));if(!response.ok)throw new Error('Data unavailable');dataset=await response.json();
  const observations=await fetch(new URL('../data/experiments.json',import.meta.url));if(!observations.ok)throw new Error('Experimental data unavailable');experiments=await observations.json();
  const truckResponse=await fetch(new URL('../data/trucks.json',import.meta.url));if(!truckResponse.ok)throw new Error('Truck data unavailable');truckDataset=await truckResponse.json();
  const busResponse=await fetch(new URL('../data/buses.json',import.meta.url));if(!busResponse.ok)throw new Error('Bus data unavailable');busDataset=await busResponse.json();
  const tramResponse=await fetch(new URL('../data/trams.json',import.meta.url));if(!tramResponse.ok)throw new Error('Tram data unavailable');tramDataset=await tramResponse.json();
  const updateRoadCategory=()=>{
    const passenger=roadCategory==='passengers';
    $('truck-service-heading').textContent=`${passenger?'Passengers':'Freight'} · route calculator`;
    $('road-metric-help').textContent=`Running cost per ${passenger?'passenger journey':'delivered cargo unit'}. Lower is better.`;
    $('road-intro').textContent=passenger?`Compare buses${includeTrams?' and passenger trams':''} on A–B–A, with equal utilization in both directions. Fixed passenger handling factor: 1.`:`Compare trucks${includeTrams?' and freight trams':''} on A–B–A. Fixed freight handling factor: 0.0625 (1/16).`;
    for(const id of ['road-freight-filter','road-return-control','road-freight-facilities'])$(id).hidden=passenger;
    $('road-passenger-warning').hidden=!passenger;
    $('road-handling-calibration').textContent=passenger?'Passenger handling: 1 passenger/s per vehicle multiplier. Fixed pauses: 2 s before alighting, 2 s before boarding and 2 s before departure (6 s per terminal). Bus and tram timings have not been independently measured.':'Freight handling: 0.0625 cargo units/s per vehicle multiplier (1/16 of the passenger factor), consistent with approximate MAN 19.304 timings. Fixed pauses: 2 s before each active transfer operation and departure. Loading plus unloading: 6 s per terminal; one operation only: 4 s.';
    $('road-chart-help').textContent=`Shorter bars are better · $ / ${passenger?'passenger journey':'cargo unit'} · starts at zero`;
    $('truck-chart-heading').textContent=`Running cost per ${passenger?'passenger journey':'delivered cargo unit'}`;
    $('road-cost-column').innerHTML=`Cost / ${passenger?'passenger journey':'cargo unit'}<br>($) ↓`;
    $('road-source-download').href=passenger?'./data/buses.json':'./data/trucks.json';
    $('road-source-download').textContent=`Download ${passenger?'bus':'truck'} source data JSON ↓`;
    $('road-tram-source-download').hidden=!includeTrams;
    $('road-speed-label').textContent=includeTrams?'Limit infrastructure speed':'Limit road speed';
    $('truck-speed-limit').setAttribute('aria-label',includeTrams?'Infrastructure speed limit in kilometres per hour':'Road speed limit in kilometres per hour');
  };
  $('road-category').addEventListener('change',()=>{roadCategory=document.querySelector('input[name="road-category"]:checked').value;updateRoadCategory();render();});
  $('road-include-trams').addEventListener('change',()=>{includeTrams=$('road-include-trams').checked;updateRoadCategory();render();});
  updateRoadCategory();
  const updateTruckSpeed=()=>{
    const enabled=$('enable-truck-speed-limit').checked, speed=$('truck-speed-limit').valueAsNumber;
    $('truck-speed-limit').disabled=!enabled;
    if(enabled&&(!Number.isFinite(speed)||speed<=0))return;
    truckRoadSpeedLimit=enabled?speed:null;render();
  };
  $('enable-truck-speed-limit').addEventListener('change',updateTruckSpeed);
  $('truck-speed-limit').addEventListener('input',updateTruckSpeed);
  $('truck-cargo-specialization').addEventListener('change',()=>{
    truckCargo=document.querySelector('input[name="truck-cargo"]:checked').value;render();
  });
  const updateTruckYear=()=>{
    truckYear=$('truck-year').valueAsNumber;
    $('truck-year-value').textContent=truckYear;
    $('truck-year-previous').disabled=truckYear<=Number($('truck-year').min);
    $('truck-year-next').disabled=truckYear>=Number($('truck-year').max);
    render();
  };
  $('truck-year-next').disabled=true;
  $('truck-year').addEventListener('input',updateTruckYear);
  for(const [id,step] of [['truck-year-previous',-1],['truck-year-next',1]])$(id).addEventListener('click',()=>{
    $('truck-year').value=Math.min(Number($('truck-year').max),Math.max(Number($('truck-year').min),truckYear+step));updateTruckYear();
  });
  const updateTruckService=event=>{
    if(event.target.id==='truck-distance-slider')$('truck-distance').value=$('truck-distance-slider').value;
    const distanceKm=$('truck-distance').valueAsNumber,fillRatio=$('truck-utilization').valueAsNumber/100;
    if(!Number.isFinite(distanceKm)||distanceKm<=0)return;
    $('truck-distance-slider').value=Math.min(5,distanceKm);
    $('truck-utilization-value').textContent=`${Math.round(fillRatio*100)}%`;
    truckService={distanceKm,fillRatio,loadedReturn:$('truck-loaded-return').checked,specializedTerminal:$('truck-specialized-terminal').checked,specializedWarehouse:$('truck-specialized-warehouse').checked};render();
  };
  for(const id of ['truck-distance','truck-distance-slider','truck-utilization','truck-loaded-return','truck-specialized-terminal','truck-specialized-warehouse'])$(id).addEventListener('input',updateTruckService);
  trains=dataset.trains.map(t=>({...t,model:createModel(t,dataset.source)}));defaults=['metroliner','twindexx','tgv','fuxing','ice-1','etr-450'];selected=new Set(defaults);renderCatalogue();initPickerDrawer();
  $('raw-data-csv').addEventListener('click',()=>{const table=$('raw-data-body').closest('table');const csv=[...table.rows].map(row=>[...row.cells].map(cell=>'"'+cell.textContent.replaceAll('"','""')+'"').join(',')).join('\n');download(csv,'text/csv;charset=utf-8','tf3-catalogue.csv');});
  $('trains').addEventListener('change',e=>{if(e.target.checked)selected.add(e.target.value);else selected.delete(e.target.value);renderSelectionCount();render();});
  const highlight = event => {const row=event.target.closest('[data-train]');const id=row?.dataset.train;if(highlighted!==id){highlighted=id;render();}};
  for (const chart of [$('chart'), $('speed-chart'), $('crossover-chart'), $('crossover-curves-chart'), $('economic-efficiency-chart'), $('economic-crossover-curves-chart'), $('economic-crossovers-chart')]) {
  chart.addEventListener('pointermove',event=>{
    const previous=highlighted;highlight(event);
    if (highlighted && highlighted!==previous) {
      const row=[...$('trains').querySelectorAll('[data-train]')].find(row=>row.dataset.train===highlighted);
      if (row) {const box=row.getBoundingClientRect(),list=$('trains').getBoundingClientRect();
        if (box.top<list.top) $('trains').scrollTop+=box.top-list.top;
        else if (box.bottom>list.bottom) $('trains').scrollTop+=box.bottom-list.bottom;
      }
    }
  });
  chart.addEventListener('pointerleave',()=>{if(highlighted!==undefined){highlighted=undefined;render();}});
  }
  $('trains').addEventListener('pointerover',highlight);$('trains').addEventListener('focusin',highlight);
  $('trains').addEventListener('pointerleave',()=>{highlighted=undefined;render();});$('trains').addEventListener('focusout',e=>{if(!$('trains').contains(e.relatedTarget)){highlighted=undefined;render();}});
  const setCatalogueYear = year => {catalogueYear=Math.max(1900,Math.min(2020,year));highlighted=undefined;renderCatalogue();render();};
  $('catalogue-year').addEventListener('input', e=>setCatalogueYear(Number(e.target.value)));
  $('year-previous').addEventListener('click',()=>setCatalogueYear(catalogueYear-1));
  $('year-next').addEventListener('click',()=>setCatalogueYear(catalogueYear+1));
  $('explore-history').addEventListener('click',()=>{selected=new Set(trains.map(t=>t.id));$('train-search').value='';setCatalogueYear(1900);});
  for(const id of ['train-search','train-sort']) $(id).addEventListener(id==='train-search'?'input':'change',()=>{highlighted=undefined;renderCatalogue();render();});
  for(const [id,select] of [['select-visible',true],['clear-visible',false]]) $(id).addEventListener('click',()=>{for(const t of visible())if(select)selected.add(t.id);else selected.delete(t.id);highlighted=undefined;renderCatalogue();render();});
  $('reset').addEventListener('click',()=>{selected=new Set(defaults);$('train-search').value='';catalogueYear=2020;$('catalogue-year').value=catalogueYear;highlighted=undefined;renderCatalogue();render();});
  $('race-orientation').addEventListener('change',e=>{
    const previous=raceView;raceView=e.target.value;highlighted=undefined;
    if(previous!==raceView){const x=scaleMode('x'),y=scaleMode('y');document.querySelector(`input[name="x-scale"][value="${y}"]`).checked=true;document.querySelector(`input[name="y-scale"][value="${x}"]`).checked=true;}
    render();
  });
  const updateTargets=()=>{
    const flow=Number($('desired-flow').value), interval=Number($('desired-headway').value);
    const flowEnabled=$('enable-flow').checked, frequencyEnabled=$('enable-frequency').checked;
    $('desired-flow').disabled=!flowEnabled;
    $('desired-headway').disabled=!frequencyEnabled;
    $('frequency-mode').disabled=!frequencyEnabled;
    if((flowEnabled&&(!Number.isFinite(flow)||flow<=0))||(frequencyEnabled&&(!Number.isFinite(interval)||interval<=0)))return;
    desiredFlow=$('enable-flow').checked?flow:null;
    maxHeadwaySeconds=$('enable-frequency').checked?interval*60:null;
    frequencyMode=$('frequency-mode').value;
    $('frequency-mode').disabled=maxHeadwaySeconds===null;
    $('desired-flow').disabled=desiredFlow===null;
    $('desired-headway').disabled=maxHeadwaySeconds===null;
    render();
  };
  for(const id of ['enable-flow','enable-frequency','frequency-mode'])$(id).addEventListener('change',updateTargets);
  for(const id of ['desired-flow','desired-headway'])$(id).addEventListener('input',updateTargets);
  $('line-fill').addEventListener('input', e => {lineFill = Number(e.target.value) / 100; render();});
  $('line-distance').addEventListener('input', e => {routeDistance = Number(e.target.value); render();});
  $('line-distance-input').addEventListener('change', e => {
    const distance = e.target.valueAsNumber;
    if (!e.target.checkValidity() || !Number.isFinite(distance)) {e.target.reportValidity(); return;}
    routeDistance = distance; render();
  });
  $('route-distance').addEventListener('input', e => {routeDistance = Number(e.target.value); render();});
  $('distance-input').addEventListener('change', e => {
    const distance = e.target.valueAsNumber;
    if (!e.target.checkValidity() || !Number.isFinite(distance)) {e.target.reportValidity(); return;}
    routeDistance = distance; render();
  });
  for(const id of ['x-scale','y-scale','speed-x-scale','speed-y-scale','focus-distance','focus-time','crossover-orientation','emphasize-leaders','rank-distance-scale','economic-efficiency-scale','economic-focus-scale','economic-focus-y','economic-rank-scale']) $(id).addEventListener('change',()=>render());
  for (const kind of ['speed','race']) {
  const el = id => $(kind === 'speed' ? `speed-${id}` : id);
  el('svg').addEventListener('click',()=>{
    const view = kind === 'speed' ? 'speed' : raceView, horizon = chartHorizon(view);
    const prior=highlighted;highlighted=undefined;renderChart(kind,1400);const svg=el('chart').querySelector('svg').cloneNode(true);svg.querySelectorAll('.curve-hit').forEach(path=>path.remove());highlighted=prior;render();
    const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent='text{font-family:system-ui,sans-serif;font-size:12px;fill:#758079}.end-label{font-weight:600}';svg.prepend(style);
    // Wrap the legend so exports remain usable with a large selection.
    const lines=[`Ideal model without resistance · Route distance: ${fmt(routeDistance)} km · Time horizon: ${fmt(view === 'speed' ? horizon : raceHorizon(active(), routeDistance).seconds)} s`,...active().map(t=>`${t.name} (${t.maxSpeedKmh} km/h)`)]
    const chartHeight=Number(svg.getAttribute('viewBox').split(' ')[3]);
    lines.forEach((line,i)=>{const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',65);text.setAttribute('y',chartHeight+30+i*18);text.textContent=line;svg.append(text);});
    svg.setAttribute('viewBox',`0 0 1400 ${chartHeight+40+lines.length*18}`);
    download(new XMLSerializer().serializeToString(svg),'image/svg+xml',`tf3-${view}-${scaleMode('x',kind)}-${scaleMode('y',kind)}.svg`);
  });
  el('csv').addEventListener('click',()=>{const view = kind === 'speed' ? 'speed' : raceView, horizon = chartHorizon(view);const rows=[['train','time_s','distance_km','speed_kmh']];for(const t of active())for(let i=0;i<=300;i++){const x=i*horizon/300,time=view==='time'?t.model.timeAt(x):x,state=t.model.stateAt(time);rows.push([t.name,time.toFixed(4),state.distanceKm.toFixed(6),state.speedKmh.toFixed(4)]);}download(rows.map(row=>row.map(cell=>`"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv;charset=utf-8',`tf3-${view}.csv`);});
  }
  const stickyObserver = new ResizeObserver(updateStickyOffsets);
  stickyObserver.observe(document.querySelector('.app-header'));
  stickyObserver.observe($('line-capacity'));
  updateStickyOffsets();
  window.addEventListener('resize',()=>render());
  window.addEventListener('hashchange',syncAnalysisView);syncAnalysisView();
}
init().catch(error=>{$('status').textContent='Unable to load the lab. Serve the site over HTTP and try again.';console.error(error);});
