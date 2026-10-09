import {validateRouteProfile,routeProfileDistance} from './route-profile.js';

const format=value=>Number(value.toFixed(3));

/** A qualitative elevation sketch; horizontal space is per segment, not distance. */
export function routeProfileSketch(segments) {
  const parts=validateRouteProfile(segments),total=routeProfileDistance(parts);
  const width=Math.max(800,parts.length*92),left=56,right=width-56,step=(right-left)/parts.length;
  const heights=[0],distances=[0];
  for(const part of parts){heights.push(heights.at(-1)+part.distanceKm*1000*part.gradePercent/100);distances.push(distances.at(-1)+part.distanceKm);}
  const min=Math.min(...heights),max=Math.max(...heights),range=max-min;
  const y=value=>range<1e-9?150:205-(value-min)/range*110;
  const points=heights.map((height,i)=>`${left+i*step},${y(height).toFixed(1)}`).join(' ');
  const bands=parts.map((part,i)=>{
    const x=left+i*step,mid=x+step/2;
    return `<g><rect x="${x.toFixed(1)}" y="35" width="${step.toFixed(1)}" height="205" class="profile-band${i%2?' alternate':''}"/><text x="${mid.toFixed(1)}" y="57" text-anchor="middle">${i+1}</text><text x="${mid.toFixed(1)}" y="77" text-anchor="middle">${format(part.distanceKm)} km</text><text x="${mid.toFixed(1)}" y="257" text-anchor="middle">${part.gradePercent>0?'+':''}${format(part.gradePercent)}% · ${format(part.speedLimitKmh)} km/h</text></g>`;
  }).join('');
  const markers=heights.map((height,i)=>`<circle cx="${(left+i*step).toFixed(1)}" cy="${y(height).toFixed(1)}" r="4" class="profile-node"><title>${i===0?'A':i===parts.length?'B':`After segment ${i}`} · ${format(distances[i])} km from A</title></circle>`).join('');
  const description=`Route from A to B, ${format(total)} km over ${parts.length} segment${parts.length===1?'':'s'}. ${parts.map((p,i)=>`Segment ${i+1}: ${format(p.distanceKm)} km, ${format(p.gradePercent)} percent grade, ${format(p.speedLimitKmh)} kilometres per hour limit.`).join(' ')}`;
  return `<div class="profile-sketch-scroll"><svg class="profile-sketch" viewBox="0 0 ${width} 290" role="img" aria-label="${description}">${bands}<line x1="${left}" x2="${right}" y1="232" y2="232" class="profile-baseline"/><polyline points="${points}" class="profile-terrain"/>${markers}<text x="${left}" y="280" text-anchor="start">A · 0 km</text><text x="${right}" y="280" text-anchor="end">B · ${format(total)} km</text></svg></div>`;
}

/** One editor and two sidebar summaries share a single rail A→B profile. */
export function mountRouteProfileControls(container,{initial,onChange,statuses=[],visual}) {
  let active=false,segments=validateRouteProfile(initial),uniform={...initial[0]},profileEdited=false;
  const render=()=>{
    const route=active?segments:[uniform];
    visual.innerHTML=routeProfileSketch(route);
    for(const status of statuses)status.innerHTML=`<strong>${active?`${segments.length} segment${segments.length===1?'':'s'} · ${format(routeProfileDistance(segments))} km`:'Uniform route'}</strong><a href="#route-profile">${active?'Edit route profile':'Build a route profile'} ↗</a>`;
    container.innerHTML=`<fieldset class="profile-mode"><legend>Route model</legend><label><input type="radio" name="route-profile-mode" value="uniform" ${active?'':'checked'}> Uniform</label><label><input type="radio" name="route-profile-mode" value="profile" ${active?'checked':''}> Segments</label></fieldset><div class="profile-editor" ${active?'':'hidden'}><p>Ordered A→B · total <strong>${format(routeProfileDistance(segments))} km</strong>. B→A reverses the order and grades. Trains keep their speed between segments; service trains stop at A and B.</p><p class="profile-help">Grade effects and braking are theoretical. Segment limits are anticipated. No intermediate stops.</p><div class="profile-segments">${segments.map((part,i)=>`<fieldset class="profile-segment"><legend>Segment ${i+1}</legend><label>Length (km)<input data-index="${i}" data-field="distanceKm" type="number" min="0.01" max="100" step="0.01" value="${format(part.distanceKm)}" required></label><label>Grade (%)<input data-index="${i}" data-field="gradePercent" type="number" min="-9" max="9" step="0.1" value="${format(part.gradePercent)}" required></label><label>Limit (km/h)<input data-index="${i}" data-field="speedLimitKmh" type="number" min="10" max="350" step="1" value="${format(part.speedLimitKmh)}" required></label><div class="profile-row-actions"><button type="button" data-action="up" data-index="${i}" ${i?'':'disabled'} aria-label="Move segment ${i+1} earlier" title="Move earlier">↑</button><button type="button" data-action="down" data-index="${i}" ${i<segments.length-1?'':'disabled'} aria-label="Move segment ${i+1} later" title="Move later">↓</button><button type="button" data-action="remove" data-index="${i}" ${segments.length>1?'':'disabled'} aria-label="Remove segment ${i+1}" title="Remove">×</button></div></fieldset>`).join('')}</div><button type="button" data-action="add" ${segments.length>=24?'disabled':''}>Add segment</button><p class="profile-error" role="status" hidden></p></div><p class="profile-uniform-note" ${active?'hidden':''}>The uniform distance, gradient and track speed limit are set in Race or Economics. Switch to Segments to edit individual sections here.</p>`;
  };
  const changed=()=>{render();onChange({active,segments:active?segments:null,distanceKm:active?routeProfileDistance(segments):uniform.distanceKm});};
  const showError=(error,target)=>{const message=container.querySelector('.profile-error');message.textContent=error.message;message.hidden=false;if(target){target.setCustomValidity(error.message);target.reportValidity();target.setCustomValidity('');}};
  container.addEventListener('change',event=>{
    if(event.target.matches('input[type="radio"]')){active=event.target.value==='profile';changed();return;}
    const field=event.target.dataset.field,index=Number(event.target.dataset.index);
    if(!field)return;
    if(!event.target.checkValidity()){event.target.reportValidity();return;}
    const next=segments.map(part=>({...part}));next[index][field]=event.target.valueAsNumber;
    try{const valid=validateRouteProfile(next);if(routeProfileDistance(valid)<.5)throw new RangeError('Route total must be at least 0.5 km');segments=valid;profileEdited=true;changed();}
    catch(error){showError(error,event.target);}
  });
  container.addEventListener('click',event=>{
    const button=event.target.closest('button[data-action]');if(!button)return;
    const index=Number(button.dataset.index),action=button.dataset.action,next=segments.map(part=>({...part}));
    if(action==='add')next.push({...next.at(-1),distanceKm:1});
    else if(action==='remove')next.splice(index,1);
    else if(action==='up'||action==='down'){const other=index+(action==='up'?-1:1);[next[index],next[other]]=[next[other],next[index]];}
    try{const valid=validateRouteProfile(next);if(routeProfileDistance(valid)<.5)throw new RangeError('Route total must be at least 0.5 km');segments=valid;profileEdited=true;changed();}catch(error){showError(error);}
  });
  render();
  return {get active(){return active;},get segments(){return segments;},setUniformDefaults(distanceKm,gradePercent,speedLimitKmh){uniform={distanceKm,gradePercent,speedLimitKmh};if(!active&&!profileEdited)segments=[{...uniform}];if(!active)render();}};
}
