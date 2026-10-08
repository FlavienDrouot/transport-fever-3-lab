import {updateTablePreview} from './table-preview.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=value=>Number.isFinite(value)?value.toLocaleString('en-GB',{maximumFractionDigits:2}):'Unknown';
export function sourceName(item) {
  return item.name?.value??item.name?.translation?.translation_key??item.name?.translation_key??item.id;
}
export function filterSourceVehicles(catalogue,{query='',category='all',year=2035,includeAuxiliary=false}={}) {
  const search=query.trim().toLowerCase();
  return catalogue.vehicles.filter(v=>(includeAuxiliary||v.isTransportVehicle)&&
    (category==='all'||v.category===category)&&
    (v.availability.raw?.yearFrom==null||v.availability.raw.yearFrom<=year)&&
    `${sourceName(v)} ${v.name?.translation?.translation_key??''} ${v.id} ${v.kind}`.toLowerCase().includes(search));
}
export function sourceRows(vehicles) {
  return vehicles.map(v=>{
    const observed=v.capacity.display_observed;
    const capacity=Number.isFinite(observed)?`${fmt(observed)} · observed`:Number.isFinite(v.capacity.display_candidate)?`${fmt(v.capacity.display_candidate)} · estimate`:'Unknown';
    const power=v.engines.raw?.length&&v.engines.raw.every(e=>Number.isFinite(e.power))?v.engines.raw.reduce((sum,e)=>sum+e.power,0):null;
    const cost=(field,prediction)=>Number.isFinite(field.value)&&field.value>=0?`${fmt(field.value)} · source`:
      Number.isFinite(prediction)&&prediction>=0?`${fmt(prediction)} · ${v.costValidation?.status==='verified_difficulty_normalization'?'checked':'estimate'}`:'Unknown';
    const status=v.validation.visible_fields==='sample_verified_in_2020_normal_user_screenshot'?'Sample checked':'Awaiting validation';
    return `<tr><th scope="row">${escape(sourceName(v))}</th><td>${escape(v.kind.replaceAll('_',' '))}</td><td>${escape(v.category)}</td><td>${fmt(v.availability.raw?.yearFrom)}–${fmt(v.availability.raw?.yearTo)}</td><td>${fmt(v.topSpeed.value==null?null:v.topSpeed.value*3.6)}</td><td>${fmt(v.emptyMass.value==null?null:v.emptyMass.value/1000)}</td><td>${fmt(power)}</td><td>${fmt(v.length.value)}</td><td>${capacity}</td><td>${cost(v.purchasePrice,v.derivedCosts?.purchase_price)}</td><td>${cost(v.annualMaintenance,v.derivedCosts?.annual_maintenance)}</td><td>${status}</td></tr>`;
  }).join('')||'<tr><td colspan="12">No source models match these filters.</td></tr>';
}
export function mountSourceCatalogue(document,catalogue) {
  const node=id=>document.getElementById(id);
  node('source-catalogue-summary').textContent=`${catalogue.vehicles.length} source models · ${catalogue.formations.length} formation definitions · Steam build ${catalogue.source.steamBuildId} · collected ${catalogue.source.generatedAt.slice(0,10)} · ${catalogue.vehicles.filter(v=>v.nameReconciliation).length} model names and ${catalogue.formations.filter(f=>f.nameReconciliation).length} formation names matched to captures`;
  const update=()=>{
    const vehicles=filterSourceVehicles(catalogue,{query:node('source-search').value,category:node('source-category').value,
      year:node('source-year').valueAsNumber,includeAuxiliary:node('source-auxiliary').checked});
    node('source-catalogue-caption').textContent=`${vehicles.length} matching source models · introduction year only; retirement and active mods are not applied`;
    node('source-catalogue-body').innerHTML=sourceRows(vehicles);
    updateTablePreview(document,'source-catalogue-body');
  };
  for(const id of ['source-search','source-category','source-year','source-auxiliary'])node(id).addEventListener('input',update);
  node('source-formations').innerHTML=catalogue.formations.map(f=>`<details><summary>${escape(sourceName(f))} · ${f.components.length} components</summary><p>${escape(f.id)}</p>${f.nameReconciliation?`<p>Name matched to ${escape(f.nameReconciliation.observation)}. Identity only; formation totals remain provisional.</p>`:''}<ol>${f.components.map(c=>`<li>${escape(c.name)} · ${c.forward?'forward':'reversed'}</li>`).join('')}</ol></details>`).join('');
  update();
}
