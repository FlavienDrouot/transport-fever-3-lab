import {curveLabels, trainLegend} from './chart-labels.js';
import {analyseLine} from './line.js';
import {createScale} from './scales.js';

const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const fmt = n => n.toLocaleString('en-GB', {maximumFractionDigits: 1});
// Hover changes presentation only; reuse service calculations until inputs change.
let cachedKey, cachedSeries;
export function renderEconomicChart(container, {trains, distance, fill, mode, highlighted}) {
  const maxDistance = distance, minDistance = Math.min(.5, distance / 10);
  const key = JSON.stringify([trains.map(t=>t.id), maxDistance, fill]);
  if (key !== cachedKey) {
    cachedKey = key;
    cachedSeries = trains.map(t => ({t, points: Array.from({length: 161}, (_,i) => {
      const x = minDistance + (maxDistance - minDistance) * i / 160;
      return {x, ...analyseLine(t, {distanceKm:x, fillRatio:fill})};
    })}));
  }
  if (!trains.length) {container.textContent = 'Select at least one train to display the economic curves.'; return;}
  const series = cachedSeries.map(({t,points}) => ({t, points: points.map(p => ({x:p.x,y:p.maintenancePerJourney}))}));
  const W = Math.max(320, container.clientWidth || 1000), H = W < 700 ? 430 : 520;
  const L = 70, R = W>=700?220:20, T = 40, B = 55;
  const maxValue = Math.max(1, ...series.flatMap(s => s.points.map(p=>p.y || 0)));
  const positives = series.flatMap(s => s.points.filter(p=>p.y>0).map(p=>p.y));
  const upper = maxValue * 1.05;
  const floor = Math.min(upper/10, Math.max(upper/10000, Math.min(...positives)));
  const scale = createScale(mode, upper, floor);
  const sx = x => L+(x-minDistance)/(maxDistance-minDistance)*(W-L-R), sy = y => H-B-scale.position(y)*(H-T-B);
  const title = 'Maintenance cost per passenger journey · lower is better';
  let svg = `<title>${title}</title><desc>A–B–A service with braking and terminal handling, at ${fmt(fill*100)}% occupancy. Demand is assumed sufficient. ${mode} vertical scale.</desc><rect width="${W}" height="${H}" fill="white"/><text x="${L}" y="20">Maintenance / journey ($)</text>`;
  for (const tick of scale.ticks) svg += `<line x1="${L}" x2="${W-R}" y1="${sy(tick)}" y2="${sy(tick)}" stroke="#e4e8e4" stroke-dasharray="2 5"/><text x="${L-10}" y="${sy(tick)+4}" text-anchor="end">${tick.toLocaleString('en-GB',{notation:'compact',maximumFractionDigits:1})}</text>`;
  for (let i=0;i<=5;i++) {const x=minDistance+(maxDistance-minDistance)*i/5;svg+=`<text x="${sx(x)}" y="${H-B+22}" text-anchor="middle">${fmt(x)}</text>`;}
  svg += `<line x1="${sx(distance)}" x2="${sx(distance)}" y1="${T}" y2="${H-B}" stroke="#8a5f2b" stroke-dasharray="6 5"/><text x="${sx(distance)}" y="${T-8}" text-anchor="${distance>maxDistance*.8?'end':'start'}" style="fill:#8a5f2b">${fmt(distance)} km route</text>`;
  const ordered = [...series].sort((a,b)=>Number(a.t.id===highlighted)-Number(b.t.id===highlighted));
  for (const {t,points} of ordered) {
    let path='', penDown=false;
    for (const p of points) {const y=p.y === null ? NaN : sy(p.y);if(!Number.isFinite(y)){penDown=false;continue;}path+=`${penDown?'L':'M'}${sx(p.x).toFixed(2)},${y.toFixed(2)} `;penDown=true;}
    const opacity = highlighted && t.id!==highlighted ? .15 : 1;
    svg += `<path data-train="${escape(t.id)}" d="${path}" fill="none" stroke="${t.color}" stroke-width="${t.id===highlighted?4:2}" stroke-dasharray="${t.dash || ''}" opacity="${opacity}"/><path class="curve-hit" data-train="${escape(t.id)}" d="${path}" fill="none" stroke="transparent" stroke-width="12"><title>${escape(t.name)}</title></path>`;
  }
  svg += curveLabels(series.map(({t,points})=>({t,y:sy(points.at(-1).y)})),{width:W,right:R,top:T,bottom:H-B,highlighted});
  svg += `<text x="${(W+L-R)/2}" y="${H-8}" text-anchor="middle">One-way distance (km)</text>`;
  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title} over distance">${svg}</svg>${trainLegend(trains,W,highlighted)}${!fill?'<p class="chart-help">Zero occupancy: no passenger journeys or efficiency benefit. Choose a positive occupancy to compare trains.</p>':''}`;
}
