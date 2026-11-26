import {validateRouteProfile,routeProfileDistance,routeProfileForDomain} from './route-profile.js';
import {escapeHtml} from './format.js';

import {ROUTE_SPEED_PRESETS as SPEED_PRESETS} from './transport-category.js';
const speedLabel=part=>part.roadSpeedLimitKmh==null?`${format(part.speedLimitKmh)} km/h`:`Rail ${format(part.speedLimitKmh)} · Road ${format(part.roadSpeedLimitKmh)} km/h`;
const format=value=>Number(value.toFixed(3));
const positions=parts=>{
  const distances=[0],heights=[0];
  for(const part of parts){distances.push(distances.at(-1)+part.distanceKm);heights.push(heights.at(-1)+part.distanceKm*1000*part.gradePercent/100);}
  return {distances,heights};
};

export const GRADE_PRESETS=Object.freeze([-4,-2,-1,0,1,2,4]);
/** Colour classes describe the numeric grade only; their meaning differs between Rail and Road. */
export const GRADE_CLASSES=Object.freeze([[.5,'flat','under 0.5%'],[2,'gentle','0.5–2%'],[4,'steep','2–4%'],[Infinity,'severe','4% or more']]);
export const gradeClass=grade=>GRADE_CLASSES.find(([limit])=>Math.abs(grade)<limit)[1];
const gradeText=grade=>`${grade>0?'+':''}${format(grade)}%`;

/** Starting shapes are editable geometry, not measured game routes. */
export const ROUTE_SHAPES=Object.freeze([
  {id:'flat',name:'Flat',segments:[{distanceKm:10,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:120}]},
  {id:'climb',name:'Long climb',segments:[{distanceKm:3,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:120},{distanceKm:6,gradePercent:2.5,speedLimitKmh:160,roadSpeedLimitKmh:80},{distanceKm:3,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:120}]},
  {id:'pass',name:'Mountain pass',segments:[{distanceKm:4,gradePercent:1,speedLimitKmh:160,roadSpeedLimitKmh:80},{distanceKm:6,gradePercent:3.5,speedLimitKmh:100,roadSpeedLimitKmh:60},{distanceKm:2,gradePercent:0,speedLimitKmh:160,roadSpeedLimitKmh:80},{distanceKm:6,gradePercent:-3.5,speedLimitKmh:100,roadSpeedLimitKmh:60},{distanceKm:4,gradePercent:-1,speedLimitKmh:160,roadSpeedLimitKmh:80}]},
  {id:'hills',name:'Rolling hills',segments:[1.5,-1.5,1.5,-1.5].map(gradePercent=>({distanceKm:3,gradePercent,speedLimitKmh:160,roadSpeedLimitKmh:100}))},
  {id:'towns',name:'Town to town',segments:[{distanceKm:1.5,gradePercent:0,speedLimitKmh:80,roadSpeedLimitKmh:50},{distanceKm:12,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:120},{distanceKm:1.5,gradePercent:0,speedLimitKmh:80,roadSpeedLimitKmh:50}]},
]);
const shapeIcon=segments=>{
  const {distances,heights}=positions(segments),total=distances.at(-1),min=Math.min(...heights),range=Math.max(...heights)-min||1;
  return `<svg viewBox="0 0 64 20" aria-hidden="true" focusable="false"><polyline points="${heights.map((h,i)=>`${(2+60*distances[i]/total).toFixed(1)},${(range===1&&!min&&!h?14:17-14*(h-min)/range).toFixed(1)}`).join(' ')}"/></svg>`;
};

