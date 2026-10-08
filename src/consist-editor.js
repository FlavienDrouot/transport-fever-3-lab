import {buildConsist} from './consists.js';

const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'Unknown':n.toLocaleString('en-GB',{maximumFractionDigits:2});

export function compatibleComponents(catalogue,{category,cargo='all',year=2035}) {
  return catalogue.filter(item=>item.year<=year&&
    (item.role==='locomotive'||(category==='passengers'?item.passengerCapacity>0:
      item.cargoCapacity>0&&(item.freightSpecialization==='general'||item.freightSpecialization===cargo))));
}

/** A local, experimental editor. Saved formations are not source catalogue records. */
export function mountConsistEditor(document,{catalogue,units,onChange}) {
  const list=document.getElementById('custom-tram-list');
  const name=document.getElementById('custom-tram-name');
  const rows=document.getElementById('custom-tram-components');
  const summary=document.getElementById('custom-tram-summary');
  const save=document.getElementById('custom-tram-save');
  const reset=document.getElementById('custom-tram-reset');
  const add=document.getElementById('custom-tram-add');
  const form=document.getElementById('custom-tram-form');
  let context={category:'freight',cargo:'all',year:2035},entries=[],editing=null,sequence=0,preview=null;
  const saved=new Map();
  const candidates=()=>compatibleComponents(catalogue,context);
  const defaultEngine=()=>candidates().find(item=>item.role==='powered-carriage')??candidates().find(item=>item.role==='locomotive');
  function drawRows(){
    const available=candidates();
    rows.innerHTML=entries.map((entry,i)=>{
      const choices=i===0?available.filter(x=>x.role!=='wagon'):[...available];
      const selected=catalogue.find(x=>x.id===entry.componentId);
      if(selected&&!choices.some(x=>x.id===selected.id))choices.push({...selected,name:`${selected.name} (unavailable)`});
      const options=[['locomotive','Locomotives'],['powered-carriage','Powered trams'],['wagon','Wagons']].map(([role,label])=>{
        const items=choices.filter(item=>item.role===role);
        return items.length?`<optgroup label="${label}">${items.map(item=>`<option value="${escape(item.id)}"${item.id===entry.componentId?' selected':''}>${escape(item.name)} · ${item.year}</option>`).join('')}</optgroup>`:'';
      }).join('');
      return `<div class="consist-row" data-row="${i}"><div><label for="consist-component-${i}">${i===0?'Powered vehicle':'Component'} ${i+1}</label><select id="consist-component-${i}" data-component required><option value="">Choose a vehicle</option>${options}</select></div><div><label for="consist-quantity-${i}">Quantity</label><input id="consist-quantity-${i}" data-quantity type="number" min="1" max="1000" step="1" value="${entry.quantity}" required></div>${i?`<button type="button" data-remove="${i}" aria-label="Remove component ${i+1}">Remove</button>`:''}</div>`;
    }).join('');
    add.disabled=!available.length;
    updatePreview();
  }
  function readRows(){
    entries=[...rows.querySelectorAll('[data-row]')].map(row=>({componentId:row.querySelector('[data-component]').value,quantity:row.querySelector('[data-quantity]').valueAsNumber}));
  }
  function updatePreview(){
    preview=null;save.disabled=true;
    try {
      if(entries.some(entry=>!candidates().some(item=>item.id===entry.componentId)))throw new RangeError('Choose components available for this category, freight group and year.');
      preview=buildConsist({schemaVersion:1,id:editing??`custom:tram:${sequence+1}`,name:name.value,carrier:'tram',category:context.category,cargo:context.cargo,components:entries},catalogue,units);
      if(!preview.serviceReady)throw new RangeError(`Missing data: ${preview.missing.join(', ')}`);
      summary.innerHTML=`<dl class="consist-totals">${[
        ['Capacity',`${fmt(preview.passengerCapacity??preview.cargoCapacity)} ${context.category==='passengers'?'passengers':'cargo units'}`],
        ['Maximum speed',`${fmt(preview.maxSpeedKmh)} km/h`],['Empty mass',`${fmt(preview.massTonnes)} t`],['Length',`${fmt(preview.lengthMetres)} m`],
        ['Power',`${fmt(preview.powerCh)} ch`],['Traction',`${fmt(preview.tractionKgf)} kgf`],
        ['Handling',`${fmt(preview.handlingRate)} ${context.category==='passengers'?'passengers':'cargo units'}/s before facility bonuses`],
        ['Purchase',`$${fmt(preview.economy.purchasePrice)}`],['Running costs',`$${fmt(preview.economy.annualMaintenance)}/year`]
      ].map(([key,value])=>`<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
      save.disabled=false;
    } catch(error){summary.textContent=error.message;preview=null;}
    save.textContent=editing?'Update comparison':'Add to comparison';
    reset.textContent=editing?'Cancel edit':'New composition';
  }
  function drawSaved(){
    list.innerHTML=saved.size?`<ul class="consist-saved">${[...saved.values()].map(item=>`<li><span>${escape(item.name)} · ${item.category==='passengers'?'Passengers':escape(item.freightSpecialization)} · ${item.year}</span><button type="button" data-edit="${escape(item.id)}">Edit</button><button type="button" data-delete="${escape(item.id)}">Remove</button></li>`).join('')}</ul>`:'<p class="chart-help">No custom compositions yet.</p>';
  }
  function newDraft(){editing=null;name.value='Custom tram';entries=[{componentId:defaultEngine()?.id??'',quantity:1}];drawRows();}
  rows.addEventListener('input',()=>{readRows();updatePreview();});
  rows.addEventListener('change',()=>{readRows();updatePreview();});
  rows.addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(!button)return;entries.splice(Number(button.dataset.remove),1);drawRows();});
  name.addEventListener('input',updatePreview);
  add.addEventListener('click',()=>{entries.push({componentId:candidates().find(x=>x.role==='wagon')?.id??defaultEngine()?.id??'',quantity:1});drawRows();rows.lastElementChild.querySelector('select').focus();});
  reset.addEventListener('click',newDraft);
  form.addEventListener('submit',event=>{
    event.preventDefault();readRows();updatePreview();if(!preview)return;
    saved.set(preview.id,{...preview,vehicleType:'Custom tram'});
    if(!editing)sequence++;
    editing=preview.id;drawSaved();updatePreview();onChange();
  });
  list.addEventListener('click',event=>{
    const remove=event.target.closest('[data-delete]'),edit=event.target.closest('[data-edit]');
    if(remove){saved.delete(remove.dataset.delete);if(editing===remove.dataset.delete)newDraft();drawSaved();onChange();}
    if(edit){const item=saved.get(edit.dataset.edit);if(item.category!==context.category||(item.category==='freight'&&item.freightSpecialization!==(context.cargo==='all'?'general':context.cargo))){summary.textContent='Select the saved composition’s category and freight group above before editing it.';return;}editing=item.id;name.value=item.name;entries=item.components.map(x=>({...x}));drawRows();name.focus();}
  });
  drawSaved();newDraft();
  return {
    setContext(next){const changed=next.category!==context.category||next.cargo!==context.cargo;context={...next};if(changed)newDraft();else drawRows();},
    getCompositions(){return [...saved.values()];},
  };
}
