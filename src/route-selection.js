import {validateRouteProfile} from './route-profile.js';

/** Quick comparison settings and the designed route retain independent values. */
export function createRouteSelection(initial) {
  let simple=validateRouteProfile([initial]),custom=validateRouteProfile([initial]),mode='simple';
  return {
    get mode(){return mode;},
    get segments(){return validateRouteProfile(mode==='simple'?simple:custom);},
    select(next){
      if(!['simple','custom'].includes(next))throw new RangeError('Unknown route selection');
      mode=next;
    },
    updateSimple(part){
      const next={...simple[0],...part};
      for(const [field,constraint] of [['speedLimitKmh','railSpeedConstraintKmh'],['roadSpeedLimitKmh','roadSpeedConstraintKmh']])
        if(Object.hasOwn(part,field)&&part[field]!==simple[0][field]&&!Object.hasOwn(part,constraint)){
          delete next[constraint];if(field==='roadSpeedLimitKmh'&&!Object.hasOwn(part,'roadCity'))delete next.roadCity;
        }
      simple=validateRouteProfile([next]);
    },
    updateCustom(parts){custom=validateRouteProfile(parts);mode='custom';}
  };
}

/** The same route switch can be mounted in comparisons and draft analysis. */
export function mountRouteChoice(root,{value,onChange}) {
  root.innerHTML=`<legend class="sr-only">Route selection</legend>${[['simple','Simple'],['custom','Custom route']].map(([mode,label])=>`<label><input type="radio" name="${root.id}" value="${mode}"><span>${label}</span></label>`).join('')}`;
  const setValue=mode=>{root.querySelector(`input[value="${mode}"]`).checked=true;};
  setValue(value);
  root.addEventListener('change',()=>onChange(root.querySelector('input:checked').value));
  return {setValue};
}