/** Elevation is exaggerated; the full map is the route editor, compact previews are read-only. */
export function routeProfileSketch(segments,options={}) {
  const {scale='equal',selectedIndex=null,availableWidth=900,compact=false,stops=[],openStops=false,below=null}=options;
  if(compact||options.selectable===false)return compactSketch(segments,options);
  const parts=validateRouteProfile(segments),total=routeProfileDistance(parts);
  if(scale!=='equal'&&scale!=='linear')throw new RangeError('Unknown profile scale');
  const width=Math.max(640,availableWidth,parts.length*96),left=44,right=width-44,span=right-left;
  const {distances,heights}=positions(parts);
  const xs=distances.map((distance,i)=>left+span*(scale==='linear'?distance/total:i/parts.length));
  const min=Math.min(...heights),range=Math.max(...heights)-min;
  const y=value=>range<1e-9?140:176-(value-min)/range*124;
  const point=i=>`${xs[i].toFixed(1)},${y(heights[i]).toFixed(1)}`;
  const points=heights.map((_,i)=>point(i)).join(' ');
  const bands=parts.map((part,i)=>{
    const x=xs[i],bandWidth=xs[i+1]-x,mid=(x+bandWidth/2).toFixed(1),selected=selectedIndex===i;
    const number=bandWidth>=28?`<text x="${mid}" y="34" text-anchor="middle" class="profile-band-number">${i+1}</text>`:'';
    const first=bandWidth>=96?`${format(part.distanceKm)} km · ${gradeText(part.gradePercent)}`:bandWidth>=52?gradeText(part.gradePercent):'';
    const second=bandWidth>=(part.roadSpeedLimitKmh==null?96:150)?speedLabel(part):'';
    return `<g class="profile-band-group is-selectable${selected?' is-selected':''}" data-segment="${i}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="Select segment ${i+1}, ${format(distances[i])} to ${format(distances[i+1])} kilometres"><title>Segment ${i+1}: ${format(part.distanceKm)} km, ${format(part.gradePercent)}% grade, ${speedLabel(part)} limit</title><rect x="${x.toFixed(1)}" y="18" width="${bandWidth.toFixed(1)}" height="234" class="profile-band"/>${number}<line x1="${xs[i].toFixed(1)}" y1="${y(heights[i]).toFixed(1)}" x2="${xs[i+1].toFixed(1)}" y2="${y(heights[i+1]).toFixed(1)}" class="profile-track grade-${gradeClass(part.gradePercent)}"/>${first?`<text x="${mid}" y="214" text-anchor="middle" class="profile-band-grade">${first}</text>`:''}${second?`<text x="${mid}" y="232" text-anchor="middle" class="profile-band-details">${second}</text>`:''}</g>`;
  }).join('');
  const action=(name,index,cx,cy,label)=>`<g class="profile-inline-action" data-action="${name}" data-index="${index}" tabindex="0" role="button" aria-label="${label}"><title>${label}</title><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="11"/><text x="${cx.toFixed(1)}" y="${(cy+1).toFixed(1)}" text-anchor="middle" dominant-baseline="middle">+</text></g>`;
  const actions=selectedIndex!=null&&parts[selectedIndex]&&parts.length<24?(()=>{
    const i=selectedIndex,lower=k=>Math.min(186,y(heights[k])+28);
    return `<g class="profile-inline-actions is-selected" data-actions-for="${i}">${action('insert-before',i,xs[i]+(i===0?14:0),lower(i),`Add segment before segment ${i+1}`)}${action('insert',i,xs[i+1]-(i===parts.length-1?14:0),lower(i+1),`Add segment after segment ${i+1}`)}</g>`;
  })():'';
  // With openStops, a stop is a button that opens its details (the Route page's service panel).
  const markers=heights.map((height,i)=>{const stop=stops.find(s=>s.boundary===i),open=openStops&&stop?`<g class="profile-stop" data-route-action="open-stop" data-stop="${stops.indexOf(stop)}" tabindex="0" role="button" aria-label="${escapeHtml(`Open ${stop.name}`)}">`:'';return `${open}<circle cx="${xs[i].toFixed(1)}" cy="${y(height).toFixed(1)}" r="${stop?7:4}" class="profile-node${stop?' profile-stop-node':''}"><title>${escapeHtml(stop?.name??(i===0?'A':i===parts.length?'B':`After segment ${i}`))} · ${format(distances[i])} km from A</title></circle>${stop?`<text class="profile-stop-label" x="${xs[i].toFixed(1)}" y="${(y(height)-15).toFixed(1)}" text-anchor="${i===0?'start':i===parts.length?'end':'middle'}">${escapeHtml(stop.name.slice(0,28))}</text>`:''}${open?'</g>':''}`;}).join('');
  const axisY=256,axisLabelY=274,tickCount=6;
  const axis=scale==='linear'?Array.from({length:tickCount},(_,i)=>{
    const distance=i*total/(tickCount-1),x=left+span*i/(tickCount-1);
    return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${axisY}" y2="${axisY+5}" class="profile-axis-tick"/><text x="${x.toFixed(1)}" y="${axisLabelY}" text-anchor="middle">${format(distance)}</text>`;
  }).join(''):`<text x="${left}" y="${axisLabelY}" text-anchor="start">A · 0 km</text><text x="${right}" y="${axisLabelY}" text-anchor="end">B · ${format(total)} km</text>`;
  const description=`Route from A to B, ${format(total)} km over ${parts.length} segment${parts.length===1?'':'s'}. ${scale==='linear'?'Horizontal distance is linear.':'Segments have equal visual widths.'} ${parts.map((p,i)=>`Segment ${i+1}: ${format(p.distanceKm)} km, ${format(p.gradePercent)} percent grade, ${p.roadSpeedLimitKmh==null?`${format(p.speedLimitKmh)} kilometres per hour`:`Rail ${format(p.speedLimitKmh)}, Road ${format(p.roadSpeedLimitKmh)} kilometres per hour`} limit.`).join(' ')}`;
  const stopDescription=stops.filter(s=>Number.isInteger(s.boundary)&&s.boundary>=0&&s.boundary<=parts.length).map(s=>`${s.name} at ${format(distances[s.boundary])} km.`).join(' ');
  return `<div class="profile-sketch-scroll"><svg class="profile-sketch profile-line-map" viewBox="0 0 ${width} 296" role="group" aria-label="${escapeHtml(`${description} ${stopDescription}`.trim())}"><polygon points="${points} ${xs.at(-1).toFixed(1)},192 ${xs[0].toFixed(1)},192" class="profile-ground"/>${bands}<polyline points="${points}" class="profile-terrain"/>${markers}${actions}<line x1="${left}" x2="${right}" y1="${axisY}" y2="${axisY}" class="profile-axis"/>${axis}<text x="${(left+right)/2}" y="292" text-anchor="middle">Distance from A (km)${scale==='linear'?' · linear':''}</text></svg>${below?below({width,xs}):''}</div>`;
}

