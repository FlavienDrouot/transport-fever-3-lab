import {validateRouteProfile,routeProfileDistance} from './route-profile.js';

const format=value=>Number(value.toFixed(3));
const positions=parts=>{
  const distances=[0],heights=[0];
  for(const part of parts){distances.push(distances.at(-1)+part.distanceKm);heights.push(heights.at(-1)+part.distanceKm*1000*part.gradePercent/100);}
  return {distances,heights};
};

/** Elevation is exaggerated; choose equal segment widths or a true linear distance axis. */
export function routeProfileSketch(segments,{scale='equal',selectedIndex=null,selectable=true}={}) {
  const parts=validateRouteProfile(segments),total=routeProfileDistance(parts);
  if(scale!=='equal'&&scale!=='linear')throw new RangeError('Unknown profile scale');
  const width=Math.max(900,parts.length*130),left=58,right=width-58,span=right-left;
  const {distances,heights}=positions(parts);
  const xs=distances.map((distance,i)=>left+span*(scale==='linear'?distance/total:i/parts.length));
  const min=Math.min(...heights),max=Math.max(...heights),range=max-min;
  const y=value=>range<1e-9?145:200-(value-min)/range*105;
  const points=heights.map((height,i)=>`${xs[i].toFixed(1)},${y(height).toFixed(1)}`).join(' ');
  const bands=parts.map((part,i)=>{
    const x=xs[i],bandWidth=xs[i+1]-x,mid=x+bandWidth/2;
    const label=bandWidth>=36?`<text x="${mid.toFixed(1)}" y="56" text-anchor="middle">${i+1}</text>`:'';
    const details=bandWidth>=95?`<text x="${mid.toFixed(1)}" y="76" text-anchor="middle">${format(part.distanceKm)} km</text><text x="${mid.toFixed(1)}" y="254" text-anchor="middle">${part.gradePercent>0?'+':''}${format(part.gradePercent)}% · ${format(part.speedLimitKmh)} km/h</text>`:'';
    return `<g class="profile-band-group${selectable?' is-selectable':''}${selectedIndex===i?' is-selected':''}" ${selectable?`data-segment="${i}" tabindex="0" role="button" aria-label="Select segment ${i+1}, ${format(distances[i])} to ${format(distances[i+1])} kilometres"`:''}><title>Segment ${i+1}: ${format(part.distanceKm)} km, ${format(part.gradePercent)}% grade, ${format(part.speedLimitKmh)} km/h limit</title><rect x="${x.toFixed(1)}" y="32" width="${bandWidth.toFixed(1)}" height="231" class="profile-band${i%2?' alternate':''}"/>${label}${details}</g>`;
  }).join('');
  const markers=heights.map((height,i)=>`<circle cx="${xs[i].toFixed(1)}" cy="${y(height).toFixed(1)}" r="4" class="profile-node"><title>${i===0?'A':i===parts.length?'B':`After segment ${i}`} · ${format(distances[i])} km from A</title></circle>`).join('');
  const axis=scale==='linear'?Array.from({length:6},(_,i)=>{
    const distance=i*total/5,x=left+span*i/5;
    return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="278" y2="284" class="profile-axis-tick"/><text x="${x.toFixed(1)}" y="300" text-anchor="middle">${format(distance)}</text>`;
  }).join(''):`<text x="${left}" y="300" text-anchor="start">A · 0 km</text><text x="${right}" y="300" text-anchor="end">B · ${format(total)} km</text>`;
  const description=`Route from A to B, ${format(total)} km over ${parts.length} segment${parts.length===1?'':'s'}. ${scale==='linear'?'Horizontal distance is linear.':'Segments have equal visual widths.'} ${parts.map((p,i)=>`Segment ${i+1}: ${format(p.distanceKm)} km, ${format(p.gradePercent)} percent grade, ${format(p.speedLimitKmh)} kilometres per hour limit.`).join(' ')}`;
  return `<div class="profile-sketch-scroll"><svg class="profile-sketch" viewBox="0 0 ${width} 330" role="img" aria-label="${description}">${bands}<line x1="${left}" x2="${right}" y1="228" y2="228" class="profile-baseline"/><polyline points="${points}" class="profile-terrain"/>${markers}<line x1="${left}" x2="${right}" y1="278" y2="278" class="profile-axis"/>${axis}<text x="${(left+right)/2}" y="322" text-anchor="middle">Distance from A (km)${scale==='linear'?' · linear':''}</text></svg></div>`;
}

/** One editor and two sidebar summaries share a single rail A→B profile. */
export function mountRouteProfileControls(container,{initial,onChange,statuses=[],visual,scaleControl,scaleNote}) {
  let active=false,segments=validateRouteProfile(initial),uniform={...initial[0]},profileEdited=false,scale='equal',selectedIndex=null;
  const renderVisual=()=>{
    visual.innerHTML=routeProfileSketch(active?segments:[uniform],{scale,selectedIndex:active?selectedIndex:null,selectable:active});
    scaleNote.textContent=scale==='linear'?'Distance from A is linear; short segments may be too narrow for labels. Elevation is exaggerated. Select a segment in the diagram or the list to edit it.':'Every segment has equal visual width; elevation is exaggerated. Select a segment in the diagram or the list to edit it.';
  };
  const render=()=>{
    renderVisual();
    for(const status of statuses)status.innerHTML=`<strong>${active?`${segments.length} segment${segments.length===1?'':'s'} · ${format(routeProfileDistance(segments))} km`:'Uniform route'}</strong><a href="#route-profile">${active?'Edit route profile':'Build a route profile'} ↗</a>`;
    const {distances}=positions(segments);
    container.innerHTML=`<fieldset class="profile-mode"><legend>Route model</legend><label><input type="radio" name="route-profile-mode" value="uniform" ${active?'':'checked'}> Uniform</label><label><input type="radio" name="route-profile-mode" value="profile" ${active?'checked':''}> Segments</label></fieldset><div class="profile-editor" ${active?'':'hidden'}><p>Ordered A→B · <strong>${format(routeProfileDistance(segments))} km</strong> total. Select a segment in the diagram or below. B→A reverses their order and grades; there are no intermediate stops.</p><div class="profile-segments">${segments.map((part,i)=>`<fieldset class="profile-segment${selectedIndex===i?' is-selected':''}" data-index="${i}"><legend><span class="profile-segment-number">${String(i+1).padStart(2,'0')}</span><span class="profile-segment-range">${i===0?'A · 0 km':`${format(distances[i])} km`} → ${i===segments.length-1?`B · ${format(distances[i+1])} km`:`${format(distances[i+1])} km`}</span></legend><div class="profile-segment-fields"><label>Length <span>km</span><input data-index="${i}" data-field="distanceKm" type="number" min="0.01" max="100" step="0.01" value="${format(part.distanceKm)}" required></label><label>Grade <span>%</span><input data-index="${i}" data-field="gradePercent" type="number" min="-9" max="9" step="0.1" value="${format(part.gradePercent)}" required></label><label>Speed limit <span>km/h</span><input data-index="${i}" data-field="speedLimitKmh" type="number" min="10" max="350" step="1" value="${format(part.speedLimitKmh)}" required></label><div class="profile-row-actions"><button type="button" data-action="up" data-index="${i}" ${i?'':'disabled'} aria-label="Move segment ${i+1} earlier" title="Move earlier">↑</button><button type="button" data-action="down" data-index="${i}" ${i<segments.length-1?'':'disabled'} aria-label="Move segment ${i+1} later" title="Move later">↓</button><button type="button" data-action="insert" data-index="${i}" ${segments.length>=24?'disabled':''} aria-label="Insert segment after ${i+1}" title="Insert after">+ after</button><button type="button" data-action="remove" data-index="${i}" ${segments.length>1?'':'disabled'} aria-label="Remove segment ${i+1}" title="Remove">×</button></div></div></fieldset>`).join('')}</div><button type="button" data-action="add" ${segments.length>=24?'disabled':''}>Add segment at end</button><p class="profile-error" role="status" hidden></p><p class="profile-help">Grade effects, advance braking and speed limits are theoretical; the game has not been calibrated for a changing profile.</p></div><p class="profile-uniform-note" ${active?'hidden':''}>The uniform distance, gradient and track speed limit are set in Race or Economics. Switch to Segments to edit individual sections here.</p>`;
  };
  const changed=()=>{selectedIndex=active?Math.min(selectedIndex??0,segments.length-1):null;render();onChange({active,segments:active?segments:null,distanceKm:active?routeProfileDistance(segments):uniform.distanceKm});};
  const showError=(error,target)=>{const message=container.querySelector('.profile-error');message.textContent=error.message;message.hidden=false;if(target){target.setCustomValidity(error.message);target.reportValidity();target.setCustomValidity('');}};
  const select=index=>{
    if(!active)return;
    selectedIndex=index;
    for(const row of container.querySelectorAll('.profile-segment'))row.classList.toggle('is-selected',Number(row.dataset.index)===index);
    for(const band of visual.querySelectorAll('.profile-band-group'))band.classList.toggle('is-selected',Number(band.dataset.segment)===index);
  };
  scaleControl.addEventListener('change',event=>{if(event.target.name==='profile-horizontal-scale'){scale=event.target.value;renderVisual();}});
  visual.addEventListener('click',event=>{const band=event.target.closest('[data-segment]');if(!band)return;const index=Number(band.dataset.segment);select(index);container.querySelector(`.profile-segment[data-index="${index}"] input`)?.focus();});
  visual.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const band=event.target.closest('[data-segment]');if(!band)return;event.preventDefault();const index=Number(band.dataset.segment);select(index);container.querySelector(`.profile-segment[data-index="${index}"] input`)?.focus();});
  container.addEventListener('focusin',event=>{const row=event.target.closest('.profile-segment');if(row)select(Number(row.dataset.index));});
  container.addEventListener('change',event=>{
    if(event.target.matches('input[type="radio"]')){active=event.target.value==='profile';changed();return;}
    const field=event.target.dataset.field,index=Number(event.target.dataset.index);
    if(!field)return;
    if(!event.target.checkValidity()){event.target.reportValidity();return;}
    const next=segments.map(part=>({...part}));next[index][field]=event.target.valueAsNumber;
    try{const valid=validateRouteProfile(next);if(routeProfileDistance(valid)<.5)throw new RangeError('Route total must be at least 0.5 km');segments=valid;profileEdited=true;selectedIndex=index;changed();container.querySelector(`input[data-index="${index}"][data-field="${field}"]`)?.focus();}
    catch(error){showError(error,event.target);}
  });
  container.addEventListener('click',event=>{
    const button=event.target.closest('button[data-action]');if(!button)return;
    const index=Number(button.dataset.index),action=button.dataset.action,next=segments.map(part=>({...part}));
    if(action==='add')next.push({...next.at(-1),distanceKm:1});
    else if(action==='insert')next.splice(index+1,0,{...next[index],distanceKm:1});
    else if(action==='remove')next.splice(index,1);
    else if(action==='up'||action==='down'){const other=index+(action==='up'?-1:1);[next[index],next[other]]=[next[other],next[index]];}
    try{const valid=validateRouteProfile(next);if(routeProfileDistance(valid)<.5)throw new RangeError('Route total must be at least 0.5 km');segments=valid;profileEdited=true;selectedIndex=action==='add'?next.length-1:action==='insert'?index+1:action==='remove'?Math.min(index,next.length-1):index+(action==='up'?-1:1);changed();container.querySelector(`.profile-segment[data-index="${selectedIndex}"] input`)?.focus();}catch(error){showError(error);}
  });
  render();
  return {get active(){return active;},get segments(){return segments;},setUniformDefaults(distanceKm,gradePercent,speedLimitKmh){uniform={distanceKm,gradePercent,speedLimitKmh};if(!active&&!profileEdited)segments=[{...uniform}];if(!active)render();}};
}
