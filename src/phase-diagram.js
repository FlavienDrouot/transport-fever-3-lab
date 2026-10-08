import {curveLabels,trainLegend} from './chart-labels.js';
import {escapeHtml as escape} from './format.js';
export {observeChartHighlight as observePhaseHighlight} from './chart-interactions.js';
import {mountChartInteractions} from './chart-interactions.js';

// Keep the winning envelope readable even when a losing vehicle is an outlier.
export function winningValueCeiling(values,margin=.15){
  const maximum=values.reduce((max,value)=>Number.isFinite(value)?Math.max(max,value):max,0);
  return maximum>0?maximum*(1+margin):1;
}

export function phaseAppearance(winner,emphasize,highlighted,id){
  return {opacity:highlighted?(highlighted===id?1:.12):emphasize&&!winner?.2:1,width:highlighted===id?4:emphasize&&winner?3.5:1.7};
}

// Horizontal rank plateaus carry emphasis; vertical transitions are neutral.
// Availability gaps never connect unrelated segments.
export function rankPhaseSegments(trains,phases,intervals,sx,sy){
  // Both partitions are ordered. Share their intersections across vehicles,
  // rather than scanning every rank interval again for each leadership phase.
  let first=0;
  const intersections=phases.map(phase=>{
    while(first<intervals.length&&intervals[first].end<=phase.start)first++;
    const overlaps=[];
    for(let index=first;index<intervals.length&&intervals[index].start<phase.end;index++){
      const interval=intervals[index];
      const start=Math.max(interval.start,phase.start),end=Math.min(interval.end,phase.end);
      if(end>start)overlaps.push({interval,index,start,end,xStart:sx(start),xEnd:sx(end)});
    }
    return overlaps;
  });
  const rankYs=new Map();
  const rankY=rank=>{if(!rankYs.has(rank))rankYs.set(rank,sy(rank));return rankYs.get(rank);};
  return trains.flatMap(t=>phases.map((phase,phaseIndex)=>{
    let d='',transitions='',plateau;
    const flush=()=>{
      if(plateau)d+=`M${plateau.xStart},${rankY(plateau.rank)} H${plateau.xEnd} `;
      plateau=null;
    };
    for(const {interval,index,start,end,xStart,xEnd} of intersections[phaseIndex]){
      const rank=interval.ranks[t.id];if(rank==null){flush();continue;}
      const before=intervals[index-1];
      const previous=start===interval.start&&before?.end===start?before.ranks[t.id]:null;
      if(previous!=null&&previous!==rank)transitions+=`M${xStart},${rankY(previous)} V${rankY(rank)} `;
      if(plateau&&plateau.rank===rank&&plateau.end===start){plateau.end=end;plateau.xEnd=xEnd;}
      else {flush();plateau={start,end,rank,xStart,xEnd};}
    }
    flush();
    return {t,d,transitions,winner:phase.leaders.includes(t.id)};
  })).filter(segment=>segment.d);
}

