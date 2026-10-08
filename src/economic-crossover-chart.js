import {escapeHtml as escape, formatNumber} from './format.js';
import {renderPhaseDiagram,rankPhaseSegments,winningValueCeiling} from './phase-diagram.js';
import {analyseService as analyseLine} from './line.js';
import {createPhaseScale, leadershipWeights} from './phase-scale.js';
import {createScale} from './scales.js';
const fmt = x => formatNumber(x,2);

export function renderEconomicCrossovers(container, {trains,story,fill,kind,distanceMode,verticalMode='linear',highlighted,targets={},ordinateTitle='Running cost / passenger ($)',ordinateFormat=value=>value.toLocaleString('en-GB',{notation:'compact',maximumFractionDigits:1}),chartTitle,rankTitle='Efficiency rank · first place at the top',emphasize=true}) {
  if(!story.phases.length) {container.textContent=trains.length?'Choose a positive occupancy to compare economic crossovers.':'Select at least one train to display economic crossovers.';return;}
  const valueAt=story.valueAt??((id,x)=>analyseLine(trains.find(t=>t.id===id),{distanceKm:x,fillRatio:fill,...targets}).maintenancePerJourney);
  const axisLabel=story.label??'One-way distance (km)';
  const formatX=x=>story.axis==='year'?String(Math.floor(x)):fmt(x);
  const rank=kind==='rank',W=Math.max(320,container.clientWidth||1000),H=rank?Math.max(330,trains.length*28+100):(W<700?460:620);
  const L=65,R=W>=700?220:20,T=40,B=55;
  const segments=rank?story.intervals:story.phases;
  const knots=distanceMode==='linear'?[story.start,story.end]:[segments[0].start,...segments.map(p=>p.end)];
  const axis=createPhaseScale(knots,rank||distanceMode==='linear'?undefined:leadershipWeights(segments.length));
  const sx=x=>L+axis.position(x)*(W-L-R);
  // Evaluate each render from the supplied story: custom compositions may retain
  // their ID while their mechanical or economic specifications change.
  const samples=rank?[]:story.phases.map(phase=>{
    const points=Array.from({length:101},(_,i)=>phase.start+(phase.end-phase.start)*i/100);
    if(story.axis==='year')for(let year=Math.ceil(phase.start);year<=phase.end;year++)points.push(year);
    return [...new Set(points)].sort((a,b)=>a-b).map(x=>({x,values:trains.map(train=>valueAt(train.id,x))}));
  });
  const costs=rank?[1]:samples.flatMap((phase,index)=>phase.flatMap(point=>story.phases[index].leaders.map(id=>point.values[trains.findIndex(t=>t.id===id)])));
  const finalRanks=story.ranksAt?.(story.end);
  if(!rank&&finalRanks)for(const train of trains)if(finalRanks[train.id]===1)costs.push(valueAt(train.id,story.end));
  const upper=winningValueCeiling(costs);
  const finiteCosts=costs.filter(Number.isFinite);
  const floor=Math.min(upper/10,Math.max(upper/10000,finiteCosts.reduce((minimum,cost)=>Math.min(minimum,cost),Infinity)));
  const efficiencyScale=createScale(verticalMode,upper,floor);
  const sy=y=>rank ? T+(y-1)/Math.max(1,trains.length-1)*(H-T-B) : H-B-efficiencyScale.positionUnbounded(y)*(H-T-B);
  const title=chartTitle??(rank?'Economic rank crossovers':'Running cost around crossovers');
  let svg=`<title>${escape(title)}</title><desc>${escape(axisLabel)}: ${formatX(story.start)}–${formatX(story.end)}. Scale: ${escape(distanceMode)}.${story.sampled?' Fleet changes and crossovers are sampled.':''}</desc><text x="${L}" y="20">${escape(rank?rankTitle:ordinateTitle)}</text>`;
  const ticks=rank?Array.from({length:trains.length},(_,i)=>i+1):efficiencyScale.ticks;
  for(const tick of ticks)svg+=`<line x1="${L}" x2="${W-R}" y1="${sy(tick)}" y2="${sy(tick)}" stroke="#e4e8e4" stroke-dasharray="2 5"/><text x="${L-10}" y="${sy(tick)+4}" text-anchor="end">${rank?fmt(tick):escape(ordinateFormat(tick))}</text>`;
  const xTicks=distanceMode==='linear'?Array.from({length:6},(_,i)=>story.start+(story.end-story.start)*i/5):knots;
  const spacing=Math.max(1,Math.ceil(xTicks.length/Math.max(2,(W-L-R)/85)));
  xTicks.forEach((x,i)=>{
    const boundary=i>0 && i<xTicks.length-1 && distanceMode!=='linear';
    if(boundary)svg+=`<line x1="${sx(x)}" x2="${sx(x)}" y1="${T}" y2="${H-B}" stroke="#c7a478" stroke-dasharray="4 4"/><text x="${sx(x)}" y="${H-B+10}" text-anchor="middle" style="fill:#8a5f2b">//</text>`;
    if(i%spacing===0 || i===xTicks.length-1)svg+=`<text x="${sx(x)}" y="${H-B+25}" text-anchor="${i===0?'start':i===xTicks.length-1?'end':'middle'}">${formatX(x)}</text>`;
  });
  const paths=rank?rankPhaseSegments(trains,story.phases,story.intervals,sx,sy):[];
  if(!rank)for(const t of trains)for(const [phaseIndex,phase] of story.phases.entries()){
    let d='',pen=false;
    for(const point of samples[phaseIndex]){
      const value=point.values[trains.indexOf(t)];
      if(!Number.isFinite(value)){pen=false;continue;}
      const x=sx(point.x),y=sy(value);
      if(!Number.isFinite(y)){pen=false;continue;}
      d+=pen&&(story.discontinuous??targets.demandPerDirection!=null)?`H${x} V${y} `:`${pen?'L':'M'}${x},${y} `;pen=true;
    }
    paths.push({t,d,winner:phase.leaders.includes(t.id)});
  }
  let overlay='';
  if(!rank)for(const phase of story.phases.slice(1)){
    const value=valueAt(phase.leaders[0],phase.start);
    if(Number.isFinite(value))overlay+=`<circle cx="${sx(phase.start)}" cy="${sy(value)}" r="4" fill="white" stroke="#27332e"><title>Leader changes at ${formatX(phase.start)}</title></circle>`;
  }
  if(Number.isFinite(story.current)&&story.current>=story.start&&story.current<=story.end)overlay+=`<line x1="${sx(story.current)}" x2="${sx(story.current)}" y1="${T}" y2="${H-B}" stroke="currentColor" stroke-dasharray="6 4"><title>Current setting: ${formatX(story.current)}</title></line>`;
  overlay+=`<text x="${(W+L-R)/2}" y="${H-8}" text-anchor="middle">${escape(axisLabel)} · ${escape(distanceMode)}</text>`;
  const endpointRanks=rank?(story.ranksAt?.(story.end)??story.intervals.at(-1).ranks):null;
  renderPhaseDiagram(container,{trains,segments:paths,frame:svg,overlay,width:W,height:H,left:L,right:R,top:T,bottom:B,title,highlighted,emphasize,
    bands:story.phases.map(p=>({leaders:p.leaders,width:axis.position(p.end)-axis.position(p.start)})),
    endpoints:trains.map(t=>({t,y:(rank?endpointRanks[t.id]:valueAt(t.id,story.end))==null?NaN:sy(rank?endpointRanks[t.id]:valueAt(t.id,story.end)),winner:rank?endpointRanks[t.id]===1:finalRanks?finalRanks[t.id]===1:story.phases.at(-1).leaders.includes(t.id)}))});
}
