import {UI_TERMS as T} from './ui-terms.js';
import {escapeHtml,formatNumber,formatTime,formatDuration} from './format.js';
import {RAIL_TERMINAL_ASSUMPTIONS} from './rail-terminal-service.js';

const fmt=(n,d=1)=>formatNumber(n,d,true),money=n=>`$${fmt(n,0)}`;
const VISIBLE_POWERED_MODELS=5;

function terminalSummary(result,category){
  if(!result.infrastructure)return '';
  return `<div class="optimizer-infra-summary">${['stopA','stopB'].map((stop,index)=>{
    const plan=result.infrastructure[stop];
    const estimate=result.terminalEstimates?.[stop];
    const places=estimate?` · ${fmt(plan.platformTrackCount,0)} platform track${plan.platformTrackCount===1?'':'s'} · ${fmt(plan.platformCount,0)} platform${plan.platformCount===1?'':'s'} · entry ${formatDuration(estimate.entrySeconds)} + stop ${formatDuration(estimate.stopSeconds)} + exit ${formatDuration(estimate.exitSeconds)} · ${T.frequency} ≥ ${formatDuration(estimate.minHeadwaySeconds)} without waiting · max ${fmt(estimate.maxTrainsPerSecond*60,2)} trains/min`:
      result.domain==='road'&&plan.vehicleSlots!==undefined?` · ${fmt(plan.vehicleSlots,0)} simultaneous vehicle place${plan.vehicleSlots===1?'':'s'}${result.stopOccupancy?` · ${formatDuration(result.stopOccupancy[stop])} occupied per visit`:''}${result.stopWaiting?` · ${fmt(result.stopWaiting[stop],1)} s estimated mean wait`:''}${result.stopMaxVehiclesPerSecond?.[stop]!=null?` · max ${fmt(result.stopMaxVehiclesPerSecond[stop]*60,2)} vehicles/min`:''}`:'';
    return `<p class="chart-help"><strong>${index===0?'A':'B'} · ${escapeHtml(plan.name)}</strong>${!plan.mode?` · ${plan.existing?'Existing':'Proposed'}`:''}${result.domain==='rail'?` · ${plan.platformExtended?`extend ${fmt(plan.existingLength)} → `:''}${fmt(plan.maxTrainLength)} m`:plan.factoryTerminals?` · ${fmt(plan.factoryTerminals,0)} parallel terminals · 1 vehicle each`:(plan.mode?plan.mode!=='factory':plan.siteType!=='factory')&&plan.platformCount?` · ${fmt(plan.platformCount,0)} ${plan.platformCount>1?'parallel ':''}platform${plan.platformCount===1?'':'s'}${plan.platformLengths?` · ${plan.platformLengths.map(length=>`${fmt(length,0)} m`).join(' + ')}`:''}${plan.platformExtended?' · extend existing platform':''}${plan.mode==='reuse'&&plan.addedPlatformCount?` · add ${fmt(plan.addedPlatformCount,0)} parallel`:''}`:''} · ${money(plan.annualMaintenance)}/year attributed${category==='freight'?` · ${plan.specializedTerminal?'Terminal ×2':''}${plan.specializedTerminal&&plan.specializedWarehouse?' + ':''}${plan.specializedWarehouse?'Warehouse ×2':''}${!plan.specializedTerminal&&!plan.specializedWarehouse?'Standard handling':''}`:''}${plan.warehouseCapacity?` · ${plan.warehouseExpanded?'Expand warehouse to':'Warehouse'} ${fmt(plan.warehouseCapacity,0)} ${T.capacityUnit} · ${plan.specializedWarehouse?'specialized':'generic'}`:''}${places}</p>`;
  }).join('')}${result.terminalEstimates?`<p class="chart-help">${RAIL_TERMINAL_ASSUMPTIONS}</p>`:''}</div>`;
}

