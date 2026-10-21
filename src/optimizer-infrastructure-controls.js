import {RAIL_PLATFORM_MAX_LENGTH,busStopAllowed,DEFAULT_INDUSTRY_OUTPUT_STORAGE_CAPACITY,optimizerInfrastructureValue} from './optimizer-infrastructure.js';
import {formatNumber,escapeHtml} from './format.js';
import {UI_TERMS as T} from './ui-terms.js';
import {MAX_TERMINAL_CONFIGURATIONS} from './optimizer-infrastructure.js';
import {RAIL_TERMINAL_ASSUMPTIONS} from './rail-terminal-service.js';

/** Declare reusable route infrastructure; unlisted terminals are built for the project. A custom route's declaration replaces the manual endpoints and entries. */
export function mountOptimizerInfrastructure(root,{getScope,onChange,getDeclared=()=>null}){
  const stops=['stopA','stopB'],kinds=['rail','road'],manualEntries=[];
  const bounds=Object.fromEntries(stops.map(stop=>[stop,{maxTrainLength:RAIL_PLATFORM_MAX_LENGTH,maxPlatformTracks:2,maxPlatformLength:40,maxPlatforms:2,allowSpecialization:true,allowBusStop:true}]));
  const manualSites=Object.fromEntries(stops.map(stop=>[stop,{type:'',factoryTerminals:2,inputStorageCapacity:100,outputStorageCapacity:DEFAULT_INDUSTRY_OUTPUT_STORAGE_CAPACITY,existingSpecializedWarehouse:false,
    allowWarehouseSpecialization:true,allowWarehouseExpansion:false,warehouseCapacity:500,maxWarehouseCapacity:1000}]));
  // `sites` and `entries` point to the declaration while one applies; the manual inputs stay untouched.
  let sites=manualSites,entries=manualEntries,declared=null,declaredKey='null',nextId=0;
  const title=stop=>stop==='stopA'?'Source · A':'Destination · B';
  const numeric=(attrs,key,label,value,min,max,step,unit='')=>`<label class="optimizer-field">${label}<span><input ${attrs} data-infrastructure-field="${key}" type="number" value="${value??''}" min="${min}"${max==null?'':` max="${max}"`} step="${step}" required> ${unit}</span></label>`;
  const check=(attrs,key,label,checked=false)=>`<label class="road-inline-check"><input ${attrs} data-infrastructure-field="${key}" type="checkbox"${checked?' checked':''}> ${label}</label>`;
  const toggle=(attrs,key,legend,choices,value,name,className='')=>`<fieldset class="scale-toggle ${className}"><legend>${legend}</legend>${choices.map(([v,label])=>`<label data-toggle-choice="${v}"><input ${attrs} data-infrastructure-field="${key}" type="radio" name="${name}" value="${v}"${String(value)===v?' checked':''} required><span>${label}</span></label>`).join('')}</fieldset>`;
  root.innerHTML=`<details class="panel-group" open><summary>Stops &amp; infrastructure</summary><div class="panel-group-body">
    <label class="road-inline-check"><input id="optimizer-include-infrastructure" type="checkbox"> Include infrastructure ${T.runningCosts}</label>
    <div id="optimizer-infrastructure-body" hidden>
      <div data-storage-policy>
        <label class="road-inline-check"><input id="optimizer-limit-vehicle-capacity" type="checkbox" checked aria-describedby="optimizer-storage-policy-help"> Require full vehicle ${T.capacity} to fit storage</label>
        <p id="optimizer-storage-policy-help" class="chart-help" hidden>Only the load (${T.capacity} × ${T.utilization}) must fit storage. This can sometimes select trains with more Capacity than needed: extra carrying units can shorten loading/unloading times.</p>
      </div>
      <section id="optimizer-infrastructure-sites" class="optimizer-infra-section"><h4>Endpoint buildings</h4><p class="chart-help">Choose the building served at each stop. Its storage and handling apply to this route.</p><div class="optimizer-infra-stops">${stops.map(stop=>{
        const attrs=`data-infrastructure-site="${stop}"`;
        return `<fieldset><legend>${title(stop)}</legend>${toggle(attrs,'type','Building',[['factory',T.industry],['warehouse','Warehouse'],['industrial','Industrial building']],'',`optimizer-building-${stop}`,'optimizer-building-toggle')}
          <p data-building-help="${stop}" class="chart-help" hidden></p>
          <div data-industry-storage="${stop}" class="optimizer-infra-fields" hidden>
            ${numeric(attrs,'inputStorageCapacity',`Input storage ${T.capacity}`,100,100,null,100,T.capacityUnit)}
            ${numeric(attrs,'outputStorageCapacity',`Output storage ${T.capacity}`,DEFAULT_INDUSTRY_OUTPUT_STORAGE_CAPACITY,100,null,100,T.capacityUnit)}
            <p class="chart-help">Enter the storage available for this freight type. The storage limit above applies. Industry storage cannot be expanded by the search.</p>
          </div>
          <div data-factory-options="${stop}">${toggle(attrs,'factoryTerminals','Parallel Truck terminals',[['2','2'],['3','3']],2,`optimizer-industry-terminals-${stop}`)}<p class="chart-help">Free specialized terminals, one truck each. Trams require a separate station/platform.</p></div>
          <details data-warehouse-options="${stop}" class="panel-group" hidden><summary>Warehouse access <span data-warehouse-summary="${stop}"></span></summary><div class="optimizer-infra-fields">
            ${numeric(attrs,'warehouseCapacity','Existing warehouse Capacity',500,500,100000,500,T.capacityUnit)}
            ${toggle(attrs,'existingSpecializedWarehouse','Existing warehouse',[['false','Generic'],['true','Specialized']],false,`optimizer-warehouse-${stop}`)}
            <div data-warehouse-specialization="${stop}">${check(attrs,'allowWarehouseSpecialization','Allow specialization',true)}</div>
            ${check(attrs,'allowWarehouseExpansion','Allow expansion')}
            <div data-warehouse-expansion="${stop}">${numeric(attrs,'maxWarehouseCapacity','Maximum allowed warehouse Capacity',1000,500,100000,500,T.capacityUnit)}</div>
            <p class="chart-help">Existing storage is retained without attributing its upkeep to this project. Allowed expansions and specialization add their own Running costs. The storage limit above applies.</p>
          </div></details></fieldset>`;
      }).join('')}</div></section>
      <section id="optimizer-reusable-section" class="optimizer-infra-section"><h4>Reusable infrastructure</h4><p class="chart-help">Only add existing facilities available to this service.</p>
        <button id="optimizer-add-infrastructure" type="button">+ Add existing reusable infrastructure</button>
        <div id="optimizer-reusable-infrastructure"></div><p id="optimizer-infrastructure-retained" class="chart-help" hidden></p>
        <p id="optimizer-infrastructure-empty" class="chart-help"></p>
      </section>
      <section id="optimizer-declared-infrastructure" class="optimizer-infra-section" hidden><h4>Declared in Route</h4><div data-declared-summary></div><p class="chart-help" data-declared-costs-help>They constrain the search either way; check Include infrastructure Running costs to count their upkeep and upgrades.</p><p class="chart-help">These stops and facilities come from the custom route declaration, so they are not edited here. <a href="#route-profile">Edit them in Design → Route →</a></p></section>
      <details id="optimizer-new-infrastructure" class="panel-group optimizer-infra-section"><summary>New infrastructure · limits</summary><div class="panel-group-body optimizer-infra-stops">${stops.map(stop=>{
        const attrs=`data-infrastructure-bound="${stop}"`;
        return `<fieldset data-new-terminal="${stop}"><legend>${title(stop)}</legend><div data-new-rail-length>${numeric(attrs,'maxTrainLength','Maximum allowed Rail platform length',RAIL_PLATFORM_MAX_LENGTH,40,RAIL_PLATFORM_MAX_LENGTH,40,'m')}${numeric(attrs,'maxPlatformTracks','Maximum allowed platform tracks',2,1,100,1)}</div>
          <div data-new-road-geometry>${numeric(attrs,'maxPlatformLength','Maximum allowed Road platform length',40,20,10000,10,'m')}${numeric(attrs,'maxPlatforms','Maximum allowed parallel Road platforms',2,1,100,1)}</div>
          <div data-new-specialization>${check(attrs,'allowSpecialization','Allow new platform specialization',true)}</div>
          <div data-new-bus-stop>${check(attrs,'allowBusStop','Allow bus stop',true)}<p class="chart-help">$30,000/year · one vehicle at a time. The search can choose a bus stop or a station platform.</p></div></fieldset>`;
      }).join('')}<p class="chart-help">Applies where no reusable terminal is declared. Rail platforms cannot exceed ${RAIL_PLATFORM_MAX_LENGTH} m and use 40 m sections. Road: the search compares lengths and parallel platforms within your limits; the first section is 20 m, extensions add 10 m.</p></div></details>
      <p class="chart-help" data-rail-terminal-assumptions>${RAIL_TERMINAL_ASSUMPTIONS} Clearance includes half the train length and 100 m of switches on each side. Two platform tracks can share one platform.</p>
      <p class="chart-help" data-tram-platform-help>Freight trams must fit each platform they use, on Rail and Road. Bus stops have no length limit and can only unload freight at industrial destination B without a loaded return. Passenger trams are modeled without a platform-length limit; formation search bounds still apply.</p>
      <details class="panel-group optimizer-infra-cost-help"><summary>How infrastructure costs are calculated</summary><div class="panel-group-body">
        <p class="chart-help">Reused stations, tracks and platforms add no upkeep; only extensions, new tracks and specialization upgrades do.</p>
        <p class="chart-help">Rail: $18,000/year per station and $30,000/year per track per 40 m. Platforms per 40 m: $60,000/year for passengers or specialized freight, $30,000 for all freight.</p>
        <p class="chart-help">Road: $36,000/year per station + $6,000 access. Platforms per 10 m: $60,000/year for passengers or specialized freight, $30,000 for all freight; the first 20 m count twice. Bus stop: $30,000/year, one vehicle at a time.</p>
        <p class="chart-help">Warehouse: $150,000/year per 500 capacity, $300,000 specialized. Waiting at stops is estimated from regular arrivals and 5 s maneuvering per visit; traffic is not simulated.</p>
      </div></details>
    </div></div></details>`;
  const $=selector=>root.querySelector(selector),enabled=$('#optimizer-include-infrastructure'),list=$('#optimizer-reusable-infrastructure');
  // A declaration constrains the search whether or not its Running costs are counted.
  const active=()=>enabled.checked||!!declared;
  const inScope=(entry,scope)=>scope.domain==='both'||entry.domain===scope.domain;
  const factoryTerminal=(stop,kind,scope)=>scope.category==='freight'&&kind==='road'&&sites[stop]?.type==='factory';
  const matching=(stop,kind,scope)=>entries.filter(entry=>inScope(entry,scope)&&entry.stop===stop&&entry.domain===kind&&entry.kind);
  const selectedKinds=scope=>scope.domain==='both'?kinds:[scope.domain];
  function renderEntries(){
    const opened=new Map([...list.querySelectorAll('[data-reusable-entry]')].map(node=>[node.dataset.reusableEntry,node.open]));
    list.innerHTML=manualEntries.map(entry=>{
      const attrs=`data-infrastructure-entry="${entry.id}"`;
      return `<details class="panel-group optimizer-reusable-entry" data-reusable-entry="${entry.id}"${opened.get(entry.id)!==false?' open':''}><summary><span data-entry-summary></span></summary><div class="panel-group-body">
        ${toggle(attrs,'stop','Stop',[['stopA',title('stopA')],['stopB',title('stopB')]],entry.stop,`${entry.id}-stop`)}
        <div data-entry-domain>${toggle(attrs,'domain','Infrastructure',[['rail','Rail'],['road','Road']],entry.domain,`${entry.id}-domain`)}</div>
        <div data-entry-type>${toggle(attrs,'kind','Available to this project',[['station','Station only'],['platform','Station + platform'],['busStop','Bus stop']],entry.kind,`${entry.id}-kind`)}</div>
        <p class="chart-help" data-entry-factory hidden>The industry includes free specialized Truck terminals. No reusable Truck infrastructure declaration is needed here.</p>
        <div class="optimizer-infra-fields" data-entry-settings>
          <p class="chart-help" data-entry-help></p>
          <div data-entry-specialized>${toggle(attrs,'specializedTerminal','Existing platform',[['false','Generic'],['true','Specialized']],entry.specializedTerminal,`${entry.id}-specialized`)}</div>
          <div data-entry-length>${numeric(attrs,'existingLength','Available platform length',entry.existingLength,40,RAIL_PLATFORM_MAX_LENGTH,40,'m')}</div>
          <div data-entry-rail-existing>${numeric(attrs,'platformTrackCount','Available platform tracks',entry.platformTrackCount,1,100,1)}${numeric(attrs,'railPlatformCount','Reusable platforms',entry.railPlatformCount,1,100,1)}<p class="chart-help">One train per track. Each platform can serve one or two available tracks.</p></div>
          <div data-entry-road-existing>${numeric(attrs,'platformLength','Available Road platform length',entry.platformLength,20,10000,10,'m')}${numeric(attrs,'platformCount','Available parallel Road platforms',entry.platformCount,1,100,1)}</div>
          <div data-entry-extension>${check(attrs,'allowExtension','Allow platform extension',entry.allowExtension)}</div>
          <div data-entry-limit>${numeric(attrs,'maxTrainLength','Maximum allowed platform length',entry.maxTrainLength,40,RAIL_PLATFORM_MAX_LENGTH,40,'m')}</div>
          <div data-entry-road-limit>${numeric(attrs,'maxPlatformLength','Maximum allowed Road platform length',entry.maxPlatformLength,20,10000,10,'m')}</div>
          <div data-entry-parallel>${check(attrs,'allowParallelPlatforms','Allow additional parallel platforms',entry.allowParallelPlatforms)}</div>
          <div data-entry-rail-parallel>${check(attrs,'allowParallelTracks','Allow additional platform tracks',entry.allowParallelTracks)}</div>
          <div data-entry-rail-count>${numeric(attrs,'maxPlatformTracks','Maximum allowed platform tracks',entry.maxPlatformTracks,1,100,1)}</div>
          <div data-entry-road-count>${numeric(attrs,'maxPlatforms','Maximum allowed parallel Road platforms',entry.maxPlatforms,1,100,1)}</div>
          <div data-entry-specialization>${check(attrs,'allowSpecialization','Allow platform specialization',entry.allowSpecialization)}</div>
        </div><button type="button" data-remove-infrastructure="${entry.id}">Remove</button>
      </div></details>`;
    }).join('');
    refresh();
  }
  function useDeclaration(model){
    const key=JSON.stringify(model);if(key===declaredKey)return;
    declaredKey=key;declared=model;sites=model?model.sites:manualSites;entries=model?model.entries:manualEntries;
    $('[data-declared-summary]').innerHTML=model?`<ul>${model.lines.map(line=>`<li>${escapeHtml(line)}</li>`).join('')}</ul>${model.issues.map(issue=>`<p class="route-plan-warning">${escapeHtml(issue)}</p>`).join('')}`:'';
  }
  function refresh(){
    const scope=getScope(),freight=scope.category==='freight';
    useDeclaration(getDeclared(scope));
    $('#optimizer-infrastructure-body').hidden=!active();
    $('[data-declared-costs-help]').hidden=!declared;
    $('[data-storage-policy]').hidden=!freight;
    $('#optimizer-storage-policy-help').hidden=$('#optimizer-limit-vehicle-capacity').checked;
    $('#optimizer-infrastructure-sites').hidden=!freight||!!declared;
    $('#optimizer-reusable-section').hidden=!!declared;
    $('#optimizer-declared-infrastructure').hidden=!declared;
    $('[data-rail-terminal-assumptions]').hidden=scope.domain==='road';
    $('[data-tram-platform-help]').hidden=scope.domain==='road'&&!scope.includeTrams;
    for(const stop of stops){
      const site=manualSites[stop],options=$(`[data-warehouse-options="${stop}"]`);options.hidden=!freight||site.type!=='warehouse';
      $(`[data-industry-storage="${stop}"]`).hidden=!freight||site.type!=='factory';
      for(const [key,relevant] of [['inputStorageCapacity',stop==='stopB'||scope.loadedReturn],['outputStorageCapacity',stop==='stopA'||scope.loadedReturn]])
        $(`[data-infrastructure-site="${stop}"][data-infrastructure-field="${key}"]`).closest('label').hidden=!relevant;
      $(`[data-factory-options="${stop}"]`).hidden=!freight||site.type!=='factory'||scope.domain==='rail';
      $(`[data-warehouse-specialization="${stop}"]`).hidden=site.existingSpecializedWarehouse;
      $(`[data-warehouse-expansion="${stop}"]`).hidden=!site.allowWarehouseExpansion;
      $(`[data-infrastructure-site="${stop}"][data-infrastructure-field=maxWarehouseCapacity]`).min=site.warehouseCapacity||500;
      $(`[data-warehouse-summary="${stop}"]`).textContent=`· ${formatNumber(site.warehouseCapacity||0,0)} ${T.capacityUnit}${site.allowWarehouseExpansion?` → ${formatNumber(site.maxWarehouseCapacity||0,0)}`:''}`;
      const help=$(`[data-building-help="${stop}"]`);help.hidden=!site.type;
      help.textContent=site.type==='factory'?'The included Truck terminals are specialized and free; trams cannot use them.':site.type==='warehouse'?'This warehouse is a fixed endpoint; choose available storage and permitted improvements.':'No building handling bonus.';
    }
    let visible=0;
    for(const entry of manualEntries){
      if(!entry.domain&&scope.domain!=='both'){
        entry.domain=scope.domain;$(`[data-infrastructure-entry="${entry.id}"][data-infrastructure-field=domain][value="${scope.domain}"]`).checked=true;
      }
      const node=$(`[data-reusable-entry="${entry.id}"]`);node.hidden=!inScope(entry,scope);if(node.hidden)continue;
      visible++;
      const factory=factoryTerminal(entry.stop,entry.domain,scope)&&!scope.includeTrams;
      node.querySelector('[data-entry-summary]').textContent=[entry.stop?title(entry.stop):`Existing infrastructure ${manualEntries.indexOf(entry)+1}`,entry.domain==='rail'?'Rail':entry.domain==='road'?'Road':'',factory?`${T.industry} terminals included`:entry.kind==='station'?'Station only':entry.kind==='platform'?'Station + platform':entry.kind==='busStop'?'Bus stop':''].filter(Boolean).join(' · ');
      // The stop is chosen first, then the optional domain, then the reusable part.
      node.querySelector('[data-entry-domain]').hidden=!entry.stop||scope.domain!=='both';
      node.querySelector('[data-entry-type]').hidden=!entry.stop||!entry.domain||factory;
      node.querySelector('[data-entry-factory]').hidden=!factory;
      const reused=entry.kind==='platform',rail=entry.domain==='rail';
      const busStop=entry.kind==='busStop',busAllowed=busStopAllowed(entry.domain,scope.category,entry.stop,manualSites[entry.stop]?.type,scope.loadedReturn);
      node.querySelector('[data-toggle-choice="busStop"]').hidden=!busAllowed&&!busStop;
      node.querySelector('[data-entry-settings]').hidden=!entry.kind||factory;
      node.querySelector('[data-entry-specialized]').hidden=!freight||!reused;
      node.querySelector('[data-entry-length]').hidden=!rail||!reused;
      node.querySelector('[data-entry-rail-existing]').hidden=!rail||!reused;
      node.querySelector('[data-entry-road-existing]').hidden=rail||!reused;
      node.querySelector('[data-entry-extension]').hidden=busStop||!reused;
      node.querySelector('[data-entry-limit]').hidden=!rail||busStop||reused&&!entry.allowExtension;
      node.querySelector('[data-entry-road-limit]').hidden=rail||busStop||reused&&!entry.allowExtension;
      node.querySelector('[data-entry-parallel]').hidden=rail||busStop||!reused;
      node.querySelector('[data-entry-rail-parallel]').hidden=!rail||!reused;
      node.querySelector('[data-entry-rail-count]').hidden=!rail||reused&&!entry.allowParallelTracks;
      node.querySelector('[data-entry-road-count]').hidden=rail||busStop||reused&&!entry.allowParallelPlatforms;
      node.querySelector('[data-entry-specialization]').hidden=!freight||busStop||reused&&entry.specializedTerminal;
      node.querySelector('[data-infrastructure-field=maxTrainLength]').min=reused?entry.existingLength||40:40;
      node.querySelector('[data-infrastructure-field=maxPlatformLength]').min=reused?entry.platformLength||20:20;
      node.querySelector('[data-infrastructure-field=maxPlatforms]').min=reused?entry.platformCount||1:1;
      node.querySelector('[data-infrastructure-field=maxPlatformTracks]').min=reused?entry.platformTrackCount||1:1;
      node.querySelector('[data-infrastructure-field=railPlatformCount]').min=Math.ceil((entry.platformTrackCount||1)/2);
      node.querySelector('[data-infrastructure-field=railPlatformCount]').max=entry.platformTrackCount||1;
      node.querySelector('[data-entry-help]').textContent=busStop?(busAllowed?'You confirm this bus stop is available. One vehicle at a time; existing upkeep is excluded.':'This bus stop cannot serve the selected transport, endpoint or loaded return. Choose another reusable facility or remove this entry.'):
        reused?'You confirm this platform is available to this service. Only allowed extensions or specialization upgrades add upkeep.':'The station is reusable; a new track/lane and platform are required and counted.';
    }
    $('#optimizer-infrastructure-empty').hidden=visible>0;
    $('#optimizer-infrastructure-empty').textContent=selectedKinds(scope).some(kind=>stops.some(stop=>factoryTerminal(stop,kind,scope)))?'No reusable terminals declared. Industries provide free specialized Truck terminals; trams require separate stations/platforms.':'No reusable terminals declared. New stations and platforms will be included at A and B.';
    const retained=$('#optimizer-infrastructure-retained');retained.hidden=manualEntries.length===visible;
    retained.textContent=`${manualEntries.length-visible} reusable infrastructure ${manualEntries.length-visible===1?'entry is':'entries are'} retained outside the current search.`;
    let needsLimits=false;
    for(const stop of stops){
      const needed=selectedKinds(scope).filter(kind=>(!factoryTerminal(stop,kind,scope)||kind==='road'&&scope.includeTrams)&&!matching(stop,kind,scope).length),node=$(`[data-new-terminal="${stop}"]`);
      const hasControls=needed.length>0;
      node.hidden=!hasControls;needsLimits ||= hasControls;
      node.querySelector('[data-new-rail-length]').hidden=!needed.includes('rail');
      node.querySelector('[data-new-road-geometry]').hidden=!needed.includes('road');
      node.querySelector('[data-new-specialization]').hidden=!freight;
      node.querySelector('[data-new-bus-stop]').hidden=!needed.includes('road')||!busStopAllowed('road',scope.category,stop,sites[stop]?.type,scope.loadedReturn);
    }
    $('#optimizer-new-infrastructure').hidden=!needsLimits;
    // Closed relevant controls validate; hidden or irrelevant ones do not.
    for(const control of root.querySelectorAll('input')){
      if(control===enabled)continue;
      control.setCustomValidity('');
      let hidden=false;
      for(let parent=control.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.hidden){hidden=true;break;}
      control.disabled=!active()||hidden;
    }
    for(const entry of manualEntries)if(entry.kind==='busStop'&&inScope(entry,scope)&&(!factoryTerminal(entry.stop,entry.domain,scope)||scope.includeTrams)&&!busStopAllowed(entry.domain,scope.category,entry.stop,manualSites[entry.stop]?.type,scope.loadedReturn)){
      $(`[data-infrastructure-entry="${entry.id}"][data-infrastructure-field=kind][value=busStop]`).setCustomValidity('Bus stops serve passengers or unload freight at industrial destination B without a loaded return.');
    }
  }
  root.addEventListener('invalid',event=>{
    for(let parent=event.target.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  },true);
  root.addEventListener('input',event=>{
    const target=event.target,key=target.dataset.infrastructureField;
    if(target===enabled&&enabled.checked)$('#optimizer-new-infrastructure').open=true;
    const record=target.dataset.infrastructureSite?manualSites[target.dataset.infrastructureSite]:target.dataset.infrastructureBound?bounds[target.dataset.infrastructureBound]:manualEntries.find(entry=>entry.id===target.dataset.infrastructureEntry);
    if(record&&key){
      record[key]=target.type==='checkbox'?target.checked:target.type==='number'||key==='factoryTerminals'?(target.value===''?null:Number(target.value)):['specializedTerminal','existingSpecializedWarehouse'].includes(key)?target.value==='true':target.value;
      if(key==='platformTrackCount'&&Number.isSafeInteger(record.platformTrackCount)&&record.platformTrackCount>0){
        record.railPlatformCount=Math.max(Math.ceil(record.platformTrackCount/2),Math.min(record.platformTrackCount,record.railPlatformCount));
        $(`[data-infrastructure-entry="${record.id}"][data-infrastructure-field=railPlatformCount]`).value=record.railPlatformCount;
      }
      if(target.dataset.infrastructureSite){
        if(key==='type'&&record.type!=='warehouse')$(`[data-warehouse-options="${target.dataset.infrastructureSite}"]`).open=false;
      }
    }
    refresh();onChange();
  });
  root.addEventListener('click',event=>{
    if(event.target.closest('#optimizer-add-infrastructure')){
      const scope=getScope(),entry={id:`optimizer-reuse-${++nextId}`,stop:'',domain:scope.domain==='both'?'':scope.domain,kind:'',
        specializedTerminal:false,allowSpecialization:true,allowExtension:false,existingLength:160,maxTrainLength:RAIL_PLATFORM_MAX_LENGTH,
        platformLength:20,platformCount:1,maxPlatformLength:40,maxPlatforms:2,allowParallelPlatforms:false,
        platformTrackCount:1,railPlatformCount:1,maxPlatformTracks:2,allowParallelTracks:false};
      manualEntries.push(entry);renderEntries();$(`[data-infrastructure-entry="${entry.id}"][data-infrastructure-field=stop]`).focus();onChange();
    }
    const remove=event.target.closest('[data-remove-infrastructure]');
    if(remove){manualEntries.splice(manualEntries.findIndex(entry=>entry.id===remove.dataset.removeInfrastructure),1);renderEntries();$('#optimizer-add-infrastructure').focus();onChange();}
  });
  refresh();
  return {refresh,isActive:active,reportValidity(){
    const scope=getScope();
    for(const kind of selectedKinds(scope))for(const stop of stops){
      const factory=factoryTerminal(stop,kind,scope),group=factory&&!scope.includeTrams?[]:matching(stop,kind,scope);
      const maximum=MAX_TERMINAL_CONFIGURATIONS-(factory&&scope.includeTrams?1:0);
      if(group.length>maximum&&!declared){
        const input=$(`[data-infrastructure-entry="${group.at(-1).id}"][data-infrastructure-field=stop]:checked`);
        input.setCustomValidity(`Declare at most ${maximum} reusable infrastructures per stop and domain.`);
      }
    }
    const invalid=[...root.querySelectorAll('input')].find(control=>!control.disabled&&!control.checkValidity());
    return invalid?invalid.reportValidity():true;
  },getValue(){
    if(!active())return null;
    const scope=getScope();
    return optimizerInfrastructureValue({limitVehicleCapacity:$('#optimizer-limit-vehicle-capacity').checked,countRunningCosts:enabled.checked,sites,bounds,entries,scope});
  }};
}
