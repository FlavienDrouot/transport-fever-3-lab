import {analyseLine} from './line.js';
import {createPhaseScale, leadershipWeights} from './phase-scale.js';
import {createScale} from './scales.js';
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = x => x.toLocaleString('en-GB',{maximumFractionDigits:2});

let sampleKey, samples;
export function renderEconomicCrossovers(container, {trains,story,fill,kind,distanceMode,verticalMode='linear',highlighted}) {
  if(!story.phases.length) {container.textContent=trains.length?'Choose a positive occupancy to compare economic crossovers.':'Select at least one train to display economic crossovers.';return;}
  const rank=kind==='rank',W=Math.max(320,container.clientWidth||1000),H=rank?Math.max(330,trains.length*28+100):(W<700?460:620);
  const L=65,R=20,T=40,B=55;
  const segments=rank?story.intervals:story.phases;
  const knots=distanceMode==='linear'?[story.start,story.end]:[segments[0].start,...segments.map(p=>p.end)];
  const axis=createPhaseScale(knots,rank||distanceMode==='linear'?undefined:leadershipWeights(segments.length));
  const sx=x=>L+axis.position(x)*(W-L-R);
  const efficiencyScale=createScale(verticalMode,105,.01);
  const sy=y=>rank ? T+(y-1)/Math.max(1,trains.length-1)*(H-T-B) : H-B-efficiencyScale.position(y)*(H-T-B);
  const title=rank?'Economic rank crossovers':'Efficiency curves around crossovers';
  let svg=`<title>${title}</title><desc>Ranks by passenger throughput per maintenance cost within ${fmt(story.start)}–${fmt(story.end)} km. Demand assumed sufficient. Distance scale: ${distanceMode}.</desc><rect width="${W}" height="${H}" fill="white"/><text x="${L}" y="20">${rank?'Efficiency rank · first place at the top':'Efficiency (best = 100)'}</text>`;
  for(const phase of story.phases) {const leader=trains.find(t=>t.id===phase.leaders[0]);svg+=`<rect x="${sx(phase.start)}" y="${T}" width="${sx(phase.end)-sx(phase.start)}" height="${H-T-B}" fill="${leader.color}" opacity=".045"/>`;}
  const ticks=rank?Array.from({length:trains.length},(_,i)=>i+1):efficiencyScale.ticks;
  for(const tick of ticks)svg+=`<line x1="${L}" x2="${W-R}" y1="${sy(tick)}" y2="${sy(tick)}" stroke="#e4e8e4" stroke-dasharray="2 5"/><text x="${L-10}" y="${sy(tick)+4}" text-anchor="end">${fmt(tick)}</text>`;
  const xTicks=distanceMode==='linear'?Array.from({length:6},(_,i)=>story.start+(story.end-story.start)*i/5):knots;
  const spacing=Math.max(1,Math.ceil(xTicks.length/Math.max(2,(W-L-R)/85)));
  xTicks.forEach((x,i)=>{
    const boundary=i>0 && i<xTicks.length-1 && distanceMode!=='linear';
    if(boundary)svg+=`<line x1="${sx(x)}" x2="${sx(x)}" y1="${T}" y2="${H-B}" stroke="#c7a478" stroke-dasharray="4 4"/><text x="${sx(x)}" y="${H-B+10}" text-anchor="middle" style="fill:#8a5f2b">//</text>`;
    if(i%spacing===0 || i===xTicks.length-1)svg+=`<text x="${sx(x)}" y="${H-B+25}" text-anchor="${i===0?'start':i===xTicks.length-1?'end':'middle'}">${fmt(x)}</text>`;
  });
  if(!rank) {
    const key=JSON.stringify([trains.map(t=>t.id),fill,story.phases.map(p=>[p.start,p.end])]);
    if(key!==sampleKey) {
      sampleKey=key;
      samples=story.phases.map(phase=>Array.from({length:101},(_,i)=>{
        const x=phase.start+(phase.end-phase.start)*i/100;
        const values=trains.map(train=>analyseLine(train,{distanceKm:x,fillRatio:fill}).efficiency),best=Math.max(...values);
        return {x,values:values.map(v=>best?v/best*100:0)};
      }));
    }
  }
  const draw=(t,path,winner)=>{
    const opacity=highlighted?(highlighted===t.id?1:.12):rank||winner?1:.2;
    svg+=`<path d="${path}" data-train="${escape(t.id)}" fill="none" stroke="${t.color}" stroke-dasharray="${t.dash||''}" stroke-width="${highlighted===t.id?4:!rank&&winner?3.5:1.7}" opacity="${opacity}"/><path class="curve-hit" data-train="${escape(t.id)}" d="${path}" fill="none" stroke="transparent" stroke-width="12"><title>${escape(t.name)}</title></path>`;
  };
  for(const t of [...trains].sort((a,b)=>Number(a.id===highlighted)-Number(b.id===highlighted))) {
    if(rank) {
      let path='';story.intervals.forEach((p,i)=>{const y=sy(p.ranks[t.id]);path+=`${i?'L':'M'}${sx(p.start)},${y} L${sx(p.end)},${y} `;});draw(t,path,true);
    } else for(const [phaseIndex,phase] of story.phases.entries()) {
      let path='',pen=false;
      for(let i=0;i<=100;i++) {
        const point=samples[phaseIndex][i],x=point.x;
        const y=sy(point.values[trains.indexOf(t)]);
        if(!Number.isFinite(y)){pen=false;continue;}
        path+=`${pen?'L':'M'}${sx(x)},${y} `;pen=true;
      }
      draw(t,path,phase.leaders.includes(t.id));
    }
  }
  if(!rank)for(const phase of story.phases.slice(1))svg+=`<circle cx="${sx(phase.start)}" cy="${sy(100)}" r="4" fill="white" stroke="#27332e"><title>Leader changes at ${fmt(phase.start)} km</title></circle>`;
  svg+=`<text x="${(W+L-R)/2}" y="${H-8}" text-anchor="middle">One-way distance (km) · ${distanceMode}</text>`;
  container.innerHTML=`<div class="phase-leaders">${story.phases.map(p=>`<div style="flex:${axis.position(p.end)-axis.position(p.start)}">${p.leaders.map(id=>{const t=trains.find(t=>t.id===id);return `<span data-train="${escape(id)}" style="color:${t.color}">${escape(t.name)}</span>`;}).join(' / ')}</div>`).join('')}</div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">${svg}</svg>`;
}