function routeSummary(result){
  if(!result.routeInfrastructure)return '';
  return `<details class="optimizer-infra-summary"><summary>Selected ${result.domain==='rail'?'track':result.vehicleType==='Tram'?'tram':'road'} tiers${result.routeInfrastructure.costsIncluded===false?' · route upkeep excluded':` · ${money(result.routeRunningCosts)}/year`}</summary><ol>${result.routeInfrastructure.segments.map(part=>`<li>${fmt(part.distanceKm,4)} km · ${part.tramInfrastructure==='dedicated'?'Dedicated tram tracks · ':part.tramInfrastructure==='road'?'Road tram tracks · ':''}${part.city?'City · ':''}${part.tierSpeedKmh} km/h tier${part.trackCount?` · ${part.trackCount} track${part.trackCount===1?'':'s'}`:''}${part.roadLanes?` · ${part.roadLanes} lanes`:''}${part.speedLimitKmh<part.tierSpeedKmh?` · ${part.speedLimitKmh} km/h limit`:''} · ${money(part.annualMaintenance)}/year</li>`).join('')}</ol>${result.domain==='rail'?'<p class="chart-help">Auto uses one track for a one-train service, otherwise two tracks, one per direction. Passing loops and signal capacity are not modeled.</p>':''}</details>`;
}

function proposal(r,index,category,group=null,wagon=null,selected=false){
  const domain=r.domain;
  return `<article class="optimizer-proposal">${selected?'<p class="chart-help optimizer-selected-label">Selected configuration</p>':''}<div class="optimizer-proposal-top">${selected?'':`<span class="optimizer-rank">${index+1}</span>`}<h4>${escapeHtml(r.name)}</h4><strong>${money(r.cost)}/year</strong></div><p class="chart-help">${escapeHtml(r.parts.map(p=>`${p.quantity} × ${p.name}`).join(' + '))}${Number.isFinite(r.length)?` · ${fmt(r.length)} m`:''}</p>${terminalSummary(r,category)}<dl class="optimizer-metrics">${[
    ['Fleet',`${fmt(r.fleet,0)} ${domain==='rail'?'trains':'vehicles'}`],[T.capacity,`${fmt(r.capacity,0)} ${T.capacityUnit}`],
    [T.rate,`${fmt(r.rate,0)} ${T.capacityUnit}/year${category==='passengers'?'/direction':''}`],
    [T.frequency,formatDuration(r.frequency)],[T.utilization,`${fmt(r.utilization*100)}%`],['Leg time A→B / B→A',`${formatTime(r.outboundTravelSeconds)} / ${formatTime(r.returnTravelSeconds)}`],['Round trip',formatTime(r.cycle)],
    ...(r.infrastructure||r.routeInfrastructure?[[`${T.runningCosts} · vehicles`,`${money(r.vehicleRunningCosts)}/year`]]:[]),
    ...(r.routeInfrastructure?[[`${T.runningCosts} · route`,`${money(r.routeRunningCosts)}/year`]]:[]),
    ...(r.infrastructure?[[`${T.runningCosts} · stops`,`${money(r.terminalRunningCosts??r.infrastructureRunningCosts)}/year`]]:[]),
    [`${T.runningCosts} / capacity${r.infrastructure||r.routeInfrastructure?' · total':''}`,`${money(r.unitCost)}`]
  ].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>${routeSummary(r)}<button type="button" data-domain="${domain}" data-result="${index}"${group===null?'':` data-group="${group}" data-wagon="${wagon}"`}>${domain==='rail'?'Open composition':'Compare service'} ↗</button>${domain==='road'&&r.definition?`<button type="button" data-open="composition" data-domain="${domain}" data-result="${index}"${group===null?'':` data-group="${group}" data-wagon="${wagon}"`}>Edit composition ↗</button>`:''}</article>`;
}

