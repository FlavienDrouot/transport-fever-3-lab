import {validateRouteProfile,routeProfileDistance,routeProfileForDomain} from './route-profile.js';

import {ROUTE_SPEED_PRESETS as SPEED_PRESETS} from './transport-category.js';
const speedLabel=part=>part.roadSpeedLimitKmh==null?`${format(part.speedLimitKmh)} km/h`:`Rail ${format(part.speedLimitKmh)} · Road ${format(part.roadSpeedLimitKmh)} km/h`;
const format=value=>Number(value.toFixed(3));
const positions=parts=>{
  const distances=[0],heights=[0];
  for(const part of parts){distances.push(distances.at(-1)+part.distanceKm);heights.push(heights.at(-1)+part.distanceKm*1000*part.gradePercent/100);}
  return {distances,heights};
};

/** Elevation is exaggerated; compact previews are read-only. */
export function routeProfileSketch(segments,{scale='equal',selectedIndex=null,selectable=true,availableWidth=900,compact=false}={}) {
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
  const markers=heights.map((height,i)=>`<circle cx="${xs[i].toFixed(1)}" cy="${y(height).toFixed(1)}" r="4" class="profile-node"><title>${i===0?'A':i===parts.length?'B':`After segment ${i}`} · ${format(distances[i])} km from A</title></circle>`).join('');
  const axisY=compact?130:278,axisLabelY=compact?154:300;
  const tickCount=compact?Math.max(2,Math.min(6,Math.floor(span/70)+1)):6;
  const axis=scale==='linear'?Array.from({length:tickCount},(_,i)=>{
    const distance=i*total/(tickCount-1),x=left+span*i/(tickCount-1);
    return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${axisY}" y2="${axisY+6}" class="profile-axis-tick"/><text x="${x.toFixed(1)}" y="${axisLabelY}" text-anchor="middle">${format(distance)}</text>`;
  }).join(''):`<text x="${left}" y="${axisLabelY}" text-anchor="start">A · 0 km</text><text x="${right}" y="${axisLabelY}" text-anchor="end">B · ${format(total)} km</text>`;
  const description=`Route from A to B, ${format(total)} km over ${parts.length} segment${parts.length===1?'':'s'}. ${scale==='linear'?'Horizontal distance is linear.':'Segments have equal visual widths.'} ${parts.map((p,i)=>`Segment ${i+1}: ${format(p.distanceKm)} km, ${format(p.gradePercent)} percent grade, ${p.roadSpeedLimitKmh==null?`${format(p.speedLimitKmh)} kilometres per hour`:`Rail ${format(p.speedLimitKmh)}, Road ${format(p.roadSpeedLimitKmh)} kilometres per hour`} limit.`).join(' ')}`;
  return `<div class="profile-sketch-scroll"><svg class="profile-sketch${compact?' is-compact':''}" viewBox="0 0 ${width} ${compact?184:330}" role="${selectable?'group':'img'}" aria-label="${description}">${bands}<line x1="${left}" x2="${right}" y1="${compact?95:228}" y2="${compact?95:228}" class="profile-baseline"/><polyline points="${points}" class="profile-terrain"/>${markers}${actions}<line x1="${left}" x2="${right}" y1="${axisY}" y2="${axisY}" class="profile-axis"/>${axis}<text x="${(left+right)/2}" y="${compact?176:322}" text-anchor="middle">Distance from A (km)${scale==='linear'?' · linear':''}</text></svg></div>`;
}

/** A summary of the active route, independent of the saved editor preset. */
export function renderRouteProfileStatus(status,segments,{domain='rail'}={}){
  segments=domain==='all'?validateRouteProfile(segments):routeProfileForDomain(segments,domain).map(({roadSpeedLimitKmh,...part})=>part);
  const total=routeProfileDistance(segments),single=segments.length===1?segments[0]:null;
  status.innerHTML=`<strong>A→B · ${format(total)} km</strong><span>${single?`${single.gradePercent>0?'+':''}${format(single.gradePercent)}% · ${speedLabel(single)}`: `${segments.length} segments`}</span><a href="#route-profile">Edit route ↗</a>`;
}

