import {updateTablePreview} from './table-preview.js';
import {GAME_YEAR_SECONDS} from './line.js';
import {formatTime} from './format.js';

export const FREIGHT_LOAD_SPEED_FACTOR = 0.0625;
export const PASSENGER_LOAD_SPEED_FACTOR = 1;
export const ROAD_OPERATION_DELAY_SECONDS = 2; // Before each active transfer operation and departure.

const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (number,digits=0) => number.toLocaleString('en-GB',{maximumFractionDigits:digits});

/** Indicative long-haul index; source annual costs are not converted to delivery costs. */
export function rankTrucks(trucks, roadSpeedLimit = null) {
  if (roadSpeedLimit !== null && (!Number.isFinite(roadSpeedLimit) || roadSpeedLimit <= 0)) throw new RangeError('Road speed must be positive or null');
  const rows=trucks.map(truck=>{
    const costs=truck.economy.annualMaintenance;
    if (![costs,truck.cargoCapacity,truck.maxSpeedKmh].every(value=>Number.isFinite(value)&&value>0)) throw new RangeError('Invalid truck parameters');
    const effectiveSpeedKmh=Math.min(truck.maxSpeedKmh,roadSpeedLimit??Infinity);
    return {truck,effectiveSpeedKmh,index:costs/(truck.cargoCapacity*effectiveSpeedKmh)};
  }).sort((a,b)=>a.index-b.index||a.truck.year-b.truck.year||a.truck.name.localeCompare(b.truck.name,'en'));
  let rank=0,previous;
  return rows.map((row,i)=>{
    if(previous===undefined||Math.abs(row.index-previous)>Math.max(1,Math.abs(previous))*1e-12)rank=i+1;
    previous=row.index;return {...row,rank};
  });
}

/** General-purpose vehicles are compatible with each captured freight specialization. */
export function trucksForCargo(trucks,cargo='all') {
  if(!['all','bulk','goods','flatbed','liquid'].includes(cargo))throw new RangeError('Unsupported freight specialization');
  return trucks.filter(truck=>truck.freightSpecialization==='general'||(!truck.freightSpecialization&&truck.cargoTypes==='all freight')||(cargo!=='all'&&truck.freightSpecialization===cargo));
}

export function trucksByYear(trucks,year) {
  if(!Number.isInteger(year))throw new RangeError('Truck year must be an integer');
  return trucks.filter(truck=>truck.year<=year);
}

/** Shared road comparison cohorts; category never mixes passenger and cargo capacities. */
export function selectRoadVehicles(datasets,{category='freight',includeTrams=false,cargo='all',year=2020}={}) {
  if(!['freight','passengers'].includes(category))throw new RangeError('Unsupported transport category');
  if(typeof includeTrams!=='boolean')throw new TypeError('Include trams must be boolean');
  const annotate=(vehicles,vehicleType)=>vehicles.map(vehicle=>({...vehicle,vehicleType:vehicle.vehicleType??vehicleType}));
  const vehicles=category==='passengers'
    ? [...annotate(datasets.buses,'Bus'),...(includeTrams?annotate(datasets.trams,'Tram'):[])]
    : trucksForCargo([...annotate(datasets.trucks,'Truck'),...(includeTrams?annotate(datasets.freightTrams,'Tram'):[])],cargo);
  return trucksByYear(vehicles,year);
}

/** Steady-speed A–B–A freight cycle, including sequential handling of delivered cargo. */
function analyseRoadService(trucks, {distanceKm, fillRatio = 1, loadedReturn = false, roadSpeedLimit = null, specializedTerminal = false, specializedWarehouse = false, stopA, stopB}, baseRate) {
  const terminalDelaySeconds = ROAD_OPERATION_DELAY_SECONDS * (loadedReturn ? 3 : 2);
  for (const [name,value] of Object.entries({distanceKm,baseRate})) {
    if (!Number.isFinite(value)||value<=0) throw new RangeError(`${name} must be positive and finite`);
  }
  if (!Number.isFinite(fillRatio)||fillRatio<=0||fillRatio>1) throw new RangeError('Utilization must be between zero (exclusive) and one');
  if (typeof specializedTerminal!=='boolean'||typeof specializedWarehouse!=='boolean') throw new TypeError('Specialized facilities must be boolean');
  const facilities=stop=>({specializedTerminal,specializedWarehouse,...stop});
  const a=facilities(stopA),b=facilities(stopB);
  for(const stop of [a,b])if(typeof stop.specializedTerminal!=='boolean'||typeof stop.specializedWarehouse!=='boolean')throw new TypeError('Stop facilities must be boolean');
  const handlingMultiplierA=(a.specializedTerminal?2:1)*(a.specializedWarehouse?2:1);
  const handlingMultiplierB=(b.specializedTerminal?2:1)*(b.specializedWarehouse?2:1);
  const handlingMultiplier=2/(1/handlingMultiplierA+1/handlingMultiplierB);
  if (typeof loadedReturn!=='boolean') throw new TypeError('Loaded return must be boolean');
  const rows=rankTrucks(trucks,roadSpeedLimit).map(row=>{
    const multiplier=row.truck.formationLoadingUnloadingSpeedMultiplier!==undefined?row.truck.formationLoadingUnloadingSpeedMultiplier:row.truck.loadingUnloadingSpeedMultiplier;
    if (!Number.isFinite(multiplier)||multiplier<=0) throw new RangeError('Handling multiplier must be positive and finite');
    const cargoPerLeg=row.truck.cargoCapacity*fillRatio;
    const deliveredPerCycle=cargoPerLeg*(loadedReturn?2:1);
    const travelSeconds=distanceKm/row.effectiveSpeedKmh*3600;
    const transferA=cargoPerLeg/(baseRate*multiplier*handlingMultiplierA);
    const transferB=cargoPerLeg/(baseRate*multiplier*handlingMultiplierB);
    const loadingSeconds=transferA+(loadedReturn?transferB:0);
    const unloadingSeconds=transferB+(loadedReturn?transferA:0);
    const roundTripSeconds=2*travelSeconds+loadingSeconds+unloadingSeconds+2*terminalDelaySeconds;
    const cargoPerYear=deliveredPerCycle/roundTripSeconds*GAME_YEAR_SECONDS;
    const costPerCargo=row.truck.economy.annualMaintenance/cargoPerYear;
    return {...row,terminalDelaySeconds,handlingMultiplier,handlingMultiplierA,handlingMultiplierB,cargoPerLeg,deliveredPerCycle,travelSeconds,loadingSeconds,unloadingSeconds,roundTripSeconds,cargoPerYear,costPerCargo};
  }).sort((a,b)=>a.costPerCargo-b.costPerCargo||a.truck.year-b.truck.year||a.truck.name.localeCompare(b.truck.name,'en'));
  let rank=0,previous;
  return rows.map((row,i)=>{
    if(previous===undefined||Math.abs(row.costPerCargo-previous)>Math.max(1,Math.abs(previous))*1e-12)rank=i+1;
    previous=row.costPerCargo;return {...row,rank};
  });
}

