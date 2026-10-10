import {durationInputs,durationSeconds,enableDurationInputs,bindDurationInputs} from './duration-controls.js';
import {OPTIMIZER_DEFAULTS,OPTIMIZER_MAX_TRAIN_LENGTH,optimizerRequest} from './optimizer.js';
import {UI_TERMS as T} from './ui-terms.js';
import {ROAD_TRAVEL_TIME_WARNING} from './road-limitations.js';
import {formatNumber} from './format.js';
import {mountTransportCategory,mountFreightFilter} from './transport-category.js';
import {renderFreightFacilities} from './service-controls.js';
import {mountOptimizerInfrastructure} from './optimizer-infrastructure-controls.js';
import {mountOptimizerLineInfrastructure} from './optimizer-line-controls.js';
import {optimizerProposalRequest} from './optimizer-infrastructure.js';
import {renderOptimizerConstraints} from './optimizer-constraints.js';
import {routeProfileSketch} from './route-profile-control.js';
import {optimizerExclusionSummary} from './optimizer-diagnostics.js';
import {renderOptimizerProposals,renderSelectedOptimizerProposal,toggleOptimizerProposalRows,showMoreOptimizerProposals,optimizerProposalAt,mountStickyOptimizerHeaders} from './optimizer-proposals.js';

