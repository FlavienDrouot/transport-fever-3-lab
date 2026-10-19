import {validateRouteProfile} from './route-profile.js';

// A Compare link carries what a player sees: category, route, years, filters, Utilization and
// the chosen vehicles. Defaults are omitted, so an untouched comparison keeps a bare URL.
// Saved compositions live in one browser and never enter a link.
const SAFE=/^[a-z0-9:._~-]+$/;
const number=value=>String(Math.round(value*1e4)/1e4);
const segment=part=>[part.distanceKm,part.gradePercent,part.speedLimitKmh,part.roadSpeedLimitKmh??120].map(number).join('~');
const ids=list=>list.filter(id=>!String(id).startsWith('custom:')&&SAFE.test(id)).join('.');

export const SHARE_DEFAULTS=Object.freeze({category:'passengers',scope:'auto',railYear:2035,roadYear:2035,railCargo:'all',roadCargo:'all',includeTrams:false,railFill:1,roadFill:1});

export function encodeShareState(state){
  const d=SHARE_DEFAULTS,out=[];
  const put=(key,value)=>{if(value!==''&&value!=null&&SAFE.test(String(value)))out.push(`${key}=${value}`);};
  if(state.category!==d.category)put('c',state.category==='freight'?'f':'p');
  if(state.scope!==d.scope)put('s',state.scope);
  const route=state.segments??[];
  const defaultRoute=route.length===1&&segment(route[0])==='10~0~350~120';
  if(!defaultRoute||state.scope==='custom')put('r',route.map(segment).join('_'));
  if(state.railYear!==d.railYear)put('y',state.railYear);
  if(state.roadYear!==d.roadYear)put('yr',state.roadYear);
  if(state.railCargo!==d.railCargo)put('rc',state.railCargo);
  if(state.roadCargo!==d.roadCargo)put('tc',state.roadCargo);
  if(state.includeTrams)put('t',1);
  if(state.railFill!==d.railFill)put('u',number(state.railFill*100));
  if(state.roadFill!==d.roadFill)put('ur',number(state.roadFill*100));
  if(state.railSelection)put('v',ids(state.railSelection)||'-');
  if(state.roadSelection)put('vr',ids(state.roadSelection)||'-');
  return out.join('&');
}

/** Read a shared link; invalid fields are ignored rather than breaking the page. */
export function decodeShareState(search){
  const params=new URLSearchParams(search),state={};
  const year=value=>{const y=Number(value);return Number.isInteger(y)&&y>=1800&&y<=2035?y:undefined;};
  const fill=value=>{const u=Number(value);return Number.isFinite(u)&&u>=0&&u<=100?u/100:undefined;};
  const list=value=>value==='-'?[]:value.split('.').filter(id=>SAFE.test(id));
  if(params.has('c'))state.category=params.get('c')==='f'?'freight':'passengers';
  if(['auto','distance','custom'].includes(params.get('s')))state.scope=params.get('s');
  if(params.has('r')){
    try{
      state.segments=validateRouteProfile(params.get('r').split('_').map(part=>{
        const [distanceKm,gradePercent,speedLimitKmh,roadSpeedLimitKmh]=part.split('~').map(Number);
        return {distanceKm,gradePercent,speedLimitKmh,roadSpeedLimitKmh};
      }));
    }catch{}
  }
  for(const [key,field] of [['y','railYear'],['yr','roadYear']])if(params.has(key)&&year(params.get(key))!==undefined)state[field]=year(params.get(key));
  for(const [key,field] of [['rc','railCargo'],['tc','roadCargo']])if(params.has(key)&&SAFE.test(params.get(key)))state[field]=params.get(key);
  if(params.get('t')==='1')state.includeTrams=true;
  for(const [key,field] of [['u','railFill'],['ur','roadFill']])if(params.has(key)&&fill(params.get(key))!==undefined)state[field]=fill(params.get(key));
  for(const [key,field] of [['v','railSelection'],['vr','roadSelection']])if(params.has(key))state[field]=list(params.get(key));
  return state;
}
