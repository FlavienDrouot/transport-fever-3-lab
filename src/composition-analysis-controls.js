import {UI_TERMS} from './ui-terms.js';
import {analyseComposition,renderCompositionSummary,renderCompositionSteadySummary,renderCompositionChart} from './composition-analysis.js';
import {mountGradientControl} from './gradient-control.js';
import {mountDistanceControl,validateNumberInputs,syncNumberInput} from './numeric-controls.js';
import {mountControlHelp} from './control-help.js';

/** Live draft analysis shares route state with Race/Economics, but never publishes a recipe. */
export function mountCompositionAnalysis(document,{getSettings,onSettingsChange}) {
  const $=id=>document.getElementById(id),root=$('composition-analysis-controls');
  const target=(id,label,value,unit,min=1,step=1,afterLabel='')=>`<div class="target-control${id==='composition-headway'?' composition-frequency-target':''}"><label><input id="${id}-enabled" type="checkbox">${label}</label>${afterLabel}<div><input id="${id}" type="number" min="${min}" step="${step}" value="${value}" disabled required aria-label="${label}" aria-describedby="composition-analysis-input-error"><span${id==='composition-flow'?' id="composition-flow-unit"':''}>${unit}</span></div></div>`;
  root.innerHTML=`<div class="panel-group-body">
    <p id="composition-analysis-input-error" class="input-error" role="status" hidden></p>
    <div class="composition-route-grid"><div><div class="road-value-row"><label for="composition-distance">One-way distance</label><div class="line-distance-entry"><input id="composition-distance" type="number" min="0.1" data-strict-positive="true" step="0.1" value="10" required aria-describedby="composition-analysis-input-error"><span>km</span></div></div><input id="composition-distance-range" type="range" min="0.1" max="30" step="0.1" value="10" aria-label="One-way route distance in kilometres"></div>
    <div id="composition-gradient"></div>
    <div><fieldset id="composition-speed-limit" class="scale-toggle"><legend>Track speed limit</legend>${[100,160,350].map(speed=>`<label><input type="radio" name="composition-speed-limit" value="${speed}"${speed===350?' checked':''}><span>${speed}${speed===350?' km/h':''}</span></label>`).join('')}</fieldset></div>
    <div><label for="composition-fill">${UI_TERMS.utilization} <output id="composition-fill-value">100%</output></label><input id="composition-fill" type="range" min="0" max="100" step="1" value="100" aria-describedby="composition-fill-help"><p class="control-help" id="composition-fill-help">Share of capacity used; a ceiling when a target rate is enabled.</p></div></div>
    <details class="service-options"><summary>Targets &amp; constraints</summary><div class="composition-route-grid">
    ${target('composition-flow',`Target ${UI_TERMS.rate.toLowerCase()}`,1000,`${UI_TERMS.capacityUnit}/year/direction`)}
    ${target('composition-headway',`Target ${UI_TERMS.frequency.toLowerCase()}`,5,'min between trains',.1,.1,
      `<fieldset id="composition-frequency-mode" class="scale-toggle frequency-toggle" disabled><legend class="sr-only">Frequency policy</legend><label><input type="radio" name="composition-frequency-mode" value="maximum" checked><span>At most</span></label><label><input type="radio" name="composition-frequency-mode" value="closest"><span>Closest to target</span></label></fieldset>`)}
    ${target('composition-platform','Maximum train length',320,'m of platform')}
    </div></details>
    <details id="composition-freight-options" class="service-options" hidden><summary>Freight handling</summary><div class="composition-route-grid">
    <label><input id="composition-loaded-return" type="checkbox">Loaded return</label>
    ${['a','b'].map(stop=>`<fieldset class="service-option-group"><legend>Stop ${stop.toUpperCase()}</legend><label><input id="composition-terminal-${stop}" type="checkbox">Terminal ×2</label><label><input id="composition-warehouse-${stop}" type="checkbox">Warehouse ×2</label></fieldset>`).join('')}
    </div></details>
    <details class="composition-help"><summary>Route assumptions</summary><p class="control-help">Settings are shared with Race and Economics. Running cost includes fleet maintenance; purchase cost, infrastructure, revenue and congestion are excluded. The return reverses the slope. Cargo mass is not added.</p></details>
    <p id="composition-tram-notice" class="control-help" hidden>Tram motion here uses the theoretical rail acceleration model, which has not been calibrated for trams. Road comparisons use their existing steady-speed model.</p>
    </div>`;
  let draft=null,analysis=null,key=null,scheduled=false;
  const inputs=['composition-distance','composition-gradient-input','composition-flow','composition-headway','composition-platform'];
  const validate=()=>validateNumberInputs(inputs.map($),$('composition-analysis-input-error'));
  const gradient=mountGradientControl(document,$('composition-gradient'),{rail:true,noticeId:'composition-analysis-input-error',validate,onChange:gradePercent=>commit({gradePercent})});
  function commit(patch){if(validate())onSettingsChange({...getSettings(),...patch});}
  function updateSettings(){
    for(const id of ['flow','headway','platform'])$(`composition-${id}`).disabled=!$(`composition-${id}-enabled`).checked;
    $('composition-frequency-mode').disabled=$('composition-headway').disabled;
    if(!validate())return;
    commit({distanceKm:$('composition-distance').valueAsNumber,gradePercent:$('composition-gradient-input').valueAsNumber,
      infrastructureSpeedKmh:Number($('composition-speed-limit').querySelector('input:checked').value),fillRatio:$('composition-fill').valueAsNumber/100,
      desiredFlow:$('composition-flow').disabled?null:$('composition-flow').valueAsNumber,
      maxHeadwaySeconds:$('composition-headway').disabled?null:$('composition-headway').valueAsNumber*60,
      frequencyMode:$('composition-frequency-mode').querySelector('input:checked').value,platformLengthMetres:$('composition-platform').disabled?null:$('composition-platform').valueAsNumber,
      loadedReturn:$('composition-loaded-return').checked,
      stopA:{specializedTerminal:$('composition-terminal-a').checked,specializedWarehouse:$('composition-warehouse-a').checked},
      stopB:{specializedTerminal:$('composition-terminal-b').checked,specializedWarehouse:$('composition-warehouse-b').checked}});
  }
  mountDistanceControl({number:$('composition-distance'),range:$('composition-distance-range'),validate,onChange:distanceKm=>commit({distanceKm})});
  for(const id of ['flow','headway','platform']){
    $(`composition-${id}-enabled`).addEventListener('change',updateSettings);
    $(`composition-${id}`).addEventListener('input',updateSettings);
  }
  for(const id of ['composition-speed-limit','composition-frequency-mode','composition-loaded-return',...['a','b'].flatMap(stop=>[`composition-terminal-${stop}`,`composition-warehouse-${stop}`])])$(id).addEventListener('change',updateSettings);
  $('composition-fill').addEventListener('input',updateSettings);
  function syncControls(settings){
    syncNumberInput($('composition-distance'),settings.distanceKm);gradient.setValue(settings.gradePercent);
    $('composition-distance-range').min=.1;$('composition-distance-range').max=Math.max(30,settings.distanceKm);$('composition-distance-range').value=settings.distanceKm;
    $('composition-speed-limit').querySelector(`input[value="${settings.infrastructureSpeedKmh}"]`).checked=true;
    $('composition-fill').value=settings.fillRatio*100;$('composition-fill-value').textContent=`${Math.round(settings.fillRatio*100)}%`;
    for(const [id,value] of [['flow',settings.desiredFlow],['headway',settings.maxHeadwaySeconds===null?null:settings.maxHeadwaySeconds/60],['platform',settings.platformLengthMetres]]){
      $(`composition-${id}-enabled`).checked=value!==null;$(`composition-${id}`).disabled=value===null;
      if(value!==null)syncNumberInput($(`composition-${id}`),value);
    }
    $('composition-frequency-mode').querySelector(`input[value="${settings.frequencyMode}"]`).checked=true;$('composition-frequency-mode').disabled=settings.maxHeadwaySeconds===null;
    $('composition-loaded-return').checked=settings.loadedReturn;
    for(const [stop,options] of [['a',settings.stopA],['b',settings.stopB]]){
      $(`composition-terminal-${stop}`).checked=!!options?.specializedTerminal;$(`composition-warehouse-${stop}`).checked=!!options?.specializedWarehouse;
    }
  }
  function render(){
    scheduled=false;if($('configurator').hidden)return;
    const settings=getSettings();
    const roundedDistance=Math.max(.1,Math.round(settings.distanceKm*10)/10);
    if(settings.distanceKm!==roundedDistance){onSettingsChange({...settings,distanceKm:roundedDistance});return;}
    syncControls(settings);
    const freight=draft?.category==='freight';$('composition-freight-options').hidden=!freight;
    $('composition-tram-notice').hidden=draft?.carrier!=='tram';
    $('composition-flow-unit').textContent=`${UI_TERMS.capacityUnit}/year${freight?'':'/direction'}`;
    $('composition-flow').setAttribute('aria-label',`Target rate in ${UI_TERMS.capacityUnit} per game year${freight?'':' per direction'}`);
    $('composition-headway').setAttribute('aria-label','Target interval in minutes between trains');
    $('composition-platform').setAttribute('aria-label','Maximum train length in metres');
    // Draft IDs and names change independently of physical/economic data.
    const next=JSON.stringify([draft&&[draft.category,draft.carrier,draft.components,draft.massTonnes,draft.powerCh,draft.tractionKgf,draft.maxSpeedKmh,draft.lengthMetres,draft.passengerCapacity,draft.cargoCapacity,draft.carCount,draft.formationLoadingUnloadingSpeedMultiplier,draft.economy],settings]);
    if(next!==key){analysis=analyseComposition(draft,settings);key=next;}
    $('composition-analysis-content').hidden=!!analysis.empty;
    $('composition-analysis-empty').hidden=!analysis.empty;
    $('composition-analysis-empty').textContent=analysis.empty?analysis.message:'';
    if(analysis.empty)return;
    $('composition-analysis-status').textContent=analysis.message||'';
    $('composition-analysis-status').hidden=!analysis.message;
    $('composition-analysis-summary').hidden=!analysis.service;
    renderCompositionSummary($('composition-analysis-summary'),analysis);
    renderCompositionSteadySummary($('composition-steady-summary'),analysis);
    $('composition-steady-help').textContent=analysis.empty?'Add a powered vehicle and compatible capacity to see the steady-running reference.':
      `Cruise-only reference using the selected slope, speed limit and ${Math.round(settings.fillRatio*100)}% utilization. Rate × distance measures transport output from one train per game year, at steady speed. Doubling the route length halves Rate, so their product stays constant. Passenger Rate is per direction; freight Rate counts all loaded legs. Cost per kilometre includes both directions. Acceleration, braking, terminal handling and rate/frequency targets are excluded; their effects appear below in the selected-route results.${freight&&!settings.loadedReturn?' Cost includes the empty return.':''}`;
    const help=`${settings.gradePercent?'Peak speeds A→B and B→A':'Peak speed'}, Rate × distance per train and cost per ${UI_TERMS.capacityUnit} per km versus total A–B–A length. Each quantity has its own ordinate scale. Peak speed includes final braking; with a slope, both directions share the speed scale. Handling at both stops is included. ${freight?'Deliveries count loaded legs.':'Passenger journeys count both legs.'}`;
    const maximum=analysis.normalizedMaximumDistance;
    const beyond=!analysis.empty&&settings.distanceKm>maximum?' The selected route extends beyond this view; its full results remain in the summary.':'';
    $('composition-analysis-help').textContent=help+beyond+
      ' The chart describes one train at the selected utilization, independently of Rate, Frequency and platform constraints. Those constraints apply only to Route & service results. Gradient, speed limit, utilization and freight handling settings remain shared. The distance window extends until Rate × distance is at least 99% of its limit and cost/km at most 1% above its limit. Distance starts at 10 m round trip; distance and cost use logarithmic scales. Cost / capacity / km divides unit cost by one-way distance. Output and cost approach the steady-running reference above.';
    renderCompositionChart($('composition-normalized-chart'),analysis,'normalized');
  }
  function schedule(){if(scheduled)return;scheduled=true;if(document.defaultView?.requestAnimationFrame)document.defaultView.requestAnimationFrame(render);else setTimeout(render,0);}
  $('composition-performance-analysis').addEventListener('toggle',event=>{if(event.currentTarget.open)schedule();});
  mountControlHelp(document,root);
  return {setDraft(value){draft=value;schedule();},refresh:schedule};
}
