import {returnShare} from './service-fleet.js';
import {routeStops} from './route-profile.js';

// Each active transfer (unloading, loading) is preceded by a 2 s pause; departure waits 2 s more.
export const TRANSFER_PAUSE_SECONDS=2,DEPARTURE_PAUSE_SECONDS=2;
const EPSILON=1e-9;
const share=(value,label)=>{if(!Number.isFinite(value)||value<0||value>1+EPSILON)throw new RangeError(`${label} must be a share between 0 and 1.`);return value;};

/** Who alights and boards at each stop, A to B, as shares of the load on the busiest section. */
export function validateStopPattern(pattern){
  if(!pattern||!Array.isArray(pattern.stops)||pattern.stops.length<2||pattern.stops.length>25)throw new RangeError('A stop pattern needs 2–25 stops.');
  const stops=pattern.stops.map((stop,i)=>Object.fromEntries(['outbound','return'].map(direction=>[direction,{
    load:share(stop?.[direction]?.load??0,`Stop ${i+1} ${direction} load`),unload:share(stop?.[direction]?.unload??0,`Stop ${i+1} ${direction} unload`)}])));
  const deliveries=stops.reduce((sum,stop)=>sum+stop.outbound.unload+stop.return.unload,0);
  if(deliveries<=EPSILON)throw new RangeError('A stop pattern must deliver something.');
  return {stops,deliveries};
}

/** A–B–A: the busier leg carries the full load, the return a share of it; intermediate stops are only visited. */
export function abaStopPattern(loadedReturn,intermediateStops=0){
  const r=returnShare(loadedReturn),idle={outbound:{load:0,unload:0},return:{load:0,unload:0}};
  return validateStopPattern({stops:[{outbound:{load:1,unload:0},return:{load:0,unload:r}},
    ...Array.from({length:intermediateStops},()=>idle),{outbound:{load:0,unload:1},return:{load:r,unload:0}}]});
}

/** The service's pattern, checked against the route's intermediate stops. */
export function servicePattern({servicePattern=null,loadedReturn=false,routeProfile=null}={}){
  const intermediate=routeProfile?routeStops(routeProfile).length:0;
  if(servicePattern===null)return abaStopPattern(loadedReturn,intermediate);
  const pattern=validateStopPattern(servicePattern);
  if(pattern.stops.length!==intermediate+2)throw new RangeError('The stop pattern does not match the route stops.');
  return pattern;
}

/** Waits at the intermediate stops on the way A → B: the departure pause, plus the declared transfers and their pauses for a vehicle carrying `load` at `rate` units/s. */
export function outboundStopWaits(pattern,count,load=0,rate=Infinity){
  if(!pattern)return Array(count).fill(DEPARTURE_PAUSE_SECONDS);
  return validateStopPattern(pattern).stops.slice(1,-1).map(({outbound:visit})=>
    (visit.load+visit.unload)*load/rate+TRANSFER_PAUSE_SECONDS*((visit.load>EPSILON)+(visit.unload>EPSILON))+DEPARTURE_PAUSE_SECONDS);
}

/** Stop visits in one A–B–A cycle: A and B once each, intermediate stops once per direction. */
export function cycleVisits(pattern){
  const {stops}=pattern,last=stops.length-1,middle=stops.slice(1,-1);
  return [{stop:0,unload:stops[0].return.unload,load:stops[0].outbound.load},
    ...middle.map((stop,i)=>({stop:i+1,...stop.outbound})),
    {stop:last,unload:stops[last].outbound.unload,load:stops[last].return.load},
    ...middle.map((stop,i)=>({stop:i+1,...stop.return})).toReversed()];
}

/** Handling of one cycle for a load `load` on the busiest section; `rateAt(stop)` is the transfer rate there (units/s). */
export function cycleHandling(pattern,load,rateAt,extraPerVisitSeconds=0){
  let loadingSeconds=0,unloadingSeconds=0,pauseSeconds=0;
  const visits=cycleVisits(pattern).map(visit=>{
    const rate=rateAt(visit.stop),loading=visit.load*load/rate,unloading=visit.unload*load/rate;
    const pause=TRANSFER_PAUSE_SECONDS*((visit.load>EPSILON)+(visit.unload>EPSILON))+DEPARTURE_PAUSE_SECONDS+extraPerVisitSeconds;
    loadingSeconds+=loading;unloadingSeconds+=unloading;pauseSeconds+=pause;
    return {...visit,transferSeconds:loading+unloading,pauseSeconds:pause,seconds:loading+unloading+pause};
  });
  const last=pattern.stops.length-1;
  // transferShares: units moved per cycle, in loads on the busiest section (4 for a passenger A–B–A).
  const transferShares=visits.reduce((sum,v)=>sum+v.load+v.unload,0);
  return {visits,loadingSeconds,unloadingSeconds,pauseSeconds,transferShares,deliveries:pattern.deliveries,deliveredPerCycle:load*pattern.deliveries,
    stationSecondsA:visits[0].seconds,stationSecondsB:visits.find(v=>v.stop===last).seconds,
    intermediateStopSeconds:visits.filter(v=>v.stop!==0&&v.stop!==last).reduce((sum,v)=>sum+v.seconds,0)};
}
