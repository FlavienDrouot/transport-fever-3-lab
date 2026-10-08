import {escapeHtml as escape, formatNumber} from './format.js';
import {validateNumberInputs} from './numeric-controls.js';
import {isCampaignResource} from './catalogue-reconciliation.js';
import {updateTablePreview} from './table-preview.js';
const fmtYear=value=>Number.isFinite(value)?String(value):'Unknown';
const fmt=value=>formatNumber(value,2);
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
    const fields=[
      ['Kind',v.kind.replaceAll('_',' ')],['Category',v.category],
      ['Source years',`${fmtYear(d.year??v.availability.raw?.yearFrom)}${v.availability.raw?.yearTo>0?`–${fmtYear(v.availability.raw.yearTo)}`:''}`],
      ['Speed (km/h)',fmt(d.maxSpeedKmh??(v.topSpeed.value==null?null:v.topSpeed.value*3.6))],
      ['Empty mass (t)',fmt(d.massTonnes??(v.emptyMass.value==null?null:v.emptyMass.value/1000))],
      ['Power (kW)',fmt(power)],['Length (m)',fmt(d.lengthMetres??v.length.value)],['Capacity',fmt(capacity)],
      ['Purchase ($)',fmt(d.purchasePrice??cost(v.purchasePrice,v.derivedCosts?.purchase_price))],
      ['Maintenance ($/year)',fmt(d.annualMaintenance??cost(v.annualMaintenance,v.derivedCosts?.annual_maintenance))],
    ];
    const name=escape(sourceName(v));
    const mobile=`<details class="source-mobile-details"><summary>${name}<small>${escape(fields[2][1])} · ${escape(fields[3][1])} km/h · capacity ${escape(fields[7][1])}</small></summary><dl>${fields.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></details>`;
    return `<tr><th scope="row"><span class="source-desktop-name">${name}</span>${mobile}</th>${fields.map(([,value])=>`<td>${escape(value)}</td>`).join('')}</tr>`;
  }).join('')||'<tr><td class="source-empty" colspan="11">No vehicles match these filters.</td></tr>';
}

export function mountSourceCatalogue(document,catalogue) {
  const node=id=>document.getElementById(id);
  node('source-catalogue-summary').textContent=`${catalogue.vehicles.filter(v=>!isCampaignResource(v)).length} models · ${catalogue.formations.length} formation definitions · Steam build ${catalogue.source.steamBuildId} · collected ${catalogue.source.generatedAt.slice(0,10)}`;
  const update=()=>{
    const error=node('source-input-error');
    if(error&&!validateNumberInputs([node('source-year')],error))return;
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
