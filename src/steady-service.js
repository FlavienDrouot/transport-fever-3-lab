import {compositionSteadyRunning} from './composition-analysis.js';
import {withRoadModel} from './road-motion.js';
import {UI_TERMS} from './ui-terms.js';
import {escapeHtml as escape,formatNumber,formatSignificant} from './format.js';
import {renderServiceSummary} from './service-summary.js';

/** The Composition steady reference, applied to one selected train or Road vehicle. */
export function steadyServiceRows(vehicles,settings,{road=false}={}){
  const freight=road?!settings.passenger:!!settings.freight;
  const rows=vehicles.map(vehicle=>{
    const adapted={...vehicle,category:freight?'freight':'passengers',passengerCapacity:vehicle.passengerCapacity??vehicle.cargoCapacity};
    const steady=compositionSteadyRunning(road?withRoadModel(adapted):adapted,{...settings,infrastructureSpeedKmh:road?settings.roadSpeedLimit:settings.infrastructureSpeedKmh});
    return {vehicle,steady,capacity:freight?vehicle.cargoCapacity:adapted.passengerCapacity};
  }).sort((a,b)=>(a.steady.costPerUnitKm??Infinity)-(b.steady.costPerUnitKm??Infinity)||a.vehicle.name.localeCompare(b.vehicle.name,'en'));
  let rank=0,previous;
  return rows.map((row,index)=>{
    const cost=row.steady.costPerUnitKm;
    if(cost===null)return {...row,rank:null};
    if(previous===undefined||Math.abs(cost-previous)>Math.max(1e-9,Math.abs(cost)*1e-9))rank=index+1;
    previous=cost;
    return {...row,rank};
  });
}

export function renderSteadyService({summary,table,body,caption},vehicles,settings,{road=false,highlighted}={}){
  const rows=steadyServiceRows(vehicles,settings,{road}),best=rows.filter(row=>row.rank===1);
  const freight=road?!settings.passenger:!!settings.freight,per=road?'vehicle':'train';
  const headings=[['Rank'],['Vehicle'],[`Cost / ${UI_TERMS.capacityUnit} / km`,'$ · lower is better'],
    [`${UI_TERMS.rate} × distance`,`${UI_TERMS.capacityUnit}·km/year${freight?'':'/direction'} / ${per}`],
    [UI_TERMS.capacity,`${UI_TERMS.capacityUnit} / ${per}`],[UI_TERMS.runningCosts,`$/year / ${per}`],
    ['Maximum speed','km/h · vehicle limit'],['Steady speed A→B / B→A','km/h'],[UI_TERMS.utilization,'%']];
  const detail=index=>!road&&index>=7?' class="service-detail"':'';
  table.querySelector('thead tr').innerHTML=headings.map(([label,unit],index)=>`<th scope="col"${detail(index)}>${label}${unit?`<span class="table-unit">${unit}</span>`:''}</th>`).join('');
  renderServiceSummary(summary,{names:best.map(row=>row.vehicle.name),cost:best[0]?.steady.costPerUnitKm,unit:`${UI_TERMS.capacityUnit} / km`,significant:4,
    explanation:'Steady-running cost per transported capacity per one-way kilometre, including both directions. Speed limits, gradients and Utilization apply; acceleration, braking and terminal handling are excluded.',
    emptyMessage:vehicles.length?'No ranking at cruising speed for this Utilization or gradient.':'Select vehicles to compare their Running costs at cruising speed.'});
  caption.textContent=`Steady running · one ${per} per row · normal-difficulty running costs. Speed limits and gradients apply; acceleration, braking and terminal handling are excluded.`;
  body.innerHTML=rows.map(({vehicle,steady,capacity,rank})=>{
    const cells=[rank??'—',`<span class="train-key" style="--train-color:${vehicle.color}"></span>${escape(vehicle.name)}`,
      steady.costPerUnitKm===null?'—':formatSignificant(steady.costPerUnitKm),steady.transportOutputPerYear===null?'—':formatNumber(steady.transportOutputPerYear,0),
      formatNumber(capacity,0),`$${formatNumber(vehicle.economy.annualMaintenance,0)}`,formatNumber(vehicle.maxSpeedKmh,1),
      `${formatNumber(steady.outboundSpeedKmh,1)} / ${formatNumber(steady.returnSpeedKmh,1)}`,`${formatNumber((settings.fillRatio??1)*100,1)}%`];
    return `<tr data-train="${escape(vehicle.id)}" class="${vehicle.id===highlighted?'is-highlighted':''}">${cells.map((cell,index)=>`<td${detail(index)}>${cell}</td>`).join('')}</tr>`;
  }).join('');
  return rows;
}
