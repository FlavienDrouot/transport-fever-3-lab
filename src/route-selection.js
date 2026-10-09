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
    updateSimple(part){simple=validateRouteProfile([{...simple[0],...part}]);},
    updateCustom(parts){custom=validateRouteProfile(parts);mode='custom';}
  };
}
