import {escapeHtml,formatNumber,formatDuration} from './format.js';
import {UI_TERMS as T} from './ui-terms.js';

/** Counts come from actual candidate evaluations, separately for each domain. */
export function optimizerExclusionSummary(answer,domain){
  const request=answer.request;
  const labels={
    minHeadwaySeconds:`${T.frequency} · minimum interval (${formatDuration(request.minHeadwaySeconds)})`,
    maxHeadwaySeconds:`${T.frequency} · maximum interval (${formatDuration(request.maxHeadwaySeconds)})`,
    maxOutboundLegSeconds:`Max leg time A→B (${formatDuration(request.maxOutboundLegSeconds)})`,
    maxReturnLegSeconds:`Max leg time B→A (${formatDuration(request.maxReturnLegSeconds)})`,
    maxFleet:`Fleet size · at most ${formatNumber(request.maxFleet)}`,
    rate:`${T.rate} · at least ${formatNumber(request.rate)} ${T.capacityUnit}/year${request.category==='passengers'?'/direction':''}`,
    fillRatio:`${T.utilization} · ceiling ${formatNumber(request.fillRatio*100)}%`,
    stopCapacityA:domain==='rail'?'Rail terminal capacity without waiting at A':'Terminal vehicle throughput at A',
    stopCapacityB:domain==='rail'?'Rail terminal capacity without waiting at B':'Terminal vehicle throughput at B',
    railTerminalGeometry:'Overlapping Rail terminal approaches (train length + 200 m exceeds route length)',
    infrastructure:'Platform, storage or infrastructure access constraints',route:'Cannot complete the route',data:'Incomplete vehicle data',service:'Service constraints',fleet:'Fleet size limit'
  };
  const sole=Object.entries(answer.stats.singleConstraintByDomain?.[domain]??{}).filter(([key])=>['minHeadwaySeconds','maxHeadwaySeconds','maxOutboundLegSeconds','maxReturnLegSeconds','maxFleet','rate','fillRatio','stopCapacityA','stopCapacityB','railTerminalGeometry'].includes(key)).sort((a,b)=>b[1]-a[1]);
  if(sole.length)return `<div class="optimizer-exclusions"><p>Identified limiting constraints:</p><ul>${sole.map(([key,count])=>`<li><strong>${escapeHtml(labels[key])}</strong> excludes ${formatNumber(count)} design${count===1?'':'s'} that meet the other settings.</li>`).join('')}</ul></div>`;
  const observed=Object.entries(answer.stats.rejectedByDomain?.[domain]??{}).sort((a,b)=>b[1]-a[1]);
  if(!observed.length)return '<p class="chart-help">No candidate vehicles in this search. Check the year, transport type and search bounds.</p>';
  return `<div class="optimizer-exclusions"><p>Observed exclusions${observed.length>1?' · no single limiting constraint identified':''}:</p><ul>${observed.map(([key,count])=>`<li>${escapeHtml(labels[key]??key)} · ${formatNumber(count)} design${count===1?'':'s'}</li>`).join('')}</ul>${observed.length>1?'<p class="chart-help">A design can fail several constraints.</p>':''}</div>`;
}
