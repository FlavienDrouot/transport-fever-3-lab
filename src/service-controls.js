import {UI_TERMS} from './ui-terms.js';
import {speedPresets} from './transport-category.js';

/** One Service form for both domains; IDs adapt to the existing calculators. */
export function mountServiceControls(document,domain){
  const road=domain==='road';
  const ids=road?{
    root:'road-service-settings',heading:'road-service-heading',error:'road-input-error',
    fill:'truck-utilization',label:'road-utilization-label',output:'truck-utilization-value',
    handling:'road-handling-group',help:'road-handling-calibration',loaded:'truck-loaded-return',return:'road-return-control',facilities:'road-freight-facilities',
    terminalA:'truck-specialized-terminal',warehouseA:'truck-specialized-warehouse',terminalB:'truck-specialized-terminal-b',warehouseB:'truck-specialized-warehouse-b',
    options:'road-service-options',summary:'road-service-options-summary',flow:'road-enable-flow',rate:'road-desired-flow',unit:'road-flow-unit',frequency:'road-enable-frequency',headway:'road-desired-headway',policy:'road-frequency-mode'
  }:{
    root:'rail-service-controls',heading:'line-heading',error:'economic-input-error',
    fill:'line-fill',label:'occupancy-label',output:'line-fill-value',
    handling:'rail-freight-handling',help:'rail-handling-calibration',loaded:'rail-loaded-return',return:'rail-return-control',facilities:'rail-freight-facilities',
    terminalA:'rail-terminal-a',warehouseA:'rail-warehouse-a',terminalB:'rail-terminal-b',warehouseB:'rail-warehouse-b',
    options:'service-options',summary:'service-options-summary',flow:'enable-flow',rate:'desired-flow',unit:'economic-flow-unit',frequency:'enable-frequency',headway:'desired-headway',policy:'frequency-mode'
  };
  const info=(text,id)=>`<button class="control-info" type="button" title="${text}" aria-label="Help: ${text}"${id?` aria-describedby="${id}"`:''}>ⓘ</button>`;
  const check=(id,label)=>`<label class="road-inline-check"><input id="${id}" type="checkbox"> ${label}</label>`;
  const constraints=road?'':`<fieldset class="service-option-group"><legend>Train constraints</legend>
    <div id="economic-coupling-control" class="target-control">${info('Automatic coupling joins identical complete trainsets; custom compositions retain their chosen vehicles.')}<span id="composition-description" class="sr-only">One MU is one complete trainset. Coupling joins identical sets.</span><label><input id="allow-multiple-units" type="checkbox" aria-describedby="coupling-help" disabled> Couple identical units</label><p id="coupling-help" class="control-help field-help">Requires both a target rate and a target frequency. Nearest frequency first, then lowest cost.</p></div>
    <div class="target-control"><label><input id="enable-platform-limit" type="checkbox"> Maximum train length</label><div><input required id="platform-length" type="number" min="1" step="1" value="320" disabled aria-label="Maximum train length in metres" aria-describedby="${ids.error}"><span id="economic-length-unit">m of platform</span></div></div>
  </fieldset>`;
  document.getElementById(ids.root).innerHTML=`<details class="panel-group" open><summary id="${ids.heading}">Service</summary><div class="panel-group-body">
    <div class="utilization-control"><label for="${ids.fill}" id="${ids.label}">${UI_TERMS.utilization}</label>${info('Share of capacity used on each loaded leg.',road?'road-utilization-help':'utilization-help').replace('class="control-info"',`id="${road?'road-utilization-info':'utilization-info'}" class="control-info"`)}<output id="${ids.output}" for="${ids.fill}">100%</output><input id="${ids.fill}" type="range" min="1" max="100" step="1" value="100"><p id="${road?'road-utilization-help':'utilization-help'}" class="sr-only">Share of capacity used on each loaded leg.</p></div>
    <details id="${ids.handling}" class="panel-group" hidden><summary>Freight handling &amp; facilities</summary><div class="panel-group-body">
      ${info('Category handling factors and fixed terminal pauses are included automatically.',ids.help)}<span id="${ids.help}" class="sr-only">Category handling factors and fixed terminal pauses are included automatically.</span>
      <div id="${ids.return}" class="target-control handling-return">${check(ids.loaded,'Loaded return')}${info('Off: deliver at B and return empty. On: carry equal loads in both directions.')}</div>
      <div id="${ids.facilities}" class="road-stop-grid">${renderFreightFacilities(ids)}</div>
    </div></details>
    <details id="${ids.options}" class="panel-group"><summary>Targets &amp; constraints</summary><div class="panel-group-body"><p id="${ids.summary}" class="chart-help">No targets</p><div class="service-options-grid">
      <fieldset class="service-option-group"><legend>Service targets</legend>${info('Optional: size a fleet for a transport rate or frequency target.',road?'road-targets-description':'service-targets-description')}<span id="${road?'road-targets-description':'service-targets-description'}" class="sr-only">Optional: size a fleet for the service you want.</span>
        <div class="target-control"><label><input id="${ids.flow}" type="checkbox"> Target rate</label><div><input required id="${ids.rate}" type="number" min="1" step="1" value="1000" disabled aria-label="Target transport rate" aria-describedby="${ids.error}"><span id="${ids.unit}">${UI_TERMS.capacityUnit}/year</span></div></div>
        <div class="target-control"><label><input id="${ids.frequency}" type="checkbox"> Target frequency</label><div><input required id="${ids.headway}" type="number" min="0.1" step="0.1" value="5" disabled aria-label="Target frequency in minutes between vehicles" aria-describedby="${ids.error}"><span>min between vehicles</span><fieldset id="${ids.policy}" class="scale-toggle frequency-toggle" disabled><legend class="sr-only">Frequency policy</legend><label><input type="radio" name="${ids.policy}" value="maximum" checked><span>At most</span></label><label><input type="radio" name="${ids.policy}" value="closest"><span>Closest to target</span></label></fieldset></div></div>
      </fieldset>${constraints}
    </div><p class="chart-help">Whole vehicles, evenly spaced. Traffic and station queues are excluded.</p></div></details>
  </div></details>`;
}

/** Changing domain changes suggestions, never the shared route's actual limit. */
export function syncRouteSpeedControls(document,{domain,speed,multiple=false}){
  const root=document.getElementById('race-infrastructure-speed'),presets=speedPresets(domain);
  if(root.dataset.domain!==domain){
    root.innerHTML='<legend class="sr-only">Route speed presets</legend>'+presets.map((value,i)=>`<label><input type="radio" name="race-infrastructure-speed" value="${value}"><span>${value}${i===presets.length-1?' km/h':''}</span></label>`).join('');
    root.dataset.domain=domain;
  }
  for(const input of root.querySelectorAll('input'))input.checked=Number(input.value)===speed;
  root.closest('.infrastructure-control').hidden=multiple;
  const number=document.getElementById('route-speed-input');
  if(document.activeElement!==number)number.value=speed;
}

/** Shared endpoint facility fields for Service and Optimizer. */
export function renderFreightFacilities({terminalA,warehouseA,terminalB,warehouseB}){
  const stop=(label,terminal,warehouse)=>`<fieldset class="road-stop"><legend>Stop ${label}</legend><label class="road-inline-check"><input id="${terminal}" type="checkbox"> Terminal ×2</label><label class="road-inline-check"><input id="${warehouse}" type="checkbox"> Warehouse ×2</label></fieldset>`;
  return `${stop('A',terminalA,warehouseA)}${stop('B',terminalB,warehouseB)}<p class="chart-help">Each specialized facility doubles handling at its stop; combined bonuses give ×4.</p>`;
}