export function mountOptimizer(root,{getRoute,getCatalogue,onOpen,summaryRoot,onRouteChange}){
  bindDurationInputs(root.ownerDocument);
  const railBounds=['maxTrainLength','maxLocomotives','maxWagons'];
  const number=(key,label,unit,min,max,step='1')=>`<label class="optimizer-field"${railBounds.includes(key)?' data-optimizer-rail-bound':''}>${label}<span><input name="${key}" type="number" value="${OPTIMIZER_DEFAULTS[key]}" min="${min}" max="${max}" step="${step}" required> ${unit}</span></label>`;
  root.innerHTML=`<div class="optimizer-layout"><div class="optimizer-main"><div class="optimizer-setup"><div class="optimizer-route-context"><h3>Route &amp; infrastructure</h3><div id="optimizer-route-slot"></div><div id="optimizer-infrastructure-control"></div></div><form id="optimizer-form" class="panel-group"><div class="panel-group-body">
    <h3>What service do you need?</h3>
    <fieldset id="optimizer-domain" class="scale-toggle"><legend>Search vehicles</legend>${[['both','Rail + Road'],['rail','Rail only'],['road','Road only']].map(([value,label])=>`<label><input type="radio" name="domain" value="${value}"${value==='both'?' checked':''}><span>${label}</span></label>`).join('')}</fieldset>
    <fieldset id="optimizer-category" class="scale-toggle"></fieldset><fieldset id="optimizer-cargo" class="scale-toggle"></fieldset>
    <p id="optimizer-cargo-help" class="chart-help" hidden>All freight selects general-purpose vehicles; it does not combine different commodities.</p>
    <div class="optimizer-fields optimizer-service-fields">${number('rate',T.rate,'<span id="optimizer-rate-unit">capacity/year/direction</span>',1,1e9)}
    <label class="optimizer-field">${T.utilization} · ceiling <span><input name="utilization" type="number" min="1" max="100" step="1" value="100" required> %</span></label>
    ${[['enableFrequency','minutes',`${T.frequency} · maximum interval`,OPTIMIZER_DEFAULTS.maxHeadwaySeconds,300],['enableMinimumFrequency','minMinutes',`${T.frequency} · minimum interval`,OPTIMIZER_DEFAULTS.minHeadwaySeconds,30],['enableMaxOutboundLeg','outboundMinutes','Max leg time A→B',OPTIMIZER_DEFAULTS.maxOutboundLegSeconds,600],['enableMaxReturnLeg','returnMinutes','Max leg time B→A',OPTIMIZER_DEFAULTS.maxReturnLegSeconds,600]].map(([toggle,name,label,value,fallback])=>`<div class="optimizer-field"><label><input name="${toggle}" type="checkbox"${value!==null?' checked':''}> ${label}</label>${durationInputs({id:`optimizer-${name}`,name,label,value:value??fallback,disabled:value===null})}</div>`).join('')}
    <p class="chart-help optimizer-leg-help">Leg times include acceleration and any modeled braking; stop handling is excluded.</p>
    </div>
    <p class="chart-help">Meet the Rate with whole vehicles, within the enabled intervals between departures and the Utilization ceiling.</p>
    <div id="optimizer-loaded-return" hidden><label class="road-inline-check"><input name="loadedReturn" type="checkbox"> Loaded return</label></div>
    <details id="optimizer-handling" class="panel-group" hidden><summary>Freight handling &amp; facilities</summary><div class="panel-group-body"><div class="road-stop-grid">${renderFreightFacilities({terminalA:'optimizer-terminal-a',warehouseA:'optimizer-warehouse-a',terminalB:'optimizer-terminal-b',warehouseB:'optimizer-warehouse-b'})}</div></div></details>
    <details class="panel-group"><summary>Year &amp; search bounds</summary><div class="panel-group-body"><label><input name="ignoreRetirements" type="checkbox"${OPTIMIZER_DEFAULTS.ignoreRetirements?' checked':''}> Ignore retirements</label><label id="optimizer-mu-coupling"><input name="identicalMUsOnly" type="checkbox"${OPTIMIZER_DEFAULTS.identicalMUsOnly?' checked':''}> Couple MUs only with identical units</label><p id="optimizer-mu-coupling-help" class="chart-help">Applies to complete trainsets and powered trams. Uncheck to allow added wagons and mixed light-rail trams. Different classical Rail MU models are not combined.</p><div class="optimizer-fields">
      ${number('year','Game year','',1850,2035)}${number('maxTrainLength','Maximum train length','m',1,OPTIMIZER_MAX_TRAIN_LENGTH)}${number('maxLocomotives','Locomotives per train · at most','',1,8)}${number('maxWagons','Wagons per train · at most','',1,100)}${number('maxRoadTramLength','Maximum Road tram length','m',1,OPTIMIZER_MAX_TRAIN_LENGTH)}${number('maxFleet','Fleet size · at most','vehicles',1,100000)}
    </div><p class="chart-help">Search vehicles introduced by the game year. Ignore retirements is enabled by default; uncheck it to respect the source catalogue's retirement dates. Save/mod overrides are not read.</p><p class="chart-help">Rail: identical complete trainsets, with optional wagons, or one locomotive model with one wagon model. The locomotive count applies only to locomotive + wagon formations; repeated trainsets are limited by platform length. Nine confirmed light-rail trams are also searched as whole units, with mixed formations when identical-only coupling is disabled; they cannot mix with railway stock. Road: buses or trucks, plus optional complete/coupled trams and tram locomotive or ordinary powered tram + wagon formations. Road tram length has a separate practical limit (80 m by default), including dedicated tram tracks; it does not limit Rail-compatible trams in Rail search. Saved recipes are not searched.</p></div></details>
    <p id="optimizer-rail-search-limit" class="chart-help" hidden>Rail platforms are limited to ${OPTIMIZER_MAX_TRAIN_LENGTH} m in the game. Lower limits at either stop also constrain train length.</p>
    <div class="optimizer-actions"><button type="submit" class="optimizer-primary">Find solutions</button><button type="button" id="optimizer-cancel" hidden>Cancel</button></div>
    <p id="optimizer-status" role="status" aria-live="polite" class="chart-help">Minimize Running costs while meeting your service goals.</p>
  </div></form></div><div id="optimizer-results" class="optimizer-results"></div></div>${summaryRoot?'':'<aside class="optimizer-constraints" aria-labelledby="optimizer-constraints-heading"></aside>'}</div>`;
  root.querySelector('#optimizer-infrastructure-control').insertAdjacentHTML('beforebegin','<div id="optimizer-line-control"></div>');
  const sidebar=summaryRoot??root.querySelector('.optimizer-constraints');
  sidebar.innerHTML='<details id="optimizer-constraints-disclosure" open><summary id="optimizer-constraints-heading">Your constraints</summary><div id="optimizer-constraints-summary"></div></details>';
  const overview=root.previousElementSibling;
  if(overview?.classList.contains('panel-top'))root.querySelector('.optimizer-main').prepend(overview);
  const form=root.querySelector('form'),field=name=>form.elements.namedItem(name),$=id=>root.querySelector(`#${id}`)??sidebar.querySelector(`#${id}`),status=$('optimizer-status'),results=$('optimizer-results');
  let category='passengers',worker=null,job=0,completed=null,infrastructureControl=null,lineControl=null,routeKey=JSON.stringify(getRoute());
  mountTransportCategory($('optimizer-category'),{value:category,onChange:value=>{category=value;syncCategory();invalidate();}});
  mountFreightFilter($('optimizer-cargo'));syncCategory();
  const stopValues=stop=>({specializedTerminal:$(`optimizer-terminal-${stop}`).checked,specializedWarehouse:$(`optimizer-warehouse-${stop}`).checked});
  infrastructureControl=mountOptimizerInfrastructure($('optimizer-infrastructure-control'),{getScope:()=>({domain:field('domain').value,category,loadedReturn:field('loadedReturn').checked,maxTrainLength:Number(field('maxTrainLength').value),stopA:stopValues('a'),stopB:stopValues('b')}),onChange:()=>{syncInfrastructure();invalidate();}});
  lineControl=mountOptimizerLineInfrastructure($('optimizer-line-control'),{getRoute,getScope:()=>({domain:field('domain').value,year:Number(field('year').value)}),onRouteChange,onChange:()=>{syncInfrastructure();invalidate();}});
  syncInfrastructure();
  function syncCategory(){
    for(const id of ['optimizer-cargo','optimizer-cargo-help','optimizer-loaded-return'])$(id).hidden=category!=='freight';
    $('optimizer-rate-unit').textContent=`${T.capacityUnit}/year${category==='passengers'?'/direction':''}`;
    syncInfrastructure();
  }
  function syncInfrastructure(){
    infrastructureControl?.refresh();
    lineControl?.refresh();
    $('optimizer-handling').hidden=category!=='freight'||(infrastructureControl?.isEnabled()??false);
    const infrastructureEnabled=infrastructureControl?.isEnabled()??false;
    for(const label of form.querySelectorAll('[data-optimizer-rail-bound]')){label.hidden=field('domain').value==='road'&&!lineControl?.includeTrams();label.querySelector('input').disabled=label.hidden;}
    const length=field('maxTrainLength');length.closest('label').hidden=field('domain').value==='road'||infrastructureEnabled;length.disabled=length.closest('label').hidden;
    const coupling=field('identicalMUsOnly');coupling.disabled=field('domain').value==='road'&&!lineControl?.includeTrams();$('optimizer-mu-coupling').hidden=coupling.disabled;$('optimizer-mu-coupling-help').hidden=coupling.disabled;
    const tramLength=field('maxRoadTramLength');tramLength.closest('label').hidden=!lineControl?.includeTrams();tramLength.disabled=tramLength.closest('label').hidden;
    $('optimizer-rail-search-limit').hidden=field('domain').value==='road'||!infrastructureEnabled;
  }
  function busy(value){form.querySelector('[type="submit"]').disabled=value;$('optimizer-cancel').hidden=!value;}
  function stop(){job++;worker?.terminate();worker=null;busy(false);}
  function invalidate(){
    const hadResult=completed!==null,wasBusy=!$('optimizer-cancel').hidden;stop();completed=null;
    if(hadResult||wasBusy){results.replaceChildren();status.textContent='Settings changed. Find solutions again to update the proposals.';}
    updateConstraints();
  }
  function updateConstraints(){
    renderOptimizerConstraints($('optimizer-constraints-summary'),{
      domain:field('domain').value,includeTrams:lineControl?.includeTrams()??false,category,cargo:$('optimizer-cargo').querySelector('input:checked').value,route:lineControl?.getRoute()??getRoute(),lineInfrastructure:lineControl?.getValue(),
      ...Object.fromEntries(['rate','utilization','year',...railBounds,'maxRoadTramLength','maxFleet'].map(name=>[name,field(name).valueAsNumber])),
      maxHeadwaySeconds:field('enableFrequency').checked?durationSeconds(field('minutes'),field('minutesSeconds')):null,
      minHeadwaySeconds:field('enableMinimumFrequency').checked?durationSeconds(field('minMinutes'),field('minMinutesSeconds')):null,
      maxOutboundLegSeconds:field('enableMaxOutboundLeg').checked?durationSeconds(field('outboundMinutes'),field('outboundMinutesSeconds')):null,
      maxReturnLegSeconds:field('enableMaxReturnLeg').checked?durationSeconds(field('returnMinutes'),field('returnMinutesSeconds')):null,
      identicalMUsOnly:field('identicalMUsOnly').checked,ignoreRetirements:field('ignoreRetirements').checked,loadedReturn:field('loadedReturn').checked,
      stopA:stopValues('a'),stopB:stopValues('b'),infrastructure:infrastructureControl.getValue(),
      incompleteInfrastructure:[...root.querySelectorAll('[data-reusable-entry]')].filter(entry=>!entry.hidden&&(['stop','domain'].some(key=>!entry.querySelector(`[data-infrastructure-field=${key}]:checked`))||!entry.querySelector('[data-entry-type]').hidden&&!entry.querySelector('[data-infrastructure-field=kind]:checked'))).length
    });
    renderRoutePreview();
  }
  function renderRoutePreview(){
    const preview=$('optimizer-route-preview');
    if(preview)preview.innerHTML=routeProfileSketch(getRoute(),{scale:'linear',compact:true,availableWidth:preview.clientWidth||400});
  }
  function request(){
    const domain=field('domain').value;
    const values=Object.fromEntries(['rate','year',...railBounds,'maxRoadTramLength','maxFleet'].map(name=>[name,field(name).disabled?OPTIMIZER_DEFAULTS[name]:Number(field(name).value)]));
    if(domain!=='road'&&infrastructureControl.isEnabled())values.maxTrainLength=OPTIMIZER_MAX_TRAIN_LENGTH;
    return optimizerRequest({...values,domain,identicalMUsOnly:field('identicalMUsOnly').disabled?OPTIMIZER_DEFAULTS.identicalMUsOnly:field('identicalMUsOnly').checked,includeTrams:lineControl.includeTrams(),ignoreRetirements:field('ignoreRetirements').checked,category,cargo:$('optimizer-cargo').querySelector('input:checked').value,
      minHeadwaySeconds:field('enableMinimumFrequency').checked?durationSeconds(field('minMinutes'),field('minMinutesSeconds')):null,
      maxOutboundLegSeconds:field('enableMaxOutboundLeg').checked?durationSeconds(field('outboundMinutes'),field('outboundMinutesSeconds')):null,
      maxReturnLegSeconds:field('enableMaxReturnLeg').checked?durationSeconds(field('returnMinutes'),field('returnMinutesSeconds')):null,
      maxHeadwaySeconds:field('enableFrequency').checked?durationSeconds(field('minutes'),field('minutesSeconds')):null,fillRatio:Number(field('utilization').value)/100,
      loadedReturn:field('loadedReturn').checked,stopA:stopValues('a'),stopB:stopValues('b'),infrastructure:infrastructureControl.getValue(),lineInfrastructure:lineControl.getValue(),routeProfile:lineControl.getRoute()});
  }
  const fmt=(n,d=1)=>formatNumber(n,d,true);
  function show(answer){
    completed=answer;
    const domains=answer.request.domain==='both'?['rail','road']:[answer.request.domain];
    results.classList.toggle('optimizer-results-single',domains.length===1);
    status.textContent=`Searched ${fmt(answer.stats.tested,0)} designs · ${domains.map(domain=>`${fmt(answer.stats.feasible[domain],0)} feasible ${domain==='rail'?'Rail':'Road'}`).join(' · ')}. Best within the displayed search bounds.`;
    const visibility=domains.length===2?`<fieldset class="scale-toggle optimizer-result-visibility"><legend>Show results</legend>${domains.map(domain=>`<label><input type="checkbox" data-result-visibility value="${domain}" aria-controls="optimizer-${domain}-results" checked><span>${domain==='rail'?'Rail':answer.request.includeTrams?'Road + Tram':'Road'}</span></label>`).join('')}</fieldset>`:'';
    results.classList.remove('optimizer-results-hidden');
    results.innerHTML=visibility+domains.map(domain=>`<section id="optimizer-${domain}-results" data-result-domain="${domain}" aria-labelledby="optimizer-${domain}-heading"><div class="optimizer-result-heading"><h3 id="optimizer-${domain}-heading">${domain==='rail'?'Rail':answer.request.includeTrams?'Road + Tram':'Road'}</h3>${domain==='road'?`<p class="scale-note">${ROAD_TRAVEL_TIME_WARNING} Road braking is not included in the calculations.</p>`:''}</div>${answer.best[domain].length?renderOptimizerProposals(answer,domain):`<div class="optimizer-no-results"><p>No feasible ${domain==='rail'?'train':'road vehicle'} within these bounds.</p>${optimizerExclusionSummary(answer,domain)}</div>`}</section>`).join('');
    mountStickyOptimizerHeaders(results);
    const hasProposals=domains.some(domain=>answer.best[domain].length);
    if(hasProposals&&(answer.request.minHeadwaySeconds!==null||answer.request.maxOutboundLegSeconds!==null||answer.request.maxReturnLegSeconds!==null))results.insertAdjacentHTML('beforeend','<p class="chart-help optimizer-result-note">The minimum interval and directional leg time limits are search constraints. Recheck them after editing a proposal in Compare or Composition.</p>');
    if(hasProposals&&(answer.request.lineInfrastructure||domains.some(domain=>answer.best[domain].some(r=>r.routeInfrastructure))))results.insertAdjacentHTML('beforeend','<p class="chart-help optimizer-result-note">Opening a proposal applies its selected segment speed limits. Route upkeep is included only when enabled; Compare and Composition show vehicle costs only.</p>');
    if(hasProposals&&answer.request.infrastructure)results.insertAdjacentHTML('beforeend',`<p class="chart-help optimizer-result-note">Infrastructure costs include only new installations and allowed upgrades. Existing upkeep is excluded. Rail platform tracks and Road geometry are chosen within your limits. ${answer.request.domain!=='rail'?'Road throughput and mean waiting assume regular arrivals and independent parallel accesses; cycle time includes waiting and 5 s maneuvering per visit. Traffic and queue propagation between stops are not simulated. ':''}Opening a proposal applies its handling bonuses, train length limit and storage-based Utilization ceiling; Compare and Composition show vehicle costs only and do not enforce terminal throughput or Road waiting estimates. Recheck terminal and storage constraints after editing.</p>`);
  }
  root.addEventListener('input',event=>{if(event.target.closest('#optimizer-route-slot'))invalidate();});
  root.addEventListener('toggle',event=>{if(event.target.id==='train-race-settings'&&event.target.open)renderRoutePreview();},true);
  form.addEventListener('input',()=>{
    for(const [name,toggle] of [['minutes','enableFrequency'],['minMinutes','enableMinimumFrequency'],['outboundMinutes','enableMaxOutboundLeg'],['returnMinutes','enableMaxReturnLeg']])enableDurationInputs(field(name),field(`${name}Seconds`),field(toggle).checked);
    for(const label of form.querySelectorAll('[data-optimizer-rail-bound]')){label.hidden=field('domain').value==='road'&&!lineControl.includeTrams();label.querySelector('input').disabled=label.hidden;}
    syncInfrastructure();
    invalidate();
  });
  $('optimizer-cancel').addEventListener('click',()=>{stop();status.textContent='Search cancelled. Adjust your settings or try again.';});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const invalidRoute=[...$('optimizer-route-slot').querySelectorAll('input')].find(input=>!input.disabled&&!input.checkValidity());
    if(invalidRoute){invalidRoute.reportValidity();status.textContent='Check the route settings before searching.';return;}
    if(!infrastructureControl.reportValidity()){status.textContent='Check terminal access and infrastructure limits before searching.';return;}
    if(!form.reportValidity())return;
    stop();results.replaceChildren();completed=null;
    const token=job;let input;
    try{
      input=request();busy(true);status.textContent='Loading vehicle data…';
      const catalogue=await getCatalogue(input);if(token!==job)return;
      worker=new Worker(new URL('./optimizer-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{
        if(token!==job)return;
        if(data.type==='progress')status.textContent=`Searching… ${fmt(data.tested,0)} designs · ${fmt(data.feasible,0)} feasible. You can cancel or change settings.`;
        else if(data.type==='complete'){stop();show(data.result);}
        else if(data.type==='error'){stop();status.textContent=`Search failed: ${data.message} Try again after checking the route and bounds.`;}
      };
      worker.onerror=()=>{if(token===job){stop();status.textContent='Search could not run. Reload the page and try again.';}};
      worker.postMessage({catalogue,request:input});
    }catch(error){if(token!==job)return;stop();status.textContent=`Search failed: ${error.message}`;}
  });
  results.addEventListener('change',event=>{
    const toggle=event.target.closest('[data-result-visibility]');if(!toggle)return;
    results.querySelector(`[data-result-domain="${toggle.value}"]`).hidden=!toggle.checked;
    const visible=results.querySelectorAll('[data-result-domain]:not([hidden])').length;
    results.classList.toggle('optimizer-results-single',visible<2);
    results.classList.toggle('optimizer-results-hidden',visible===0);
  });
  results.addEventListener('click',async event=>{
    const more=event.target.closest('[data-more-proposals]');
    if(more){showMoreOptimizerProposals(more);return;}
    const row=event.target.closest('.optimizer-variants-table tbody tr');
    let button=event.target.closest('[data-result]');
    const toggle=event.target.closest('[data-powered-toggle],[data-wagon-toggle]')??(!button&&row?.querySelector('[data-powered-toggle],[data-wagon-toggle]'));
    if(toggle){toggleOptimizerProposalRows(results,toggle);return;}
    button??=row?.querySelector('[data-select-proposal]');if(!button||!completed)return;
    const answer=completed,proposal=optimizerProposalAt(answer,button.dataset);if(!proposal)return;button.disabled=true;
    if(button.hasAttribute('data-select-proposal')){
      results.querySelector(`[data-selected-${button.dataset.domain}]`).innerHTML=renderSelectedOptimizerProposal(answer,button.dataset);
      for(const choice of results.querySelectorAll(`[data-select-proposal][data-domain="${button.dataset.domain}"]`)){
        const selected=['domain','group','wagon','result'].every(key=>choice.dataset[key]===button.dataset[key]);
        choice.setAttribute('aria-pressed',String(selected));choice.textContent=selected?'Selected':'Select';
      }
      button.disabled=false;return;
    }
    try{await onOpen(proposal,optimizerProposalRequest(proposal,answer.request),()=>completed===answer&&JSON.stringify(getRoute())===routeKey,button.dataset.open);}
    catch(error){if(completed===answer)status.textContent=`Unable to open proposal: ${error.message}`;}
    finally{button.disabled=false;}
  });
  const mobile=root.ownerDocument.defaultView.matchMedia?.('(max-width:700px)');
  const syncSidebar=()=>{
    if(summaryRoot){
      if(mobile?.matches)root.querySelector('.optimizer-layout').append(sidebar);
      else root.ownerDocument.getElementById('optimizer-sidebar-anchor').before(sidebar);
    }
    $('optimizer-constraints-disclosure').open=!mobile?.matches;
  };
  mobile?.addEventListener('change',syncSidebar);syncSidebar();
  updateConstraints();
  return {refresh(){lineControl.refresh();const next=JSON.stringify(getRoute());if(next!==routeKey){routeKey=next;invalidate();}else updateConstraints();},cancel:stop};
}
