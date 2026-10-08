import {isCampaignResource} from './catalogue-reconciliation.js';
import {updateTablePreview} from './table-preview.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtYear=value=>Number.isFinite(value)?String(value):'Unknown';
const fmt=value=>Number.isFinite(value)?value.toLocaleString('en-GB',{maximumFractionDigits:2}):'Unknown';
export function sourceName(item) {
  return item.name?.value??item.name?.translation?.translation_key??item.name?.translation_key??item.id;
}
export function filterSourceVehicles(catalogue,{query='',category='all',year=2035,includeAuxiliary=false}={}) {
  const search=query.trim().toLowerCase();
  const entries=[...catalogue.vehicles,...catalogue.formations.filter(f=>f.displayValues).map(f=>({...f,category:'train',kind:'locomotive formation',isTransportVehicle:true,availability:{raw:{yearFrom:f.displayValues.year}}}))];
  return entries.filter(v=>!isCampaignResource(v)&&(includeAuxiliary||v.isTransportVehicle)&&
    (category==='all'||(v.category==='train'&&v.displayValues?.role==='wagon'?'waggon':v.category)===category)&&
    (v.availability.raw?.yearFrom==null||v.availability.raw.yearFrom<=year)&&
    `${sourceName(v)} ${v.name?.translation?.translation_key??''} ${v.id} ${v.kind}`.toLowerCase().includes(search));
}
export function sourceRows(vehicles) {
  return vehicles.map(v=>{
    const d=v.displayValues??{};
    const capacity=d.capacity??v.capacity.display_observed??v.capacity.display_candidate;
    const power=d.powerKw??(v.engines.raw?.every(e=>Number.isFinite(e.power))?v.engines.raw.reduce((sum,e)=>sum+e.power,0):null);
    const cost=(field,prediction)=>Number.isFinite(field.value)&&field.value>=0?field.value:prediction;
    return `<tr><th scope="row">${escape(sourceName(v))}</th><td>${escape(v.kind.replaceAll('_',' '))}</td><td>${escape(v.category)}</td><td>${fmtYear(d.year??v.availability.raw?.yearFrom)}${v.availability.raw?.yearTo>0?`–${fmtYear(v.availability.raw.yearTo)}`:''}</td><td>${fmt(d.maxSpeedKmh??(v.topSpeed.value==null?null:v.topSpeed.value*3.6))}</td><td>${fmt(d.massTonnes??(v.emptyMass.value==null?null:v.emptyMass.value/1000))}</td><td>${fmt(power)}</td><td>${fmt(d.lengthMetres??v.length.value)}</td><td>${fmt(capacity)}</td><td>${fmt(d.purchasePrice??cost(v.purchasePrice,v.derivedCosts?.purchase_price))}</td><td>${fmt(d.annualMaintenance??cost(v.annualMaintenance,v.derivedCosts?.annual_maintenance))}</td></tr>`;
  }).join('')||'<tr><td colspan="11">No vehicles match these filters.</td></tr>';
}

export function mountSourceCatalogue(document,catalogue) {
  const node=id=>document.getElementById(id);
  node('source-catalogue-summary').textContent=`${catalogue.vehicles.filter(v=>!isCampaignResource(v)).length} models · ${catalogue.formations.length} formation definitions · Steam build ${catalogue.source.steamBuildId} · collected ${catalogue.source.generatedAt.slice(0,10)}`;
  const update=()=>{
    const vehicles=filterSourceVehicles(catalogue,{query:node('source-search').value,category:node('source-category').value,
      year:node('source-year').valueAsNumber,includeAuxiliary:node('source-auxiliary').checked});
    node('source-catalogue-caption').textContent=`${vehicles.length} matching models · campaign vehicles excluded`;
    node('source-catalogue-body').innerHTML=sourceRows(vehicles);
    updateTablePreview(document,'source-catalogue-body');
  };
  for(const id of ['source-search','source-category','source-year','source-auxiliary'])node(id).addEventListener('input',update);
  node('source-formations').innerHTML=catalogue.formations.map(f=>`<details><summary>${escape(sourceName(f))} · ${f.components.length} components</summary><p>${escape(f.id)}</p>${f.nameReconciliation?`<p>${f.displayValues?'Captured whole-locomotive values are included in the catalogue above.':`Name matched to ${escape(f.nameReconciliation.observation)}. Identity only; formation totals remain provisional.`}</p>`:''}<ol>${f.components.map(c=>`<li>${escape(c.name)} · ${c.forward?'forward':'reversed'}</li>`).join('')}</ol></details>`).join('');
  update();
}
