import {createRoutePlan,validateRoutePlan,restoreRoutePlans,updateRoutePlanSegments,routePlanFlows,newRouteStop,newRouteBuilding,routeId,ROUTE_STORAGE_KEY} from './route-plan.js';
import {escapeHtml as escape,formatNumber} from './format.js';
import {UI_TERMS as T} from './ui-terms.js';
import {DEFAULT_INDUSTRY_OUTPUT_STORAGE_CAPACITY} from './optimizer-infrastructure.js';
import {declarationReport,terminusFlows} from './route-plan-service.js';

const fmt=n=>formatNumber(n,3);
const kinds={railPlatform:'Rail station + platform',roadPlatform:'Road station + platform',railStation:'Rail station only',roadStation:'Road station only',busStop:'Bus stop'};
const freightTypes={general:'General',bulk:'Bulk',goods:'Goods',flatbed:'Flatbed',liquid:'Liquid'};
const buildings={none:'Not specified',factory:T.industry,warehouse:'Warehouse',industrial:'Industrial building'};
const icons={factory:'🏭',warehouse:'📦',industrial:'🏢',none:'⌂'};
const COLORS=['#d99a1e','#4f7fc8','#3d9a6c','#c0508f','#8467c9','#c96a32'];
const newInfrastructure=kind=>({id:routeId('infra'),kind,...(kind==='railPlatform'?{length:840,tracks:2,platforms:1,specialized:false}:kind==='roadPlatform'?{length:20,platforms:1,specialized:false}:{})});
const directions={outbound:'A → B',return:'B → A'};

