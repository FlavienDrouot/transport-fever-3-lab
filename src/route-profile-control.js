import {validateRouteProfile,routeProfileDistance} from './route-profile.js';

/** Two synchronized sidebar views of one rail A→B profile. Native inputs keep editing accessible. */
export function mountRouteProfileControls(containers,{initial,onChange}) {
  let active=false,segments=validateRouteProfile(initial),uniformDistance=initial[0].distanceKm,profileEdited=false;
  const format=value=>Number(value.toFixed(3));
  const render=()=>{
    for(const container of containers){
      container.innerHTML=`<div class="profile-mode" role="group" aria-label="Rail route shape"><label><input type="radio" name="${container.id}-mode" value="uniform" ${active?'':'checked'}> Uniform</label><label><input type="radio" name="${container.id}-mode" value="profile" ${active?'checked':''}> Segments</label></div><div class="profile-editor" ${active?'':'hidden'}><p>Ordered A→B · total <strong>${format(routeProfileDistance(segments))} km</strong>. B→A reverses the order and grades. Trains keep their speed between segments; service trains stop at A and B.</p><p class="profile-help">Grade effects and braking are theoretical. Segment limits are anticipated. No intermediate stops.</p><div class="profile-segments">${segments.map((part,i)=>`<fieldset class="profile-segment"><legend>Segment ${i+1}</legend><label>Length (km)<input data-index="${i}" data-field="distanceKm" type="number" min="0.01" max="100" step="0.01" value="${format(part.distanceKm)}" required></label><label>Grade (%)<input data-index="${i}" data-field="gradePercent" type="number" min="-9" max="9" step="0.1" value="${format(part.gradePercent)}" required></label><label>Limit (km/h)<input data-index="${i}" data-field="speedLimitKmh" type="number" min="10" max="350" step="1" value="${format(part.speedLimitKmh)}" required></label><div class="profile-row-actions"><button type="button" data-action="up" data-index="${i}" ${i?'':'disabled'} aria-label="Move segment ${i+1} earlier">↑</button><button type="button" data-action="down" data-index="${i}" ${i<segments.length-1?'':'disabled'} aria-label="Move segment ${i+1} later">↓</button><button type="button" data-action="remove" data-index="${i}" ${segments.length>1?'':'disabled'} aria-label="Remove segment ${i+1}">×</button></div></fieldset>`).join('')}</div><button type="button" data-action="add" ${segments.length>=24?'disabled':''}>Add segment</button><p class="profile-error" role="status" hidden></p></div>`;
    }
  };
  const changed=()=>{render();onChange({active,segments:active?segments:null,distanceKm:active?routeProfileDistance(segments):uniformDistance});};
  for(const container of containers){
    container.addEventListener('change',event=>{
      if(event.target.matches('input[type="radio"]')){active=event.target.value==='profile';changed();return;}
      const field=event.target.dataset.field,index=Number(event.target.dataset.index);
      if(!field)return;
      if(!event.target.checkValidity()){event.target.reportValidity();return;}
      const next=segments.map(part=>({...part}));next[index][field]=event.target.valueAsNumber;
      try{const valid=validateRouteProfile(next);if(routeProfileDistance(valid)<.5)throw new RangeError('Route total must be at least 0.5 km');segments=valid;profileEdited=true;changed();}
      catch(error){const message=container.querySelector('.profile-error');message.textContent=error.message;message.hidden=false;event.target.setCustomValidity(error.message);event.target.reportValidity();event.target.setCustomValidity('');}
    });
    container.addEventListener('click',event=>{
      const button=event.target.closest('button[data-action]');if(!button)return;
      const index=Number(button.dataset.index),action=button.dataset.action,next=segments.map(part=>({...part}));
      if(action==='add')next.push({...next.at(-1),distanceKm:1});
      else if(action==='remove')next.splice(index,1);
      else if(action==='up'||action==='down'){const other=index+(action==='up'?-1:1);[next[index],next[other]]=[next[other],next[index]];}
      try{const valid=validateRouteProfile(next);if(routeProfileDistance(valid)<.5)throw new RangeError('Route total must be at least 0.5 km');segments=valid;profileEdited=true;changed();}catch(error){const message=container.querySelector('.profile-error');message.textContent=error.message;message.hidden=false;}
    });
  }
  render();
  return {get active(){return active;},get segments(){return segments;},setUniformDefaults(distanceKm,gradePercent,speedLimitKmh){uniformDistance=distanceKm;if(!active&&!profileEdited){segments=[{distanceKm,gradePercent,speedLimitKmh}];render();}}};
}
