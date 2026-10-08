import {renderPhaseDiagram,rankPhaseSegments,winningValueCeiling} from './phase-diagram.js';
import {analyseService as analyseLine} from './line.js';
import {createPhaseScale, leadershipWeights} from './phase-scale.js';
import {createScale} from './scales.js';
const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = x => x.toLocaleString('en-GB',{maximumFractionDigits:2});

let sampleKey, samples;
export function renderEconomicCrossovers(container, {trains,story,fill,kind,distanceMode,verticalMode='linear',highlighted,targets={}}) {
  if(!story.phases.length) {container.textContent=trains.length?'Choose a positive occupancy to compare economic crossovers.':'Select at least one train to display economic crossovers.';return;}
  const rank=kind==='rank',W=Math.max(320,container.clientWidth||1000),H=rank?Math.max(330,trains.length*28+100):(W<700?460:620);
  const L=65,R=W>=700?220:20,T=40,B=55;
  const segments=rank?story.intervals:story.phases;
  const knots=distanceMode==='linear'?[story.start,story.end]:[segments[0].start,...segments.map(p=>p.end)];
  const axis=createPhaseScale(knots,rank||distanceMode==='linear'?undefined:leadershipWeights(segments.length));
  const sx=x=>L+axis.position(x)*(W-L-R);
  if(!rank) {
    const key=JSON.stringify([trains.map(t=>t.id),fill,targets,story.phases.map(p=>[p.start,p.end])]);
    if(key!==sampleKey) {
      sampleKey=key;
      samples=story.phases.map(phase=>Array.from({length:101},(_,i)=>{
        const x=phase.start+(phase.end-phase.start)*i/100;
        const values=trains.map(train=>analyseLine(train,{distanceKm:x,fillRatio:fill,...targets}).maintenancePerJourney);
        return {x,values};
      }));
    }
  }
  const costs=rank?[1]:samples.flatMap((phase,index)=>phase.flatMap(point=>story.phases[index].leaders.map(id=>point.values[trains.findIndex(t=>t.id===id)])));
  const upper=winningValueCeiling(costs);
  const floor=Math.min(upper/10,Math.max(upper/10000,costs.reduce((minimum,cost)=>Math.min(minimum,cost),Infinity)));
  const efficiencyScale=createScale(verticalMode,upper,floor);
  const sy=y=>rank ? T+(y-1)/Math.max(1,trains.length-1)*(H-T-B) : H-B-efficiencyScale.positionUnbounded(y)*(H-T-B);
  const title=rank?'Economic rank crossovers':'Running cost around crossovers';
  let svg=`<title>${title}</title><desc>Ranks by passenger throughput per maintenance cost within ${fmt(story.start)}–${fmt(story.end)} km. Demand assumed sufficient. Distance scale: ${distanceMode}.</desc><text x="${L}" y="20">${rank?'Efficiency rank · first place at the top':'Running cost / passenger ($)'}</text>`;
  const ticks=rank?Array.from({length:trains.length},(_,i)=>i+1):efficiencyScale.ticks;
  for(const tick of ticks)svg+=`<line x1="${L}" x2="${W-R}" y1="${sy(tick)}" y2="${sy(tick)}" stroke="#e4e8e4" stroke-dasharray="2 5"/><text x="${L-10}" y="${sy(tick)+4}" text-anchor="end">${rank?fmt(tick):tick.toLocaleString('en-GB',{notation:'compact',maximumFractionDigits:1})}</text>`;
  const xTicks=distanceMode==='linear'?Array.from({length:6},(_,i)=>story.start+(story.end-story.start)*i/5):knots;
  const spacing=Math.max(1,Math.ceil(xTicks.length/Math.max(2,(W-L-R)/85)));
  xTicks.forEach((x,i)=>{
    const boundary=i>0 && i<xTicks.length-1 && distanceMode!=='linear';
    if(boundary)svg+=`<line x1="${sx(x)}" x2="${sx(x)}" y1="${T}" y2="${H-B}" stroke="#c7a478" stroke-dasharray="4 4"/><text x="${sx(x)}" y="${H-B+10}" text-anchor="middle" style="fill:#8a5f2b">//</text>`;
    if(i%spacing===0 || i===xTicks.length-1)svg+=`<text x="${sx(x)}" y="${H-B+25}" text-anchor="${i===0?'start':i===xTicks.length-1?'end':'middle'}">${fmt(x)}</text>`;
  });
  const paths=rank?rankPhaseSegments(trains,story.phases,story.intervals,sx,sy):[];
  if(!rank)for(const t of trains)for(const [phaseIndex,phase] of story.phases.entries()){
    let d='',pen=false;
    for(const point of samples[phaseIndex]){
      const x=sx(point.x),y=sy(point.values[trains.indexOf(t)]);
      if(!Number.isFinite(y)){pen=false;continue;}
      d+=pen&&targets.demandPerDirection!=null?`H${x} V${y} `:`${pen?'L':'M'}${x},${y} `;pen=true;
    }
    paths.push({t,d,winner:phase.leaders.includes(t.id)});
  }
  let overlay='';
  if(!rank)for(const phase of story.phases.slice(1))overlay+=`<circle cx="${sx(phase.start)}" cy="${sy(analyseLine(trains.find(t=>t.id===phase.leaders[0]),{distanceKm:phase.start,fillRatio:fill,...targets}).maintenancePerJourney)}" r="4" fill="white" stroke="#27332e"><title>Leader changes at ${fmt(phase.start)} km</title></circle>`;
  overlay+=`<text x="${(W+L-R)/2}" y="${H-8}" text-anchor="middle">One-way distance (km) · ${distanceMode}</text>`;
  renderPhaseDiagram(container,{trains,segments:paths,frame:svg,overlay,width:W,height:H,left:L,right:R,top:T,bottom:B,title,highlighted,
    bands:story.phases.map(p=>({leaders:p.leaders,width:axis.position(p.end)-axis.position(p.start)})),
    endpoints:trains.map(t=>({t,y:sy(rank?story.intervals.at(-1).ranks[t.id]:samples.at(-1).at(-1).values[trains.indexOf(t)]),winner:story.phases.at(-1).leaders.includes(t.id)}))});
}