/** Read-only preview for narrow panels; elevation is exaggerated. */
function compactSketch(segments,{scale='equal',selectedIndex=null,selectable=true,availableWidth=900,compact=false,stops=[]}={}) {
  if(compact)selectable=false;
  const parts=validateRouteProfile(segments),total=routeProfileDistance(parts);
  if(scale!=='equal'&&scale!=='linear')throw new RangeError('Unknown profile scale');
  const width=compact?Math.max(220,availableWidth):Math.max(900,availableWidth,parts.length*130),left=compact?24:58,right=width-left,span=right-left;
  const {distances,heights}=positions(parts);
  const xs=distances.map((distance,i)=>left+span*(scale==='linear'?distance/total:i/parts.length));
  const min=Math.min(...heights),max=Math.max(...heights),range=max-min;
  const y=value=>range<1e-9?(compact?64:145):(compact?88:200)-(value-min)/range*(compact?48:105);
  const points=heights.map((height,i)=>`${xs[i].toFixed(1)},${y(height).toFixed(1)}`).join(' ');
  const bands=parts.map((part,i)=>{
    const x=xs[i],bandWidth=xs[i+1]-x,mid=x+bandWidth/2;
    const label=bandWidth>=36?`<text x="${mid.toFixed(1)}" y="${compact?16:56}" text-anchor="middle">${i+1}</text>`:'';
    const grade=`${part.gradePercent>0?'+':''}${format(part.gradePercent)}%`;
    const dual=part.roadSpeedLimitKmh!=null;
    const details=bandWidth>=(dual?170:95)?`${compact?(dual?`<text x="${mid.toFixed(1)}" y="104" text-anchor="middle">${grade}</text>`:''):`<text x="${mid.toFixed(1)}" y="76" text-anchor="middle">${format(part.distanceKm)} km${dual?` · ${grade}`:''}</text>`}<text x="${mid.toFixed(1)}" y="${compact?(dual?120:112):254}" text-anchor="middle" class="profile-band-details">${dual?'':`${grade} · `}${speedLabel(part)}</text>`:'';
    return `<g class="profile-band-group${selectable?' is-selectable':''}${selectedIndex===i?' is-selected':''}" ${selectable?`data-segment="${i}" tabindex="0" role="button" aria-label="Select segment ${i+1}, ${format(distances[i])} to ${format(distances[i+1])} kilometres"`:''}><title>Segment ${i+1}: ${format(part.distanceKm)} km, ${format(part.gradePercent)}% grade, ${speedLabel(part)} limit</title><rect x="${x.toFixed(1)}" y="${compact?24:32}" width="${bandWidth.toFixed(1)}" height="${compact?71:231}" class="profile-band${i%2?' alternate':''}"/>${label}${details}</g>`;
  }).join('');
  const action=(name,index,cx,cy,symbol,label)=>`<g class="profile-inline-action" data-action="${name}" data-index="${index}" tabindex="0" role="button" aria-label="${label}"><title>${label}</title><rect x="${(cx-13).toFixed(1)}" y="${cy-13}" width="26" height="26" rx="6"/>${name==='remove'?`<path class="profile-trash-icon" transform="translate(${cx.toFixed(1)} ${cy})" d="M-7 -6H7M-4 -6V-8H4V-6M-6 -3L-5 8H5L6 -3M-2 0V5M2 0V5"/>`:`<text x="${cx.toFixed(1)}" y="${cy+1}" text-anchor="middle" dominant-baseline="middle">${symbol}</text>`}</g>`;
  const actions=selectable?parts.map((_,i)=>{
    const x=xs[i],bandWidth=xs[i+1]-x,mid=x+bandWidth/2;
    const before=bandWidth>=90?x+18:Math.max(left+17,Math.min(right-85,mid-34));
    const after=bandWidth>=90?xs[i+1]-18:before+68;
    return `<g class="profile-inline-actions${selectedIndex===i?' is-selected':''}" data-actions-for="${i}" aria-hidden="${selectedIndex!==i}">${parts.length<24?action('insert-before',i,before,200,'+',`Add segment before segment ${i+1}`)+action('insert',i,after,200,'+',`Add segment after segment ${i+1}`):''}${i>0?action('up',i,before,235,'←',`Move segment ${i+1} earlier`):''}${parts.length>1?action('remove',i,(before+after)/2,235,'',`Remove segment ${i+1}`):''}${i<parts.length-1?action('down',i,after,235,'→',`Move segment ${i+1} later`):''}</g>`;
  }).join(''):'';
  const markers=heights.map((height,i)=>{const stop=stops.find(s=>s.boundary===i);return `<circle cx="${xs[i].toFixed(1)}" cy="${y(height).toFixed(1)}" r="${stop?7:4}" class="profile-node${stop?' profile-stop-node':''}"><title>${escapeHtml(stop?.name??(i===0?'A':i===parts.length?'B':`After segment ${i}`))} · ${format(distances[i])} km from A</title></circle>${stop?`<text class="profile-stop-label" x="${xs[i].toFixed(1)}" y="${(y(height)-14).toFixed(1)}" text-anchor="${i===0?'start':i===parts.length?'end':'middle'}">${escapeHtml(stop.name.slice(0,28))}</text>`:''}`;}).join('');
  const axisY=compact?130:278,axisLabelY=compact?154:300;
  const tickCount=compact?Math.max(2,Math.min(6,Math.floor(span/70)+1)):6;
  const axis=scale==='linear'?Array.from({length:tickCount},(_,i)=>{
    const distance=i*total/(tickCount-1),x=left+span*i/(tickCount-1);
    return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${axisY}" y2="${axisY+6}" class="profile-axis-tick"/><text x="${x.toFixed(1)}" y="${axisLabelY}" text-anchor="middle">${format(distance)}</text>`;
  }).join(''):`<text x="${left}" y="${axisLabelY}" text-anchor="start">A · 0 km</text><text x="${right}" y="${axisLabelY}" text-anchor="end">B · ${format(total)} km</text>`;
  const description=`Route from A to B, ${format(total)} km over ${parts.length} segment${parts.length===1?'':'s'}. ${scale==='linear'?'Horizontal distance is linear.':'Segments have equal visual widths.'} ${parts.map((p,i)=>`Segment ${i+1}: ${format(p.distanceKm)} km, ${format(p.gradePercent)} percent grade, ${p.roadSpeedLimitKmh==null?`${format(p.speedLimitKmh)} kilometres per hour`:`Rail ${format(p.speedLimitKmh)}, Road ${format(p.roadSpeedLimitKmh)} kilometres per hour`} limit.`).join(' ')}`;
  const stopDescription=stops.filter(s=>Number.isInteger(s.boundary)&&s.boundary>=0&&s.boundary<=parts.length).map(s=>`${s.name} at ${format(distances[s.boundary])} km.`).join(' ');
  return `<div class="profile-sketch-scroll"><svg class="profile-sketch${compact?' is-compact':''}" viewBox="0 0 ${width} ${compact?184:330}" role="${selectable?'group':'img'}" aria-label="${escapeHtml(`${description} ${stopDescription}`.trim())}">${bands}<line x1="${left}" x2="${right}" y1="${compact?95:228}" y2="${compact?95:228}" class="profile-baseline"/><polyline points="${points}" class="profile-terrain"/>${markers}${actions}<line x1="${left}" x2="${right}" y1="${axisY}" y2="${axisY}" class="profile-axis"/>${axis}<text x="${(left+right)/2}" y="${compact?176:322}" text-anchor="middle">Distance from A (km)${scale==='linear'?' · linear':''}</text></svg></div>`;
}

