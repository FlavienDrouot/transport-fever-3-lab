import {withRailGradient,withRailSpeedLimit} from './rail-motion.js';

export const RAIL_SWITCH_LENGTH_METRES=100;
export const RAIL_TERMINAL_ASSUMPTIONS='Terminal capacity assumes flat station approaches and independent access to each platform track. Shared switches may limit capacity in practice. Configurations requiring trains to wait are excluded.';

/** One train per platform track. Reserve the access before arrival until the rear clears it. */
export function railTerminalEstimate(train,{stopSeconds,headwaySeconds,trackCount=1,speedLimitKmh,arrivalPeakSpeedKmh,brakingDeceleration=2.5}){
  if(!Number.isFinite(train.lengthMetres)||train.lengthMetres<=0||!Number.isFinite(stopSeconds)||stopSeconds<0||
    !Number.isFinite(headwaySeconds)||headwaySeconds<=0||!Number.isSafeInteger(trackCount)||trackCount<1||
    !Number.isFinite(arrivalPeakSpeedKmh)||arrivalPeakSpeedKmh<=0||!Number.isFinite(brakingDeceleration)||brakingDeceleration<=0)
    throw new RangeError('Rail terminal capacity requires valid train geometry, occupation, Frequency and track count.');
  const clearanceMetres=train.lengthMetres/2+RAIL_SWITCH_LENGTH_METRES;
  const flat=withRailSpeedLimit(withRailGradient(train,0),speedLimitKmh);
  const exitSeconds=flat.model.timeAt(clearanceMetres/1000);
  const speed=Math.min(flat.maxSpeedKmh,arrivalPeakSpeedKmh)/3.6;
  const brakingMetres=speed*speed/(2*brakingDeceleration);
  const entrySeconds=clearanceMetres<=brakingMetres
    ?Math.sqrt(2*clearanceMetres/brakingDeceleration)
    :speed/brakingDeceleration+(clearanceMetres-brakingMetres)/speed;
  const blockedSeconds=stopSeconds+exitSeconds+entrySeconds;
  return {trackCount,clearanceMetres,stopSeconds,entrySeconds,exitSeconds,blockedSeconds,
    minHeadwaySeconds:blockedSeconds/trackCount,maxTrainsPerSecond:trackCount/blockedSeconds,
    overloaded:headwaySeconds*trackCount+1e-7<blockedSeconds};
}

export function railTerminalEstimates(train,service,route,stops){
  const common={headwaySeconds:service.headwaySeconds};
  return Object.fromEntries(['stopA','stopB'].flatMap((stop,index)=>stops[stop].platformTrackCount==null?[]:[[stop,railTerminalEstimate(train,{
    ...common,trackCount:stops[stop].platformTrackCount,
    stopSeconds:service[index?'stationSecondsB':'stationSecondsA']??service.stationSeconds,
    speedLimitKmh:route[index?route.length-1:0].speedLimitKmh,
    arrivalPeakSpeedKmh:service[index?'outboundPeakSpeedKmh':'returnPeakSpeedKmh']??service.peakSpeedKmh,
  })]]));
}
