import {buildConsist} from './consists.js';
import {vehicleThumbnail} from './vehicle-thumbnails.js';
import {matchesFreightFilter} from './trucks.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'—':n.toLocaleString('en-GB',{maximumFractionDigits:2});
export const COMPOSITION_STORAGE_KEY='tf3-compositions-v1';

export function compatibleComponents(catalogue,{carrier,category,cargo='all',year=2035}) {
  return catalogue.filter(item=>(!carrier||item.carrier===carrier)&&item.year<=year&&
    (item.role==='locomotive'||(category==='passengers'?item.passengerCapacity>0:
      item.cargoCapacity>0&&matchesFreightFilter(item,cargo))));
}
export function compositionDefinition(item){
  return {schemaVersion:1,id:item.id,name:item.name,carrier:item.carrier,category:item.category,
    ...(item.category==='freight'?{cargo:item.freightSpecialization==='general'?'all':item.freightSpecialization}:{}),
    components:item.components.map(c=>({...c}))};
}
export function duplicateDefinition(item,id=`custom:${item.carrier}:${crypto.randomUUID()}`) {
  return {...compositionDefinition(item),id,name:`${item.name.slice(0,110)} · copy`};
}
export function canAddComponent(item,draft) {
  return compatibleComponents([item],{...draft,year:2035}).length>0;
}
export function restoreCompositions(raw,catalogue,units){
  const compositions=[],ids=new Set();let skipped=0;
  if(!raw)return {compositions,skipped};
  try {
    if(raw.length>256000)throw new RangeError('Stored definitions too large');
    const data=JSON.parse(raw);
    if(data.schemaVersion!==1||!Array.isArray(data.compositions)||data.compositions.length>100)throw new RangeError('Invalid stored definitions');
    for(const definition of data.compositions){
      try {
        if(!definition.id?.startsWith('custom:')||ids.has(definition.id)||definition.components?.length>100)throw new RangeError('Invalid stored identity');
        const item=buildConsist(definition,catalogue,units);
        if(!item.serviceReady)throw new RangeError('Incomplete saved composition');
        ids.add(item.id);compositions.push(item);
      }catch{skipped++;}
    }
  }catch{return {compositions:[],skipped:1};}
  return {compositions,skipped};
}