export function analyseTruckService(trucks, options) {
  return analyseRoadService(trucks, options, FREIGHT_LOAD_SPEED_FACTOR);
}

/** Passenger road service: equal occupancy both ways; freight facility bonuses never apply. */
export function analysePassengerRoadService(vehicles,options) {
  return analyseRoadService(vehicles.map(vehicle=>({...vehicle,cargoCapacity:vehicle.passengerCapacity})),{...options,loadedReturn:true,specializedTerminal:false,specializedWarehouse:false,stopA:{specializedTerminal:false,specializedWarehouse:false},stopB:{specializedTerminal:false,specializedWarehouse:false}}, PASSENGER_LOAD_SPEED_FACTOR);
}

// Retain the bus-specific entry point for existing callers.
export const analyseBusService=analysePassengerRoadService;

export function renderTruckService(document,trucks,options) {
  const passenger=options.passenger===true;
  const rows=passenger?analysePassengerRoadService(trucks,options):analyseTruckService(trucks,options);
  const unit=passenger?'passenger journey':'cargo unit';
  document.getElementById('truck-service-summary').textContent=rows.length?`Lowest running cost / ${unit}: ${rows.filter(row=>row.rank===1).map(row=>row.truck.name).join(' / ')} · $${fmt(rows[0].costPerCargo,2)}. A–B–A · ${fmt(options.distanceKm,1)} km per leg · ${passenger?'equal utilization in both directions':options.loadedReturn?'loaded in both directions':'empty return'} · handling A ×${rows[0].handlingMultiplierA} / B ×${rows[0].handlingMultiplierB}.`:'No vehicles introduced by this year in the captured catalogue.';
  renderTruckBars(document.getElementById('truck-bars'),rows);
  document.getElementById('truck-service-readout').innerHTML=rows.map(row=>`<tr><td>${row.rank}</td><th scope="row">${escape(row.truck.name)}${row.truck.vehicleType?`<span class="road-vehicle-kind">${escape(row.truck.vehicleType)}</span>`:''}</th><td title="${escape(row.costPerCargo.toFixed(6))}">${fmt(row.costPerCargo,2)}</td><td>${fmt(row.cargoPerLeg,1)}</td><td>${formatTime(row.travelSeconds)}</td><td>${formatTime(row.loadingSeconds)}</td><td>${formatTime(row.unloadingSeconds)}</td><td>${formatTime(row.roundTripSeconds)}</td></tr>`).join('');
  updateTablePreview(document,'truck-service-readout');
}

function renderTruckBars(container,rows) {
  if(!rows.length){container.innerHTML='<p class="chart-help">No vehicles introduced by this year in the captured catalogue.</p>';return;}
  const maximum=Math.max(...rows.map(row=>row.costPerCargo));
  container.innerHTML=`<div class="truck-bar-axis" aria-hidden="true"><span>0</span><span>$${fmt(maximum,2)}</span></div><ol class="truck-bar-list">${rows.map(row=>`<li class="truck-bar-row${row.rank===1?' is-best':''}"><span class="truck-bar-name">${escape(row.truck.name)}${row.truck.vehicleType?`<span class="road-vehicle-kind">${escape(row.truck.vehicleType)}</span>`:''}</span><span class="truck-bar-track" aria-hidden="true"><span class="truck-bar" style="width:${row.costPerCargo/maximum*100}%"></span></span><span class="truck-bar-value" title="${escape(row.costPerCargo.toFixed(6))}">$${fmt(row.costPerCargo,2)}</span></li>`).join('')}</ol>`;
}
