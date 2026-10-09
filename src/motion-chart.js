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

/** Keep the speed domain close to the speeds actually reached in this view. */
export function speedOrdinateMaximum(trains,horizon,view) {
  const maximum=Math.max(1,...trains.map(t=>t.model.routeProfile?Math.max(motionValue(t,horizon,view),t.model.effectiveMaxSpeedKmh):motionValue(t,horizon,view)));
  const step=10**Math.floor(Math.log10(maximum))/20;
  return Math.max(maximum,Math.ceil(maximum/step)*step);
}

/** Actual phase changes; an asymptote gets a clearly labelled display milestone. */
export function motionTransitions(train,view) {
  const model=train.model;
  if(model.canStart===false)return [];
  if(model.routeProfile)return model.profileEvents.map(event=>{
    const state=model.stateAt(event.time),horizontalDistance=view==='time'||view==='speed-distance';
    return {...event,x:horizontalDistance?event.distanceKm:event.time,
      y:view==='time'?event.time:view==='distance'?event.distanceKm:state.speedKmh,
      xLabel:horizontalDistance?`d = ${formatNumber(event.distanceKm,3)} km`:`t = ${formatTime(event.time)}`,
      yLabel:view==='time'?`t = ${formatTime(event.time)}`:view==='distance'?`d = ${formatNumber(event.distanceKm,3)} km`:`v = ${formatNumber(state.speedKmh,1)} km/h`};
  });
  const traction=model.tractionEndSeconds,cap=model.speedCapSeconds;
  const hasPower=cap>traction+1e-9*Math.max(1,cap);
  const events=hasPower?[{time:traction,label:'Traction → power'}]:[];
  events.push({time:model.asymptoticSpeed?model.speedViewSeconds:cap,
    label:model.asymptoticSpeed?'99% equilibrium':'Speed limit'});
  return events.filter(e=>Number.isFinite(e.time)&&e.time>0).map(event=>{
    const state=model.stateAt(event.time);
    const horizontalDistance=view==='time'||view==='speed-distance';
    return {...event,x:horizontalDistance?state.distanceKm:event.time,
      y:view==='time'?event.time:view==='distance'?state.distanceKm:state.speedKmh,
      xLabel:horizontalDistance?`d = ${formatNumber(state.distanceKm,3)} km`:`t = ${formatTime(event.time)}`,
      yLabel:view==='time'?`t = ${formatTime(event.time)}`:view==='distance'?`d = ${formatNumber(state.distanceKm,3)} km`:`v = ${formatNumber(state.speedKmh,1)} km/h`};
  });
}

export function renderModelTransitions(trains) {
  return trains.map(train=>{
    const model=train.model,end=motionTransitions(train,'speed').at(-1);
    if(model.routeProfile){const first=model.profileEvents.find(event=>event.label==='Traction → power');return `<tr><td>${escape(train.name)}</td><td>${first?formatTime(first.time):'—'}</td><td>${first?formatNumber(first.distanceKm*1000,0):'—'}</td><td>${formatNumber(model.effectiveMaxSpeedKmh,1)}</td><td>${formatTime(model.speedCapSeconds)}</td><td>${formatNumber(model.routeDistanceKm,2)}</td></tr>`;}
    if(!end)return '';
    const maximum=model.effectiveMaxSpeedKmh??model.stateAt(model.speedCapSeconds).speedKmh;
    return `<tr><td>${escape(train.name)}</td><td>${formatTime(model.tractionEndSeconds)}</td><td>${formatNumber(model.stateAt(model.tractionEndSeconds).distanceKm*1000,0)}</td><td>${formatNumber(maximum,1)}</td><td>${formatTime(end.time)}</td><td>${formatNumber(model.stateAt(end.time).distanceKm,2)}</td></tr>`;
  }).join('');
}

/** Only the hovered train's tiny overlay changes; curves and focus stay intact. */
export function renderMotionTransitions(train,{view,sx,sy,left,right,top,bottom}) {
  if(!train)return '';
  const labels=[],overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const points=motionTransitions(train,view).map(point=>({...point,px:sx(point.x),py:sy(point.y)}))
    .filter(({px:x,py:y})=>Number.isFinite(x)&&Number.isFinite(y)&&x>=left&&x<=right&&y>=top&&y<=bottom);
  if(!points.length)return '';
  const markers=points.map(({px:x,py:y})=>({x:x-8,y:y-8,w:16,h:16}));
  return points.map(point=>{
    const {px:x,py:y}=point;
    const width=Math.min(right-left-8,Math.max(...[point.label,point.xLabel,point.yLabel].map(s=>s.length))*6+16),height=54;
    const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
    const positions=[[x+10,y-height-10],[x+10,y+10],[x-width-10,y-height-10],[x-width-10,y+10],
      [x-width/2,y-height-10],[x-width/2,y+10],[x+10,y-height/2],[x-width-10,y-height/2]];
    // Near a plot edge, clamping can make every preferred position collide.
    // Also try stacking above/below placed labels, keeping both events visible.
    for(const other of labels)for(const cx of [x+10,x-width-10])
      positions.push([cx,other.y-height-8],[cx,other.y+other.h+8]);
    // If both points constrain the preferred sides, use free rows at plot
    // edges or beyond either point. Test every marker before placing a box.
    const rows=[top+4,bottom-height-4,...points.flatMap(p=>[p.py-height-10,p.py+10])];
    for(const cy of rows)for(const cx of [left+4,right-width-4])positions.push([cx,cy]);
    const candidates=positions.map(([cx,cy])=>({x:clamp(cx,left+4,right-width-4),y:clamp(cy,top+4,bottom-height-4),w:width,h:height}));
    const box=candidates.find(c=>[...labels,...markers].every(other=>!overlap(c,other)))??candidates[0];labels.push(box);
    const anchorX=clamp(x,box.x,box.x+width),anchorY=clamp(y,box.y,box.y+height);
    const title=`${train.name} — ${point.label}; ${point.xLabel}; ${point.yLabel}`;
    return `<g class="motion-transition"><title>${escape(title)}</title><path d="M${left},${y} H${x} V${bottom}" fill="none" stroke="${train.color}" stroke-dasharray="3 4" opacity=".5"/><line x1="${x}" y1="${y}" x2="${anchorX}" y2="${anchorY}" stroke="${train.color}" opacity=".6"/><g class="motion-transition-label"><rect x="${box.x}" y="${box.y}" width="${width}" height="${height}" rx="5" fill="white" stroke="${train.color}"/><text x="${box.x+8}" y="${box.y+15}" fill="#314439" font-size="11"><tspan font-weight="600">${escape(point.label)}</tspan><tspan x="${box.x+8}" dy="16">${escape(point.xLabel)}</tspan><tspan x="${box.x+8}" dy="15">${escape(point.yLabel)}</tspan></text></g></g>`;
  }).join('')+`<g class="motion-transition-markers">${points.map(({px:x,py:y})=>`<circle cx="${x}" cy="${y}" r="4.5" fill="${train.color}" stroke="white" stroke-width="1.5"/>`).join('')}</g>`;
}
