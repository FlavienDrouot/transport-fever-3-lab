import {mountDistanceControl,syncNumberInput} from './numeric-controls.js';
import {mountControlHelp} from './control-help.js';

/** Shared bounded route gradient control; zero preserves the flat-track model. */
export function mountGradientControl(document,root,{rail=false,noticeId,validate,onChange}) {
  const id=root.id,max=20;
  const help=`Experimental gradient model; calibration is incomplete. Positive means uphill from A to B; the return is downhill. ${rail?'Race uses A→B only. Shared by Rail and Road. Rail acceleration uses calibrated 0.2 s increments, effective traction ×2 and 0.02 m/s² resistance. Gravity also adjusts service braking. Road motion uses provisional coefficients, with 40% of the gravity effect fitted to one MAN run at a displayed 10% grade.':'Acceleration uses captured traction and power, with 40% of the gravity effect fitted to one MAN run at a displayed 10% grade. Road braking is 6.2 m/s² before the scaled grade contribution; other grades and vehicles need checks.'} Empty vehicle mass is used; cargo weight is not added. Vehicles without enough traction to climb are excluded. Downhill speed stays capped by the vehicle and infrastructure limits.`;
  root.classList.add('gradient-control');
  root.innerHTML=`<div class="road-value-row"><label for="${id}-input">Gradient A→B <button class="control-info" type="button" aria-label="Help: Route gradient" aria-describedby="${id}-help" title="${help}">ⓘ</button></label><div class="line-distance-entry"><input required id="${id}-input" type="number" min="-${max}" max="${max}" step="0.1" value="0" aria-label="Route gradient A to B in percent" aria-describedby="${id}-help ${noticeId}"><span>%</span></div></div><input id="${id}-range" type="range" min="-${max}" max="${max}" step="0.1" value="0" aria-label="Route gradient A to B in percent"><p id="${id}-help" class="sr-only">${help}</p>`;
  const number=document.getElementById(`${id}-input`),range=document.getElementById(`${id}-range`);
  mountControlHelp(document,root);
  mountDistanceControl({number,range,validate,event:'change',onChange:value=>{range.value=value;onChange(value);}});
  return {setValue(value){syncNumberInput(number,value);range.value=value;}};
}
