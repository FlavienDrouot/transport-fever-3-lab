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

/** The route editor owns the draft; Race and Economics choose how to use it. */
export function mountRouteProfileControls(container,{initial,onChange,statuses=[],modeControls=[],visual,scaleControl,scaleNote}) {
  let active=false,segments=validateRouteProfile(initial),uniform={...initial[0]},profileEdited=false,scale='equal',selectedIndex=0;
  const segmentRange=(distances,i)=>`${i===0?'A · 0 km':`${format(distances[i])} km`} → ${i===segments.length-1?`B · ${format(distances[i+1])} km`:`${format(distances[i+1])} km`}`;
  const renderVisual=()=>{
    visual.innerHTML=routeProfileSketch(segments,{scale,selectedIndex});
    scaleNote.textContent=scale==='linear'?'Distance from A is linear; short segments may be too narrow for labels. Elevation is exaggerated. Select a segment in the diagram or the list to edit it.':'Every segment has equal visual width; elevation is exaggerated. Select a segment in the diagram or the list to edit it.';
  };
  const syncMode=()=>{
    for(const control of modeControls)control.querySelector(`input[value="${active?'profile':'uniform'}"]`).checked=true;
    for(const status of statuses)status.innerHTML=`<strong>${active?`${segments.length} segment${segments.length===1?'':'s'} · ${format(routeProfileDistance(segments))} km`:profileEdited?'Uniform route · segments saved':'Uniform route'}</strong><a href="#route-profile">${active?'Edit route profile':profileEdited?'Edit saved segments':'Build a route profile'} ↗</a>`;
    const notice=container.querySelector('.profile-activation-note');if(notice)notice.hidden=active;
  };
  const segmentEditor=(part,i,distances)=>`<fieldset class="profile-segment${selectedIndex===i?' is-selected':''}" data-index="${i}">
    <legend><span class="profile-segment-number">${String(i+1).padStart(2,'0')}</span><span class="profile-segment-range">${segmentRange(distances,i)}</span></legend>
    <div class="profile-segment-fields">
      <div class="profile-field"><label for="profile-length-${i}">Length <span>km</span></label><input id="profile-length-${i}" data-index="${i}" data-field="distanceKm" data-control="number" type="number" min="0.01" max="100" step="0.01" value="${format(part.distanceKm)}" required><input data-index="${i}" data-field="distanceKm" data-control="range" type="range" min="0.01" max="${Math.max(10,Math.ceil(part.distanceKm))}" step="0.01" value="${format(part.distanceKm)}" aria-label="Segment ${i+1} length slider"></div>
      <div class="profile-field"><label for="profile-grade-${i}">Grade <span>%</span></label><input id="profile-grade-${i}" data-index="${i}" data-field="gradePercent" data-control="number" type="number" min="-9" max="9" step="0.1" value="${format(part.gradePercent)}" required><input data-index="${i}" data-field="gradePercent" data-control="range" type="range" min="-9" max="9" step="0.1" value="${format(part.gradePercent)}" aria-label="Segment ${i+1} grade slider"></div>
      <div class="profile-field"><label for="profile-speed-${i}">Speed limit <span>km/h</span></label><input id="profile-speed-${i}" data-index="${i}" data-field="speedLimitKmh" data-control="number" type="number" min="10" max="350" step="1" value="${format(part.speedLimitKmh)}" required><div class="profile-speed-presets" role="group" aria-label="Segment ${i+1} speed presets">${[100,160,350].map(speed=>`<button type="button" data-speed-preset="${speed}" data-index="${i}" aria-pressed="${part.speedLimitKmh===speed}">${speed}</button>`).join('')}</div></div>
      <div class="profile-row-actions"><button type="button" data-action="up" data-index="${i}" ${i?'':'disabled'} aria-label="Move segment ${i+1} earlier" title="Move earlier">↑</button><button type="button" data-action="down" data-index="${i}" ${i<segments.length-1?'':'disabled'} aria-label="Move segment ${i+1} later" title="Move later">↓</button><button type="button" data-action="insert" data-index="${i}" ${segments.length>=24?'disabled':''} aria-label="Insert segment after ${i+1}" title="Insert after">+ after</button><button type="button" data-action="remove" data-index="${i}" ${segments.length>1?'':'disabled'} aria-label="Remove segment ${i+1}" title="Remove">×</button></div>
    </div></fieldset>`;
  const render=()=>{
    const {distances}=positions(segments);
    container.innerHTML=`<div class="profile-editor"><p class="profile-activation-note" ${active?'hidden':''}>Race and Economics currently use uniform route settings. Editing these segments activates this profile.</p><p>Ordered A→B · <strong data-profile-total>${format(routeProfileDistance(segments))} km</strong> total. Select a segment in the diagram or below. B→A reverses their order and grades; there are no intermediate stops.</p><div class="profile-segments">${segments.map((part,i)=>segmentEditor(part,i,distances)).join('')}</div><button type="button" data-action="add" ${segments.length>=24?'disabled':''}>Add segment at end</button><p class="profile-error" role="status" hidden></p><p class="profile-help">Length sliders start at 0.01–10 km and expand when a longer length is entered. Numeric fields allow precise values. Grade effects, advance braking and speed limits are theoretical; the game has not been calibrated for a changing profile.</p></div>`;
    renderVisual();syncMode();
  };
  const notify=()=>onChange({active,segments:active?segments:null,distanceKm:active?routeProfileDistance(segments):uniform.distanceKm});
  const refreshValues=()=>{
    renderVisual();syncMode();
    const error=container.querySelector('.profile-error');error.hidden=true;error.textContent='';
    container.querySelector('[data-profile-total]').textContent=`${format(routeProfileDistance(segments))} km`;
    const {distances}=positions(segments);
    for(const row of container.querySelectorAll('.profile-segment'))row.querySelector('.profile-segment-range').textContent=segmentRange(distances,Number(row.dataset.index));
    notify();
  };
  const changed=()=>{selectedIndex=Math.min(selectedIndex,segments.length-1);render();notify();};
  const showError=(error,target)=>{const message=container.querySelector('.profile-error');message.textContent=error.message;message.hidden=false;if(target){target.setCustomValidity(error.message);target.reportValidity();target.setCustomValidity('');}};
  const select=index=>{
    selectedIndex=index;
    for(const row of container.querySelectorAll('.profile-segment'))row.classList.toggle('is-selected',Number(row.dataset.index)===index);
    for(const band of visual.querySelectorAll('.profile-band-group'))band.classList.toggle('is-selected',Number(band.dataset.segment)===index);
  };
  for(const control of modeControls)control.addEventListener('change',event=>{if(!event.target.matches('input[type="radio"]'))return;active=event.target.value==='profile';syncMode();notify();});
  scaleControl.addEventListener('change',event=>{if(event.target.name==='profile-horizontal-scale'){scale=event.target.value;renderVisual();}});
  visual.addEventListener('click',event=>{const band=event.target.closest('[data-segment]');if(!band)return;const index=Number(band.dataset.segment);select(index);container.querySelector(`.profile-segment[data-index="${index}"] input`)?.focus();});
  visual.addEventListener('keydown',event=>{if(event.key!=='Enter'&&event.key!==' ')return;const band=event.target.closest('[data-segment]');if(!band)return;event.preventDefault();const index=Number(band.dataset.segment);select(index);container.querySelector(`.profile-segment[data-index="${index}"] input`)?.focus();});
  container.addEventListener('focusin',event=>{const row=event.target.closest('.profile-segment');if(row)select(Number(row.dataset.index));});
  const updateField=event=>{
    const field=event.target.dataset.field,index=Number(event.target.dataset.index);
    if(!field)return;
    if(!event.target.checkValidity()){
      if(event.type==='change')event.target.reportValidity();
      return;
    }
    if(segments[index][field]===event.target.valueAsNumber)return;
    const next=segments.map(part=>({...part}));next[index][field]=event.target.valueAsNumber;
    try{
      const valid=validateRouteProfile(next);if(routeProfileDistance(valid)<.5)throw new RangeError('Route total must be at least 0.5 km');
      segments=valid;profileEdited=true;active=true;
      const row=container.querySelector(`.profile-segment[data-index="${index}"]`);
      const matching=row.querySelector(`[data-field="${field}"][data-control="${event.target.dataset.control==='range'?'number':'range'}"]`);
      if(matching){if(matching.type==='range')matching.max=Math.max(10,Math.ceil(valid[index].distanceKm));matching.value=format(valid[index][field]);}
      if(field==='speedLimitKmh')for(const button of row.querySelectorAll('[data-speed-preset]'))button.setAttribute('aria-pressed',String(Number(button.dataset.speedPreset)===valid[index].speedLimitKmh));
      select(index);refreshValues();
    }
    catch(error){if(event.target.dataset.control==='range')event.target.value=format(segments[index][field]);showError(error,event.type==='change'?event.target:null);}
  };
  container.addEventListener('input',updateField);
  container.addEventListener('change',updateField);
  container.addEventListener('click',event=>{
    const preset=event.target.closest('button[data-speed-preset]');
    if(preset){
      const input=container.querySelector(`.profile-segment[data-index="${preset.dataset.index}"] input[data-field="speedLimitKmh"]`);
      input.value=preset.dataset.speedPreset;
      updateField({target:input,type:'change'});
      return;
    }
    const button=event.target.closest('button[data-action]');if(!button)return;
    const invalid=container.querySelector('.profile-segment input[data-control="number"]:invalid');if(invalid){invalid.reportValidity();return;}
    const index=Number(button.dataset.index),action=button.dataset.action,draft=segments.map(part=>({...part}));
    for(const input of container.querySelectorAll('.profile-segment input[data-control="number"]'))draft[Number(input.dataset.index)][input.dataset.field]=input.valueAsNumber;
    try{
      const next=validateRouteProfile(draft);if(routeProfileDistance(next)<.5)throw new RangeError('Route total must be at least 0.5 km');
      if(action==='add')next.push({...next.at(-1),distanceKm:1});
      else if(action==='insert')next.splice(index+1,0,{...next[index],distanceKm:1});
      else if(action==='remove')next.splice(index,1);
      else if(action==='up'||action==='down'){const other=index+(action==='up'?-1:1);[next[index],next[other]]=[next[other],next[index]];}
      const valid=validateRouteProfile(next);if(routeProfileDistance(valid)<.5)throw new RangeError('Route total must be at least 0.5 km');
      segments=valid;profileEdited=true;active=true;selectedIndex=action==='add'?next.length-1:action==='insert'?index+1:action==='remove'?Math.min(index,next.length-1):index+(action==='up'?-1:1);changed();container.querySelector(`.profile-segment[data-index="${selectedIndex}"] input`)?.focus();
    }catch(error){showError(error);}
  });
  render();
  return {get active(){return active;},get segments(){return segments;},setUniformDefaults(distanceKm,gradePercent,speedLimitKmh){uniform={distanceKm,gradePercent,speedLimitKmh};if(!profileEdited){segments=[{...uniform}];render();}else if(!active)syncMode();}};
}