/** The route editor owns the custom preset shared by rail and road comparisons. */
export function mountRouteProfileControls(container,{initial,onChange,visual,scaleControl,scaleNote,segmentList}) {
  let segments=validateRouteProfile(initial),scale='equal',selectedIndex=0;
  const segmentRange=(distances,i)=>`${i===0?'A · 0 km':`${format(distances[i])} km`} → ${i===segments.length-1?`B · ${format(distances[i+1])} km`:`${format(distances[i+1])} km`}`;
  const renderVisual=()=>{
    visual.innerHTML=routeProfileSketch(segments,{scale,selectedIndex,availableWidth:Math.max(0,visual.clientWidth-18)});
    scaleNote.textContent=scale==='linear'?'Distance to scale · elevation exaggerated. Short segments can also be selected in the sidebar.':'Symbolic elevation · exaggerated scale.';
  };
  const segmentEditor=(part,i,distances)=>`<fieldset class="profile-segment${selectedIndex===i?' is-selected':''}" data-index="${i}">
    <legend class="sr-only">Selected segment ${i+1}</legend>
    <div class="profile-segment-fields">
      <div class="profile-field"><label for="profile-length-${i}">Length <span>km</span></label><input id="profile-length-${i}" data-index="${i}" data-field="distanceKm" data-control="number" type="number" min="0.01" max="100" step="0.01" value="${format(part.distanceKm)}" required><input data-index="${i}" data-field="distanceKm" data-control="range" type="range" min="0.01" max="${Math.max(10,Math.ceil(part.distanceKm))}" step="0.01" value="${format(part.distanceKm)}" aria-label="Segment ${i+1} length slider"></div>
      <div class="profile-field"><label for="profile-grade-${i}">Grade <span>%</span></label><input id="profile-grade-${i}" data-index="${i}" data-field="gradePercent" data-control="number" type="number" min="-20" max="20" step="0.1" value="${format(part.gradePercent)}" required><input data-index="${i}" data-field="gradePercent" data-control="range" type="range" min="-20" max="20" step="0.1" value="${format(part.gradePercent)}" aria-label="Segment ${i+1} grade slider"></div>
      ${[['speedLimitKmh','Rail'],['roadSpeedLimitKmh','Road']].map(([field,domain])=>{const value=part[field]??part.speedLimitKmh;return `<div class="profile-field"><label for="profile-${field}-${i}">${domain} speed limit <span>km/h</span></label><input id="profile-${field}-${i}" data-index="${i}" data-field="${field}" data-control="number" type="number" min="10" max="350" step="1" value="${format(value)}" required><div class="profile-speed-presets" role="group" aria-label="Segment ${i+1} ${domain} speed presets">${SPEED_PRESETS.map(speed=>`<button type="button" data-speed-preset="${speed}" data-speed-field="${field}" data-index="${i}" aria-pressed="${value===speed}">${speed}</button>`).join('')}</div></div>`;}).join('')}
    </div><p class="profile-edit-summary"><span class="profile-segment-number">${String(i+1).padStart(2,'0')}</span><span class="profile-segment-range">${segmentRange(distances,i)}</span></p></fieldset>`;
  const renderSegmentList=()=>{
    const {distances}=positions(segments);
    segmentList.innerHTML=`<p class="profile-list-total"><strong>${format(routeProfileDistance(segments))} km</strong> total · ${segments.length} segment${segments.length===1?'':'s'}</p><ol class="profile-segment-list">${segments.map((part,i)=>`<li class="profile-segment-summary${selectedIndex===i?' is-selected':''}" data-list-index="${i}"><button type="button" class="profile-summary-select" data-select-segment="${i}" aria-pressed="${selectedIndex===i}" aria-label="Edit segment ${i+1}, ${format(distances[i])} to ${format(distances[i+1])} kilometres"><strong>${String(i+1).padStart(2,'0')} · ${format(part.distanceKm)} km</strong><span>${part.gradePercent>0?'+':''}${format(part.gradePercent)}% · ${speedLabel(part)}</span><small>${segmentRange(distances,i)}</small></button><div class="profile-summary-actions"><button type="button" data-action="up" data-index="${i}" ${i?'':'disabled'} aria-label="Move segment ${i+1} earlier" title="Move earlier">↑</button><button type="button" class="profile-selected-action" data-action="remove" data-index="${i}" ${segments.length>1?'':'disabled'} aria-label="Remove segment ${i+1}" title="Remove segment"><svg viewBox="-12 -12 24 24" aria-hidden="true" focusable="false"><path d="M-7 -6H7M-4 -6V-8H4V-6M-6 -3L-5 8H5L6 -3M-2 0V5M2 0V5"/></svg></button><button type="button" data-action="down" data-index="${i}" ${i<segments.length-1?'':'disabled'} aria-label="Move segment ${i+1} later" title="Move later">↓</button><button type="button" class="profile-selected-action" data-action="insert" data-index="${i}" ${segments.length>=24?'disabled':''} aria-label="Add segment after segment ${i+1}" title="Add after">+</button></div></li>`).join('')}</ol><div class="profile-list-actions"><button type="button" data-action="add" ${segments.length>=24?'disabled':''}>Add at end</button></div>`;
  };
  const renderInspector=()=>{
    const {distances}=positions(segments);
    container.querySelector('.profile-inspector').innerHTML=segmentEditor(segments[selectedIndex],selectedIndex,distances);
    for(const button of segmentList.querySelectorAll('[data-select-segment]'))button.setAttribute('aria-pressed',String(Number(button.dataset.selectSegment)===selectedIndex));
    for(const row of segmentList.querySelectorAll('.profile-segment-summary'))row.classList.toggle('is-selected',Number(row.dataset.listIndex)===selectedIndex);
  };
  const render=()=>{
    container.innerHTML='<div class="profile-editor"><div class="profile-inspector"></div><p class="profile-error" role="status" hidden></p></div>';
    renderSegmentList();
    renderInspector();
    renderVisual();
  };
  const notify=()=>onChange({active:true,segments,distanceKm:routeProfileDistance(segments)});
  const refreshValues=()=>{
    renderVisual();
    const error=container.querySelector('.profile-error');error.hidden=true;error.textContent='';
    const {distances}=positions(segments);
    for(const row of container.querySelectorAll('.profile-segment'))row.querySelector('.profile-segment-range').textContent=segmentRange(distances,Number(row.dataset.index));
    renderSegmentList();
    notify();
  };
  const changed=(origin,action)=>{
    selectedIndex=Math.min(selectedIndex,segments.length-1);render();notify();
    const focus=origin===segmentList?segmentList.querySelector(`button[data-select-segment="${selectedIndex}"]`):action==='remove'?visual.querySelector(`[data-segment="${selectedIndex}"]`):visual.querySelector(`.profile-inline-actions.is-selected [data-action="${action}"]`)??visual.querySelector(`[data-segment="${selectedIndex}"]`);
    (focus??container.querySelector(`.profile-segment[data-index="${selectedIndex}"] input`))?.focus();
  };
  const showError=(error,target)=>{const message=container.querySelector('.profile-error');message.textContent=error.message;message.hidden=false;if(target){target.setCustomValidity(error.message);target.reportValidity();target.setCustomValidity('');}};
  const select=index=>{
    if(index===selectedIndex)return;
    selectedIndex=index;
    renderInspector();
    for(const band of visual.querySelectorAll('.profile-band-group'))band.classList.toggle('is-selected',Number(band.dataset.segment)===index);
    for(const actions of visual.querySelectorAll('.profile-inline-actions')){const selected=Number(actions.dataset.actionsFor)===index;actions.classList.toggle('is-selected',selected);actions.setAttribute('aria-hidden',String(!selected));}
  };
  scaleControl.addEventListener('change',event=>{if(event.target.name==='profile-horizontal-scale'){scale=event.target.value;renderVisual();}});
  const selectFromPreview=event=>{const band=event.target.closest('[data-segment]');if(!band)return;const invalid=container.querySelector('.profile-segment input[data-control="number"]:invalid');if(invalid){invalid.reportValidity();return;}select(Number(band.dataset.segment));};
  visual.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(button){performAction(button,visual);return;}selectFromPreview(event);});
  visual.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const button=event.target.closest('[data-action]');if(button){event.preventDefault();performAction(button,visual);return;}if(!event.target.closest('[data-segment]'))return;event.preventDefault();selectFromPreview(event);});
  container.addEventListener('focusin',event=>{const row=event.target.closest('.profile-segment');if(row)select(Number(row.dataset.index));});
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
      segments=valid;
      const row=container.querySelector(`.profile-segment[data-index="${index}"]`);
      const matching=row.querySelector(`[data-field="${field}"][data-control="${event.target.dataset.control==='range'?'number':'range'}"]`);
      if(matching){if(matching.type==='range')matching.max=Math.max(10,Math.ceil(valid[index].distanceKm));matching.value=format(valid[index][field]);}
      if(field==='speedLimitKmh'||field==='roadSpeedLimitKmh')for(const button of row.querySelectorAll(`[data-speed-field="${field}"]`))button.setAttribute('aria-pressed',String(Number(button.dataset.speedPreset)===valid[index][field]));
      select(index);refreshValues();
    }
    catch(error){if(event.target.dataset.control==='range')event.target.value=format(segments[index][field]);showError(error,event.type==='change'?event.target:null);}
  };
  container.addEventListener('input',updateField);
  container.addEventListener('change',updateField);
  const performAction=(button,origin)=>{
    const invalid=container.querySelector('.profile-segment input[data-control="number"]:invalid');if(invalid){invalid.reportValidity();return;}
    const index=Number(button.dataset.index),action=button.dataset.action,draft=segments.map(part=>({...part}));
    for(const input of container.querySelectorAll('.profile-segment input[data-control="number"]'))draft[Number(input.dataset.index)][input.dataset.field]=input.valueAsNumber;
    try{
      const next=validateRouteProfile(draft);
      if(action==='add')next.push({...next.at(-1),distanceKm:1});
      else if(action==='insert-before')next.splice(index,0,{...next[index],distanceKm:1});
      else if(action==='insert')next.splice(index+1,0,{...next[index],distanceKm:1});
      else if(action==='remove')next.splice(index,1);
      else if(action==='up'||action==='down'){const other=index+(action==='up'?-1:1);[next[index],next[other]]=[next[other],next[index]];}
      const valid=validateRouteProfile(next);
      segments=valid;selectedIndex=action==='add'?next.length-1:action==='insert-before'?index:action==='insert'?index+1:action==='remove'?Math.min(index,next.length-1):index+(action==='up'?-1:1);changed(origin,action);
    }catch(error){showError(error);}
  };
  container.addEventListener('click',event=>{
    const preset=event.target.closest('button[data-speed-preset]');
    if(preset){
      const input=container.querySelector(`.profile-segment[data-index="${preset.dataset.index}"] input[data-field="${preset.dataset.speedField}"]`);
      input.value=preset.dataset.speedPreset;
      updateField({target:input,type:'change'});
      return;
    }
  });
  segmentList.addEventListener('click',event=>{
    const selector=event.target.closest('button[data-select-segment]');
    if(selector){const invalid=container.querySelector('.profile-segment input[data-control="number"]:invalid');if(invalid){invalid.reportValidity();return;}select(Number(selector.dataset.selectSegment));selector.closest('dialog')?.close();return;}
    const button=event.target.closest('button[data-action]');if(button)performAction(button,segmentList);
  });
  if(globalThis.ResizeObserver){
    let priorWidth=0;
    new ResizeObserver(()=>{const width=visual.clientWidth;if(width>0&&width!==priorWidth){priorWidth=width;renderVisual();}}).observe(visual);
  }
  render();
  return {refresh:render,setSegments(parts){
    const next=validateRouteProfile(parts);
    if(JSON.stringify(next)===JSON.stringify(segments))return;
    segments=next;selectedIndex=Math.min(selectedIndex,segments.length-1);render();
  },get segments(){return segments;}};
}