// Analyses provide their axis/grid and sampled model paths. This component owns
// the presentation and interaction contract for every phase plot.
export function renderPhaseDiagram(container,{trains,segments,bands,endpoints,frame='',overlay='',width:W,height:H,left:L,right:R,top:T,bottom:B,title,highlighted,emphasize=true,group='rail'}){
  container.classList?.add('phase-diagram');
  if(container.style)container.style.containIntrinsicSize=`auto ${H+32}px`;
  const clipId=`${container.id||'phase'}-clip`;
  // Compound paths preserve gaps and winner styling with at most two paths per vehicle.
  const groups=new Map();
  for(const segment of segments){
    const key=JSON.stringify([segment.t.id,!!segment.winner]);
    if(!groups.has(key))groups.set(key,{t:segment.t,winner:segment.winner,paths:[],transitions:[]});
    const group=groups.get(key);group.paths.push(segment.d);if(segment.transitions)group.transitions.push(segment.transitions);
  }
  const combined=[...groups.values()].map(group=>({t:group.t,winner:group.winner,d:group.paths.join(' '),transitions:group.transitions.join(' ')}));
  const sorted=combined.sort((a,b)=>Number(a.t.id===highlighted)-Number(b.t.id===highlighted)||Number(a.winner)-Number(b.winner));
  const transitions=sorted.filter(s=>s.transitions).map(({t,transitions})=>`<path class="rank-transition" d="${transitions}" fill="none" stroke="${t.color}" stroke-dasharray="${t.dash||''}" stroke-width="1.2" opacity=".25" pointer-events="none"/>`).join('');
  const geometry=sorted.map(({d},i)=>`<path id="${escape(clipId)}-curve-${i}" d="${d}"/>`).join('');
  const curves=sorted.map(({t,winner},i)=>{
    const {opacity,width}=phaseAppearance(winner,emphasize,highlighted,t.id);
    return `<use class="train-curve phase-segment ${winner?'winning-segment':'other-segment'}" data-train="${escape(t.id)}" data-winner="${winner}" href="#${escape(clipId)}-curve-${i}" fill="none" stroke="${t.color}" stroke-dasharray="${t.dash||''}" stroke-width="${width}" opacity="${opacity}"/>`;
  }).join('');
  const hits=sorted.map(({t,winner},i)=>`<use class="curve-hit" data-train="${escape(t.id)}" href="#${escape(clipId)}-curve-${i}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"><title>${escape(t.name)}${winner?' · leading phase':''}</title></use>`).join('');
  const points=endpoints.filter(p=>p.y>=T&&p.y<=H-B).map(p=>({...p,opacity:highlighted?(p.t.id===highlighted?1:.25):emphasize&&p.winner===false?.3:1}));
  const labels=curveLabels(points,{width:W,right:R,top:T,bottom:H-B,highlighted});
  const byId=new Map(trains.map(t=>[t.id,t]));
  let bandStart=0;
  const shading=bands.map(band=>{
    const x=L+bandStart*(W-L-R);bandStart+=band.width;
    return `<rect x="${x}" y="${T}" width="${band.width*(W-L-R)}" height="${H-T-B}" fill="${byId.get(band.leaders[0])?.color??'#888'}" opacity=".06"/>`;
  }).join('');
  const leaders=bands.map(band=>{
    const compact=band.width*(W-L-R)/Math.max(1,band.leaders.length)<40;
    return `<div class="${compact?'phase-leader-compact':''}" style="flex:0 0 ${band.width*100}%">${band.leaders.map(id=>{
      const t=byId.get(id);
      return `<span data-train="${escape(id)}" title="${escape(t.name)}" aria-label="${escape(t.name)}" style="color:${t.color}">${compact?'•':escape(t.name)}</span>`;
    }).join(' / ')}</div>`;
  }).join('');

  container.innerHTML=`<div class="phase-leaders" style="padding-left:${L}px;padding-right:${R}px">${leaders}</div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(title)}"><defs>${geometry}<clipPath id="${escape(clipId)}"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs><rect width="${W}" height="${H}" fill="white"/>${shading}${frame}<g clip-path="url(#${escape(clipId)})"><g class="rank-transitions">${transitions}</g><g class="phase-curves">${curves}</g><g class="phase-hits">${hits}</g></g>${overlay}${labels}</svg>${trainLegend(trains,W,highlighted)}`;
  // Names are the keyboard equivalent of the wide pointer hit areas.
  if(container.querySelectorAll){
    for(const label of container.querySelectorAll('.end-label,.train-legend [data-train],.phase-leaders [data-train]')){
      label.setAttribute('tabindex','0');
      const point=endpoints.find(p=>p.t.id===label.dataset.train);
      label.dataset.baseOpacity=label.classList.contains('end-label')&&emphasize&&point?.winner===false?.3:1;
    }
  }
  mountChartInteractions(container,{group,highlighted,selector:'.phase-segment',appearance:(segment,id)=>phaseAppearance(segment.dataset.winner==='true',emphasize,id,segment.dataset.train)});
}
