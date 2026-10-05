import {createModel} from './model.js';
import {createScale} from './scales.js';
import {formatTime} from './format.js';
import {raceHorizon, rankingSettlesAt, suggestedDistanceLimit} from './race.js';
const $ = id => document.getElementById(id);
const fmt = (n, digits = 1) => n.toLocaleString('en-GB', {minimumFractionDigits: digits, maximumFractionDigits: digits});
const scaleMode = axis => document.querySelector(`input[name="${axis}-scale"]:checked`).value;
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const views = {
  distance: {title: 'Distance over time', x: 'Time since departure (m:ss)', y: 'Distance travelled (km)', unit: 's', xFloor: 10, yFloor: .1, yUnit: 'km', help: 'The highest curve shows the leading train.'},
  speed: {title: 'Speed over time', x: 'Time since departure (m:ss)', y: 'Speed (km/h)', unit: 's', xFloor: 10, yFloor: 10, yUnit: 'km/h', help: 'The plateaus show each train’s top speed.'},
  time: {title: 'Time over distance', x: 'Distance travelled (km)', y: 'Time since departure (m:ss)', unit: 'km', xFloor: .1, yFloor: 10, yUnit: 's', help: 'The lowest curve shows the train that reaches the distance first.'}
};
const distanceLimits = new Map();
function selectionLimits(ts) {
  const key = ts.map(t => t.id).sort().join('|');
  if (!distanceLimits.has(key)) distanceLimits.set(key, {stable: rankingSettlesAt(ts), limit: suggestedDistanceLimit(ts)});
  return distanceLimits.get(key);
}
let dataset, trains, selected, defaults, highlighted, view = 'distance', routeDistance = 10, horizon = 300;
function active() {return trains.filter(t => selected.has(t.id));}
function value(t, x) {return view === 'time' ? t.model.timeAt(x) : t.model.stateAt(x)[view === 'speed' ? 'speedKmh' : 'distanceKm'];}
function visible() {
  const query = $('train-search').value.trim().toLowerCase();
  const sort = $('train-sort').value;
  return trains.filter(t => `${t.name} ${t.year}`.toLowerCase().includes(query)).sort((a,b) => sort === 'speed' ? b.maxSpeedKmh - a.maxSpeedKmh : sort === 'year' ? b.year - a.year : a.name.localeCompare(b.name));
}
function renderCatalogue() {
  const results = visible();
  $('train-count').textContent = trains.length;
  $('selection-count').textContent = `${selected.size} selected · ${results.length} of ${trains.length} shown`;
  $('no-results').hidden = !!results.length;
  $('select-visible').disabled = $('clear-visible').disabled = !results.length;
  $('trains').innerHTML = results.map(t => `<label class="train-row" data-train="${escape(t.id)}" style="--train-color:${t.color}"><input type="checkbox" value="${escape(t.id)}" ${selected.has(t.id) ? 'checked' : ''} aria-label="Compare ${escape(t.name)}"><span class="train-info"><span class="train-name">${escape(t.name)}</span><span class="train-spec">${t.year} · ${t.maxSpeedKmh} km/h</span><span class="train-power">${t.massTonnes} t · <span title="Metric horsepower">${fmt(t.powerCh, 0)} PS</span> · ${fmt(t.tractionKgf, 0)} kgf</span></span></label>`).join('');
}
function sample(t, xScale, yScale) {
  // Find where the curve enters the positive log domain, rather than inventing zero.
  let start = xScale.min;
  if (value(t, start) < yScale.min) {
    let low = start, high = horizon;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      if (value(t, mid) < yScale.min) low = mid; else high = mid;
    }
    start = high;
  }
  // Stop precisely at the displayed ceiling instead of flattening the curve there.
  let end = horizon;
  if (value(t, end) > yScale.max) {
    let low = 0, high = end;
    for (let i = 0; i < 50; i++) {
      const mid = (low + high) / 2;
      if (value(t, mid) < yScale.max) low = mid; else high = mid;
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
  return [...xs].sort((a,b) => a-b).map(x => [x,value(t,x)]).filter(([x,y]) => Number.isFinite(xScale.position(x)) && Number.isFinite(yScale.position(y)));
}
function tickLabel(n) {return fmt(n, n > 0 && n < 1 ? Math.min(4, Math.ceil(-Math.log10(n))) : n % 1 ? 1 : 0);}
function render(width) {
  const W = typeof width === 'number' ? width : Math.max(320, $('chart').clientWidth || 1000);
  const labelSpace = view === 'distance' ? 120 : 0;
  const H = (W < 700 ? 430 : 610) + labelSpace, L = 65, R = W < 700 || view === 'distance' ? 18 : 175, T = 45 + labelSpace, B = 50;
  const ts = active(), spec = views[view];
  const race = raceHorizon(ts, routeDistance);
  horizon = view === 'time' ? routeDistance : Math.max(1, race.seconds);
  const {limit, stable} = selectionLimits(ts);
  $('route-distance').max = limit;
  $('route-distance').value = Math.min(routeDistance, limit);
  $('distance-input').value = routeDistance;
  $('route-distance').setAttribute('aria-valuetext', `${fmt(Math.min(routeDistance, limit))} kilometres; use the number field for longer routes`);
  $('distance-note').textContent = ts.length > 1 ? `Arrival order settles at approximately ${fmt(stable, 2)} km. Slider up to ${limit} km; enter a larger distance in the field.` : `Slider up to ${limit} km; enter a larger distance in the field.`;
  $('chart-heading').textContent = spec.title;
  $('chart-help').textContent = spec.help + (ts.length > 12 ? ' Hover or focus a catalogue row to identify its curve.' : '');
  $('empty').hidden = !!ts.length; $('csv').disabled = $('svg').disabled = !ts.length;
  const max = Math.max(1,...ts.map(t=>value(t,horizon)));
  const step = 10 ** Math.floor(Math.log10(max / 5));
  const ymax = view === 'distance' ? routeDistance * 1.1 : Math.ceil(max / 5 / step) * step * 5;
  const xScale = createScale(scaleMode('x'), horizon, Math.min(spec.xFloor, horizon / 10));
  const yScale = createScale(scaleMode('y'), ymax, Math.min(spec.yFloor, ymax / 10));
  const notes = [];
  if (xScale.mode === 'log') notes.push(`X starts at ${tickLabel(xScale.min)} ${spec.unit}`);
  if (yScale.mode === 'log') notes.push(`Y starts at ${tickLabel(yScale.min)} ${spec.yUnit}`);
  $('scale-note').hidden = !notes.length;
  $('scale-note').textContent = `Small values are cropped on logarithmic axes. ${notes.join('; ')}. The readout and CSV retain the full values.`;
  const sx = x => L + xScale.position(x) * (W-L-R);
  const sy = y => H-B-yScale.position(y) * (H-T-B);
  let content = `<title>${spec.title}</title><desc>Theoretical curves. X axis: ${xScale.mode}; Y axis: ${yScale.mode}. Log domains: X starts at ${xScale.min} ${spec.unit}; Y starts at ${yScale.min} ${spec.yUnit}. Use the race readout for exact values, including zero.</desc><rect width="${W}" height="${H}" fill="white"/><defs><clipPath id="plot-clip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs><text x="${L}" y="20">${spec.y}${yScale.mode==='log' ? ' · log scale' : ''}</text>`;
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
    const d=sample(t,xScale,yScale).map(([x,y],i)=>`${i?'L':'M'}${sx(x).toFixed(2)},${sy(y).toFixed(2)}`).join(' ');
    const emphasis = !highlighted || highlighted === t.id;
    content+=`<path data-train="${escape(t.id)}" clip-path="url(#plot-clip)" d="${d}" fill="none" stroke="${t.color}" stroke-width="${highlighted===t.id?3:2}" opacity="${emphasis?1:.16}" stroke-dasharray="${t.dash}"><title>${escape(t.name)} — model</title></path>`;
  }
  if (view === 'distance') {
    const y = sy(routeDistance);
    const labelled = (ts.length <= 12 ? ts : ts.filter(t => t.id === highlighted))
      .map(t => ({t, x: sx(t.model.timeAt(routeDistance))}))
      .filter(({x}) => Number.isFinite(x)).sort((a,b) => a.x-b.x);
    // Spread neighbouring names; markers keep the exact arrival position.
    for (let i=0; i<labelled.length; i++) labelled[i].labelX=Math.max(labelled[i].x, labelled[i].t.name.length*7/Math.sqrt(2)+8, i ? labelled[i-1].labelX+20 : L+5);
    for (let i=labelled.length-1; i>=0; i--) labelled[i].labelX=Math.min(labelled[i].labelX, i===labelled.length-1 ? W-R-5 : labelled[i+1].labelX-20);
    for (const {t,x,labelX} of labelled) {
      const opacity = !highlighted || highlighted === t.id ? 1 : .25;
      content += `<circle class="arrival-marker" data-train="${escape(t.id)}" cx="${x}" cy="${y}" r="3" fill="${t.color}" opacity="${opacity}"/><line x1="${x}" y1="${y}" x2="${labelX}" y2="${T-12}" stroke="${t.color}" opacity=".35"/><text class="arrival-label end-label" data-train="${escape(t.id)}" x="${labelX}" y="${T-16}" transform="rotate(45 ${labelX} ${T-16})" text-anchor="end" style="fill:${t.color}" opacity="${opacity}">${escape(t.name)}</text>`;
    }
  } else if(W>=700) {
    const labelled = (ts.length<=12 ? ts : ts.filter(t=>t.id===highlighted)).map(t=>{const end=view==='distance'?Math.min(horizon,t.model.timeAt(ymax)):horizon;return {t,x:sx(end),y:sy(Math.min(ymax,value(t,end)))};}).filter(t=>Number.isFinite(t.y)).sort((a,b)=>a.y-b.y);
    for(let i=0;i<labelled.length;i++) labelled[i].labelY=Math.max(labelled[i].y,i ? labelled[i-1].labelY+20 : T+5);
    for(let i=labelled.length-1;i>=0;i--) labelled[i].labelY=Math.min(labelled[i].labelY,i===labelled.length-1?H-B-5:labelled[i+1].labelY-20);
    for(const {t,x,y,labelY} of labelled) content+=`<line x1="${x}" y1="${y}" x2="${W-R+12}" y2="${labelY}" stroke="${t.color}" opacity=".35"/><text class="end-label" x="${W-R+17}" y="${labelY+4}" style="fill:${t.color}" opacity="${!highlighted||highlighted===t.id?1:.25}">${escape(t.name)}</text>`;
  }
  $('chart').innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${spec.title}; X ${xScale.mode}, Y ${yScale.mode}">${content}</svg>`;
  const ranking=ts.map(t=>({t,time:t.model.timeAt(routeDistance)})).sort((a,b)=>a.time-b.time);
  $('ranking-caption').textContent=`Theoretical arrival ranking at ${fmt(routeDistance)} km`;
  $('value-heading').textContent='Arrival time (m:ss)'; $('extra-heading').textContent='Speed at arrival (km/h)';
  $('ranking').innerHTML=ranking.map(({t,time},i)=>`<tr><td>${i+1}</td><td><span class="train-key" style="--train-color:${t.color}"></span>${escape(t.name)}</td><td>${formatTime(time)}</td><td>${fmt(t.model.stateAt(time).speedKmh)}</td></tr>`).join('');
  $('transitions').innerHTML=ts.map(t=>`<tr><td>${escape(t.name)}</td><td>${fmt(t.model.tractionEndSeconds)}</td><td>${fmt(t.model.speedCapSeconds)}</td><td>${fmt(t.model.speedCapKm,2)}</td></tr>`).join('');
}
function download(content,type,filename) {
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('status').textContent=`Export ready: ${filename}`;
}
async function init() {
  const response=await fetch(new URL('../data/trains.json',import.meta.url));if(!response.ok)throw new Error('Data unavailable');dataset=await response.json();
  trains=dataset.trains.map(t=>({...t,model:createModel(t,dataset.source)}));defaults=trains.slice(0,4).map(t=>t.id);selected=new Set(defaults);renderCatalogue();
  $('trains').addEventListener('change',e=>{if(e.target.checked)selected.add(e.target.value);else selected.delete(e.target.value);$('selection-count').textContent=`${selected.size} selected · ${visible().length} of ${trains.length} shown`;render();});
  const highlight = event => {const row=event.target.closest('[data-train]');const id=row?.dataset.train;if(highlighted!==id){highlighted=id;render();}};
  $('trains').addEventListener('pointerover',highlight);$('trains').addEventListener('focusin',highlight);
  $('trains').addEventListener('pointerleave',()=>{highlighted=undefined;render();});$('trains').addEventListener('focusout',e=>{if(!$('trains').contains(e.relatedTarget)){highlighted=undefined;render();}});
  for(const id of ['train-search','train-sort']) $(id).addEventListener(id==='train-search'?'input':'change',()=>{highlighted=undefined;renderCatalogue();render();});
  for(const [id,select] of [['select-visible',true],['clear-visible',false]]) $(id).addEventListener('click',()=>{for(const t of visible())if(select)selected.add(t.id);else selected.delete(t.id);highlighted=undefined;renderCatalogue();render();});
  $('reset').addEventListener('click',()=>{selected=new Set(defaults);$('train-search').value='';highlighted=undefined;renderCatalogue();render();});
  document.querySelector('.views').addEventListener('change', e => {
    view = e.target.value;
    render();
  });
  $('route-distance').addEventListener('input', e => {routeDistance = Number(e.target.value); render();});
  $('distance-input').addEventListener('change', e => {
    const distance = e.target.valueAsNumber;
    if (!e.target.checkValidity() || !Number.isFinite(distance)) {e.target.reportValidity(); return;}
    routeDistance = distance; render();
  });
  for(const id of ['x-scale','y-scale']) $(id).addEventListener('change',()=>render());
  $('svg').addEventListener('click',()=>{
    const prior=highlighted;highlighted=undefined;render(1400);const svg=$('chart').querySelector('svg').cloneNode(true);highlighted=prior;render();
    const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent='text{font-family:system-ui,sans-serif;font-size:12px;fill:#758079}.end-label{font-weight:600}';svg.prepend(style);
    // Wrap the legend so exports remain usable with a large selection.
    const lines=[`Ideal model without resistance · Route distance: ${fmt(routeDistance)} km · Time horizon: ${fmt(raceHorizon(active(), routeDistance).seconds)} s`,...active().map(t=>`${t.name} (${t.maxSpeedKmh} km/h)`)]
    const chartHeight=Number(svg.getAttribute('viewBox').split(' ')[3]);
    lines.forEach((line,i)=>{const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',65);text.setAttribute('y',chartHeight+30+i*18);text.textContent=line;svg.append(text);});
    svg.setAttribute('viewBox',`0 0 1400 ${chartHeight+40+lines.length*18}`);
    download(new XMLSerializer().serializeToString(svg),'image/svg+xml',`tf3-${view}-${scaleMode('x')}-${scaleMode('y')}.svg`);
  });
  $('csv').addEventListener('click',()=>{const rows=[['train','time_s','distance_km','speed_kmh']];for(const t of active())for(let i=0;i<=300;i++){const x=i*horizon/300,time=view==='time'?t.model.timeAt(x):x,state=t.model.stateAt(time);rows.push([t.name,time.toFixed(4),state.distanceKm.toFixed(6),state.speedKmh.toFixed(4)]);}download(rows.map(row=>row.map(cell=>`"${String(cell).replaceAll('"','""')}"`).join(',')).join('\n'),'text/csv;charset=utf-8',`tf3-${view}.csv`);});
  window.addEventListener('resize',()=>render());render();
}
init().catch(error=>{$('status').textContent='Unable to load the lab. Serve the site over HTTP and try again.';console.error(error);});