const configuration=result=>result.parts.map(part=>`${part.quantity} × ${part.name}`).join(' + ');
function variantRow(result,g,w,i,{kind='variant',name=configuration(result),expand=false,controls=''}={}){
  const selected=g===0&&w===0&&i===0,domain=result.domain,prefix=domain==='rail'?'':`${domain}-`;
  const title=expand?`<button type="button" ${kind==='powered'?'data-powered-toggle':'data-wagon-toggle'} data-domain="${domain}" data-group="${g}" data-wagon="${w}" aria-expanded="false" aria-controls="${controls}"><span data-disclosure-icon aria-hidden="true">▸</span> <span>${escapeHtml(name)}</span> <span data-disclosure-label class="optimizer-row-action">Expand</span></button>`:escapeHtml(name);
  return `<tr class="optimizer-${kind}-row" data-expandable="${expand}" title="${expand?'Click this row to expand variants':'Click this row to select this configuration'}"${kind==='powered'?'':` data-powered-member="${g}"${kind==='variant'?` data-wagon-member="${w}"`:''} hidden`} id="optimizer-variant-${prefix}${g}-${w}-${i}-${kind}"><th scope="row"><span class="optimizer-configuration-title">${title}</span>${kind==='variant'?'':`<small>${escapeHtml(configuration(result))}</small>`}</th><td>${fmt(result.length)}</td><td>${fmt(result.fleet,0)}</td><td>${fmt(result.capacity,0)}</td><td>${formatDuration(result.frequency)}</td><td>${formatTime(result.outboundTravelSeconds)} / ${formatTime(result.returnTravelSeconds)}</td><td class="optimizer-cost-cell">${money(result.cost)}</td><td class="optimizer-select-cell"><button type="button" data-select-proposal data-domain="${domain}" data-group="${g}" data-wagon="${w}" data-result="${i}" aria-pressed="${selected}" aria-label="Select ${escapeHtml(configuration(result))}">${selected?'Selected':'Select'}</button></td></tr>`;
}

export function renderSelectedOptimizerProposal(answer,selection={domain:'rail',group:'0',wagon:'0',result:'0'}){
  const result=optimizerProposalAt(answer,selection);
  return result?proposal(result,Number(selection.result),answer.request.category,Number(selection.group),Number(selection.wagon),true):'';
}

/** One detail card, with an always-visible grouped comparison table below it. */
export function renderOptimizerProposals(answer,domain){
  const category=answer.request.category,groups=answer.groups?.[domain],prefix=domain==='rail'?'':`${domain}-`;
  if(!groups)return answer.best[domain].map((r,i)=>proposal(r,i,category)).join('');
  const rows=groups.map((group,g)=>{
    const best=group.wagons[0].variants[0];
    const locomotive=group.role==='locomotive'||group.wagons.some(wagon=>wagon.id!=='trainsets');
    const rowIds=locomotive?group.wagons.map((wagon,w)=>`optimizer-variant-${prefix}${g}-${w}-0-wagon`):group.wagons[0].variants.slice(1).map((r,i)=>`optimizer-variant-${prefix}${g}-0-${i+1}-variant`);
    const header=variantRow(best,g,0,0,{kind:'powered',name:domain==='road'?`${group.name} · ${group.vehicleType??'Vehicle'}`:group.vehicleType==='Tram'?`${group.name} · Tram`:group.name,expand:rowIds.length>0,controls:rowIds.join(' ')});
    const contents=group.wagons.map((wagon,w)=>{
      const variants=wagon.variants.slice(1).map((r,i)=>variantRow(r,g,w,i+1)).join('');
      if(!locomotive)return variants;
      const controls=wagon.variants.slice(1).map((r,i)=>`optimizer-variant-${prefix}${g}-${w}-${i+1}-variant`).join(' ');
      return variantRow(wagon.variants[0],g,w,0,{kind:'wagon',name:wagon.name,expand:wagon.variants.length>1,controls})+variants;
    }).join('');
    return `<tbody data-powered-group="${g}"${g>=VISIBLE_POWERED_MODELS?' hidden':''}>${header}${contents}</tbody>`;
  }).join('');
  const count=groups.reduce((sum,group)=>sum+group.wagons.reduce((n,wagon)=>n+wagon.variants.length,0),0);
  const visible=Math.min(VISIBLE_POWERED_MODELS,groups.length),more=Math.min(VISIBLE_POWERED_MODELS,groups.length-visible);
  return `<div data-selected-${domain}>${renderSelectedOptimizerProposal(answer,{domain,group:'0',wagon:'0',result:'0'})}</div><section class="optimizer-variants" aria-labelledby="optimizer-${prefix}variants-heading" data-visible-models="${visible}"><h4 id="optimizer-${prefix}variants-heading">Compare ${domain==='rail'?'train':answer.request.includeTrams?'Road + Tram':'Road'} configurations · ${fmt(count,0)} variants</h4><p class="chart-help">Click a row to expand its variants, or select it if there are no variants. Select always displays that row's configuration above. Ordered by total Running costs.</p><div class="optimizer-variants-content"><div class="optimizer-variants-scroll" tabindex="0" role="region" aria-label="${domain==='rail'?'Train':'Road + Tram'} configuration comparison"><table id="optimizer-${prefix}variants-table" class="optimizer-variants-table"><colgroup><col class="optimizer-configuration-column"><col class="optimizer-length-column"><col class="optimizer-fleet-column"><col class="optimizer-capacity-column"><col class="optimizer-frequency-column"><col class="optimizer-leg-column"><col class="optimizer-cost-column"><col class="optimizer-select-column"></colgroup><thead><tr>${['Configuration','Length (m)',domain==='rail'?'Fleet (trains)':'Fleet (vehicles)',T.capacity,T.frequency,'Leg time A→B / B→A',`${T.runningCosts}/year`,'Selection'].map((label,i)=>`<th scope="col"${i===6?' class="optimizer-cost-cell"':i===7?' class="optimizer-select-cell"':''}>${label}</th>`).join('')}</tr></thead>${rows}</table></div><div class="optimizer-variants-more"><span data-model-count role="status">Showing ${visible} of ${groups.length} models</span><button type="button" data-more-proposals aria-controls="optimizer-${prefix}variants-table"${more?'':' hidden'}>Show ${more} more</button></div></div></section>`;
}