/** Saved geometry and logistics stay separate from vehicle selection and simulation. Trips declare who goes where; the grid shows the resulting boarding and flows. */
export function mountRoutePlanControls(root,{initialSegments,storage=null,onLoad,onChange=()=>{},onSelectSegment=()=>{}}){
  let plan=createRoutePlan(initialSegments),message='',invalid=false,panel=null;
  const openSections=new Set(),expanded=new Set();
  const library=new Map();let restored;
  try{restored=restoreRoutePlans(storage?.getItem(ROUTE_STORAGE_KEY));}catch{restored={routes:[],skipped:1};}
  for(const route of restored.routes)library.set(route.id,route);
  if(restored.skipped)message='Some saved routes could not be restored. Valid routes are retained.';
  root.innerHTML=`<form class="route-plan-form" novalidate>
    <div class="rp-toolbar"><label class="rp-name">Route name <input data-plan-path="name" maxlength="120" required></label><button type="button" data-route-action="save">Save route</button><button type="button" data-route-action="duplicate">Duplicate draft</button><button type="button" data-route-action="new">New route</button>
      <label class="rp-library">Saved routes <select data-route-library aria-label="Saved routes"></select></label><button type="button" data-route-action="load">Load</button><button type="button" data-route-action="delete">Remove saved route</button></div>
    <p class="route-plan-status chart-help" role="status" aria-live="polite"></p>
    <section class="rp-loads" aria-label="Loads" data-route-loads></section>
    <section class="rp-service" aria-label="Service along the line"><div data-route-grid></div><div class="rp-panel" data-route-panel></div></section>
    <section class="route-plan-summary" aria-label="What the analyses use" data-route-summary></section>
  </form>`;
  const $=selector=>root.querySelector(selector),name=$('[data-plan-path=name]'),savedSelect=$('[data-route-library]');
  const field=(path,label,value,{type='number',min=0,max=null,step='any'}={})=>`<label>${escape(label)}<input data-plan-path="${path}" type="${type}" value="${escape(value)}"${type==='number'?` min="${min}"${max==null?'':` max="${max}"`} step="${step}"`:' maxlength="120"'} required></label>`;
  const choice=(path,legend,value,options)=>`<fieldset class="scale-toggle rp-choice"><legend>${escape(legend)}</legend>${(Array.isArray(options)?options:Object.entries(options)).map(([key,label])=>`<label><input type="radio" name="${path}" data-plan-path="${path}" value="${escape(key)}"${String(value)===key?' checked':''}><span>${escape(label)}</span></label>`).join('')}</fieldset>`;
  const check=(path,label,value)=>`<label class="road-inline-check"><input type="checkbox" data-plan-path="${path}"${value?' checked':''}> ${escape(label)}</label>`;
  const freightGoods=()=>plan.goods.filter(g=>g.type!=='passengers');
  const goodOptions=(freightOnly=false)=>Object.fromEntries(plan.goods.filter(g=>!freightOnly||g.type!=='passengers').map(g=>[g.id,g.name]));
  const color=id=>{const good=plan.goods.find(g=>g.id===id);return good?.type==='passengers'?'#3d9a6c':COLORS[Math.max(0,plan.goods.indexOf(good))%COLORS.length];};
  const goodName=id=>plan.goods.find(g=>g.id===id)?.name??id,stopName=id=>plan.stops.find(s=>s.id===id)?.name??id;
  const dot=id=>`<span class="rp-dot" style="--good:${color(id)}" aria-hidden="true"></span>`;
  const remove=path=>`<button type="button" data-route-action="remove-row" data-path="${path}" aria-label="Remove entry">Remove</button>`;
  const buildingLabel=b=>`${b.name}${b.type==='none'?'':` · ${buildings[b.type]}`}`;
  const kmAt=boundary=>plan.segments.slice(0,boundary).reduce((n,s)=>n+s.distanceKm,0);
  const loadText=q=>Object.entries(q).filter(([,v])=>v.visit>1e-9||v.year>1e-9).map(([id,v])=>`${goodName(id)} ${[v.year>1e-9?`${fmt(v.year)}/yr`:'',v.visit>1e-9?`${fmt(v.visit)}/visit`:''].filter(Boolean).join(' · ')}`);
  function drawLibrary(){
    const selected=savedSelect.value;
    savedSelect.innerHTML=library.size?[...library.values()].map(r=>`<option value="${escape(r.id)}">${escape(r.name)} · ${fmt(r.segments.reduce((n,s)=>n+s.distanceKm,0))} km · ${r.stops.length} stops</option>`).join(''):'<option value="">No saved routes</option>';
    if(library.has(selected))savedSelect.value=selected;
    for(const action of ['load','delete'])$(`[data-route-action=${action}]`).disabled=!library.size;
  }
  function drawLoads(){
    const carries=plan.goods.some(g=>g.type==='passengers')?'passengers':plan.goods.length?'freight':'';
    const goods=plan.goods.map((good,i)=>`<div class="rp-good">${dot(good.id)}${field(`goods.${i}.name`,'Good name',good.name,{type:'text'})}${choice(`goods.${i}.type`,'Type',good.type??'',freightTypes)}<button type="button" data-route-action="remove-good" data-index="${i}" aria-label="Remove ${escape(good.name)}">✕</button></div>`).join('');
    $('[data-route-loads]').innerHTML=`<div class="rp-carries${carries?'':' rp-start'}"><span>${carries?'':'<b class="rp-step">Start here</b> '}This line carries</span><fieldset class="scale-toggle"><legend class="sr-only">Load category</legend>${[['passengers','Passengers'],['freight','Freight']].map(([value,label])=>`<label><input type="radio" name="rp-carries" data-route-carries value="${value}"${carries===value?' checked':''}><span>${label}</span></label>`).join('')}</fieldset></div>
      ${carries==='freight'?`${goods}${plan.goods.some(g=>!g.type)?'<p class="chart-help route-plan-warning">Choose a type for each good: it decides which vehicles can carry it.</p>':''}<button type="button" class="rp-add" data-route-action="add-good">＋ Add a good</button><p class="chart-help">General needs general-purpose vehicles; Bulk, Goods, Flatbed and Liquid also admit them.</p>`
        :carries==='passengers'?'<p class="chart-help">Passengers board and alight at the stops below. The Rate is per direction.</p>':'<p class="rp-start-help">Choose Passengers or Freight first: trips and storage need to know what the line carries.</p>'}`;
  }
  /** One trip's form, shown in the details panel. */
  function tripForm(trip,k){
    const passengers=plan.goods.some(g=>g.type==='passengers'),stops=Object.fromEntries(plan.stops.map(s=>[s.id,s.name])),p=`trips.${k}`;
    const from=plan.stops.find(s=>s.id===trip.from),to=plan.stops.find(s=>s.id===trip.to);
    const building=(stop,key,label,value)=>stop.buildings.length?choice(`${p}.${key}`,label,value??'',[['','Not specified'],...stop.buildings.map(b=>[b.id,buildingLabel(b)])]):'';
    return `<div class="route-plan-row">${plan.goods.length>1?choice(`${p}.cargoId`,'Good',trip.cargoId,goodOptions()):''}${choice(`${p}.from`,'From',trip.from,stops)}${choice(`${p}.to`,'To',trip.to,stops)}</div>
      <div class="route-plan-row">${field(`${p}.rate`,`${T.rate} · ${T.capacityUnit}/year`,trip.rate,{min:0,max:1e12})}${check(`${p}.bothWays`,'Same in the other direction',trip.bothWays)}</div>
      ${from.buildings.length||to.buildings.length?`<div class="route-plan-row">${building(from,'fromBuildingId',`${passengers?'At':'From'} ${from.name}`,trip.fromBuildingId)}${building(to,'toBuildingId',`${passengers?'At':'To'} ${to.name}`,trip.toBuildingId)}</div>`:''}
      <div class="route-plan-row"><button type="button" data-route-action="remove-row" data-path="${p}">Remove trip</button><button type="button" data-route-action="close-panel">Done</button></div>
      <p class="chart-help">The trip loads at its start and unloads at its end. “Same in the other direction” adds the return trip with the same ${T.rate}. Infrastructure limits belong to the stops.</p>`;
  }
  const legs=trip=>[[trip.from,trip.to],...(trip.bothWays?[[trip.to,trip.from]]:[])];
  const tripChip=(trip,from,to,here)=>`<button type="button" class="rp-op rp-${from===here?'load':'unload'}" data-route-action="open-trip" data-trip="${escape(trip.id)}" aria-expanded="${panel?.kind==='trip'&&panel.id===trip.id}">${dot(trip.cargoId)}${from===here?`⬆ ${plan.goods.length>1?`${escape(goodName(trip.cargoId))} `:''}to ${escape(stopName(to))}`:`⬇ from ${escape(stopName(from))}`} ${fmt(trip.rate)}/yr${trip.bothWays?' ⇄':''}</button>`;
  function stopHead(stop,i){
    const badges=[...stop.buildings.map(b=>`<span class="rp-badge">${icons[b.type]} ${escape(b.name)}${b.type==='warehouse'&&b.warehouseSpecializedFor?` · ${escape(goodName(b.warehouseSpecializedFor))} only`:''}</span>`),
      ...stop.infrastructure.map(e=>`<span class="rp-badge">${e.kind.startsWith('rail')?'🚉':'🚏'} ${escape(e.kind.endsWith('Platform')?`${e.kind==='railPlatform'?'Rail':'Road'} ${e.length} m${e.specialized?' · specialized':''}`:kinds[e.kind])}</span>`)];
    return `<button type="button" class="rp-stop-head" data-route-action="open-stop" data-stop="${i}" aria-expanded="${panel?.kind==='stop'&&panel.id===stop.id}"><span class="rp-stop-name">${escape(stop.name)}</span><small>${fmt(kmAt(stop.boundary))} km</small>${badges.join('')||'<span class="rp-badge rp-faint">＋ Buildings &amp; infrastructure</span>'}</button>`;
  }
  function opCell(stop,i,direction){
    const index=new Map(plan.stops.map((s,k)=>[s.id,k])),chips=[];
    for(const trip of plan.trips)for(const [from,to] of legs(trip))if((index.get(from)<index.get(to))===(direction==='outbound')&&(from===stop.id||to===stop.id))chips.push(tripChip(trip,from,to,stop.id));
    const target=direction==='outbound'?plan.stops.at(-1):plan.stops[0];
    return `<div class="rp-cell"><span class="rp-cell-label">${directions[direction]}</span>${chips.join('')}${stop.id!==target.id?`<button type="button" class="rp-op rp-add" data-route-action="add-trip" data-from="${stop.id}" data-to="${target.id}" aria-label="Add a trip from ${escape(stop.name)}, ${directions[direction]}">＋</button>`:''}</div>`;
  }
  function band(section,direction){
    const items=section?Object.entries(section.load).filter(([,v])=>v.visit>1e-9||v.year>1e-9):[];
    return `<div class="rp-band${items.length?'':' rp-empty'}" data-dir="${directions[direction]}">${items.length?items.map(([id])=>`<span>${dot(id)}${escape(loadText({[id]:section.load[id]})[0])}</span>`).join(''):'Empty'}</div>`;
  }
  function drawGrid(){
    const flows=terminusFlows(plan),columns=[`<div class="rp-col rp-labels" aria-hidden="true"><span></span><span>A → B</span><span>B → A</span></div>`];
    plan.stops.forEach((stop,i)=>{
      columns.push(`<div class="rp-col rp-stop${i===0||i===plan.stops.length-1?' rp-end':''}" data-route-stop="${escape(stop.id)}">${stopHead(stop,i)}${opCell(stop,i,'outbound')}${opCell(stop,i,'return')}</div>`);
      const next=plan.stops[i+1];if(!next)return;
      const segments=[];
      for(let j=stop.boundary;j<next.boundary;j++){
        const s=plan.segments[j],a=plan.segmentAssets[j],existing=[a.railTier&&`Rail ${a.railTier} · ${a.railTracks} track${a.railTracks===1?'':'s'}`,a.roadTier&&`Road ${a.roadTier}`,a.tramTracks!=='none'&&`Tram ${a.tramTracks==='road'?'street':'dedicated'}`].filter(Boolean);
        if(j>stop.boundary)segments.push(`<button type="button" class="rp-add-stop" data-route-action="add-stop" data-boundary="${j}" aria-label="Add a stop at ${fmt(kmAt(j))} km">＋ stop</button>`);
        segments.push(`<button type="button" class="rp-segment" data-route-action="open-segment" data-index="${j}" aria-expanded="${panel?.kind==='segment'&&panel.index===j}"><b>${j+1}</b> ${fmt(s.distanceKm)} km · ${s.gradePercent>0?'+':''}${fmt(s.gradePercent)}%<small>${escape(existing.join(' · ')||'No existing infrastructure')}</small></button>`);
      }
      columns.push(`<div class="rp-col rp-lane"><div class="rp-segments">${segments.join('')}</div>${band(flows.sections.find(s=>s.direction==='outbound'&&s.from===stop.id),'outbound')}${band(flows.sections.find(s=>s.direction==='return'&&s.to===stop.id),'return')}</div>`);
    });
    const grid=$('[data-route-grid]');
    grid.innerHTML=`<div class="rp-grid" style="grid-template-columns:auto ${plan.stops.map(()=>'minmax(150px,1fr)').join(' minmax(130px,1fr) ')}">${columns.join('')}</div>`;
  }
  const editButton=(id,label)=>`<button type="button" class="rp-edit" data-route-action="edit-item" data-item="${escape(id)}" aria-label="Edit ${escape(label)}">Edit</button>`;
  const doneRow=(id,removeButton)=>`<div class="route-plan-row rp-item-actions">${removeButton}<button type="button" class="rp-done" data-route-action="done-item" data-item="${escape(id)}">Done</button></div>`;
  function buildingSummary(building){
    const storage=building.storage.map(row=>`${goodName(row.cargoId)} ${building.type==='factory'&&row.side==='output'?'out':'in'} ${fmt(row.capacity)}`);
    const recipe=building.recipe.outputs.length?`${building.recipe.inputs.map(r=>`${fmt(r.ratio)} ${goodName(r.cargoId)}`).join(' + ')||'—'} → ${building.recipe.outputs.map(r=>`${fmt(r.ratio)} ${goodName(r.cargoId)}`).join(' + ')}`:'';
    const details=[buildings[building.type],building.type==='factory'?`${building.industryTerminals} Truck terminals`:'',building.type==='warehouse'?`${fmt(building.warehouseCapacity)} ${T.capacityUnit}${building.warehouseSpecializedFor?` · ${goodName(building.warehouseSpecializedFor)} only`:''}`:'',storage.length?`storage: ${storage.join(', ')}`:'',recipe?`recipe: ${recipe}`:''].filter(Boolean);
    return `<article class="rp-item-summary">${icons[building.type]} <b>${escape(building.name)}</b><span>${escape(details.join(' · '))}</span>${editButton(building.id,building.name)}</article>`;
  }
  function buildingBody(building,i,j){
    if(!expanded.has(building.id))return buildingSummary(building);
    const base=`stops.${i}.buildings.${j}`,freight=freightGoods();
    const stocks=building.storage.map((stock,k)=>{const p=`${base}.storage.${k}`;return `<div class="route-plan-row">${choice(`${p}.cargoId`,'Good',stock.cargoId,goodOptions(true))}${building.type==='factory'?choice(`${p}.side`,'Storage',stock.side,[['input','Input'],['output','Output']]):''}${building.type==='industrial'?field(`${p}.capacity`,`Input limit · ${T.capacityUnit}`,stock.capacity,{min:1,step:1}):field(`${p}.capacity`,`${stock.side==='input'?'Input':'Output'} storage ${T.capacity}`,stock.capacity,{min:100,step:100})}${remove(p)}</div>`;}).join('');
    const recipe=['inputs','outputs'].map(key=>`<h5>${key==='inputs'?'Inputs':'Outputs'}</h5>${building.recipe[key].map((r,k)=>{const p=`${base}.recipe.${key}.${k}`;return `<div class="route-plan-row">${choice(`${p}.cargoId`,'Good',r.cargoId,goodOptions(true))}${field(`${p}.ratio`,'Recipe ratio',r.ratio,{min:0,max:1e9})}${remove(p)}</div>`;}).join('')}<button type="button" data-route-action="add-recipe" data-stop="${i}" data-building="${j}" data-side="${key}"${freight.length?'':' disabled'}>Add ${key==='inputs'?'input':'output'}</button>`).join('');
    const production=terminusFlows(plan).production.find(p=>p.buildingId===building.id);
    const needs=production&&!production.incomplete&&Object.keys(production.required.year).length?`<ul class="chart-help">${Object.entries(production.required.year).map(([id,n])=>`<li>${escape(`${goodName(id)}: ${fmt(n)} ${T.capacityUnit}/year required; ${fmt(production.incoming.year[id]??0)} delivered by this route`)}</li>`).join('')}</ul>`:'';
    return `<article class="rp-building"><div class="route-plan-row">${field(`${base}.name`,'Building name',building.name,{type:'text'})}${choice(`${base}.type`,'Building type',building.type,buildings)}</div>
      ${building.type==='factory'?`<div class="route-plan-row">${choice(`${base}.industryTerminals`,'Included parallel Truck terminals',building.industryTerminals,{'2':'2','3':'3'})}</div>`:''}
      ${building.type==='warehouse'?`<div class="route-plan-row">${field(`${base}.warehouseCapacity`,`Shared warehouse ${T.capacity}`,building.warehouseCapacity,{min:500,max:100000,step:500})}${choice(`${base}.warehouseSpecializedFor`,'Specialization',building.warehouseSpecializedFor??'',[['','All goods'],...freight.filter(g=>g.type!=='general').map(g=>[g.id,`${g.name} only`])])}</div>`:''}
      ${['factory','industrial'].includes(building.type)?`<details class="panel-group" data-keep="storage:${escape(building.id)}"><summary>${building.type==='factory'?'Storage by good':'Input storage by good'}${building.storage.length?` · ${building.storage.length}`:''}</summary><div class="panel-group-body">${stocks}<button type="button" data-route-action="add-storage" data-stop="${i}" data-building="${j}"${freight.length>building.storage.length?'':' disabled'}>Add storage</button><p class="chart-help">${building.type==='factory'?'Each good is stored either as an input or as an output of this Industry. Capacities use multiples of 100.':'An industrial building only accepts goods; its limit is any whole number.'}</p></div></details>`:''}
      ${building.type==='factory'?`<details class="panel-group" data-keep="recipe:${escape(building.id)}"${building.recipe.inputs.length||building.recipe.outputs.length?' open':''}><summary>Industry recipe</summary><div class="panel-group-body">${recipe}${needs}<p class="chart-help">Ratios describe one production cycle, for example 2 A + 1 B → 3 C. Only operations assigned to this Industry enter its requirements.</p></div></details>`:''}
      ${doneRow(building.id,`<button type="button" data-route-action="remove-building" data-stop="${i}" data-building="${j}">Remove building</button>`)}
    </article>`;
  }
  const infrastructureText=entry=>[kinds[entry.kind],entry.kind.endsWith('Platform')?`${entry.length} m`:'',entry.kind==='railPlatform'?`${entry.tracks} track${entry.tracks===1?'':'s'} · ${entry.platforms} platform${entry.platforms===1?'':'s'}`:entry.kind==='roadPlatform'?`${entry.platforms} parallel platform${entry.platforms===1?'':'s'}`:'',entry.specialized?'specialized':''].filter(Boolean).join(' · ');
  function infrastructureRow(entry,i,j){
    const p=`stops.${i}.infrastructure.${j}`,rail=entry.kind==='railPlatform';
    if(!expanded.has(entry.id))return `<article class="rp-item-summary">${entry.kind.startsWith('rail')?'🚉':'🚏'} <span>${escape(infrastructureText(entry))}</span>${editButton(entry.id,kinds[entry.kind])}</article>`;
    return `<article class="rp-building"><div class="route-plan-row">${choice(`${p}.kind`,'Existing infrastructure',entry.kind,kinds)}</div>${entry.kind.endsWith('Platform')?`<div class="route-plan-row">${field(`${p}.length`,'Platform length · m',entry.length,{min:rail?40:20,max:rail?840:10000,step:rail?40:10})}${field(`${p}.platforms`,rail?'Platforms':'Parallel platforms',entry.platforms,{min:rail?Math.ceil(entry.tracks/2):1,max:rail?entry.tracks:100,step:1})}${rail?field(`${p}.tracks`,'Platform tracks',entry.tracks,{min:1,max:100,step:1}):''}${check(`${p}.specialized`,'Specialized freight platform',entry.specialized)}</div>`:entry.kind==='busStop'?'<p class="chart-help">No specified length; one vehicle at a time. Freight unloading at industrial buildings only.</p>':'<p class="chart-help">Station exists; no available platform is assumed.</p>'}${doneRow(entry.id,`<button type="button" data-route-action="remove-row" data-path="${p}">Remove</button>`)}</article>`;
  }
  function drawPanel(){
    const slot=$('[data-route-panel]');
    const close='<button type="button" class="rp-close" data-route-action="close-panel" aria-label="Close details">✕</button>';
    if(panel?.kind==='stop'){
      const i=plan.stops.findIndex(s=>s.id===panel.id),stop=plan.stops[i];
      if(!stop){panel=null;slot.innerHTML='';return;}
      slot.innerHTML=`<div class="rp-panel-head"><h4>${escape(stop.name)} · ${fmt(kmAt(stop.boundary))} km</h4>${close}</div>
        <div class="route-plan-row">${field(`stops.${i}.name`,'Stop name',stop.name,{type:'text'})}${i>0&&i<plan.stops.length-1?`<button type="button" data-route-action="remove-stop" data-stop="${i}">Remove stop</button>`:''}</div>
        <h5>Trips</h5><div class="rp-cell rp-panel-trips">${plan.trips.filter(t=>t.from===stop.id||t.to===stop.id).map(t=>tripChip(t,t.from,t.to,stop.id)).join('')||'<span class="chart-help">No trip starts or ends here.</span>'}${plan.goods.length?`<button type="button" class="rp-op rp-add" data-route-action="add-trip" data-from="${stop.id}" data-to="${(i===plan.stops.length-1?plan.stops[0]:plan.stops.at(-1)).id}">＋ Trip from here</button>`:''}</div>
        <h5>Buildings served</h5>${stop.buildings.map((b,j)=>buildingBody(b,i,j)).join('')}<button type="button" data-route-action="add-building" data-stop="${i}"${stop.buildings.length>=20?' disabled':''}>＋ Add building</button>
        <h5>Existing infrastructure</h5>${stop.infrastructure.map((e,j)=>infrastructureRow(e,i,j)).join('')}<button type="button" data-route-action="add-infrastructure" data-stop="${i}">＋ Add infrastructure</button>
        <p class="chart-help">Assign each loading or unloading to its own building. Infrastructure limits belong here, not to the service.</p>`;
    }else if(panel?.kind==='segment'){
      const j=panel.index,s=plan.segments[j],a=plan.segmentAssets[j],p=`segmentAssets.${j}`;
      if(!s){panel=null;slot.innerHTML='';return;}
      slot.innerHTML=`<div class="rp-panel-head"><h4>Segment ${j+1} · ${fmt(s.distanceKm)} km · ${s.gradePercent>0?'+':''}${fmt(s.gradePercent)}%</h4>${close}</div>
        <p class="chart-help">Declare what already exists, independently of curve or gradient limits. <button type="button" class="rp-link" data-route-action="select-segment" data-index="${j}">Edit its length, grade and limits on the map ↑</button></p>
        <div class="route-plan-row">${choice(`${p}.railTier`,'Existing Rail tier',a.railTier??'none',[['none','None'],['100','100'],['160','160'],['350','350 km/h']])}${choice(`${p}.railTracks`,'Rail tracks',a.railTracks,{1:'1',2:'2'})}</div>
        <div class="route-plan-row">${choice(`${p}.roadTier`,'Existing Road tier',a.roadTier??'none',[['none','None'],['40','40'],['60','60'],['50','50 · city'],['80','80'],['100','100'],['120','120 km/h']])}${choice(`${p}.roadLanes`,'Road lanes',a.roadLanes,a.roadTier===100?{2:'2'}:a.roadTier===120?{4:'4'}:{2:'2',4:'4'})}${choice(`${p}.tramTracks`,'Tram tracks',a.tramTracks,{none:'None',road:'On the Road',dedicated:'Dedicated · 2 tracks'})}</div>
        <p class="chart-help">100 km/h Road has 2 lanes and 120 has 4; neither carries street Tram tracks. Dedicated Tram tracks cover both directions.</p>`;
    }else if(panel?.kind==='trip'){
      const k=plan.trips.findIndex(t=>t.id===panel.id),trip=plan.trips[k];
      if(!trip){panel=null;slot.innerHTML='';return;}
      slot.innerHTML=`<div class="rp-panel-head"><h4>${dot(trip.cargoId)} ${escape(goodName(trip.cargoId))} · ${escape(stopName(trip.from))} ${trip.bothWays?'⇄':'→'} ${escape(stopName(trip.to))}</h4>${close}</div>${tripForm(trip,k)}`;
    }else slot.innerHTML='';
  }
  function drawSummary(){
    const {used,issues}=declarationReport(plan),flows=routePlanFlows(plan),last=plan.stops.at(-1);
    const onboard=loadText(flows.visits.find(v=>v.direction==='outbound'&&v.stopId===last.id).load);
    const warnings=[...flows.warnings.map(w=>`${stopName(w.stopId)} · ${goodName(w.cargoId)}: ${w.message}`),...issues];
    const notes=onboard.length?[`Still onboard at ${last.name} after its declared unloading: ${onboard.join('; ')}. B is the terminus, so it is delivered there.`]:[];
    $('[data-route-summary]').innerHTML=`<h3>While this custom route is in use</h3><ul class="rp-checklist">${used.map(item=>`<li class="rp-ok">${escape(item.text)}</li>`).join('')||'<li class="rp-none">Nothing is used yet: declare a load, existing tiers or endpoint infrastructure.</li>'}${notes.map(text=>`<li class="rp-info">${escape(text)}</li>`).join('')}${warnings.map(text=>`<li class="rp-warn">${escape(text)}</li>`).join('')}</ul>`;
  }
  function refreshStatus(error=null){
    invalid=!!error;$('[data-route-action=save]').disabled=invalid;
    $('[data-route-action=save]').textContent=library.has(plan.id)?'Update route':'Save route';
    const status=$('.route-plan-status');status.textContent=error?.message??message;status.classList.toggle('route-plan-warning',invalid);
  }
  /** Redraw everything below the toolbar while keeping the focused control. */
  function drawBody(){
    const active=root.ownerDocument.activeElement,path=active?.dataset?.planPath,action=active?.dataset?.routeAction,key=active?.dataset?.op??active?.dataset?.stop??active?.dataset?.index;
    const kept=new Map([...root.querySelectorAll('details[data-keep]')].map(el=>[el.dataset.keep,el.open]));
    drawLoads();drawGrid();drawPanel();drawSummary();
    for(const el of root.querySelectorAll('details[data-keep]'))if(kept.has(el.dataset.keep)||openSections.has(el.dataset.keep))el.open=kept.get(el.dataset.keep)||openSections.has(el.dataset.keep);
    openSections.clear();
    if(path)(root.querySelector(`[data-plan-path="${path}"]:checked`)??(active.type==='radio'?null:root.querySelector(`[data-plan-path="${path}"]`)))?.focus();
    else if(action)root.querySelector(`[data-route-action="${action}"]${key==null?'':`[data-${active.dataset.op?'op':active.dataset.stop?'stop':'index'}="${key}"]`}`)?.focus();
  }
  function draw(){name.value=plan.name;drawLibrary();drawBody();refreshStatus();}
  function read(){
    const candidate=structuredClone(plan);
    for(const input of root.querySelectorAll('[data-plan-path]')){
      if(input.disabled||input.type==='radio'&&!input.checked)continue;
      const parts=input.dataset.planPath.split('.'),key=parts.pop();let record=candidate;for(const p of parts)record=record[p];
      record[key]=input.type==='checkbox'?input.checked:input.type==='number'?input.value===''?null:input.valueAsNumber:input.value;
      if(['buildingId','warehouseSpecializedFor','fromBuildingId','toBuildingId'].includes(key)||key==='type'&&parts[0]==='goods')record[key]=input.value||null;
      else if(['industryTerminals','railTracks','roadLanes'].includes(key))record[key]=Number(input.value);
      else if(['railTier','roadTier'].includes(key))record[key]=input.value==='none'?null:Number(input.value);
    }
    return candidate;
  }
  function accept(candidate,{redraw=true}={}){
    try{
      const next=validateRoutePlan(candidate);routePlanFlows(next);plan=next;message='';
      if(redraw)drawBody();else{drawGrid();drawSummary();for(const title of root.querySelectorAll('.rp-panel-head h4'))if(panel?.kind==='stop'&&plan.stops.some(s=>s.id===panel.id))title.textContent=`${plan.stops.find(s=>s.id===panel.id).name} · ${fmt(kmAt(plan.stops.find(s=>s.id===panel.id).boundary))} km`;}
      refreshStatus();onChange(structuredClone(plan));return true;
    }catch(error){refreshStatus(error);if(redraw)drawBody();return false;}
  }
  function persist(){
    let saved=false;
    try{const raw=JSON.stringify({schemaVersion:1,routes:[...library.values()]});if(raw.length>4_000_000)throw new RangeError('Route library exceeds browser storage limits.');if(storage){storage.setItem(ROUTE_STORAGE_KEY,raw);saved=true;}}catch{}
    message=saved?'Saved in this browser.':'Kept for this session; browser storage is unavailable. Keep this page open.';drawLibrary();refreshStatus();return saved;
  }
  const referenced=(candidate,id)=>candidate.trips.some(t=>t.cargoId===id)||candidate.stops.some(s=>s.buildings.flatMap(b=>[...b.storage,...b.recipe.inputs,...b.recipe.outputs]).some(r=>r.cargoId===id));
  root.addEventListener('input',event=>{
    const input=event.target;
    if(input.matches('[data-route-carries]')){
      const candidate=read(),wanted=input.value,other=candidate.goods.filter(g=>(g.type==='passengers')!==(wanted==='passengers'));
      if(other.some(g=>referenced(candidate,g.id))){refreshStatus(new RangeError(`Remove the operations, storage and recipes using ${other.map(g=>g.name).join(', ')} first.`));drawLoads();return;}
      candidate.goods=wanted==='passengers'?[{id:routeId('good'),name:'Passengers',type:'passengers'}]:[{id:routeId('good'),name:'Good 1',type:null}];
      accept(candidate);return;
    }
    if(!input.hasAttribute('data-plan-path'))return;
    if(!input.checkValidity()){refreshStatus(new RangeError(input.validationMessage));return;}
    const candidate=read(),path=input.dataset.planPath.split('.');
    for(const asset of candidate.segmentAssets)if(asset.roadTier===100)asset.roadLanes=2;else if(asset.roadTier===120)asset.roadLanes=4;
    if(path[2]==='buildings'&&path.at(-1)==='type'){const building=candidate.stops[Number(path[1])].buildings[Number(path[3])];building.storage=building.type==='factory'?building.storage:building.type==='industrial'?building.storage.map(row=>({...row,side:'input'})):[];}
    if(path.at(-1)==='kind'){const i=Number(path[1]),j=Number(path[3]);candidate.stops[i].infrastructure[j]={...newInfrastructure(input.value),id:plan.stops[i].infrastructure[j].id};}
    if(path.at(-1)==='tracks'){const entry=candidate.stops[Number(path[1])].infrastructure[Number(path[3])];entry.platforms=Math.max(Math.ceil(entry.tracks/2),Math.min(entry.platforms,entry.tracks));}
    if(path[0]==='trips'&&['from','to'].includes(path.at(-1))){const trip=candidate.trips[Number(path[1])];trip[`${path.at(-1)}BuildingId`]=null;if(trip.from===trip.to){const other=plan.trips[Number(path[1])][path.at(-1)==='from'?'from':'to'];trip[path.at(-1)==='from'?'to':'from']=other;}}
    if(path[0]==='name'){accept(candidate,{redraw:false});return;}
    accept(candidate,{redraw:input.type==='radio'||input.type==='checkbox'});
  });
  root.addEventListener('change',event=>{if(event.target.hasAttribute('data-plan-path')&&!event.target.checkValidity())event.target.reportValidity();});
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-route-action]');if(!button)return;
    const action=button.dataset.routeAction,i=Number(button.dataset.stop);
    if(action==='select-segment'){onSelectSegment(Number(button.dataset.index));return;}
    const toggle=next=>{panel=panel&&JSON.stringify(panel)===JSON.stringify(next)?null:next;drawBody();if(panel){$('[data-route-panel]').scrollIntoView({block:'nearest'});$('[data-route-panel] input:not([type=radio]),[data-route-panel] input:checked')?.focus({preventScroll:true});}};
    if(action==='open-stop'){toggle({kind:'stop',id:plan.stops[i].id});return;}
    if(action==='open-segment'){toggle({kind:'segment',index:Number(button.dataset.index)});return;}
    if(action==='open-trip'){toggle({kind:'trip',id:button.dataset.trip});return;}
    if(action==='edit-item'){expanded.add(button.dataset.item);drawBody();root.querySelector(`[data-route-action="done-item"][data-item="${button.dataset.item}"]`)?.closest('article')?.querySelector('input:not([type=radio]),input:checked')?.focus();return;}
    if(action==='done-item'){
      const bad=button.closest('article').querySelector('[data-plan-path]:invalid');
      if(bad){bad.reportValidity();return;}if(invalid)return;
      expanded.delete(button.dataset.item);drawBody();root.querySelector(`[data-route-action="edit-item"][data-item="${button.dataset.item}"]`)?.focus();return;
    }
    if(action==='add-trip'&&!plan.goods.length){const start=$('.rp-carries');start.classList.remove('rp-flash');void start.offsetWidth;start.classList.add('rp-flash');start.scrollIntoView({block:'nearest'});start.querySelector('input').focus({preventScroll:true});refreshStatus(new RangeError('Choose Passengers or Freight first.'));return;}
    if(action==='close-panel'){const prior=panel;panel=null;drawBody();(prior?.kind==='trip'?$(`[data-trip="${prior.id}"]`):prior?.kind==='stop'?$(`[data-route-stop="${prior.id}"] .rp-stop-head`):$(`[data-route-action="open-segment"][data-index="${prior?.index}"]`))?.focus();return;}
    if(action==='load'){
      const loaded=library.get(savedSelect.value);if(!loaded)return;
      plan=structuredClone(loaded);panel=null;message='Saved route loaded.';draw();onLoad(structuredClone(plan));onChange(structuredClone(plan));return;
    }
    if(action==='delete'){library.delete(savedSelect.value);const persisted=persist();message=`Saved route removed${persisted?'':' for this session only'}; the current draft is retained.${persisted?'':' Browser storage is unavailable.'}`;refreshStatus();return;}
    if(action==='new'){plan=createRoutePlan(initialSegments);panel=null;message='New route draft.';draw();onLoad(structuredClone(plan));onChange(structuredClone(plan));return;}
    const candidate=read();
    if(action==='save'){
      const bad=root.querySelector('[data-plan-path]:invalid');if(bad){bad.reportValidity();return;}
      if(!accept(candidate,{redraw:false}))return;
      if(!library.has(plan.id)&&library.size>=100){refreshStatus(new RangeError('Limit: 100 saved routes.'));return;}
      library.set(plan.id,structuredClone(plan));persist();savedSelect.value=plan.id;return;
    }
    if(action==='duplicate'){candidate.id=routeId('route');candidate.name=`${candidate.name.slice(0,110)} · copy`;name.value=candidate.name;}
    else if(action==='add-good'){if(candidate.goods.length>=50){refreshStatus(new RangeError('Limit: 50 goods.'));return;}let n=candidate.goods.length+1;while(candidate.goods.some(g=>g.name===`Good ${n}`))n++;candidate.goods.push({id:routeId('good'),name:`Good ${n}`,type:null});}
    else if(action==='remove-good'){
      const id=candidate.goods[Number(button.dataset.index)].id;
      if(referenced(candidate,id)){refreshStatus(new RangeError('Remove the operations, storage and recipe entries using this good first.'));return;}
      candidate.goods.splice(Number(button.dataset.index),1);
    }else if(action==='add-stop'){const stop=newRouteStop(Number(button.dataset.boundary),`Stop ${candidate.stops.length}`);candidate.stops.push(stop);panel={kind:'stop',id:stop.id};}
    else if(action==='remove-stop'){if(i<=0||i>=candidate.stops.length-1)return;const id=candidate.stops[i].id;if(candidate.trips.some(t=>t.from===id||t.to===id)){refreshStatus(new RangeError('Remove or change the trips using this stop first.'));return;}candidate.stops.splice(i,1);panel=null;}
    else if(action==='add-infrastructure'){const entry=newInfrastructure('railPlatform');candidate.stops[i].infrastructure.push(entry);expanded.add(entry.id);}
    else if(action==='add-trip'){
      if(candidate.trips.length>=200){refreshStatus(new RangeError('Limit: 200 trips.'));return;}
      const good=candidate.goods[0],trip={id:routeId('trip'),cargoId:good.id,from:button.dataset.from,to:button.dataset.to,rate:1000,bothWays:good.type==='passengers',fromBuildingId:null,toBuildingId:null};candidate.trips.push(trip);panel={kind:'trip',id:trip.id};
    }else if(action==='add-building'){
      if(candidate.stops[i].buildings.length>=20){refreshStatus(new RangeError('Limit: 20 buildings per stop.'));return;}
      let n=candidate.stops[i].buildings.length+1;while(candidate.stops[i].buildings.some(b=>b.name===`Building ${n}`))n++;
      const building=newRouteBuilding(`Building ${n}`);candidate.stops[i].buildings.push(building);expanded.add(building.id);
    }else if(action==='remove-building'){
      const j=Number(button.dataset.building),id=candidate.stops[i].buildings[j].id;
      if(candidate.trips.some(t=>t.fromBuildingId===id||t.toBuildingId===id)){refreshStatus(new RangeError('Change the trips using this building first.'));return;}
      candidate.stops[i].buildings.splice(j,1);
    }else if(action==='add-storage'){
      const building=candidate.stops[i].buildings[Number(button.dataset.building)],unused=candidate.goods.find(g=>g.type!=='passengers'&&!building.storage.some(r=>r.cargoId===g.id));
      if(!unused){refreshStatus(new RangeError('All goods already have storage in this building.'));return;}
      const output=building.type==='factory'&&(candidate.trips.some(t=>t.cargoId===unused.id&&t.fromBuildingId===building.id)||building.recipe.outputs.some(r=>r.cargoId===unused.id));
      building.storage.push({id:routeId('stock'),cargoId:unused.id,side:output?'output':'input',capacity:output?DEFAULT_INDUSTRY_OUTPUT_STORAGE_CAPACITY:100});openSections.add(`storage:${building.id}`);
    }else if(action==='add-recipe'){
      const building=candidate.stops[i].buildings[Number(button.dataset.building)],side=button.dataset.side,unused=candidate.goods.find(g=>g.type!=='passengers'&&!building.recipe[side].some(r=>r.cargoId===g.id));
      if(!unused){refreshStatus(new RangeError('Each good can appear once on this side of this building recipe.'));return;}
      building.recipe[side].push({id:routeId('recipe'),cargoId:unused.id,ratio:1});openSections.add(`recipe:${building.id}`);
    }else if(action==='remove-row'){const parts=button.dataset.path.split('.'),index=Number(parts.pop());let rows=candidate;for(const p of parts)rows=rows[p];if(rows[index]?.id===panel?.id)panel=null;rows.splice(index,1);}
    else return;
    if(accept(candidate)){if(panel&&action==='add-stop'){$('[data-route-panel]').scrollIntoView({block:'nearest'});$('[data-route-panel] input:not([type=radio])')?.focus({preventScroll:true});}if(action==='add-trip'){$('[data-route-panel]').scrollIntoView({block:'nearest'});$('[data-route-panel] [data-plan-path$=".rate"]')?.focus({preventScroll:true});}}
  });
  root.querySelector('form').addEventListener('submit',event=>{event.preventDefault();$('[data-route-action=save]').click();});
  root.addEventListener('invalid',event=>{for(let p=event.target.parentElement;p&&p!==root;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;},true);
  draw();
  return {
    get plan(){return structuredClone(plan);},
    validateSegmentEdit(segments,edit){routePlanFlows(updateRoutePlanSegments(read(),segments,edit));},
    /** Start a fresh draft from shared geometry; saved routes are untouched. */
    replaceDraft(segments,draftName='Shared route'){plan=createRoutePlan(segments,draftName);panel=null;draw();onChange(structuredClone(plan));},
    setSegments(segments,edit=null){const next=updateRoutePlanSegments(plan,segments,edit);if(JSON.stringify(next)===JSON.stringify(plan))return;plan=next;drawBody();refreshStatus();onChange(structuredClone(plan));},
    savedRoutes(){return [...library.values()].map(r=>structuredClone(r));}
  };
}
