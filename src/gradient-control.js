import {mountDistanceControl,syncNumberInput} from './numeric-controls.js';
import {mountControlHelp} from './control-help.js';

/** Shared bounded route gradient control; zero preserves the flat-track model. */
export function mountGradientControl(document,root,{noticeId,validate,onChange}) {
  const id=root.id,max=20;
  const help=`Experimental gradient model; calibration is incomplete. Positive means uphill from A to B; the return is downhill. The grade-force multiplier is 0.38, fitted to MAN runs at game-displayed 10% and 20% grades and locally supported by one requested TGV Duplex 5% uphill trace (up to 2.4 km/h residual). Race uses A→B only. Rail braking is provisional; Road braking is omitted pending a common calibration. Empty vehicle mass is used; cargo weight is not added. Vehicles without enough traction to climb are excluded. Vehicle and infrastructure speed caps still apply.`;
  root.classList.add('gradient-control');
  root.innerHTML=`<div class="road-value-row"><label for="${id}-input">Gradient A→B <button class="control-info" type="button" aria-label="Help: Route gradient" aria-describedby="${id}-help" title="${help}">ⓘ</button></label><div class="line-distance-entry"><input required id="${id}-input" type="number" min="-${max}" max="${max}" step="0.1" value="0" aria-label="Route gradient A to B in percent" aria-describedby="${id}-help ${noticeId}"><span>%</span></div></div><input id="${id}-range" type="range" min="-${max}" max="${max}" step="0.1" value="0" aria-label="Route gradient A to B in percent"><p id="${id}-help" class="sr-only">${help}</p>`;
  const number=document.getElementById(`${id}-input`),range=document.getElementById(`${id}-range`);
  mountControlHelp(document,root);
  mountDistanceControl({number,range,validate,event:'change',onChange:value=>{range.value=value;onChange(value);}});
  return {setValue(value){syncNumberInput(number,value);range.value=value;}};
}
