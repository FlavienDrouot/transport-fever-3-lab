import {escapeHtml as escape,formatNumber,formatTime} from './format.js';

export function motionStateAtAbscissa(train,x,view) {
  const time=view==='time'||view==='speed-distance'?train.model.timeAt(x):x;
  return {time,...train.model.stateAt(time)};
}
export function motionValue(train,x,view) {
  if(view==='time')return train.model.timeAt(x);
  const time=view==='speed-distance'?train.model.timeAt(x):x;
  const state=train.model.stateAt(time);
  return view==='distance'?state.distanceKm:state.speedKmh;
}

/** Actual phase changes; an asymptote gets a clearly labelled display milestone. */
export function motionTransitions(train,view) {
  const model=train.model;
  if(model.canStart===false)return [];
  const traction=model.tractionEndSeconds,cap=model.speedCapSeconds;
  const hasPower=cap>traction+1e-9*Math.max(1,cap);
  const events=hasPower?[{time:traction,label:'Traction → power'}]:[];
  events.push({time:model.asymptoticSpeed?model.speedViewSeconds:cap,
    label:model.asymptoticSpeed?'99.9% equilibrium':'Speed limit'});
  return events.filter(e=>Number.isFinite(e.time)&&e.time>0).map(event=>{
    const state=model.stateAt(event.time);
    const horizontalDistance=view==='time'||view==='speed-distance';
    return {...event,x:horizontalDistance?state.distanceKm:event.time,
      y:view==='time'?event.time:view==='distance'?state.distanceKm:state.speedKmh,
      xLabel:horizontalDistance?`d = ${formatNumber(state.distanceKm,3)} km`:`t = ${formatTime(event.time)}`,
      yLabel:view==='time'?`t = ${formatTime(event.time)}`:view==='distance'?`d = ${formatNumber(state.distanceKm,3)} km`:`v = ${formatNumber(state.speedKmh,1)} km/h`};
  });
}

/** Only the hovered train's tiny overlay changes; curves and focus stay intact. */
export function renderMotionTransitions(train,{view,sx,sy,left,right,top,bottom}) {
  if(!train)return '';
  const labels=[],overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  return motionTransitions(train,view).map(point=>{
    const x=sx(point.x),y=sy(point.y);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<left||x>right||y<top||y>bottom)return '';
    const width=Math.min(right-left-8,Math.max(...[point.label,point.xLabel,point.yLabel].map(s=>s.length))*6+16),height=54;
    const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
    const candidates=[[x+10,y-height-10],[x+10,y+10],[x-width-10,y-height-10],[x-width-10,y+10]].map(([cx,cy])=>({x:clamp(cx,left+4,right-width-4),y:clamp(cy,top+4,bottom-height-4),w:width,h:height}));
    const box=candidates.find(c=>labels.every(other=>!overlap(c,other)))??candidates[0];labels.push(box);
    const title=`${train.name} — ${point.label}; ${point.xLabel}; ${point.yLabel}`;
    return `<g class="motion-transition"><title>${escape(title)}</title><path d="M${left},${y} H${x} V${bottom}" fill="none" stroke="${train.color}" stroke-dasharray="3 4" opacity=".5"/><circle cx="${x}" cy="${y}" r="4.5" fill="${train.color}" stroke="white" stroke-width="1.5"/><g class="motion-transition-label"><rect x="${box.x}" y="${box.y}" width="${width}" height="${height}" rx="5" fill="white" stroke="${train.color}"/><text x="${box.x+8}" y="${box.y+15}" fill="#314439" font-size="11"><tspan font-weight="600">${escape(point.label)}</tspan><tspan x="${box.x+8}" dy="16">${escape(point.xLabel)}</tspan><tspan x="${box.x+8}" dy="15">${escape(point.yLabel)}</tspan></text></g></g>`;
  }).join('');
}
