import {OPTIMIZER_DEFAULTS,optimizerRequest} from './optimizer.js';
import {UI_TERMS as T} from './ui-terms.js';
import {escapeHtml,formatNumber,formatTime} from './format.js';
import {mountTransportCategory,mountFreightFilter} from './transport-category.js';
import {renderFreightFacilities} from './service-controls.js';

export function mountOptimizer(root,{getRoute,getCatalogue,onOpen}){
  const railBounds=['maxTrainLength','maxLocomotives','maxWagons','maxUnits'];
  const number=(key,label,unit,min,max,step='1')=>`<label class="optimizer-field"${railBounds.includes(key)?' data-optimizer-rail-bound':''}>${label}<span><input name="${key}" type="number" value="${OPTIMIZER_DEFAULTS[key]}" min="${min}" max="${max}" step="${step}" required> ${unit}</span></label>`;
  root.innerHTML=`<div class="optimizer-setup"><div id="optimizer-route-slot"></div><form id="optimizer-form" class="panel-group"><div class="panel-group-body">
    <h3>What service do you need?</h3>
    <fieldset id="optimizer-domain" class="scale-toggle"><legend>Search vehicles</legend>${[['both','Rail + Road'],['rail','Rail only'],['road','Road only']].map(([value,label])=>`<label><input type="radio" name="domain" value="${value}"${value==='both'?' checked':''}><span>${label}</span></label>`).join('')}</fieldset>
    <fieldset id="optimizer-category" class="scale-toggle"></fieldset><fieldset id="optimizer-cargo" class="scale-toggle"></fieldset>
    <p id="optimizer-cargo-help" class="chart-help" hidden>All freight selects general-purpose vehicles; it does not combine different commodities.</p>
    <div class="optimizer-fields optimizer-service-fields">${number('rate',T.rate,'<span id="optimizer-rate-unit">capacity/year/direction</span>',1,1e9)}
    <label class="optimizer-field">${T.utilization} · ceiling <span><input name="utilization" type="number" min="1" max="100" step="1" value="100" required> %</span></label>
    <label class="optimizer-field"><span><input name="enableFrequency" type="checkbox" checked> ${T.frequency} · maximum interval</span><span><input name="minutes" type="number" min="0.1" max="10000" step="0.1" value="5" required aria-label="Maximum minutes between vehicles"> min between vehicles</span></label>
    <label class="optimizer-field"><span><input name="enableMinimumFrequency" type="checkbox"> ${T.frequency} · minimum interval</span><span><input name="minMinutes" type="number" min="0.1" max="10000" step="0.1" value="3" required disabled aria-label="Minimum minutes between vehicles"> min between vehicles</span></label>
    </div>
    <p class="chart-help">Meet the Rate with whole vehicles, within the enabled intervals between departures and the Utilization ceiling.</p>
    <details id="optimizer-handling" class="panel-group" hidden><summary>Freight handling &amp; facilities</summary><div class="panel-group-body"><label><input name="loadedReturn" type="checkbox"> Loaded return</label><div class="road-stop-grid">${renderFreightFacilities({terminalA:'optimizer-terminal-a',warehouseA:'optimizer-warehouse-a',terminalB:'optimizer-terminal-b',warehouseB:'optimizer-warehouse-b'})}</div></div></details>
    <details class="panel-group"><summary>Year &amp; search bounds</summary><div class="panel-group-body"><label><input name="ignoreRetirements" type="checkbox"> Ignore retirements</label><div class="optimizer-fields">
      ${number('year','Game year','',1850,2035)}${number('maxTrainLength','Maximum train length','m',1,2000)}${number('maxLocomotives','Locomotives per train · at most','',1,8)}${number('maxWagons','Wagons per train · at most','',1,100)}${number('maxUnits','Complete trainsets per train · at most','',1,20)}${number('maxFleet','Fleet size · at most','vehicles',1,100000)}
    </div><p class="chart-help">Search vehicles introduced by the game year and not yet retired in the source catalogue. Ignore retirements if your game keeps older vehicles available. Save/mod overrides are not read.</p><p class="chart-help">Rail: identical complete trainsets, or one locomotive model with one wagon model. Road: buses or trucks. Saved compositions and trams are excluded.</p></div></details>
    <div class="optimizer-actions"><button type="submit" class="optimizer-primary">Find solutions</button><button type="button" id="optimizer-cancel" hidden>Cancel</button></div>
    <p id="optimizer-status" role="status" aria-live="polite" class="chart-help">Minimize fleet Running costs while meeting your service goals.</p>
    <p class="chart-help">Experimental: empty mass is used. The shared gradient factor is provisional. Road braking is omitted; rail braking remains provisional. Coupled trainset compatibility is not verified.</p>
  </div></form></div><div id="optimizer-results" class="optimizer-results"></div>`;
  const form=root.querySelector('form'),field=name=>form.elements.namedItem(name),$=id=>root.querySelector(`#${id}`),status=$('optimizer-status'),results=$('optimizer-results');
  let category='passengers',worker=null,job=0,completed=null,routeKey=JSON.stringify(getRoute());
  mountTransportCategory($('optimizer-category'),{value:category,onChange:value=>{category=value;syncCategory();invalidate();}});
  mountFreightFilter($('optimizer-cargo'));syncCategory();
  function syncCategory(){
    for(const id of ['optimizer-cargo','optimizer-cargo-help','optimizer-handling'])$(id).hidden=category!=='freight';
    $('optimizer-rate-unit').textContent=`${T.capacityUnit}/year${category==='passengers'?'/direction':''}`;
  }
  function busy(value){form.querySelector('[type="submit"]').disabled=value;$('optimizer-cancel').hidden=!value;}
  function stop(){job++;worker?.terminate();worker=null;busy(false);}
  function invalidate(){
    const hadResult=completed!==null,wasBusy=!$('optimizer-cancel').hidden;stop();completed=null;
    if(hadResult||wasBusy){results.replaceChildren();status.textContent='Settings changed. Find solutions again to update the proposals.';}
  }
  function request(){
    const domain=field('domain').value;
    const values=Object.fromEntries(['rate','year',...railBounds,'maxFleet'].map(name=>[name,domain==='road'&&railBounds.includes(name)?OPTIMIZER_DEFAULTS[name]:Number(field(name).value)]));
    const stopValues=stop=>({specializedTerminal:$(`optimizer-terminal-${stop}`).checked,specializedWarehouse:$(`optimizer-warehouse-${stop}`).checked});
    return optimizerRequest({...values,domain,ignoreRetirements:field('ignoreRetirements').checked,category,cargo:$('optimizer-cargo').querySelector('input:checked').value,
      minHeadwaySeconds:field('enableMinimumFrequency').checked?Number(field('minMinutes').value)*60:null,
      maxHeadwaySeconds:field('enableFrequency').checked?Number(field('minutes').value)*60:null,fillRatio:Number(field('utilization').value)/100,
      loadedReturn:field('loadedReturn').checked,stopA:stopValues('a'),stopB:stopValues('b'),routeProfile:getRoute()});
  }
  const fmt=(n,d=1)=>formatNumber(n,d,true),money=n=>`$${fmt(n,0)}`;
  function show(answer){
    completed=answer;
    const domains=answer.request.domain==='both'?['rail','road']:[answer.request.domain];
    results.classList.toggle('optimizer-results-single',domains.length===1);
    status.textContent=`Searched ${fmt(answer.stats.tested,0)} designs · ${domains.map(domain=>`${fmt(answer.stats.feasible[domain],0)} feasible ${domain==='rail'?'Rail':'Road'}`).join(' · ')}. Best within the displayed search bounds.`;
    results.innerHTML=domains.map(domain=>`<section aria-labelledby="optimizer-${domain}-heading"><h3 id="optimizer-${domain}-heading">${domain==='rail'?'Rail':'Road'}</h3>${answer.best[domain].length?answer.best[domain].map((r,i)=>`<article class="optimizer-proposal"><div class="optimizer-proposal-top"><span class="optimizer-rank">${i+1}</span><h4>${escapeHtml(r.name)}</h4><strong>${money(r.cost)}/year</strong></div><p class="chart-help">${escapeHtml(r.parts.map(p=>`${p.quantity} × ${p.name}`).join(' + '))}${domain==='rail'?` · ${fmt(r.length)} m`:''}</p><dl class="optimizer-metrics">${[
      ['Fleet',`${fmt(r.fleet,0)} ${domain==='rail'?'trains':'vehicles'}`],[T.capacity,`${fmt(r.capacity,0)} ${T.capacityUnit}`],
      [T.rate,`${fmt(r.rate,0)} ${T.capacityUnit}/year${answer.request.category==='passengers'?'/direction':''}`],
      [T.frequency,`${fmt(r.frequency/60,2)} min`],[T.utilization,`${fmt(r.utilization*100)}%`],['Round trip',formatTime(r.cycle)],
      [`${T.runningCosts} / capacity`,`${money(r.unitCost)}`]
    ].map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl><button type="button" data-domain="${domain}" data-result="${i}">${domain==='rail'?'Open composition':'Compare service'} ↗</button></article>`).join(''):`<p class="optimizer-no-results">No feasible ${domain==='rail'?'train':'road vehicle'} within these bounds. Try changing the route, year, service goals or search bounds.</p>`}</section>`).join('');
    if(answer.request.minHeadwaySeconds!==null)results.insertAdjacentHTML('beforeend','<p class="chart-help optimizer-result-note">These proposals meet your minimum interval. After opening one, further service edits can shorten it.</p>');
  }
  root.addEventListener('input',event=>{if(event.target.closest('#optimizer-route-slot'))invalidate();});
  form.addEventListener('input',()=>{
    field('minutes').disabled=!field('enableFrequency').checked;
    field('minMinutes').disabled=!field('enableMinimumFrequency').checked;
    for(const label of form.querySelectorAll('[data-optimizer-rail-bound]')){label.hidden=field('domain').value==='road';label.querySelector('input').disabled=label.hidden;}
    invalidate();
  });
  $('optimizer-cancel').addEventListener('click',()=>{stop();status.textContent='Search cancelled. Adjust your settings or try again.';});
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const invalidRoute=[...$('optimizer-route-slot').querySelectorAll('input')].find(input=>!input.disabled&&!input.checkValidity());
    if(invalidRoute){invalidRoute.reportValidity();status.textContent='Check the route settings before searching.';return;}
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
  results.addEventListener('click',async event=>{
    const button=event.target.closest('[data-result]');if(!button||!completed)return;
    const answer=completed,proposal=answer.best[button.dataset.domain][Number(button.dataset.result)];button.disabled=true;
    try{await onOpen(proposal,answer.request,()=>completed===answer&&JSON.stringify(getRoute())===routeKey);}
    catch(error){if(completed===answer)status.textContent=`Unable to open proposal: ${error.message}`;}
    finally{button.disabled=false;}
  });
  return {refresh(){const next=JSON.stringify(getRoute());if(next!==routeKey){routeKey=next;invalidate();}},cancel:stop};
}