/** The same builder serves rail and tram; storage contains definitions, never cached totals. */
export function mountConsistEditor(document,{catalogue,units,onChange,storage=null,thumbnails=null}) {
  const $=id=>document.getElementById(id);
  const saved=new Map();let entries=[],editing=null,preview=null;
  let context={carrier:'rail',category:'passengers',cargo:'all',year:2035};
  let draftContext={...context};
  let restored;
  try{restored=restoreCompositions(storage?.getItem(COMPOSITION_STORAGE_KEY),catalogue,units);}catch{restored={compositions:[],skipped:0};}
  restored.compositions.forEach(item=>saved.set(item.id,item));
  const available=()=>compatibleComponents(catalogue,context);
  const radio=(name,value)=>{$(name).querySelector(`input[value="${value}"]`).checked=true;};
  const readRadio=name=>$(name).querySelector('input:checked').value;
  function drawCatalogue(){
    const query=$('configuration-search').value.trim().toLowerCase(),role=readRadio('configuration-role');
    const choices=available().filter(item=>(role==='all'||item.role===role)&&`${item.name} ${item.sourceName??''} ${item.year}`.toLowerCase().includes(query)).sort((a,b)=>a.year-b.year||a.name.localeCompare(b.name));
    $('component-count').textContent=`${choices.length} vehicles · ${context.carrier==='rail'?'Rail':'Tram'} · ${context.category==='passengers'?'Passengers':context.cargo==='all'?'All freight':context.cargo}`;
    $('component-catalogue-body').innerHTML=choices.map(item=>`<tr><th scope="row">${escape(item.name)}<small>${item.role==='locomotive'?'Locomotive':item.role==='wagon'?'Wagon':context.carrier==='rail'?'Multiple unit':'Powered tram'}</small></th><td class="component-thumbnail-cell">${vehicleThumbnail(item,thumbnails)}</td><td>${item.year}</td><td>${fmt(item.passengerCapacity??item.cargoCapacity)}</td><td>${fmt(item.maxSpeedKmh)}</td><td>${item.loadingUnloadingSpeedMultiplier==null?'—':`${fmt(item.loadingUnloadingSpeedMultiplier)}×`}</td><td>${fmt(item.lengthMetres)}</td><td>${item.powerCh==null?'—':fmt(item.powerCh*units.horsepowerWatts/1000)}</td><td>$${fmt(item.economy.annualMaintenance)}</td><td><button type="button" data-add="${escape(item.id)}" aria-label="Add ${escape(item.name)}">+ Add</button></td></tr>`).join('')||'<tr><td colspan="10">No vehicles match these filters.</td></tr>';
  }
  function updatePreview(){
    preview=null;$('composition-save').disabled=true;
    if(!entries.length){$('composition-summary').textContent='Add vehicles from the catalogue to start your composition.';return;}
    try {
      preview=buildConsist({schemaVersion:1,id:editing??`custom:${draftContext.carrier}:${crypto.randomUUID()}`,name:$('composition-name').value,carrier:draftContext.carrier,category:draftContext.category,cargo:draftContext.cargo,components:entries},catalogue,units);
      if(!preview.serviceReady)throw new RangeError(`Missing data: ${preview.missing.join(', ')}`);
      $('composition-summary').innerHTML=`<dl class="consist-totals">${[
        ['Capacity',`${fmt(preview.passengerCapacity??preview.cargoCapacity)} ${draftContext.category==='passengers'?'passengers':'cargo units'}`],
        ['Length',`${fmt(preview.lengthMetres)} m`],['Maximum speed',`${fmt(preview.maxSpeedKmh)} km/h`],
        ['Empty mass',`${fmt(preview.massTonnes)} t`],['Power',`${fmt(preview.powerCh*units.horsepowerWatts/1000)} kW`],['Traction',`${fmt(preview.tractionKgf)} kgf`],
        ['Handling',`${preview.handlingRate.toLocaleString('en-GB',{maximumFractionDigits:4})} ${draftContext.category==='passengers'?'passengers':'cargo units'}/s`],
        ['Purchase',`$${fmt(preview.economy.purchasePrice)}`],['Running costs',`$${fmt(preview.economy.annualMaintenance)}/year`]
      ].map(([key,value])=>`<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
      $('composition-save').disabled=false;
    }catch(error){$('composition-summary').textContent=error.message;preview=null;}
    $('composition-save').textContent=editing?'Update composition':'Save composition';
  }
  function drawComposition(focusIndex=null){
    $('composition-components').innerHTML=entries.map((entry,i)=>{
      const item=catalogue.find(c=>c.id===entry.componentId);
      return `<li data-row="${i}" class="composition-component"><span class="component-kind">${item.role==='locomotive'?'Locomotive':item.role==='wagon'?'Wagon':'Powered unit'}</span><strong>${escape(item.name)}</strong>${vehicleThumbnail(item,thumbnails)}<label>Quantity<input data-quantity type="number" min="1" max="1000" step="1" value="${entry.quantity}" required aria-label="Quantity of ${escape(item.name)}, component ${i+1}"></label><div class="component-actions"><button type="button" data-move="${i}" data-direction="-1" aria-label="Move component ${i+1} left"${i===0?' disabled':''}>←</button><button type="button" data-move="${i}" data-direction="1" aria-label="Move component ${i+1} right"${i===entries.length-1?' disabled':''}>→</button><button type="button" data-remove="${i}" aria-label="Remove component ${i+1}">×</button></div></li>`;
    }).join('');
    $('composition-context').textContent=`${draftContext.carrier==='rail'?'Rail':'Tram'} · ${draftContext.category==='passengers'?'Passengers':draftContext.cargo==='all'?'Freight':draftContext.cargo}`;
    updatePreview();
    if(focusIndex!=null)$('composition-components').querySelector(`[data-row="${focusIndex}"] input`)?.focus();
  }
  function drawSaved(){
    const editIcon='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m10 2 4 4M3 9l8-8 4 4-8 8-5 1z"/></svg>';
    const duplicateIcon='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="6" y="6" width="8" height="8" rx="1"/><path d="M10 4V2H2v8h2"/></svg>';
    $('composition-saved').innerHTML=saved.size?`<ul class="consist-saved">${[...saved.values()].map(item=>`<li><span><strong>${escape(item.name)}</strong><small>${item.carrier==='rail'?'Rail':'Tram'} · ${item.category==='passengers'?'Passengers':escape(item.freightSpecialization)} · ${item.year}</small></span><div class="saved-actions"><button class="saved-action" type="button" data-edit="${escape(item.id)}" title="Edit" aria-label="Edit ${escape(item.name)}">${editIcon}</button><button class="saved-action" type="button" data-duplicate="${escape(item.id)}" title="Duplicate" aria-label="Duplicate ${escape(item.name)}">${duplicateIcon}</button><button class="saved-action" type="button" data-delete="${escape(item.id)}" title="Delete" aria-label="Delete ${escape(item.name)}">×</button></div></li>`).join('')}</ul>`:'<p class="chart-help">No saved compositions yet.</p>';
  }
  function publish(change){
    let persisted=false;
    try {if(storage){storage.setItem(COMPOSITION_STORAGE_KEY,JSON.stringify({schemaVersion:1,compositions:[...saved.values()].map(compositionDefinition)}));persisted=true;}}catch{}
    $('composition-message').textContent=change.removed?'Composition removed.':`Saved${persisted?' in this browser':''}. Available in ${change.item.carrier==='tram'?'Road (Include trams)':'Race and Economics'}.${persisted?'':' Browser storage is unavailable; keep this page open.'}`;
    drawSaved();onChange(change);
  }
  function newDraft(){draftContext={...context};editing=null;entries=[];$('composition-name').value=context.carrier==='rail'?'Custom train':'Custom tram';$('composition-message').textContent='';$('composition-save').textContent='Save composition';drawComposition();}
  function syncFilters(){
    $('configuration-cargo-group').hidden=context.category!=='freight';$('configuration-year').value=context.year;$('configuration-year-value').textContent=context.year;
    drawCatalogue();
  }
  for(const id of ['configuration-carrier','configuration-category','configuration-cargo','configuration-year'])$(id).addEventListener('input',()=>{
    const next={carrier:readRadio('configuration-carrier'),category:readRadio('configuration-category'),cargo:readRadio('configuration-cargo'),year:$('configuration-year').valueAsNumber};
    context=next;syncFilters();
  });
  $('configuration-search').addEventListener('input',drawCatalogue);
  $('configuration-role').addEventListener('change',drawCatalogue);
  $('component-catalogue-body').addEventListener('click',event=>{
    const button=event.target.closest('[data-add]');if(!button)return;
    if(entries.length>=100){$('composition-message').textContent='Limit: 100 component rows. Use quantities for repeated vehicles.';return;}
    const item=catalogue.find(t=>t.id===button.dataset.add);
    if(!canAddComponent(item,draftContext)){$('composition-message').textContent='This vehicle is incompatible with the current composition. Use New composition to build a different transport type.';return;}
    entries.push({componentId:button.dataset.add,quantity:1});$('composition-message').textContent='';drawComposition();
  });
  $('composition-components').addEventListener('input',()=>{
    entries=[...$('composition-components').querySelectorAll('[data-row]')].map(row=>({componentId:entries[Number(row.dataset.row)].componentId,quantity:row.querySelector('input').valueAsNumber}));updatePreview();
  });
  $('composition-components').addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove]'),move=event.target.closest('[data-move]');
    if(remove){const i=Number(remove.dataset.remove);entries.splice(i,1);drawComposition(Math.min(i,entries.length-1));}
    if(move){const i=Number(move.dataset.move),j=i+Number(move.dataset.direction);[entries[i],entries[j]]=[entries[j],entries[i]];drawComposition(j);}
  });
  $('composition-name').addEventListener('input',updatePreview);
  $('composition-new').addEventListener('click',newDraft);
  $('composition-form').addEventListener('submit',event=>{
    event.preventDefault();updatePreview();if(!preview)return;
    if(!editing&&saved.size>=100){$('composition-message').textContent='Limit: 100 saved compositions. Remove an unused composition first.';return;}
    const item={...preview,vehicleType:preview.carrier==='rail'?'Custom train':'Custom tram'};
    saved.set(item.id,item);editing=item.id;publish({item});updatePreview();
  });
  $('composition-saved').addEventListener('click',event=>{
    const remove=event.target.closest('[data-delete]'),edit=event.target.closest('[data-edit]'),duplicate=event.target.closest('[data-duplicate]');
    if(remove){saved.delete(remove.dataset.delete);if(editing===remove.dataset.delete)newDraft();publish({removed:remove.dataset.delete});}
    if(edit||duplicate){
      const original=saved.get(edit?.dataset.edit??duplicate.dataset.duplicate);
      const item=duplicate?duplicateDefinition(original):original;context={carrier:item.carrier,category:item.category,cargo:item.cargo??(item.freightSpecialization==='general'?'all':item.freightSpecialization??'all'),year:Math.max(context.year,original.year)};
      for(const key of ['carrier','category','cargo'])radio(`configuration-${key}`,context[key]);
      $('configuration-search').value='';radio('configuration-role','all');syncFilters();
      draftContext={...context};editing=duplicate?null:item.id;$('composition-name').value=item.name;entries=item.components.map(c=>({...c}));drawComposition();$('composition-name').focus();
    }
  });
  syncFilters();drawSaved();newDraft();
  if(restored.skipped)$('composition-message').textContent='Some saved compositions could not be restored with the current catalogue.';
  return {
    getCompositions(){return [...saved.values()];},
    openContext(next){
      context={...next};
      radio('configuration-carrier',context.carrier);radio('configuration-category',context.category);radio('configuration-cargo',context.cargo);radio('configuration-role','all');
      $('configuration-year').value=context.year;$('configuration-year-value').textContent=context.year;
      $('configuration-search').value='';
      if(!entries.length)newDraft();
      else $('composition-message').textContent='Your current draft has been kept. Choose New composition to start a different train.';
      syncFilters();
    }
  };
}
