import {createRoutePlan,validateRoutePlan,restoreRoutePlans,updateRoutePlanSegments,routePlanFlows,newRouteStop,routeId,ROUTE_STORAGE_KEY} from './route-plan.js';
import {escapeHtml as escape,formatNumber} from './format.js';
import {UI_TERMS as T} from './ui-terms.js';
import {DEFAULT_INDUSTRY_OUTPUT_STORAGE_CAPACITY} from './optimizer-infrastructure.js';

const fmt=n=>formatNumber(n,3);
const kinds={railPlatform:'Rail station + platform',roadPlatform:'Road station + platform',railStation:'Rail station only',roadStation:'Road station only',busStop:'Bus stop'};
const buildings={none:'Not specified',factory:T.industry,warehouse:'Warehouse',industrial:'Industrial building'};
const newInfrastructure=kind=>({id:routeId('infra'),kind,...(kind==='railPlatform'?{length:840,tracks:2,platforms:1,specialized:false}:kind==='roadPlatform'?{length:20,platforms:1,specialized:false}:{})});

/** Saved geometry and logistics stay separate from vehicle selection and simulation. */
export function mountRoutePlanControls(root,{initialSegments,storage=null,onLoad,onChange=()=>{},onSelectSegment=()=>{}}){
  let plan=createRoutePlan(initialSegments),message='',invalid=false;
  const library=new Map();let restored;
  try{restored=restoreRoutePlans(storage?.getItem(ROUTE_STORAGE_KEY));}catch{restored={routes:[],skipped:1};}
  for(const route of restored.routes)library.set(route.id,route);
  if(restored.skipped)message='Some saved routes could not be restored. Valid routes are retained.';
  root.innerHTML=`<form class="route-plan-form" novalidate>
    <div class="route-plan-toolbar"><label>Route name <input data-plan-path="name" maxlength="120" required></label><button type="button" data-route-action="save">Save route</button><button type="button" data-route-action="duplicate">Duplicate draft</button><button type="button" data-route-action="new">New route</button></div>
    <div class="route-plan-library"><label>Saved routes <select data-route-library aria-label="Saved routes"></select></label><button type="button" data-route-action="load">Load</button><button type="button" data-route-action="delete">Remove saved route</button></div>
    <p class="chart-help">Routes, freight declarations and infrastructure are saved in this browser. No vehicle is required.</p>
    <p class="route-plan-status chart-help" role="status" aria-live="polite"></p>
    <details class="panel-group" open><summary>Freight goods</summary><div class="panel-group-body"><div data-route-goods></div><button type="button" data-route-action="add-good">Add good</button></div></details>
    <details class="panel-group"><summary>Existing tracks &amp; roads</summary><div class="panel-group-body"><div data-route-segment-assets></div><p class="chart-help">Declare what is already present, independently of curve/gradient limits and future vehicles. Empty declarations do not establish reusable infrastructure. Dedicated Tram tracks cover both directions.</p></div></details>
    <section class="route-plan-itinerary" aria-label="Route stops and expected service" data-route-stops></section>
    <section class="route-plan-summary" aria-label="Expected freight flows" data-route-summary></section>
    <p class="route-plan-analysis-note chart-help">This is the route and expected service declaration. Current vehicle analyses use geometry only; these stops, freight operations and infrastructure declarations are not yet included in their calculations.</p>
  </form>`;
  const $=selector=>root.querySelector(selector),name=$('[data-plan-path=name]'),savedSelect=$('[data-route-library]');
  const field=(path,label,value,{type='number',min=0,max=null,step='any'}={})=>`<label>${escape(label)}<input data-plan-path="${path}" type="${type}" value="${escape(value)}"${type==='number'?` min="${min}"${max==null?'':` max="${max}"`} step="${step}"`:' maxlength="120"'} required></label>`;
  const select=(path,label,value,options)=>`<label>${escape(label)}<select data-plan-path="${path}" required>${Object.entries(options).map(([key,title])=>`<option value="${escape(key)}"${key===value?' selected':''}>${escape(title)}</option>`).join('')}</select></label>`;
  const check=(path,label,value)=>`<label class="road-inline-check"><input type="checkbox" data-plan-path="${path}"${value?' checked':''}> ${escape(label)}</label>`;
  const cargo=(path,value)=>select(path,'Good',value,Object.fromEntries(plan.goods.map(g=>[g.id,g.name])));
  const remove=path=>`<button type="button" data-route-action="remove-row" data-path="${path}" aria-label="Remove entry">Remove</button>`;
  const article=(heading,body)=>`<details class="panel-group" data-route-section="${heading}"><summary>${heading}</summary><div class="panel-group-body">${body}</div></details>`;
  function drawLibrary(){
    const selected=savedSelect.value;
    savedSelect.innerHTML=library.size?[...library.values()].map(r=>`<option value="${escape(r.id)}">${escape(r.name)} · ${fmt(r.segments.reduce((n,s)=>n+s.distanceKm,0))} km · ${r.stops.length} stops</option>`).join(''):'<option value="">No saved routes</option>';
    if(library.has(selected))savedSelect.value=selected;
    for(const action of ['load','delete'])$(`[data-route-action=${action}]`).disabled=!library.size;
  }
  function drawGoods(){
    $('[data-route-goods]').innerHTML=plan.goods.length?plan.goods.map((good,i)=>`<div class="route-plan-row">${field(`goods.${i}.name`,'Good name',good.name,{type:'text'})}<button type="button" data-route-action="remove-good" data-index="${i}">Remove</button></div>`).join(''):'<p class="chart-help">Name the goods required by this service. These names do not select a vehicle or a compartment.</p>';
  }
  function drawAssets(){
    $('[data-route-segment-assets]').innerHTML=plan.segmentAssets.map((a,i)=>{const p=`segmentAssets.${i}`;return `<fieldset class="route-plan-row"><legend>Segment ${i+1}</legend>${select(`${p}.railTier`,'Existing Rail tier',String(a.railTier??'none'),{none:'Not declared',100:'100 km/h',160:'160 km/h',350:'350 km/h'})}${select(`${p}.railTracks`,'Rail tracks',String(a.railTracks),{1:'1',2:'2'})}${select(`${p}.roadTier`,'Existing Road tier',String(a.roadTier??'none'),{none:'Not declared',40:'40 km/h',60:'60 km/h',50:'50 km/h · city',80:'80 km/h',100:'100 km/h · 2 lanes',120:'120 km/h · 4 lanes'})}${select(`${p}.roadLanes`,'Road lanes',String(a.roadLanes),a.roadTier===100?{2:'2'}:a.roadTier===120?{4:'4'}:{2:'2',4:'4'})}${select(`${p}.tramTracks`,'Tram tracks',a.tramTracks,{none:'Not declared',road:'On the Road',dedicated:'Dedicated · 2 tracks'})}</fieldset>`;}).join('');
  }
  function stopBody(stop,i){
    const base=`stops.${i}`;
    const operations=stop.operations.map((op,j)=>{const p=`${base}.operations.${j}`;return `<div class="route-plan-row">${select(`${p}.direction`,'Direction',op.direction,{outbound:'A → B',return:'B → A'})}${select(`${p}.action`,'Operation',op.action,{load:'Load',unload:'Unload'})}${cargo(`${p}.cargoId`,op.cargoId)}${select(`${p}.quantity.mode`,'Quantity',op.quantity.mode,{visit:'Per visit',year:`${T.rate} per year`,percent:'% of this good onboard'})}${field(`${p}.quantity.value`,op.quantity.mode==='percent'?'%':op.quantity.mode==='year'?`${T.capacityUnit}/year`:`${T.capacityUnit}/visit`,op.quantity.value,{max:op.quantity.mode==='percent'?100:1e12})}${remove(p)}</div>`;}).join('');
    const recipe=['inputs','outputs'].map(key=>`<h5>${key==='inputs'?'Inputs':'Outputs'}</h5>${stop.recipe[key].map((r,j)=>{const p=`${base}.recipe.${key}.${j}`;return `<div class="route-plan-row">${cargo(`${p}.cargoId`,r.cargoId)}${field(`${p}.ratio`,'Recipe ratio',r.ratio,{min:0,max:1e9})}${remove(p)}</div>`;}).join('')}<button type="button" data-route-action="add-recipe" data-stop="${i}" data-side="${key}"${plan.goods.length?'':' disabled'}>Add ${key==='inputs'?'input':'output'}</button>`).join('');
    const infra=stop.infrastructure.map((entry,j)=>{const p=`${base}.infrastructure.${j}`;return `<div class="route-plan-row">${select(`${p}.kind`,'Existing infrastructure',entry.kind,kinds)}${entry.kind.endsWith('Platform')?field(`${p}.length`,'Platform length · m',entry.length,{min:entry.kind==='railPlatform'?40:20,max:entry.kind==='railPlatform'?840:10000,step:entry.kind==='railPlatform'?40:10})+field(`${p}.platforms`,entry.kind==='railPlatform'?'Platforms':'Parallel platforms',entry.platforms,{min:entry.kind==='railPlatform'?Math.ceil(entry.tracks/2):1,max:entry.kind==='railPlatform'?entry.tracks:100,step:1})+(entry.kind==='railPlatform'?field(`${p}.tracks`,'Platform tracks',entry.tracks,{min:1,max:100,step:1}):'')+check(`${p}.specialized`,'Specialized freight platform',entry.specialized):entry.kind==='busStop'?'<p class="chart-help">No specified length; one vehicle at a time. Freight unloading at industrial buildings only.</p>':'<p class="chart-help">Station exists; no available platform is assumed.</p>'}${remove(p)}</div>`;}).join('');
    const stocks=stop.storage.map((s,j)=>{const p=`${base}.storage.${j}`;return `<div class="route-plan-row">${cargo(`${p}.cargoId`,s.cargoId)}${field(`${p}.inputCapacity`,`Input storage ${T.capacity}`,s.inputCapacity,{min:100,step:100})}${field(`${p}.outputCapacity`,`Output storage ${T.capacity}`,s.outputCapacity,{min:100,step:100})}${remove(p)}</div>`;}).join('');
    return `<div class="route-plan-row">${field(`${base}.name`,'Stop name',stop.name,{type:'text'})}${select(`${base}.building`,'Building',stop.building,buildings)}${i>0&&i<plan.stops.length-1?`<button type="button" data-route-action="remove-stop" data-stop="${i}">Remove stop</button>`:''}</div>
      ${stop.building==='factory'?`<p class="chart-help">Industry storage and recipe belong to the site, independently of the selected vehicles.</p>${select(`${base}.industryTerminals`,'Included parallel Truck terminals',String(stop.industryTerminals),{'2':'2','3':'3'})}<p class="chart-help">Free specialized terminals; trams require separate infrastructure.</p>`:stop.building==='warehouse'?field(`${base}.warehouseCapacity`,`Shared warehouse ${T.capacity}`,stop.warehouseCapacity,{min:500,max:100000,step:500}):''}
      ${article('Existing infrastructure',infra+`<button type="button" data-route-action="add-infrastructure" data-stop="${i}">Add infrastructure</button>`)}
      ${article('Storage by good',stocks+`<button type="button" data-route-action="add-storage" data-stop="${i}"${plan.goods.length?'':' disabled'}>Add storage</button><p class="chart-help">Declare the capacities actually present. Industry values use multiples of 100, without an 800-capacity ceiling.</p>`)}
      <details class="panel-group" open><summary>Freight operations</summary><div class="panel-group-body">${operations||'<p class="chart-help">No freight operation declared.</p>'}<button type="button" data-route-action="add-operation" data-stop="${i}"${plan.goods.length?'':' disabled'}>Add operation</button><p class="chart-help">Annual Rate and per-visit quantities are separate targets until Frequency is known. Percentages use this good's planned incoming load/flow, not vehicle Capacity. Unloading precedes loading at each visit.</p></div></details>
      ${stop.building==='factory'?article('Industry recipe',recipe+'<p class="chart-help">Ratios describe one production cycle. For example, 2 A + 1 B → 3 C. Requirements are derived from the outputs this service plans to load; other services may supply part of the inputs.</p>'):''}`;
  }
  function drawStops(focusId=null){
    const opened=new Set([...root.querySelectorAll('[data-route-stop]:is([open])')].map(el=>el.dataset.routeStop));
    const sections=new Set([...root.querySelectorAll('[data-route-section][open]')].map(el=>`${el.closest('[data-route-stop]').dataset.routeStop}/${el.dataset.routeSection}`));
    let km=0;const nodes=[];
    for(let boundary=0;boundary<=plan.segments.length;boundary++){
      const i=plan.stops.findIndex(s=>s.boundary===boundary),stop=plan.stops[i];
      if(stop)nodes.push(`<details class="panel-group route-plan-stop" data-route-stop="${escape(stop.id)}"${opened.has(stop.id)||focusId===stop.id||plan.stops.length===2?' open':''}><summary><span data-stop-title="${escape(stop.id)}">${escape(stop.name)}</span> · ${fmt(km)} km</summary><div class="panel-group-body">${stopBody(stop,i)}</div></details>`);
      else nodes.push(`<button type="button" class="route-plan-add-stop" data-route-action="add-stop" data-boundary="${boundary}">+ Add stop between segments ${boundary} and ${boundary+1}</button>`);
      if(boundary<plan.segments.length){const segment=plan.segments[boundary];nodes.push(`<button type="button" class="route-plan-segment" data-route-action="select-segment" data-index="${boundary}">Segment ${boundary+1} · ${fmt(segment.distanceKm)} km · ${fmt(segment.gradePercent)}% · Rail ${fmt(segment.speedLimitKmh)} / Road ${fmt(segment.roadSpeedLimitKmh??segment.speedLimitKmh)} km/h</button>`);km+=segment.distanceKm;}
    }
    $('[data-route-stops]').innerHTML=nodes.join('');
    for(const el of root.querySelectorAll('[data-route-section]'))el.open=sections.has(`${el.closest('[data-route-stop]').dataset.routeStop}/${el.dataset.routeSection}`);
    if(focusId)$(`[data-route-stop="${focusId}"] input`)?.focus();
  }
  function drawSummary(){
    const flows=routePlanFlows(plan),good=id=>plan.goods.find(g=>g.id===id)?.name??id,stop=id=>plan.stops.find(s=>s.id===id)?.name??id;
    const quantities=q=>[['visit',`${T.capacityUnit}/visit`],['year',`${T.capacityUnit}/year`]].filter(([basis])=>q[basis]>1e-9).map(([basis,unit])=>`${fmt(q[basis])} ${unit}`).join(' · ')||'0';
    const load=q=>Object.entries(q).filter(([,value])=>value.visit>1e-9||value.year>1e-9).map(([id,value])=>`${good(id)}: ${quantities(value)}`).join('; ')||'Empty';
    const production=flows.production.map(p=>`<article><h4>${escape(stop(p.stopId))} · recipe requirements</h4>${p.incomplete?'<p class="chart-help">Declare the recipe outputs to derive requirements.</p>':!['visit','year'].some(b=>Object.values(p.plannedOutputs[b]).some(n=>n>0))?'<p class="chart-help">Declare a quantity or Rate to load a recipe output and derive its input requirements.</p>':['visit','year'].map(basis=>{
      if(!Object.values(p.plannedOutputs[basis]).some(n=>n>0))return '';
      const unit=basis==='year'?`${T.capacityUnit}/year`:`${T.capacityUnit}/visit`;
      return `<p>Outputs: ${Object.entries(p.plannedOutputs[basis]).map(([id,n])=>escape(`${good(id)} ${fmt(n)} ${unit}`)).join(' · ')}</p>${Object.keys(p.required[basis]).length?`<ul>${Object.entries(p.required[basis]).map(([id,n])=>`<li>${escape(`${good(id)}: ${fmt(n)} ${unit} required; ${fmt(p.incoming[basis][id]??0)} declared deliveries on this route`)}</li>`).join('')}</ul>`:'<p class="chart-help">No input requirement is declared for this recipe.</p>'}`;
    }).join('')}</article>`).join('');
    $('[data-route-summary]').innerHTML=`<h3>Expected service</h3>${plan.goods.length?`<p class="chart-help">Annual values are the Rate through each portion, not the load of an individual vehicle.</p><div class="table-scroll"><table><thead><tr><th scope="col">Direction</th><th scope="col">Route portion</th><th scope="col">Planned freight</th></tr></thead><tbody>${flows.sections.map(s=>`<tr><td>${s.direction==='outbound'?'A → B':'B → A'}</td><th scope="row">${escape(`${stop(s.from)} → ${stop(s.to)}`)}</th><td>${escape(load(s.load))}</td></tr>`).join('')}</tbody></table></div>${production}${flows.warnings.map(w=>`<p class="route-plan-warning">${escape(`${stop(w.stopId)} · ${good(w.cargoId)}: ${w.message}`)}</p>`).join('')}${Object.values(flows.remaining).some(q=>q.visit>1e-9||q.year>1e-9)?`<p class="chart-help">Freight remains after the declared round trip: ${escape(load(flows.remaining))}.</p>`:''}`:'<p class="chart-help">Declare goods and operations to describe the service before selecting vehicles.</p>'}`;
  }
  function refreshStatus(error=null){
    invalid=!!error;$('[data-route-action=save]').disabled=invalid;
    $('[data-route-action=save]').textContent=library.has(plan.id)?'Update route':'Save route';
    const status=$('.route-plan-status');status.textContent=error?.message??message;status.classList.toggle('route-plan-warning',invalid);
  }
  function draw(){name.value=plan.name;drawLibrary();drawGoods();drawAssets();drawStops();drawSummary();refreshStatus();}
  function read(){
    const candidate=structuredClone(plan);
    for(const input of root.querySelectorAll('[data-plan-path]')){
      if(input.disabled)continue;
      const parts=input.dataset.planPath.split('.'),key=parts.pop();let record=candidate;for(const p of parts)record=record[p];
      record[key]=input.type==='checkbox'?input.checked:input.type==='number'?input.value===''?null:input.valueAsNumber:input.value;
      if(['industryTerminals','railTracks','roadLanes'].includes(key))record[key]=Number(input.value);
      else if(['railTier','roadTier'].includes(key))record[key]=input.value==='none'?null:Number(input.value);
    }
    return candidate;
  }
  function accept(candidate,{redraw=false,focusId=null}={}){
    try{const next=validateRoutePlan(candidate);routePlanFlows(next);plan=next;message='';if(redraw){name.value=plan.name;drawGoods();drawAssets();drawStops(focusId);}else for(const s of plan.stops){const title=$(`[data-stop-title="${s.id}"]`);if(title)title.textContent=s.name;}
      for(const input of root.querySelectorAll('select[data-plan-path$="cargoId"]'))for(const option of input.options){const good=plan.goods.find(g=>g.id===option.value);if(good)option.textContent=good.name;}
      drawSummary();refreshStatus();onChange(structuredClone(plan));return true;
    }catch(error){refreshStatus(error);return false;}
  }
  function persist(){
    let saved=false;
    try{const raw=JSON.stringify({schemaVersion:1,routes:[...library.values()]});if(raw.length>4_000_000)throw new RangeError('Route library exceeds browser storage limits.');if(storage){storage.setItem(ROUTE_STORAGE_KEY,raw);saved=true;}}catch{}
    message=saved?'Saved in this browser.':'Kept for this session; browser storage is unavailable. Keep this page open.';drawLibrary();refreshStatus();return saved;
  }
  root.addEventListener('input',event=>{
    const input=event.target;if(!input.hasAttribute('data-plan-path'))return;
    if(!input.checkValidity()){refreshStatus(new RangeError(input.validationMessage));return;}
    const candidate=read(),path=input.dataset.planPath.split('.');
    if(path.at(-1)==='mode'){
      const valueInput=$(`[data-plan-path="${path.slice(0,-1).join('.')}.value"]`);
      valueInput.max=input.value==='percent'?'100':'1000000000000';
      valueInput.parentElement.firstChild.textContent=input.value==='percent'?'%':input.value==='year'?`${T.capacityUnit}/year`:`${T.capacityUnit}/visit`;
    }
    for(const asset of candidate.segmentAssets)if(asset.roadTier===100)asset.roadLanes=2;else if(asset.roadTier===120)asset.roadLanes=4;
    if(path.at(-1)==='kind'){const i=Number(path[1]),j=Number(path[3]);candidate.stops[i].infrastructure[j]={...newInfrastructure(input.value),id:plan.stops[i].infrastructure[j].id};}
    if(path.at(-1)==='tracks'){const entry=candidate.stops[Number(path[1])].infrastructure[Number(path[3])];entry.platforms=Math.max(Math.ceil(entry.tracks/2),Math.min(entry.platforms,entry.tracks));}
    const redraw=path[0]==='segmentAssets'||['building','kind','tracks','mode'].includes(path.at(-1));if(accept(candidate,{redraw})&&redraw)$(`[data-plan-path="${input.dataset.planPath}"]`)?.focus();
  });
  root.addEventListener('change',event=>{if(event.target.hasAttribute('data-plan-path')&&!event.target.checkValidity())event.target.reportValidity();});
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-route-action]');if(!button)return;
    const action=button.dataset.routeAction,i=Number(button.dataset.stop);
    if(action==='select-segment'){onSelectSegment(Number(button.dataset.index));return;}
    if(action==='load'){
      const loaded=library.get(savedSelect.value);if(!loaded)return;
      plan=structuredClone(loaded);message='Saved route loaded.';draw();onLoad(structuredClone(plan));onChange(structuredClone(plan));return;
    }
    if(action==='delete'){library.delete(savedSelect.value);const persisted=persist();message=`Saved route removed${persisted?'':' for this session only'}; the current draft is retained.${persisted?'':' Browser storage is unavailable.'}`;refreshStatus();return;}
    if(action==='new'){plan=createRoutePlan(initialSegments);message='New route draft.';draw();onLoad(structuredClone(plan));onChange(structuredClone(plan));return;}
    const candidate=read();let focusId=null;
    if(action==='save'){
      const bad=root.querySelector('[data-plan-path]:invalid');if(bad){bad.reportValidity();return;}
      if(!accept(candidate))return;
      if(!library.has(plan.id)&&library.size>=100){refreshStatus(new RangeError('Limit: 100 saved routes.'));return;}
      library.set(plan.id,structuredClone(plan));persist();savedSelect.value=plan.id;return;
    }
    if(action==='duplicate'){candidate.id=routeId('route');candidate.name=`${candidate.name.slice(0,110)} · copy`;}
    else if(action==='add-good'){if(candidate.goods.length>=50){refreshStatus(new RangeError('Limit: 50 goods.'));return;}let n=candidate.goods.length+1;while(candidate.goods.some(g=>g.name===`Good ${n}`))n++;candidate.goods.push({id:routeId('good'),name:`Good ${n}`});}
    else if(action==='remove-good'){
      const id=candidate.goods[Number(button.dataset.index)].id;
      if(candidate.stops.some(s=>[...s.operations,...s.storage,...s.recipe.inputs,...s.recipe.outputs].some(r=>r.cargoId===id))){refreshStatus(new RangeError('Remove the operations, storage and recipe entries using this good first.'));return;}
      candidate.goods.splice(Number(button.dataset.index),1);
    }else if(action==='add-stop'){const boundary=Number(button.dataset.boundary);const stop=newRouteStop(boundary,`Stop ${candidate.stops.length}`);candidate.stops.push(stop);focusId=stop.id;}
    else if(action==='remove-stop'){if(i<=0||i>=candidate.stops.length-1)return;candidate.stops.splice(i,1);}
    else if(action==='add-infrastructure')candidate.stops[i].infrastructure.push(newInfrastructure('railPlatform'));
    else if(action==='add-operation')candidate.stops[i].operations.push({id:routeId('operation'),cargoId:candidate.goods[0].id,direction:'outbound',action:i===candidate.stops.length-1?'unload':'load',quantity:{mode:'year',value:1000}});
    else if(action==='add-storage'){const unused=candidate.goods.find(g=>!candidate.stops[i].storage.some(r=>r.cargoId===g.id));if(!unused){refreshStatus(new RangeError('All goods already have storage here.'));return;}candidate.stops[i].storage.push({id:routeId('stock'),cargoId:unused.id,inputCapacity:100,outputCapacity:candidate.stops[i].building==='factory'?DEFAULT_INDUSTRY_OUTPUT_STORAGE_CAPACITY:100});}
    else if(action==='add-recipe'){const side=button.dataset.side,unused=candidate.goods.find(g=>!candidate.stops[i].recipe[side].some(r=>r.cargoId===g.id));if(!unused){refreshStatus(new RangeError('Each good can appear once on this side of the recipe.'));return;}candidate.stops[i].recipe[side].push({id:routeId('recipe'),cargoId:unused.id,ratio:1});}
    else if(action==='remove-row'){const parts=button.dataset.path.split('.'),index=Number(parts.pop());let rows=candidate;for(const p of parts)rows=rows[p];rows.splice(index,1);}
    else return;
    accept(candidate,{redraw:true,focusId});
  });
  root.querySelector('form').addEventListener('submit',event=>{event.preventDefault();$('[data-route-action=save]').click();});
  root.addEventListener('invalid',event=>{for(let p=event.target.parentElement;p&&p!==root;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;},true);
  draw();
  return {
    get plan(){return structuredClone(plan);},
    validateSegmentEdit(segments,edit){routePlanFlows(updateRoutePlanSegments(read(),segments,edit));},
    setSegments(segments,edit=null){const next=updateRoutePlanSegments(plan,segments,edit);if(JSON.stringify(next)===JSON.stringify(plan))return;plan=next;drawAssets();drawStops();drawSummary();refreshStatus();onChange(structuredClone(plan));},
    savedRoutes(){return [...library.values()].map(r=>structuredClone(r));}
  };
}
