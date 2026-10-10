import {mountDistanceControl,syncNumberInput} from './numeric-controls.js';
import {mountControlHelp} from './control-help.js';

/** Shared bounded route gradient control; zero preserves the flat-track model. */
export function mountGradientControl(document,root,{noticeId,validate,onChange}) {
  const id=root.id,max=20;
  const help=`Positive means uphill from A to B; the return is downhill. Rail and Road share the calibrated grade-force multiplier of 0.38. Race uses A→B only. Rail includes braking; Road braking is omitted. Motion uses empty vehicle mass. Vehicles without enough traction to climb are excluded. Vehicle and infrastructure speed caps still apply.`;
  root.classList.add('gradient-control');
  root.innerHTML=`<div class="road-value-row"><label for="${id}-input">Gradient A→B <button class="control-info" type="button" aria-label="Help: Route gradient" aria-describedby="${id}-help" title="${help}">ⓘ</button></label><div class="line-distance-entry"><input required id="${id}-input" type="number" min="-${max}" max="${max}" step="0.1" value="0" aria-label="Route gradient A to B in percent" aria-describedby="${id}-help ${noticeId}"><span>%</span></div></div><div class="gradient-slider"><input id="${id}-range" type="range" min="-${max}" max="${max}" step="1" value="0" aria-label="Route gradient A to B in percent"><button type="button" id="${id}-zero" class="gradient-zero" aria-label="Reset route gradient to zero percent" title="Reset gradient to 0%">0%</button></div><p id="${id}-help" class="sr-only">${help}</p>`;
  const number=document.getElementById(`${id}-input`),range=document.getElementById(`${id}-range`);
  mountControlHelp(document,root);
  mountDistanceControl({number,range,validate,event:'change',onChange:value=>{range.value=value;onChange(value);}});
  document.getElementById(`${id}-zero`).addEventListener('click',()=>{
    if(number.disabled)return;
    number.value='0';range.value='0';
    if(validate())onChange(0);
  });
  return {setValue(value){syncNumberInput(number,value);range.value=value;}};
}
