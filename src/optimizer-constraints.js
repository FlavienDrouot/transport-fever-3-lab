import {RAIL_PLATFORM_MAX_LENGTH} from './optimizer-infrastructure.js';
import {escapeHtml,formatNumber,formatDuration} from './format.js';
import {UI_TERMS as T} from './ui-terms.js';
import {segmentLineTiers} from './optimizer-line-infrastructure.js';
import {RAIL_TERMINAL_ASSUMPTIONS} from './rail-terminal-service.js';

/** Read-only recap of current inputs, including incomplete values while editing. */
export function renderOptimizerConstraints(root,settings){
  const {domain,category,cargo,route,infrastructure}=settings,freight=category==='freight';
  const domains=domain==='both'?['rail','road']:[domain];
  const fmt=(value,digits=2)=>Number.isFinite(value)?formatNumber(value,digits):'To set';
  const row=(label,value)=>`<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  const section=(title,body)=>`<section><h4>${title}</h4>${body}</section>`;
  const list=rows=>`<dl>${rows.join('')}</dl>`;
  const range=(values,unit)=>`${fmt(Math.min(...values))}${Math.min(...values)===Math.max(...values)?'':`–${fmt(Math.max(...values))}`} ${unit}`;
  const interval=settings.minHeadwaySeconds===null&&settings.maxHeadwaySeconds===null?'No interval limit':
    settings.minHeadwaySeconds===null?`≤ ${formatDuration(settings.maxHeadwaySeconds)} between vehicles`:
    settings.maxHeadwaySeconds===null?`≥ ${formatDuration(settings.minHeadwaySeconds)} between vehicles`:
    `${formatDuration(settings.minHeadwaySeconds)}–${formatDuration(settings.maxHeadwaySeconds)} between vehicles`;
  const transport=freight?({all:'All freight',bulk:'Bulk',goods:'Goods',flatbed:'Flatbed',liquid:'Liquid'}[cargo]):'Passengers';
  let html=section('Service',list([
    row('Vehicles',domains.map(d=>d==='rail'?'Rail':settings.includeTrams?'Road + Tram':'Road').join(' + ')),row('Transport',transport),
    row(`${T.rate} · at least`,`${fmt(settings.rate)} ${T.capacityUnit}/year${freight?'':'/direction'}`),
    row(T.frequency,interval),...[[settings.maxOutboundLegSeconds,'A→B'],[settings.maxReturnLegSeconds,'B→A']].filter(([value])=>value!=null).map(([value,direction])=>row(`Max leg time ${direction}`,formatDuration(value))),row(`${T.utilization} · ceiling`,`${fmt(settings.utilization)}%`),
    ...(freight?[row('Return',settings.loadedReturn?'Loaded':'Empty')]:[])
  ]));
  html+=section('Route',list([
    row('A → B',`${fmt(route.reduce((sum,segment)=>sum+segment.distanceKm,0),4)} km · ${route.length} segment${route.length===1?'':'s'}`),
    row('Gradient A → B',range(route.map(segment=>segment.gradePercent),'%')),
    ...domains.map(kind=>row(`${kind==='rail'?'Rail':'Road'} speed limit`,range(route.map(segment=>kind==='road'?(segment.roadSpeedLimitKmh??segment.speedLimitKmh):segment.speedLimitKmh),'km/h')))
  ])+(route.length>1?`<details><summary>Segment constraints</summary><ol>${route.map(segment=>`<li>${escapeHtml(`${fmt(segment.distanceKm,4)} km · ${fmt(segment.gradePercent)}% · ${domains.map(kind=>`${kind==='rail'?'Rail':'Road'} ${fmt(kind==='road'?(segment.roadSpeedLimitKmh??segment.speedLimitKmh):segment.speedLimitKmh)} km/h`).join(' · ')}`)}</li>`).join('')}</ol></details>`:''));
  html+=section('Year & search bounds',list([
    row('Game year',Number.isFinite(settings.year)?String(settings.year):'To set'),row('Retirements',settings.ignoreRetirements?'Ignored':'Respected'),
    ...(domain!=='road'||settings.includeTrams?[row('MU coupling',settings.identicalMUsOnly?'Identical units only':'Added wagons / mixed light-rail trams allowed')]:[]),
    row('Fleet · at most',`${fmt(settings.maxFleet,0)} ${domain==='rail'?'trains':'vehicles'}`),
    ...(settings.includeTrams?[row('Road tram length · at most',`${fmt(settings.maxRoadTramLength)} m · practical limit`)]:[]),
    ...(domain!=='road'?[...(!infrastructure?[row('Train length · at most',`${fmt(settings.maxTrainLength)} m`)]:[]),row('Locomotives per train · at most',fmt(settings.maxLocomotives,0)),row('Wagons per train · at most',fmt(settings.maxWagons,0))]:[])
  ]));
  html+=section('Tracks & roads',settings.lineInfrastructure?`<p>Segment tiers optimized; route ${T.runningCosts} included.</p><ol>${route.map(segment=>`<li>${escapeHtml(`${fmt(segment.distanceKm,4)} km · ${domains.map(kind=>{
    const tiers=segmentLineTiers(segment,kind,settings.year),cap=tiers[0]?.speedConstraintKmh;
    return `${kind==='rail'?'Rail':'Road'}: ${tiers.map(tier=>tier.tierSpeedKmh).join('/')} km/h tiers${kind==='road'?` · ${segment.roadLanes??2} lanes`:segment.railTracks===2?' · 2 tracks required':' · track count: Auto'}${tiers.some(tier=>tier.speedLimitKmh<tier.tierSpeedKmh)?` · fixed limit ${fmt(cap)} km/h`:''}${tiers[0]?.city?' · City':''}`;
  }).join(' · ')}`)}</li>`).join('')}</ol>`:`<p>Route ${T.runningCosts} excluded; configured speed limits retained.</p>`);
  if(settings.includeTrams)html+=section('Tram access',`<ol>${route.map((segment,i)=>`<li>Segment ${i+1} · ${{auto:'Road / dedicated tracks optimized',road:'Road tram tracks required',dedicated:'Dedicated tram tracks required'}[segment.tramInfrastructure??'auto']}</li>`).join('')}</ol><p>Dedicated upkeep covers both directions. Highway tiers 100/120 do not accept tram tracks.</p>`);
  if(!infrastructure){
    html+=section('Stops & infrastructure',`<p>Stop infrastructure ${T.runningCosts} excluded.</p>`+
      (freight?list(['stopA','stopB'].map((stop,index)=>{
        const facilities=settings[stop];
        return row(index===0?'A':'B',[facilities.specializedTerminal?'Terminal ×2':'',facilities.specializedWarehouse?'Warehouse ×2':''].filter(Boolean).join(' + ')||'Standard handling');
      })):''));
  }else{
    html+=section('Stops & infrastructure',`<p>New installations and allowed upgrades included; existing upkeep excluded.</p>${settings.incompleteInfrastructure?`<p class="optimizer-constraint-pending">${settings.incompleteInfrastructure} declaration${settings.incompleteInfrastructure===1?'':'s'} to complete.</p>`:''}`+
      ['stopA','stopB'].map((stop,index)=>{
        const site=infrastructure.sites[stop];
        return `<div class="optimizer-constraint-stop"><h5>${index===0?'Source · A':'Destination · B'}</h5>${freight?list([
          row('Building',{factory:T.industry,warehouse:'Warehouse',industrial:'Industrial building'}[site.type]||'To set'),
          ...(site.type==='warehouse'?[row('Warehouse',`${site.existingSpecializedWarehouse?'Specialized':'Generic'} · ${fmt(site.warehouseCapacity,0)} ${T.capacityUnit}`),row('Storage expansion',site.maxWarehouseCapacity>site.warehouseCapacity?`Up to ${fmt(site.maxWarehouseCapacity,0)} ${T.capacityUnit}`:'Not allowed'),row('Warehouse specialization',site.warehouseSpecialization==='optimize'?'Allowed':site.existingSpecializedWarehouse?'Already specialized':'Not allowed')]:[])
        ]):''}${domains.map(kind=>{
          const plans=infrastructure[kind][stop];
          return `<h6>${kind==='rail'?'Rail':'Road'}</h6><ul>${(Array.isArray(plans)?plans:[plans]).map(plan=>{
            const description=[plan.terminalType==='busStop'?(plan.mode==='reuse'?'Reuse available bus stop':'New bus stop'):{new:'New station + platform',add:'Existing station · add platform',reuse:'Reuse available platform',factory:'Free industry terminals'}[plan.mode]];
            if(kind==='road'){
              if(plan.terminalType==='busStop')description.push('1 vehicle at a time');
              else if(plan.mode==='factory')description.push(`${fmt(site.factoryTerminals??2,0)} parallel terminals · 1 vehicle each`);
              else if(plan.mode!=='factory'){
                if(plan.mode==='reuse')description.push(`${fmt(plan.platformCount??1,0)} × ${fmt(plan.platformLength??20,0)} m available`,plan.allowExtension?'Extension allowed':'No extension',plan.allowParallelPlatforms?'Parallel additions allowed':'No parallel additions');
                description.push(`Length limit ${fmt(plan.maxPlatformLength??20,0)} m`,`${fmt(plan.maxPlatforms??1,0)} parallel platform${plan.maxPlatforms===1?'':'s'} at most`);
              }
              if(plan.mode==='new'&&plan.allowBusStop)description.push('Bus stop alternative allowed · 1 vehicle');
            }
            if(kind==='rail'){
              if(plan.mode==='reuse')description.push(`${fmt(plan.platformTrackCount??1,0)} tracks / ${fmt(plan.platformCount??Math.ceil((plan.platformTrackCount??1)/2),0)} platforms available`,`${fmt(plan.existingLength)} m available`,plan.allowExtension?'Extension allowed':'No extension',plan.allowParallelTracks?'Track additions allowed':'No track additions');
              description.push(`${fmt(plan.maxPlatformTracks??plan.platformTrackCount??1,0)} platform tracks at most`);
              description.push(plan.maxTrainLength!=null?`Platform limit ${fmt(plan.maxTrainLength)} m`:`Platform limit ${RAIL_PLATFORM_MAX_LENGTH} m · game maximum`);
            }
            if(freight&&plan.mode!=='factory')description.push(plan.specializedTerminal?'Specialized':plan.allowSpecialization?'Specialization allowed':'Generic only');
            return `<li>${escapeHtml(description.join(' · '))}</li>`;
          }).join('')}</ul>`;
        }).join('')}</div>`;
      }).join('')+(domain!=='road'?`<p>${RAIL_TERMINAL_ASSUMPTIONS}</p>`:'')+(domain!=='rail'?'<p>Road: 5 s maneuvering per visit; serial blocking and mean waiting estimated.</p>':''));
  }
  // Preserve the segment disclosure during live updates.
  const segmentsOpen=root.querySelector('details')?.open;
  root.innerHTML=html;
  if(segmentsOpen&&root.querySelector('details'))root.querySelector('details').open=true;
}
