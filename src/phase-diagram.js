import {curveLabels,trainLegend} from './chart-labels.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const charts=new WeakMap();
const bindings=new WeakMap();
const observers=new WeakMap();

// Optional application bridge, without rebuilding the focused chart.
export function observePhaseHighlight(document,group,onHighlight){
  if(!observers.has(document))observers.set(document,new Map());
  observers.get(document).set(group,onHighlight);
}

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
  return trains.flatMap(t=>phases.map(phase=>{
    let d='',transitions='';
    intervals.forEach((interval,index)=>{
      const start=Math.max(interval.start,phase.start),end=Math.min(interval.end,phase.end);
      if(end<=start)return;
      const rank=interval.ranks[t.id];if(rank==null)return;
      const previous=start===interval.start?intervals[index-1]?.ranks[t.id]:null;
      if(previous!=null&&previous!==rank)transitions+=`M${sx(start)},${sy(previous)} L${sx(start)},${sy(rank)} `;
      d+=`M${sx(start)},${sy(rank)} L${sx(end)},${sy(rank)} `;
    });
    return {t,d,transitions,winner:phase.leaders.includes(t.id)};
  })).filter(segment=>segment.d);
}

function applyHighlight(container,id){
  const config=bindings.get(container)?.config;if(!config)return;
  const segments=[...container.querySelectorAll('.phase-segment')];
  for(const segment of segments){
    const appearance=phaseAppearance(segment.dataset.winner==='true',config.emphasize,id,segment.dataset.train);
    segment.setAttribute('opacity',appearance.opacity);segment.setAttribute('stroke-width',appearance.width);
  }
  segments.sort((a,b)=>Number(a.dataset.train===id)-Number(b.dataset.train===id)||Number(a.dataset.winner==='true')-Number(b.dataset.winner==='true'));
  for(const segment of segments)segment.parentNode.appendChild(segment);
  for(const label of container.querySelectorAll('.end-label,.train-legend [data-train],.phase-leaders [data-train]')){
    const opacity=id?(label.dataset.train===id?1:.25):Number(label.dataset.baseOpacity??1);
    if(label.classList.contains('end-label'))label.setAttribute('opacity',opacity);else label.style.opacity=opacity;
  }
}

function mountInteractions(container,config){
  if(!container.addEventListener||!container.ownerDocument)return;
  let binding=bindings.get(container);
  if(binding){binding.config=config;return;}
  binding={config};bindings.set(container,binding);
  const document=container.ownerDocument;
  if(!charts.has(document))charts.set(document,new Set());charts.get(document).add(container);
  const update=id=>{
    for(const chart of charts.get(document))if(bindings.get(chart).config.group===binding.config.group)applyHighlight(chart,id);
    observers.get(document)?.get(binding.config.group)?.(id);
  };
  const targetId=target=>target?.closest?.('[data-train]')?.dataset.train;
  container.addEventListener('pointerover',event=>update(targetId(event.target)));
  container.addEventListener('pointerleave',()=>update(targetId(document.activeElement)&&container.contains(document.activeElement)?targetId(document.activeElement):undefined));
  container.addEventListener('focusin',event=>update(targetId(event.target)));
  container.addEventListener('focusout',event=>update(container.contains(event.relatedTarget)?targetId(event.relatedTarget):undefined));
}

// Analyses provide their axis/grid and sampled model paths. This component owns
// the presentation and interaction contract for every phase plot.
export function renderPhaseDiagram(container,{trains,segments,bands,endpoints,frame='',overlay='',width:W,height:H,left:L,right:R,top:T,bottom:B,title,highlighted,emphasize=true,group='rail'}){
  const clipId=`${container.id||'phase'}-clip`;
  const sorted=[...segments].sort((a,b)=>Number(a.t.id===highlighted)-Number(b.t.id===highlighted)||Number(a.winner)-Number(b.winner));
  const transitions=sorted.filter(s=>s.transitions).map(({t,transitions})=>`<path class="rank-transition" d="${transitions}" fill="none" stroke="${t.color}" stroke-dasharray="${t.dash||''}" stroke-width="1.2" opacity=".25" pointer-events="none"/>`).join('');
  const curves=sorted.map(({t,d,winner})=>{
    const {opacity,width}=phaseAppearance(winner,emphasize,highlighted,t.id);
    return `<path class="train-curve phase-segment ${winner?'winning-segment':'other-segment'}" data-train="${escape(t.id)}" data-winner="${winner}" d="${d}" fill="none" stroke="${t.color}" stroke-dasharray="${t.dash||''}" stroke-width="${width}" opacity="${opacity}"/>`;
  }).join('');
  const hits=sorted.map(({t,d,winner})=>`<path class="curve-hit" data-train="${escape(t.id)}" d="${d}" fill="none" stroke="transparent" stroke-width="12" pointer-events="stroke"><title>${escape(t.name)}${winner?' · leading phase':''}</title></path>`).join('');
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

  container.innerHTML=`<div class="phase-leaders" style="padding-left:${L}px;padding-right:${R}px">${leaders}</div><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escape(title)}"><defs><clipPath id="${escape(clipId)}"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs><rect width="${W}" height="${H}" fill="white"/>${shading}${frame}<g clip-path="url(#${escape(clipId)})"><g class="rank-transitions">${transitions}</g><g class="phase-curves">${curves}</g><g class="phase-hits">${hits}</g></g>${overlay}${labels}</svg>${trainLegend(trains,W,highlighted)}`;
  // Names are the keyboard equivalent of the wide pointer hit areas.
  if(container.querySelectorAll){
    for(const label of container.querySelectorAll('.end-label,.train-legend [data-train],.phase-leaders [data-train]')){
      label.setAttribute('tabindex','0');
      const point=endpoints.find(p=>p.t.id===label.dataset.train);
      label.dataset.baseOpacity=label.classList.contains('end-label')&&emphasize&&point?.winner===false?.3:1;
    }
  }
  mountInteractions(container,{emphasize,group});
  if(container.querySelectorAll)applyHighlight(container,highlighted);
}