/** A summary of the active route, independent of the saved editor preset. */
export function renderRouteProfileStatus(status,segments,{domain='rail'}={}){
  segments=domain==='all'?validateRouteProfile(segments):routeProfileForDomain(segments,domain).map(({roadSpeedLimitKmh,...part})=>part);
  const total=routeProfileDistance(segments),single=segments.length===1?segments[0]:null;
  status.innerHTML=`<strong>A→B · ${format(total)} km</strong><span>${single?`${single.gradePercent>0?'+':''}${format(single.gradePercent)}% · ${speedLabel(single)}`: `${segments.length} segments`}</span><a href="#route-profile">Edit route →</a>`;
}

/** The route editor owns the custom preset shared by rail and road comparisons. */
export function mountRouteProfileControls(container,{initial,onChange,beforeChange=()=>{},confirmReplace=()=>true,visual,scaleControl,scaleNote,segmentList,shapes,below=null,onSelect=()=>{}}) {
  let segments=validateRouteProfile(initial),scale='equal',selectedIndex=0,previewStops=[];
  const segmentRange=(distances,i)=>`${i===0?'A · 0 km':`${format(distances[i])} km`} → ${i===segments.length-1?`B · ${format(distances[i+1])} km`:`${format(distances[i+1])} km`}`;
  const renderVisual=()=>{
    // `below` draws what lines up under the map (the service lanes), from the same horizontal positions.
    visual.innerHTML=routeProfileSketch(segments,{scale,selectedIndex,availableWidth:Math.max(0,visual.clientWidth-18),stops:previewStops,openStops:!!below,below});
    scaleNote.textContent=scale==='linear'?'Distance to scale · elevation exaggerated. Select short segments in the list below.':'Equal widths · elevation exaggerated.';
  };
  const presets=(i,field,values,unit,label)=>`<div class="profile-presets" role="group" aria-label="Segment ${i+1} ${label} presets">${values.map(value=>`<button type="button" data-preset="${value}" data-preset-field="${field}" data-index="${i}" aria-pressed="${(segments[i][field]??segments[i].speedLimitKmh)===value}">${field==='gradePercent'?gradeText(value):value}${unit}</button>`).join('')}</div>`;
  const segmentEditor=(part,i,distances)=>`<fieldset class="profile-segment is-selected" data-index="${i}">
    <legend class="sr-only">Selected segment ${i+1}</legend>
    <div class="profile-segment-head"><p class="profile-edit-summary"><span class="profile-segment-number">${String(i+1).padStart(2,'0')}</span><span class="profile-segment-range">${segmentRange(distances,i)}</span></p>
      <div class="profile-segment-actions"><button type="button" data-action="up" data-index="${i}" ${i?'':'disabled'} aria-label="Move segment ${i+1} earlier">← Earlier</button><button type="button" data-action="down" data-index="${i}" ${i<segments.length-1?'':'disabled'} aria-label="Move segment ${i+1} later">Later →</button><button type="button" data-action="split" data-index="${i}" ${segments.length>=24||part.distanceKm<.02?'disabled':''} aria-label="Split segment ${i+1} in two">Split in two</button><button type="button" data-action="remove" data-index="${i}" ${segments.length>1?'':'disabled'} aria-label="Remove segment ${i+1}">Remove</button></div></div>
    <div class="profile-segment-fields">
      <div class="profile-field"><label for="profile-length-${i}">Length <span>km</span></label><input id="profile-length-${i}" data-index="${i}" data-field="distanceKm" data-control="number" type="number" min="0.01" max="100" step="0.01" value="${format(part.distanceKm)}" required><input data-index="${i}" data-field="distanceKm" data-control="range" type="range" min="0.01" max="${Math.max(10,Math.ceil(part.distanceKm))}" step="0.01" value="${format(part.distanceKm)}" aria-label="Segment ${i+1} length slider"></div>
      <div class="profile-field"><label for="profile-grade-${i}">Grade <span>% · + climbs from A to B</span></label><input id="profile-grade-${i}" data-index="${i}" data-field="gradePercent" data-control="number" type="number" min="-20" max="20" step="0.1" value="${format(part.gradePercent)}" required>${presets(i,'gradePercent',GRADE_PRESETS,'','grade')}</div>
      ${[['speedLimitKmh','Rail'],['roadSpeedLimitKmh','Road']].map(([field,domain])=>{const value=part[field]??part.speedLimitKmh;return `<div class="profile-field"><label for="profile-${field}-${i}">${domain} speed limit <span>km/h</span></label><input id="profile-${field}-${i}" data-index="${i}" data-field="${field}" data-control="number" type="number" min="10" max="350" step="1" value="${format(value)}" required>${presets(i,field,SPEED_PRESETS,'',`${domain} speed`)}</div>`;}).join('')}
    </div></fieldset>`;
  const renderSegmentList=()=>{
    segmentList.innerHTML=`<p class="profile-list-total"><strong>${format(routeProfileDistance(segments))} km</strong> · ${segments.length} segment${segments.length===1?'':'s'}</p><ol class="profile-strip">${segments.map((part,i)=>`<li><button type="button" class="profile-strip-item${selectedIndex===i?' is-selected':''}" data-select-segment="${i}" aria-pressed="${selectedIndex===i}" aria-label="Edit segment ${i+1}: ${format(part.distanceKm)} km, ${format(part.gradePercent)}% grade"><span class="profile-strip-swatch grade-${gradeClass(part.gradePercent)}" aria-hidden="true"></span><strong>${i+1}</strong> ${format(part.distanceKm)} km · ${gradeText(part.gradePercent)}</button></li>`).join('')}<li><button type="button" class="profile-strip-add" data-action="add" ${segments.length>=24?'disabled':''}>+ Add segment</button></li></ol>`;
  };
  const renderShapes=()=>{
    if(!shapes)return;
    shapes.innerHTML=`<span class="profile-shapes-label">Start from</span>${ROUTE_SHAPES.map(shape=>`<button type="button" data-shape="${shape.id}" title="${escapeHtml(`${format(routeProfileDistance(shape.segments))} km · ${shape.segments.length} segment${shape.segments.length===1?'':'s'}`)}">${shapeIcon(shape.segments)}<span>${shape.name}</span></button>`).join('')}`;
  };
  const renderInspector=()=>{
    const {distances}=positions(segments);
    container.querySelector('.profile-inspector').innerHTML=segmentEditor(segments[selectedIndex],selectedIndex,distances);
  };
  const render=()=>{
    container.innerHTML='<div class="profile-editor"><div class="profile-inspector"></div><p class="profile-error" role="status" hidden></p></div>';
    renderSegmentList();
    renderInspector();
    renderVisual();
  };
  const notify=(edit=null)=>onChange({active:true,segments,distanceKm:routeProfileDistance(segments),edit});
  const refreshValues=()=>{
    renderVisual();
    const error=container.querySelector('.profile-error');error.hidden=true;error.textContent='';
    const {distances}=positions(segments);
    for(const row of container.querySelectorAll('.profile-segment'))row.querySelector('.profile-segment-range').textContent=segmentRange(distances,Number(row.dataset.index));
    renderSegmentList();
    notify();
  };
  const changed=(origin,action,index)=>{
    selectedIndex=Math.min(selectedIndex,segments.length-1);render();notify({action,index});onSelect(selectedIndex);
    const focus=origin===segmentList?segmentList.querySelector(`button[data-select-segment="${selectedIndex}"]`):origin===visual?visual.querySelector(`[data-segment="${selectedIndex}"]`):container.querySelector(`.profile-segment [data-action="${action}"]:not(:disabled)`);
    (focus??container.querySelector(`.profile-segment[data-index="${selectedIndex}"] input`))?.focus();
  };
  const showError=(error,target)=>{const message=container.querySelector('.profile-error');message.textContent=error.message;message.hidden=false;if(target){target.setCustomValidity(error.message);target.reportValidity();target.setCustomValidity('');}};
  const select=index=>{
    // Selecting the current segment again still brings its details back.
    if(index===selectedIndex){onSelect(index);return;}
    selectedIndex=index;
    renderInspector();renderVisual();renderSegmentList();onSelect(index);
  };
  const invalidInput=()=>{const invalid=container.querySelector('.profile-segment input[data-control="number"]:invalid');invalid?.reportValidity();return invalid;};
  scaleControl.addEventListener('change',event=>{if(event.target.name==='profile-horizontal-scale'){scale=event.target.value;renderVisual();}});
  const selectFromPreview=event=>{const band=event.target.closest('[data-segment]');if(!band||invalidInput())return;select(Number(band.dataset.segment));visual.querySelector(`[data-segment="${band.dataset.segment}"]`)?.focus();};
  visual.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button){performAction(button,visual);return;}selectFromPreview(event);});
  visual.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const button=event.target.closest('[data-action]');if(button){event.preventDefault();performAction(button,visual);return;}if(!event.target.closest('[data-segment]'))return;event.preventDefault();selectFromPreview(event);});
  const updateField=event=>{
    const field=event.target.dataset.field,index=Number(event.target.dataset.index);
    if(!field)return;
    if(!event.target.checkValidity()){
      if(event.type==='change')event.target.reportValidity();
      return;
    }
    const constraint=field==='speedLimitKmh'?'railSpeedConstraintKmh':field==='roadSpeedLimitKmh'?'roadSpeedConstraintKmh':null;
    if(segments[index][field]===event.target.valueAsNumber&&(!constraint||segments[index][constraint]==null))return;
    const next=segments.map(part=>({...part}));next[index][field]=event.target.valueAsNumber;
    if(field==='speedLimitKmh')delete next[index].railSpeedConstraintKmh;
    if(field==='roadSpeedLimitKmh'){delete next[index].roadSpeedConstraintKmh;delete next[index].roadCity;}
    try{
      const valid=validateRouteProfile(next);
      beforeChange(valid,null);
      segments=valid;
      const row=container.querySelector(`.profile-segment[data-index="${index}"]`);
      const matching=row.querySelector(`[data-field="${field}"][data-control="${event.target.dataset.control==='range'?'number':'range'}"]`);
      if(matching){if(matching.type==='range')matching.max=Math.max(10,Math.ceil(valid[index].distanceKm));matching.value=format(valid[index][field]);}
      for(const button of row.querySelectorAll(`[data-preset-field="${field}"]`))button.setAttribute('aria-pressed',String(Number(button.dataset.preset)===valid[index][field]));
      row.querySelector('[data-action="split"]').disabled=segments.length>=24||valid[index].distanceKm<.02;
      refreshValues();
    }
    catch(error){if(event.target.dataset.control==='range')event.target.value=format(segments[index][field]);showError(error,event.type==='change'?event.target:null);}
  };
  container.addEventListener('input',updateField);
  container.addEventListener('change',updateField);
  const performAction=(button,origin)=>{
    if(invalidInput())return;
    const index=Number(button.dataset.index),action=button.dataset.action;
    try{
      const next=segments.map(part=>({...part}));
      if(action==='add')next.push({...next.at(-1),distanceKm:1});
      else if(action==='insert-before')next.splice(index,0,{...next[index],distanceKm:1});
      else if(action==='insert')next.splice(index+1,0,{...next[index],distanceKm:1});
      else if(action==='split'){const half=next[index].distanceKm/2;next.splice(index,1,{...next[index],distanceKm:half},{...next[index],distanceKm:half});}
      else if(action==='remove')next.splice(index,1);
      else if(action==='up'||action==='down'){const other=index+(action==='up'?-1:1);[next[index],next[other]]=[next[other],next[index]];}
      const valid=validateRouteProfile(next);
      beforeChange(valid,{action,index});
      segments=valid;selectedIndex=action==='add'?next.length-1:action==='insert-before'||action==='split'?index:action==='insert'?index+1:action==='remove'?Math.min(index,next.length-1):index+(action==='up'?-1:1);changed(origin,action,index);
    }catch(error){showError(error);}
  };
  container.addEventListener('click',event=>{
    const preset=event.target.closest('button[data-preset]');
    if(preset){
      const input=container.querySelector(`.profile-segment[data-index="${preset.dataset.index}"] input[data-field="${preset.dataset.presetField}"][data-control="number"]`);
      input.value=preset.dataset.preset;
      updateField({target:input,type:'change'});
      return;
    }
    const button=event.target.closest('.profile-segment button[data-action]');if(button)performAction(button,container);
  });
  segmentList.addEventListener('click',event=>{
    const selector=event.target.closest('button[data-select-segment]');
    if(selector){if(invalidInput())return;select(Number(selector.dataset.selectSegment));segmentList.querySelector(`button[data-select-segment="${selector.dataset.selectSegment}"]`)?.focus();return;}
    const button=event.target.closest('button[data-action]');if(button)performAction(button,segmentList);
  });
  shapes?.addEventListener('click',event=>{
    const button=event.target.closest('button[data-shape]');if(!button)return;
    const shape=ROUTE_SHAPES.find(item=>item.id===button.dataset.shape);
    if(!confirmReplace(shape))return;
    try{
      const valid=validateRouteProfile(shape.segments);
      beforeChange(valid,{action:'replace',name:shape.name});
      segments=valid;selectedIndex=0;render();notify({action:'replace',name:shape.name});
    }catch(error){showError(error);}
  });
  if(globalThis.ResizeObserver){
    let priorWidth=0;
    new ResizeObserver(()=>{const width=visual.clientWidth;if(width>0&&width!==priorWidth){priorWidth=width;renderVisual();}}).observe(visual);
  }
  renderShapes();
  render();
  return {refresh:render,redraw:renderVisual,get selectedIndex(){return selectedIndex;},selectSegment:select,setStops(stops){previewStops=stops.map(s=>({...s}));renderVisual();},setSegments(parts){
    const next=validateRouteProfile(parts);
    if(JSON.stringify(next)===JSON.stringify(segments))return;
    segments=next;selectedIndex=Math.min(selectedIndex,segments.length-1);render();
  },get segments(){return segments;}};
}
