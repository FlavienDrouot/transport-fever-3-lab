// Shared hot path for validated fixed-rate inputs. No allocations per diagram sample.
export function fixedRateFleetCount(fixedSeconds,transferFactor,minimumVehicles,maxHeadwaySeconds,frequencyMode='maximum') {
  const minimum=Math.max(1,Math.ceil(minimumVehicles-1e-10));
  if(maxHeadwaySeconds===null)return minimum;
  const ideal=transferFactor+fixedSeconds/maxHeadwaySeconds;
  if(frequencyMode==='maximum')return Math.max(minimum,Math.ceil(ideal-1e-10));
  const lower=Math.max(minimum,Math.floor(ideal)),upper=Math.max(minimum,Math.ceil(ideal));
  return Math.abs(fixedSeconds/(lower-transferFactor)-maxHeadwaySeconds)<=Math.abs(fixedSeconds/(upper-transferFactor)-maxHeadwaySeconds)?lower:upper;
}

/** Whole, evenly spaced vehicles; transfer time is proportional to transported units. */
export function sizeFleet({cycleSeconds,transferSeconds,unitsPerCycle,yearSeconds=1460}, {demandPerYear=null,maxHeadwaySeconds=null,frequencyMode='maximum'}={}, fleetCount=null) {
  for(const [name,value] of Object.entries({cycleSeconds,unitsPerCycle,yearSeconds}))if(!Number.isFinite(value)||value<=0)throw new RangeError(`${name} must be positive`);
  if(!Number.isFinite(transferSeconds)||transferSeconds<0||transferSeconds>=cycleSeconds)throw new RangeError('Invalid transfer time');
  for(const [name,value] of Object.entries({demandPerYear,maxHeadwaySeconds}))if(value!==null&&(!Number.isFinite(value)||value<=0))throw new RangeError(`${name} must be positive or null`);
  if(!['maximum','closest'].includes(frequencyMode))throw new RangeError('Invalid frequency mode');
  const up=n=>Math.max(1,Math.ceil(n-1e-10));
  let count=1,loadScale=1;
  if(demandPerYear!==null){
    const flow=demandPerYear/yearSeconds,fixed=cycleSeconds-transferSeconds,transfer=flow*transferSeconds/unitsPerCycle;
    count=fixedRateFleetCount(fixed,transfer,flow*cycleSeconds/unitsPerCycle,maxHeadwaySeconds,frequencyMode);
    if(fleetCount!==null)count=fleetCount;
    loadScale=Math.min(1,flow*fixed/(count-transfer)/unitsPerCycle);
  }else if(maxHeadwaySeconds!==null){
    const ideal=cycleSeconds/maxHeadwaySeconds;count=up(ideal);
    if(frequencyMode==='closest')count=[Math.max(1,Math.floor(ideal)),Math.max(1,Math.ceil(ideal))].sort((a,b)=>Math.abs(cycleSeconds/a-maxHeadwaySeconds)-Math.abs(cycleSeconds/b-maxHeadwaySeconds)||a-b)[0];
  }
  return {count,loadScale};
}
