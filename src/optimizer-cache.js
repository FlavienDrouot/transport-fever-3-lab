import {optimizerRequest} from './optimizer.js';

// This is the initial UI configuration, including the line control's defaults.
export function defaultOptimizerRequest(){
  return optimizerRequest({routeProfile:[{distanceKm:10,gradePercent:0,speedLimitKmh:350,roadSpeedLimitKmh:120,roadLanes:2,tramInfrastructure:'auto'}]});
}

function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const serialize=value=>JSON.stringify(canonical(value));
export function isDefaultOptimizerRequest(request){return serialize(optimizerRequest(request))===serialize(defaultOptimizerRequest());}

export async function optimizerCacheKey(request,catalogue){
  const bytes=new TextEncoder().encode(serialize({request:optimizerRequest(request),catalogue}));
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** A missing/offline/outdated cache must never prevent a normal search. */
export async function loadDefaultOptimizerResult(request,catalogue,{fetch:fetchFile=globalThis.fetch}={}){
  if(!isDefaultOptimizerRequest(request))return null;
  try{
    const manifestResponse=await fetchFile(new URL('../data/optimizer-default.json',import.meta.url),{cache:'no-cache'});
    if(!manifestResponse.ok)return null;
    const manifest=await manifestResponse.json();
    if(manifest.version!==1||!/^optimizer-default-[a-f0-9]{64}\.json$/.test(manifest.asset)||manifest.key!==await optimizerCacheKey(request,catalogue))return null;
    const response=await fetchFile(new URL(`../data/${manifest.asset}`,import.meta.url),{cache:'force-cache'});
    if(!response.ok)return null;
    const result=await response.json();
    return result?.stats&&result?.best?.rail&&result?.best?.road&&isDefaultOptimizerRequest(result.request)?result:null;
  }catch{return null;}
}
