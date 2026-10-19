import {UI_TERMS} from './ui-terms.js';
import {escapeHtml as escape, formatNumber} from './format.js';
import {validateNumberInputs} from './numeric-controls.js';
import {isCampaignResource} from './catalogue-reconciliation.js';
import {updateTablePreview} from './table-preview.js';
import {sortRows,nextSort,mountSortHeaders} from './table-sort.js';
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
const TYPE_NAMES={zeppelin:'airship',powered_rail_component:'powered rail component'};
/** One player-facing type per row, e.g. Locomotive, Freight wagon or Bus. */
export function sourceType(v) {
  const name=TYPE_NAMES[v.kind]??v.kind.replaceAll('_',' ');
  return name[0].toUpperCase()+name.slice(1);
}
function sourceValues(v) {
  const d=v.displayValues??{};
  const power=d.powerKw??(v.engines.raw?.every(e=>Number.isFinite(e.power))?v.engines.raw.reduce((sum,e)=>sum+e.power,0):null);
  const cost=(field,prediction)=>Number.isFinite(field.value)&&field.value>=0?field.value:prediction;
  return {name:sourceName(v),type:sourceType(v),year:d.year??v.availability.raw?.yearFrom,yearTo:v.availability.raw?.yearTo,
    speed:d.maxSpeedKmh??(v.topSpeed.value==null?null:v.topSpeed.value*3.6),
    weight:d.massTonnes??(v.emptyMass.value==null?null:v.emptyMass.value/1000),power,length:d.lengthMetres??v.length.value,
    capacity:d.capacity??v.capacity.display_observed??v.capacity.display_candidate,
    purchase:d.purchasePrice??cost(v.purchasePrice,v.derivedCosts?.purchase_price),
    cost:d.annualMaintenance??cost(v.annualMaintenance,v.derivedCosts?.annual_maintenance)};
}
const SOURCE_COLUMNS=['name','type','year','speed','weight','power','length','capacity','purchase','cost'];
/** Sort catalogue models by one column; missing values stay last. */
export function sortSourceVehicles(vehicles,sort) {
  const rows=vehicles.map(v=>({v,...sourceValues(v)}));
  const accessors=Object.fromEntries(SOURCE_COLUMNS.map(key=>[key,row=>Number.isFinite(row[key])||typeof row[key]==='string'?row[key]:null]));
  return sortRows(rows,sort,accessors).map(row=>row.v);
}
export function sourceRows(vehicles) {
  return vehicles.map(v=>{
    const x=sourceValues(v);
    const fields=[
      ['Type',x.type],
      ['Source years',`${fmtYear(x.year)}${x.yearTo>0?`–${fmtYear(x.yearTo)}`:''}`],
      ['Speed (km/h)',fmt(x.speed)],
      [`Empty ${UI_TERMS.weight.toLowerCase()} (t)`,fmt(x.weight)],
      ['Power (kW)',fmt(x.power)],['Length (m)',fmt(x.length)],['Capacity',fmt(x.capacity)],
      ['Purchase ($)',fmt(x.purchase)],
      [`${UI_TERMS.runningCosts} ($/year)`,fmt(x.cost)],
    ];
    const name=escape(x.name);
    const mobile=`<details class="source-mobile-details"><summary>${name}<small>${escape(fields[1][1])} · ${escape(fields[2][1])} km/h · capacity ${escape(fields[6][1])}</small></summary><dl>${fields.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl></details>`;
    return `<tr><th scope="row"><span class="source-desktop-name">${name}</span>${mobile}</th>${fields.map(([,value])=>`<td>${escape(value)}</td>`).join('')}</tr>`;
  }).join('')||'<tr><td class="source-empty" colspan="10">No vehicles match these filters.</td></tr>';
}

export function mountSourceCatalogue(document,catalogue) {
  const node=id=>document.getElementById(id);
  node('source-catalogue-summary').textContent=`${catalogue.vehicles.filter(v=>!isCampaignResource(v)).length} models · ${catalogue.formations.length} formation definitions · Steam build ${catalogue.source.steamBuildId} · collected ${catalogue.source.generatedAt.slice(0,10)}`;
  let sort={key:'year',dir:'desc'};
  const head=node('source-catalogue-body')?.closest?.('table')?.querySelector('thead');
  mountSortHeaders(head,()=>sort,key=>{sort=nextSort(sort,key,{name:'asc',type:'asc',purchase:'asc',cost:'asc'});update();});
  const update=()=>{
    const error=node('source-input-error');
    if(error&&!validateNumberInputs([node('source-year')],error))return;
    const vehicles=filterSourceVehicles(catalogue,{query:node('source-search').value,category:node('source-category').value,
      year:node('source-year').valueAsNumber,includeAuxiliary:node('source-auxiliary').checked});
    node('source-catalogue-caption').textContent=`${vehicles.length} matching models · campaign vehicles excluded`;
    node('source-catalogue-body').innerHTML=sourceRows(sortSourceVehicles(vehicles,sort));
    updateTablePreview(document,'source-catalogue-body');
  };
  for(const id of ['source-search','source-category','source-year','source-auxiliary'])node(id).addEventListener('input',update);
  node('source-formations').innerHTML=catalogue.formations.map(f=>`<details><summary>${escape(sourceName(f))} · ${f.components.length} components</summary><p>${escape(f.id)}</p>${f.nameReconciliation?`<p>${f.displayValues?'Captured whole-locomotive values are included in the catalogue above.':`Name matched to ${escape(f.nameReconciliation.observation)}. Identity only; formation totals remain provisional.`}</p>`:''}<ol>${f.components.map(c=>`<li>${escape(c.name)} · ${c.forward?'forward':'reversed'}</li>`).join('')}</ol></details>`).join('');
  update();
}
