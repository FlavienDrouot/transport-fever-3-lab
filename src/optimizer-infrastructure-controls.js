import {RAIL_PLATFORM_MAX_LENGTH,busStopAllowed} from './optimizer-infrastructure.js';
import {formatNumber} from './format.js';
import {UI_TERMS as T} from './ui-terms.js';
import {MAX_TERMINAL_CONFIGURATIONS} from './optimizer-infrastructure.js';
import {RAIL_TERMINAL_ASSUMPTIONS} from './rail-terminal-service.js';

/** Declare reusable route infrastructure; unlisted terminals are built for the project. */
export function mountOptimizerInfrastructure(root,{getScope,onChange}){
  const stops=['stopA','stopB'],kinds=['rail','road'],entries=[];
  const bounds=Object.fromEntries(stops.map(stop=>[stop,{maxTrainLength:RAIL_PLATFORM_MAX_LENGTH,maxPlatformTracks:2,maxPlatformLength:40,maxPlatforms:2,allowSpecialization:true,allowBusStop:true}]));
  const sites=Object.fromEntries(stops.map(stop=>[stop,{type:'',factoryTerminals:2,existingSpecializedWarehouse:false,
    allowWarehouseSpecialization:true,allowWarehouseExpansion:false,warehouseCapacity:500,maxWarehouseCapacity:1000}]));
  let nextId=0;
  const title=stop=>stop==='stopA'?'Source · A':'Destination · B';
  const numeric=(attrs,key,label,value,min,max,step,unit='')=>`<label class="optimizer-field">${label}<span><input ${attrs} data-infrastructure-field="${key}" type="number" value="${value??''}" min="${min}" max="${max}" step="${step}" required> ${unit}</span></label>`;
  const check=(attrs,key,label,checked=false)=>`<label class="road-inline-check"><input ${attrs} data-infrastructure-field="${key}" type="checkbox"${checked?' checked':''}> ${label}</label>`;
  const toggle=(attrs,key,legend,choices,value,name,className='')=>`<fieldset class="scale-toggle ${className}"><legend>${legend}</legend>${choices.map(([v,label])=>`<label data-toggle-choice="${v}"><input ${attrs} data-infrastructure-field="${key}" type="radio" name="${name}" value="${v}"${String(value)===v?' checked':''} required><span>${label}</span></label>`).join('')}</fieldset>`;
  root.innerHTML=`<details class="panel-group" open><summary>Stops &amp; infrastructure</summary><div class="panel-group-body">
    <label class="road-inline-check"><input id="optimizer-include-infrastructure" type="checkbox"> Include infrastructure ${T.runningCosts}</label>
    <div id="optimizer-infrastructure-body" hidden>
      <section id="optimizer-infrastructure-sites" class="optimizer-infra-section"><h4>Endpoint buildings</h4><p class="chart-help">Choose the building served at each stop. Its storage and handling apply to this route.</p><div class="optimizer-infra-stops">${stops.map(stop=>{
        const attrs=`data-infrastructure-site="${stop}"`;
        return `<fieldset><legend>${title(stop)}</legend>${toggle(attrs,'type','Building',[['factory',T.industry],['warehouse','Warehouse'],['industrial','Industrial building']],'',`optimizer-building-${stop}`,'optimizer-building-toggle')}
          <p data-building-help="${stop}" class="chart-help" hidden></p>
          <div data-factory-options="${stop}">${toggle(attrs,'factoryTerminals','Parallel Road terminals',[['2','2'],['3','3']],2,`optimizer-industry-terminals-${stop}`)}<p class="chart-help">Free specialized terminals, one vehicle each.</p></div>
          <details data-warehouse-options="${stop}" class="panel-group" hidden><summary>Warehouse access <span data-warehouse-summary="${stop}"></span></summary><div class="optimizer-infra-fields">
            ${numeric(attrs,'warehouseCapacity','Existing warehouse Capacity',500,500,100000,500,T.capacityUnit)}
            ${toggle(attrs,'existingSpecializedWarehouse','Existing warehouse',[['false','Generic'],['true','Specialized']],false,`optimizer-warehouse-${stop}`)}
            <div data-warehouse-specialization="${stop}">${check(attrs,'allowWarehouseSpecialization','Allow specialization',true)}</div>
            ${check(attrs,'allowWarehouseExpansion','Allow expansion')}
            <div data-warehouse-expansion="${stop}">${numeric(attrs,'maxWarehouseCapacity','Maximum allowed warehouse Capacity',1000,500,100000,500,T.capacityUnit)}</div>
            <p class="chart-help">Existing storage is retained without attributing its upkeep to this project. Allowed expansions and specialization add their own Running costs. Each delivery load must fit the available storage.</p>
          </div></details></fieldset>`;
      }).join('')}</div></section>
      <section class="optimizer-infra-section"><h4>Reusable infrastructure</h4><p class="chart-help">Only add existing facilities available to this service.</p>
        <button id="optimizer-add-infrastructure" type="button">+ Add existing reusable infrastructure</button>
        <div id="optimizer-reusable-infrastructure"></div><p id="optimizer-infrastructure-retained" class="chart-help" hidden></p>
        <p id="optimizer-infrastructure-empty" class="chart-help"></p>
      </section>
      <details id="optimizer-new-infrastructure" class="panel-group optimizer-infra-section"><summary>New infrastructure · limits</summary><div class="panel-group-body optimizer-infra-stops">${stops.map(stop=>{
        const attrs=`data-infrastructure-bound="${stop}"`;
        return `<fieldset data-new-terminal="${stop}"><legend>${title(stop)}</legend><div data-new-rail-length>${numeric(attrs,'maxTrainLength','Maximum allowed Rail platform length',RAIL_PLATFORM_MAX_LENGTH,40,RAIL_PLATFORM_MAX_LENGTH,40,'m')}${numeric(attrs,'maxPlatformTracks','Maximum allowed platform tracks',2,1,100,1)}</div>
          <div data-new-road-geometry>${numeric(attrs,'maxPlatformLength','Maximum allowed Road platform length',40,20,10000,10,'m')}${numeric(attrs,'maxPlatforms','Maximum allowed parallel Road platforms',2,1,100,1)}</div>
          <div data-new-specialization>${check(attrs,'allowSpecialization','Allow new platform specialization',true)}</div>
          <div data-new-bus-stop>${check(attrs,'allowBusStop','Allow bus stop',true)}<p class="chart-help">$30,000/year · one vehicle at a time. The search can choose a bus stop or a station platform.</p></div></fieldset>`;
      }).join('')}<p class="chart-help">Applies where no reusable terminal is declared. Rail platforms cannot exceed ${RAIL_PLATFORM_MAX_LENGTH} m and use 40 m sections. Road: the search compares lengths and parallel platforms within your limits; the first section is 20 m, extensions add 10 m.</p></div></details>
      <p class="chart-help" data-rail-terminal-assumptions>${RAIL_TERMINAL_ASSUMPTIONS} Clearance includes half the train length and 100 m of switches on each side. Two platform tracks can share one platform.</p>
      <details class="panel-group optimizer-infra-cost-help"><summary>How infrastructure costs are calculated</summary><div class="panel-group-body">
        <p class="chart-help">Station only: add platforms without station upkeep. Station + platform: reuse the available platforms; only allowed extensions, parallel additions and specialization upgrades add upkeep. Without reusable infrastructure, include a new station. Shared platform availability is your constraint.</p>
        <p class="chart-help">Rail: $18,000/year per station, then $30,000/year per track per 40 m. Platform per 40 m: passengers $60,000/year, all freight $30,000/year, specialized freight $60,000/year. Two new platform tracks share one platform. Reusable tracks and platforms are excluded from upkeep; undeclared sides are not assumed available.</p>
        <p class="chart-help">Road: $36,000/year per station + $6,000/year access. Platform upkeep per 10 m: passengers $60,000/year, all freight $30,000/year, specialized freight $60,000/year. The initial 20 m costs twice that amount; each extension adds 10 m. A parallel platform has no separate lane surcharge.</p>
        <p class="chart-help">Places depend on vehicle length, with at least one place per platform. Serial places can block access. The search estimates throughput and mean waiting with regular arrivals, independent parallel accesses and 5 s maneuvering per visit. Waiting increases cycle time and fleet costs; traffic and propagation of queues between stops are not simulated. Bus stops cost $30,000/year and hold one vehicle; passenger service or freight unloading at industrial destination B only, without a loaded return.</p>
        <p class="chart-help">Warehouse: 500 capacity per section, $150,000/year generic or $300,000/year specialized. Existing upkeep, construction and amortization are outside this ranking.</p>
      </div></details>
    </div></div></details>`;
  const $=selector=>root.querySelector(selector),enabled=$('#optimizer-include-infrastructure'),list=$('#optimizer-reusable-infrastructure');
  const active=(entry,scope)=>scope.domain==='both'||entry.domain===scope.domain;
  const factoryTerminal=(stop,kind,scope)=>scope.category==='freight'&&kind==='road'&&sites[stop]?.type==='factory';
  const matching=(stop,kind,scope)=>entries.filter(entry=>active(entry,scope)&&entry.stop===stop&&entry.domain===kind&&entry.kind);
  const selectedKinds=scope=>scope.domain==='both'?kinds:[scope.domain];
  function renderEntries(){
    const opened=new Map([...list.querySelectorAll('[data-reusable-entry]')].map(node=>[node.dataset.reusableEntry,node.open]));
    list.innerHTML=entries.map(entry=>{
      const attrs=`data-infrastructure-entry="${entry.id}"`;
      return `<details class="panel-group optimizer-reusable-entry" data-reusable-entry="${entry.id}"${opened.get(entry.id)!==false?' open':''}><summary><span data-entry-summary></span></summary><div class="panel-group-body">
        ${toggle(attrs,'stop','Stop',[['stopA',title('stopA')],['stopB',title('stopB')]],entry.stop,`${entry.id}-stop`)}
        <div data-entry-domain>${toggle(attrs,'domain','Infrastructure',[['rail','Rail'],['road','Road']],entry.domain,`${entry.id}-domain`)}</div>
        <div data-entry-type>${toggle(attrs,'kind','Available to this project',[['station','Station only'],['platform','Station + platform'],['busStop','Bus stop']],entry.kind,`${entry.id}-kind`)}</div>
        <p class="chart-help" data-entry-factory hidden>The industry includes free specialized Road terminals. No reusable Road infrastructure declaration is needed here.</p>
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
  function refresh(){
    const scope=getScope(),freight=scope.category==='freight';
    $('#optimizer-infrastructure-body').hidden=!enabled.checked;
    $('#optimizer-infrastructure-sites').hidden=!freight;
    $('[data-rail-terminal-assumptions]').hidden=scope.domain==='road';
    for(const stop of stops){
      const site=sites[stop],options=$(`[data-warehouse-options="${stop}"]`);options.hidden=!freight||site.type!=='warehouse';
      $(`[data-factory-options="${stop}"]`).hidden=!freight||site.type!=='factory'||scope.domain==='rail';
      $(`[data-warehouse-specialization="${stop}"]`).hidden=site.existingSpecializedWarehouse;
      $(`[data-warehouse-expansion="${stop}"]`).hidden=!site.allowWarehouseExpansion;
      $(`[data-infrastructure-site="${stop}"][data-infrastructure-field=maxWarehouseCapacity]`).min=site.warehouseCapacity||500;
      $(`[data-warehouse-summary="${stop}"]`).textContent=`· ${formatNumber(site.warehouseCapacity||0,0)} ${T.capacityUnit}${site.allowWarehouseExpansion?` → ${formatNumber(site.maxWarehouseCapacity||0,0)}`:''}`;
      const help=$(`[data-building-help="${stop}"]`);help.hidden=!site.type;
      help.textContent=site.type==='factory'?'The included Road terminals are specialized and free; each holds one vehicle.':site.type==='warehouse'?'This warehouse is a fixed endpoint; choose available storage and permitted improvements.':'No building handling bonus.';
    }
    let visible=0;
    for(const entry of entries){
      if(!entry.domain&&scope.domain!=='both'){
        entry.domain=scope.domain;$(`[data-infrastructure-entry="${entry.id}"][data-infrastructure-field=domain][value="${scope.domain}"]`).checked=true;
      }
      const node=$(`[data-reusable-entry="${entry.id}"]`);node.hidden=!active(entry,scope);if(node.hidden)continue;
      visible++;
      const factory=factoryTerminal(entry.stop,entry.domain,scope);
      node.querySelector('[data-entry-summary]').textContent=[entry.stop?title(entry.stop):`Existing infrastructure ${entries.indexOf(entry)+1}`,entry.domain==='rail'?'Rail':entry.domain==='road'?'Road':'',factory?`${T.industry} terminals included`:entry.kind==='station'?'Station only':entry.kind==='platform'?'Station + platform':entry.kind==='busStop'?'Bus stop':''].filter(Boolean).join(' · ');
      // The stop is chosen first, then the optional domain, then the reusable part.
      node.querySelector('[data-entry-domain]').hidden=!entry.stop||scope.domain!=='both';
      node.querySelector('[data-entry-type]').hidden=!entry.stop||!entry.domain||factory;
      node.querySelector('[data-entry-factory]').hidden=!factory;
      const reused=entry.kind==='platform',rail=entry.domain==='rail';
      const busStop=entry.kind==='busStop',busAllowed=busStopAllowed(entry.domain,scope.category,entry.stop,sites[entry.stop]?.type,scope.loadedReturn);
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
    $('#optimizer-infrastructure-empty').textContent=selectedKinds(scope).some(kind=>stops.some(stop=>factoryTerminal(stop,kind,scope)))?'No reusable terminals declared. New terminals are included where needed; industries provide free specialized Road terminals.':'No reusable terminals declared. New stations and platforms will be included at A and B.';
    const retained=$('#optimizer-infrastructure-retained');retained.hidden=entries.length===visible;
    retained.textContent=`${entries.length-visible} reusable infrastructure ${entries.length-visible===1?'entry is':'entries are'} retained outside the current search.`;
    let needsLimits=false;
    for(const stop of stops){
      const needed=selectedKinds(scope).filter(kind=>!factoryTerminal(stop,kind,scope)&&!matching(stop,kind,scope).length),node=$(`[data-new-terminal="${stop}"]`);
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
      control.disabled=!enabled.checked||hidden;
    }
    for(const entry of entries)if(entry.kind==='busStop'&&active(entry,scope)&&!factoryTerminal(entry.stop,entry.domain,scope)&&!busStopAllowed(entry.domain,scope.category,entry.stop,sites[entry.stop]?.type,scope.loadedReturn)){
      $(`[data-infrastructure-entry="${entry.id}"][data-infrastructure-field=kind][value=busStop]`).setCustomValidity('Bus stops serve passengers or unload freight at industrial destination B without a loaded return.');
    }
  }
  root.addEventListener('invalid',event=>{
    for(let parent=event.target.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  },true);
  root.addEventListener('input',event=>{
    const target=event.target,key=target.dataset.infrastructureField;
    const record=target.dataset.infrastructureSite?sites[target.dataset.infrastructureSite]:target.dataset.infrastructureBound?bounds[target.dataset.infrastructureBound]:entries.find(entry=>entry.id===target.dataset.infrastructureEntry);
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
      entries.push(entry);renderEntries();$(`[data-infrastructure-entry="${entry.id}"][data-infrastructure-field=stop]`).focus();onChange();
    }
    const remove=event.target.closest('[data-remove-infrastructure]');
    if(remove){entries.splice(entries.findIndex(entry=>entry.id===remove.dataset.removeInfrastructure),1);renderEntries();$('#optimizer-add-infrastructure').focus();onChange();}
  });
  refresh();
  return {refresh,isEnabled:()=>enabled.checked,reportValidity(){
    const scope=getScope();
    for(const kind of selectedKinds(scope))for(const stop of stops){
      const group=factoryTerminal(stop,kind,scope)?[]:matching(stop,kind,scope);
      if(group.length>MAX_TERMINAL_CONFIGURATIONS){
        const input=$(`[data-infrastructure-entry="${group.at(-1).id}"][data-infrastructure-field=stop]:checked`);
        input.setCustomValidity(`Declare at most ${MAX_TERMINAL_CONFIGURATIONS} reusable infrastructures per stop and domain.`);
      }
    }
    const invalid=[...root.querySelectorAll('input')].find(control=>!control.disabled&&!control.checkValidity());
    return invalid?invalid.reportValidity():true;
  },getValue(){
    if(!enabled.checked)return null;
    const scope=getScope();
    return {sites:Object.fromEntries(stops.map(stop=>{
      const site=sites[stop];
      return [stop,scope.category!=='freight'?{type:'industrial'}:{type:site.type,warehouseCapacity:site.warehouseCapacity,
        ...(site.type==='factory'?{factoryTerminals:site.factoryTerminals}:{}),
        maxWarehouseCapacity:site.allowWarehouseExpansion?site.maxWarehouseCapacity:site.warehouseCapacity,
        existingSpecializedWarehouse:site.existingSpecializedWarehouse,
        warehouseSpecialization:site.existingSpecializedWarehouse?'specialized':site.allowWarehouseSpecialization?'optimize':'generic'}];
    })),...Object.fromEntries(selectedKinds(scope).map(kind=>[kind,Object.fromEntries(stops.map(stop=>{
      const available=matching(stop,kind,scope);
      if(factoryTerminal(stop,kind,scope))return [stop,{mode:'factory'}];
      return [stop,available.length?available.map(entry=>({id:entry.id,mode:entry.kind==='platform'||entry.kind==='busStop'?'reuse':'add',terminalType:entry.kind==='busStop'?'busStop':'station',
        specializedTerminal:entry.specializedTerminal,allowSpecialization:entry.allowSpecialization,allowExtension:entry.allowExtension,existingLength:entry.existingLength,
        maxTrainLength:entry.kind==='platform'&&!entry.allowExtension?entry.existingLength:entry.maxTrainLength,
        ...(kind==='rail'?{platformTrackCount:entry.platformTrackCount,platformCount:entry.railPlatformCount,
          allowParallelTracks:entry.kind==='station'||entry.allowParallelTracks,
          maxPlatformTracks:entry.kind==='platform'&&!entry.allowParallelTracks?entry.platformTrackCount:entry.maxPlatformTracks}:{}),
        ...(kind==='road'?{platformLength:entry.platformLength,platformCount:entry.platformCount,allowParallelPlatforms:entry.kind==='station'||entry.allowParallelPlatforms,
          maxPlatformLength:entry.kind==='platform'&&!entry.allowExtension?entry.platformLength:entry.maxPlatformLength,
          maxPlatforms:entry.kind==='platform'&&!entry.allowParallelPlatforms?entry.platformCount:entry.maxPlatforms}:{}),
      })):{mode:'new',...bounds[stop],allowBusStop:bounds[stop].allowBusStop&&busStopAllowed(kind,scope.category,stop,sites[stop]?.type,scope.loadedReturn)}];
    }))]))};
  }};
}
