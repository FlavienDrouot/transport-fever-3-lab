import {leaderCurveWindow} from './crossovers.js';
import {withRailGradient,withRailSpeedLimit} from './rail-motion.js';
import {withRoadModel} from './road-motion.js';
import {gradientAcceleration} from './gradient.js';

/** Crop an exploration without turning a finite end into an infinite promise. */
export function clipStudyStory(story,end,{unbounded=false}={}){
  if(!Number.isFinite(end)||end<=0)throw new RangeError('Invalid study distance');
  const crop=entries=>entries.filter(p=>p.start<end).map(p=>({...p,end:Math.min(end,p.end),...(p.leaders?{unbounded:false}:{})}));
  const phases=crop(story.phases),intervals=crop(story.intervals);
  if(unbounded&&phases.length&&story.phases.at(-1)?.unbounded&&phases.at(-1).start===story.phases.at(-1).start)phases.at(-1).unbounded=true;
  return {...story,phases,intervals,end,roots:story.roots?.filter(x=>x<end)};
}
const raceDistances=[];
export function automaticRaceDistance(trains){
  const models=trains.map(t=>t.model),cached=raceDistances.find(entry=>entry.models.length===models.length&&entry.models.every((model,i)=>model===models[i]));
  if(cached)return cached.end;
  const end=leaderCurveWindow(trains).end;if(raceDistances.length>=8)raceDistances.shift();raceDistances.push({models,end});return end;
}
const bounds=new WeakMap();
/** Presentation bound only; the original motion law and physical route remain unchanged. */
export function withStudyDistance(train,distanceKm){
  if(train.model.routeProfile&&distanceKm>=train.model.routeDistanceKm-1e-9)return train;
  let cache=bounds.get(train);if(!cache){cache=new Map();bounds.set(train,cache);}
  if(!cache.has(distanceKm)){if(cache.size>=8)cache.clear();cache.set(distanceKm,{...train,model:{...train.model,studyDistanceKm:distanceKm}});}
  return cache.get(distanceKm);
}
export const finiteStudyMotion=train=>train.model.routeProfile||train.model.studyDistanceKm!=null;

/** Beyond full acceleration plus braking, a fixed-load uniform service cost is affine. */
export function serviceSteadyDistance(trains,options={},road=false){
  const part=options.routeProfile?.[0],grade=part?.gradePercent??options.gradePercent??0;
  const cap=road?(part?.roadSpeedLimitKmh??part?.speedLimitKmh??options.roadSpeedLimit):(part?.speedLimitKmh??options.infrastructureSpeedKmh);
  let end=1;
  for(const source of trains){
    let train=road?withRoadModel(source):source;if(cap!=null)train=withRailSpeedLimit(train,cap);
    for(const signed of [grade,-grade]){
      const model=withRailGradient(train,signed).model;
      if(model.canStart===false)return Infinity;
      const braking=(options.brakingDeceleration??2.5)+gradientAcceleration(signed)*(model.motionConfig?.gravityFactor??1);
      if(!road&&braking<=0)return Infinity;
      const stop=road?0:(model.effectiveMaxSpeedKmh/3.6)**2/(2*braking)/1000;
      end=Math.max(end,model.speedCapKm+stop);
    }
  }
  return end*1.01;
}
/** Cover every possible steady-tail cost crossing, without an arbitrary kilometre cutoff. */
export function automaticCostTail(items,costAt,steadyDistance){
  if(!Number.isFinite(steadyDistance)||steadyDistance<=0)return null;
  const step=Math.max(1,steadyDistance),lines=items.map(item=>{
    const value=costAt(item.id,steadyDistance),next=costAt(item.id,steadyDistance+step);
    return {value,slope:(next-value)/step};
  }).filter(line=>Number.isFinite(line.value)&&Number.isFinite(line.slope)&&line.slope>0);
  const absoluteTolerance=Math.max(1,...lines.map(line=>Math.abs(line.value)))*1e-9,roots=[];
  let end=steadyDistance;
  for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
    const slope=lines[i].slope-lines[j].slope;
    if(Math.abs(slope)<=Math.max(lines[i].slope,lines[j].slope)*1e-12)continue;
    for(const tolerance of [-absoluteTolerance,0,absoluteTolerance]){
      const crossing=steadyDistance-(lines[i].value-lines[j].value-tolerance)/slope;
      if(Number.isFinite(crossing)&&crossing>steadyDistance){roots.push(crossing);end=Math.max(end,crossing);}
    }
  }
  return {end:Math.max(1,end*1.2),roots,absoluteTolerance};
}
export const automaticCostDistance=(...args)=>automaticCostTail(...args)?.end??null;
export function automaticCostStudyAllowed(options={}){
  return options.studyScope==='auto'&&!options.studyCustomRoute&&!(options.routeProfile?.length>1)&&options.demandPerYear==null&&options.demandPerDirection==null&&options.maxHeadwaySeconds==null;
}
/** Extend a uniform law, without scaling a physical profile beyond its 100 km editor bound. */
export function uniformServiceStudyOptions(options){
  const part=options.routeProfile?.[0];
  return part?{...options,routeProfile:null,gradePercent:part.gradePercent,infrastructureSpeedKmh:part.speedLimitKmh}:{...options};
}

/** Suspend stored service and train constraints during an automatic distance study. */
export function serviceStudyTargets(options={}){
  if(options.studyScope!=='auto'||options.studyCustomRoute)return options;
  return {...options,demandPerYear:null,demandPerDirection:null,maxHeadwaySeconds:null,allowMultipleUnits:false,platformLengthMetres:null};
}