export function showMoreOptimizerProposals(button){
  const section=button.closest('.optimizer-variants'),groups=[...section.querySelectorAll('[data-powered-group]')];
  const current=Number(section.dataset.visibleModels);
  const visible=current<=VISIBLE_POWERED_MODELS?Math.min(current+VISIBLE_POWERED_MODELS,groups.length):groups.length;
  section.dataset.visibleModels=String(visible);
  groups.forEach((group,index)=>{group.hidden=index>=visible;});
  section.querySelector('[data-model-count]').textContent=`Showing ${visible} of ${groups.length} models`;
  button.hidden=visible===groups.length;button.textContent='Show all';
}

/** A visual header outside horizontal overflow can stick to the page viewport.
 * Keep the original thead for accessibility and synchronize horizontal movement.
 */
export function mountStickyOptimizerHeaders(root){
  for(const scroll of root.querySelectorAll('.optimizer-variants-scroll')){
    const table=scroll.querySelector('table'),document=scroll.ownerDocument;
    const header=document.createElement('div'),viewport=document.createElement('div');
    header.className='optimizer-variants-header';header.setAttribute('aria-hidden','true');
    viewport.className='optimizer-variants-header-scroll';
    const copy=table.cloneNode(false);copy.removeAttribute('id');copy.setAttribute('role','presentation');
    copy.append(table.querySelector('colgroup').cloneNode(true),table.tHead.cloneNode(true));
    viewport.append(copy);header.append(viewport);scroll.before(header);
    const sync=()=>{viewport.scrollLeft=scroll.scrollLeft;};
    scroll.addEventListener('scroll',sync,{passive:true});sync();
  }
}

export function toggleOptimizerProposalRows(root,button){
  root=button.closest('.optimizer-variants')??root;
  const group=button.dataset.group,open=button.getAttribute('aria-expanded')!=='true';
  button.setAttribute('aria-expanded',String(open));button.querySelector('[data-disclosure-icon]').textContent=open?'▾':'▸';
  button.querySelector('[data-disclosure-label]').textContent=open?'Collapse':'Expand';
  button.closest('tr').title=open?'Click this row to collapse variants':'Click this row to expand variants';
  if(button.hasAttribute('data-powered-toggle')){
    for(const row of root.querySelectorAll(`[data-powered-member="${group}"]`)){
      const wagon=button.closest('tbody').querySelector(`[data-wagon-toggle][data-wagon="${row.dataset.wagonMember}"]`);
      row.hidden=!open||(row.dataset.wagonMember!==undefined&&wagon?.getAttribute('aria-expanded')!=='true'&&wagon!==null);
    }
  }else for(const row of root.querySelectorAll(`[data-powered-member="${group}"][data-wagon-member="${button.dataset.wagon}"]`))row.hidden=!open;
}

export function optimizerProposalAt(answer,{domain,group,wagon,result}){
  return group!==undefined?answer.groups?.[domain]?.[Number(group)]?.wagons[Number(wagon)]?.variants[Number(result)]:answer.best[domain]?.[Number(result)];
}
