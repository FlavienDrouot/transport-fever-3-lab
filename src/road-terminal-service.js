import {sizeFleet} from './service-fleet.js';

// Estimated handover from available access to the next vehicle's handling start.
export const ROAD_MANEUVER_SECONDS=5;

/** Identical vehicles, serial places, regular arrivals, independent parallel accesses. */
export function roadTerminalEstimate(duration,headway,{vehicleSlots,platformCount=1,platformSlots},maneuver=ROAD_MANEUVER_SECONDS){
  if(vehicleSlots===undefined)return {waitingSeconds:0,maxVehiclesPerSecond:null,overloaded:false};
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(headway)||headway<=0||!Number.isFinite(maneuver)||maneuver<0)throw new RangeError('Invalid Road terminal timing.');
  const slots=platformSlots??Array(platformCount).fill(vehicleSlots/platformCount);
  if(!slots.length||slots.some(n=>!Number.isInteger(n)||n<1)||slots.reduce((sum,n)=>sum+n,0)!==vehicleSlots)throw new RangeError('Invalid Road terminal geometry.');
  const rates=slots.map(n=>n/(duration+n*maneuver));
  const maxVehiclesPerSecond=rates.reduce((sum,n)=>sum+n,0);
  // Different parallel lengths receive arrivals in proportion to theoretical throughput.
  const waitingSeconds=slots.reduce((sum,places,i)=>{
    const fraction=rates[i]/maxVehiclesPerSecond,spacing=headway/fraction-maneuver;
    // Sum max(0, D-k*(interval-M)), k=1..N-1, without looping over places.
    const active=spacing>0?Math.min(places-1,Math.max(0,Math.ceil(duration/spacing)-1)):places-1;
    return sum+fraction*Math.max(0,(active*duration-spacing*active*(active+1)/2)/places);
  },0);
  return {waitingSeconds,maxVehiclesPerSecond,overloaded:1/headway>maxVehiclesPerSecond+1e-10};
}

/** Scalar fleet/load solution including estimated blocking; no vehicle event simulation. */
export function sizeRoadTerminalFleet(model,options,stops){
  const {cycleSeconds,transferSeconds,unitsPerCycle,yearSeconds,transferSecondsA,transferSecondsB,fixedStopSeconds,maneuverSeconds=ROAD_MANEUVER_SECONDS}=model;
  const baseline=sizeFleet(model,options);
  const flow=options.demandPerYear==null?null:options.demandPerYear/yearSeconds;
  const fixedCycle=cycleSeconds-transferSeconds;
  const state=headway=>{
    const loadScale=flow===null?1:Math.min(1,flow*headway/unitsPerCycle);
    const stopA=roadTerminalEstimate(transferSecondsA*loadScale+fixedStopSeconds,headway,stops.stopA,maneuverSeconds);
    const stopB=roadTerminalEstimate(transferSecondsB*loadScale+fixedStopSeconds,headway,stops.stopB,maneuverSeconds);
    return {loadScale,stopA,stopB,cycleSeconds:fixedCycle+transferSeconds*loadScale+stopA.waitingSeconds+stopB.waitingSeconds};
  };
  const baselineHeadway=(fixedCycle+transferSeconds*baseline.loadScale)/baseline.count;
  const baselineState=state(baselineHeadway);
  if(!baselineState.stopA.waitingSeconds&&!baselineState.stopB.waitingSeconds)
    return {...baselineState,...baseline,headwaySeconds:baselineHeadway};
  const upper=flow===null?cycleSeconds:unitsPerCycle/flow;
  const limit=Math.min(upper,options.maxHeadwaySeconds??Infinity);
  const minimum=Math.max(1,Math.ceil(state(upper).cycleSeconds/upper-1e-10));
  const ideal=state(limit).cycleSeconds/limit;
  const count=Math.max(minimum,Math.ceil(ideal-1e-10));
  const solve=count=>{
    let low=0,high=upper;
    // The ratio cycle(H)/H is decreasing. Bisection is independent of fleet size.
    for(let i=0;i<48;i++){
      const middle=(low+high)/2;
      if(state(middle).cycleSeconds>count*middle)low=middle;else high=middle;
    }
    const headwaySeconds=(low+high)/2;
    return {...state(headwaySeconds),count,headwaySeconds};
  };
  let result=solve(count);
  if(options.frequencyMode==='closest'&&options.maxHeadwaySeconds!=null){
    const lower=solve(Math.max(minimum,Math.floor(ideal)));
    if(Math.abs(lower.headwaySeconds-limit)<=Math.abs(result.headwaySeconds-limit))result=lower;
  }
  // Keep the familiar no-target/no-blocking result numerically unchanged.
  if(!result.stopA.waitingSeconds&&!result.stopB.waitingSeconds){
    const headwaySeconds=(fixedCycle+transferSeconds*baseline.loadScale)/baseline.count;
    return {...state(headwaySeconds),...baseline,headwaySeconds};
  }
  return result;
}
