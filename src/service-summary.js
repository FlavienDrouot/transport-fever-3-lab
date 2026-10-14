import {escapeHtml as escape,formatNumber} from './format.js';
import {mountControlHelp} from './control-help.js';

// Same result card for railway and road services, including tied winners.
export function renderServiceSummary(root,{names=[],cost,unit,emptyMessage,precision=2,explanation="This compares running costs per transported capacity at the specified demand or utilization. It does not predict demand or include purchase costs, infrastructure or revenue."}) {
  if(!names.length||!Number.isFinite(cost)){
    root.textContent=emptyMessage;
    return;
  }
  const formatted=formatNumber(cost,precision);
  root.innerHTML=`<div class="service-winner"><span class="service-winner-label">Lowest running cost <button class="control-info" type="button" title="${escape(explanation)}" aria-label="Help: Lowest running cost">ⓘ</button></span><strong>${names.map(escape).join(' / ')}</strong></div><div class="service-winner-cost"><strong>$${formatted}</strong><span>per ${escape(unit)}</span></div>`;
  if(root.ownerDocument)mountControlHelp(root.ownerDocument,root);
}
