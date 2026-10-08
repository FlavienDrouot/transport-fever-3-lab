const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Same result card for railway and road services, including tied winners.
export function renderServiceSummary(root,{names=[],cost,unit,emptyMessage}) {
  if(!names.length||!Number.isFinite(cost)){
    root.textContent=emptyMessage;
    return;
  }
  const formatted=cost.toLocaleString('en-GB',{maximumFractionDigits:2});
  root.innerHTML=`<div class="service-winner"><span class="service-winner-label">Lowest running cost <button class="control-info" type="button" title="This compares maintenance per transported unit at the specified demand or utilization. It does not predict demand or include purchase costs, infrastructure or revenue." aria-label="Help: Lowest running cost">ⓘ</button></span><strong>${names.map(escape).join(' / ')}</strong></div><div class="service-winner-cost"><strong>$${formatted}</strong><span>per ${escape(unit)}</span></div>`;
}
