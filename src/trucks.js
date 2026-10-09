import {roadRoundTripMotion} from './road-motion.js';
import {UI_TERMS} from './ui-terms.js';
import {roadGradientSpeeds,validateGradient} from './gradient.js';
import {escapeHtml as escape, formatNumber} from './format.js';
import {sizeFleet} from './service-fleet.js';
import {updateTablePreview} from './table-preview.js';
import {GAME_YEAR_SECONDS} from './line.js';
import {formatTime} from './format.js';
import {renderServiceSummary} from './service-summary.js';
import {validateRouteProfile,reverseRouteProfile} from './route-profile.js';

export const FREIGHT_LOAD_SPEED_FACTOR = 0.0625;
export const PASSENGER_LOAD_SPEED_FACTOR = 1;
export const ROAD_OPERATION_DELAY_SECONDS = 2; // Before each active transfer operation and departure.

const fmt = formatNumber;

/** Directional mean speeds; opt into provisional acceleration and terminal braking. */
export function roadRouteSpeeds(vehicle,{roadSpeedLimit=null,gradePercent=0,routeProfile=null,motion=false,distanceKm=routeProfile?.reduce((n,p)=>n+p.distanceKm,0)??1}={}) {
  if(motion){
    const travel=roadRoundTripMotion(vehicle,{distanceKm,roadSpeedLimit,gradePercent,routeProfile});
    if(!travel.eligible)return {eligible:false};
    return {...travel,outboundSpeedKmh:distanceKm/travel.outboundTravelSeconds*3600,returnSpeedKmh:distanceKm/travel.returnTravelSeconds*3600,effectiveSpeedKmh:distanceKm/travel.travelSeconds*3600};
  }
  if(!routeProfile)return roadGradientSpeeds(vehicle,gradePercent,roadSpeedLimit);
  const route=validateRouteProfile(routeProfile),routeKm=route.reduce((total,part)=>total+part.distanceKm,0);
  if(route.length===1)return roadGradientSpeeds(vehicle,route[0].gradePercent,route[0].speedLimitKmh);
  const seconds=[];
  for(const leg of [route,reverseRouteProfile(route)]){
    let travelSeconds=0;
    for(const part of leg){
      const speeds=roadGradientSpeeds(vehicle,part.gradePercent,part.speedLimitKmh);
      if(!speeds.eligible)return {eligible:false};
      travelSeconds+=part.distanceKm/speeds.outboundSpeedKmh*3600;
    }
    seconds.push(travelSeconds);
  }
  const outboundSpeedKmh=routeKm/seconds[0]*3600,returnSpeedKmh=routeKm/seconds[1]*3600;
  return {eligible:true,outboundSpeedKmh,returnSpeedKmh,effectiveSpeedKmh:2/(1/outboundSpeedKmh+1/returnSpeedKmh)};
}

/** Indicative long-haul index; source annual costs are not converted to delivery costs. */
export function rankTrucks(trucks, roadSpeedLimit = null, gradePercent = 0, routeProfile = null, motionOptions = {}) {
  if (roadSpeedLimit !== null && (!Number.isFinite(roadSpeedLimit) || roadSpeedLimit <= 0)) throw new RangeError('Road speed must be positive or null');
  validateGradient(gradePercent);
  if(routeProfile)validateRouteProfile(routeProfile);
  const rows=trucks.flatMap(truck=>{
    const costs=truck.economy.annualMaintenance;
    if (![costs,truck.cargoCapacity,truck.maxSpeedKmh].every(value=>Number.isFinite(value)&&value>0)) throw new RangeError('Invalid truck parameters');
    const speeds=roadRouteSpeeds(truck,{gradePercent,roadSpeedLimit,routeProfile,...motionOptions});
    return speeds.eligible?[{truck,...speeds,index:costs/(truck.cargoCapacity*speeds.effectiveSpeedKmh)}]:[];
  }).sort((a,b)=>a.index-b.index||a.truck.year-b.truck.year||a.truck.name.localeCompare(b.truck.name,'en'));
  let rank=0,previous;
  return rows.map((row,i)=>{
    if(previous===undefined||Math.abs(row.index-previous)>Math.max(1,Math.abs(previous))*1e-12)rank=i+1;
    previous=row.index;return {...row,rank};
  });
}

/** "All freight" selects general-purpose vehicles; specific groups also include them. */
export function matchesFreightFilter(vehicle,cargo='all') {
  return vehicle.freightSpecialization==='general'||
    (!vehicle.freightSpecialization&&vehicle.cargoTypes==='all freight')||
    (cargo!=='all'&&vehicle.freightSpecialization===cargo);
}

/** Specific freight filters also include compatible general-purpose vehicles. */
export function trucksForCargo(trucks,cargo='all') {
  if(!['all','bulk','goods','flatbed','liquid'].includes(cargo))throw new RangeError('Unsupported freight specialization');
  return trucks.filter(truck=>matchesFreightFilter(truck,cargo));
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

/** A–B–A cycle with optional motion and sequential handling of delivered capacity. */
function analyseRoadService(trucks, {distanceKm, fillRatio = 1, loadedReturn = false, roadSpeedLimit = null, gradePercent = 0, routeProfile = null, motion = false, specializedTerminal = false, specializedWarehouse = false, stopA, stopB}, baseRate) {
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
  const rows=rankTrucks(trucks,roadSpeedLimit,gradePercent,routeProfile,{motion,distanceKm}).map(row=>{
    const multiplier=row.truck.formationLoadingUnloadingSpeedMultiplier!==undefined?row.truck.formationLoadingUnloadingSpeedMultiplier:row.truck.loadingUnloadingSpeedMultiplier;
    if (!Number.isFinite(multiplier)||multiplier<=0) throw new RangeError('Handling multiplier must be positive and finite');
    const cargoPerLeg=row.truck.cargoCapacity*fillRatio;
    const deliveredPerCycle=cargoPerLeg*(loadedReturn?2:1);
    // Mean leg speeds already include the optional acceleration/braking model.
    // Handling remains independent of travel; profiles scale to this distance.
    const travelSeconds=distanceKm/row.effectiveSpeedKmh*3600;
    const outboundTravelSeconds=distanceKm/row.outboundSpeedKmh*3600,returnTravelSeconds=distanceKm/row.returnSpeedKmh*3600;
    const transferA=cargoPerLeg/(baseRate*multiplier*handlingMultiplierA);
    const transferB=cargoPerLeg/(baseRate*multiplier*handlingMultiplierB);
    const loadingSeconds=transferA+(loadedReturn?transferB:0);
    const unloadingSeconds=transferB+(loadedReturn?transferA:0);
    const roundTripSeconds=2*travelSeconds+loadingSeconds+unloadingSeconds+2*terminalDelaySeconds;
    const cargoPerYear=deliveredPerCycle/roundTripSeconds*GAME_YEAR_SECONDS;
    const costPerCargo=row.truck.economy.annualMaintenance/cargoPerYear;
    return {...row,terminalDelaySeconds,handlingMultiplier,handlingMultiplierA,handlingMultiplierB,cargoPerLeg,deliveredPerCycle,travelSeconds,outboundTravelSeconds,returnTravelSeconds,loadingSeconds,unloadingSeconds,roundTripSeconds,cargoPerYear,costPerCargo};
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

export function analyseRoadFleet(vehicles, options) {
  const analyse=options.passenger?analysePassengerRoadService:analyseTruckService;
  const baseline=analyse(vehicles,options);
  const rows=baseline.map(row=>{
    const fleet=sizeFleet({cycleSeconds:row.roundTripSeconds,transferSeconds:row.loadingSeconds+row.unloadingSeconds,unitsPerCycle:row.deliveredPerCycle,yearSeconds:GAME_YEAR_SECONDS},options);
    const actual=fleet.loadScale===1?row:analyse([row.truck],{...options,fillRatio:(options.fillRatio??1)*fleet.loadScale})[0];
    return {...actual,vehicleCount:fleet.count,actualFillRatio:(options.fillRatio??1)*fleet.loadScale,headwaySeconds:actual.roundTripSeconds/fleet.count,
      fleetMaintenance:actual.truck.economy.annualMaintenance*fleet.count,deliveredPerYear:actual.cargoPerYear*fleet.count};
  }).sort((a,b)=>a.costPerCargo-b.costPerCargo||a.truck.name.localeCompare(b.truck.name));
  let rank=0,prior;
  return rows.map((row,i)=>{if(prior===undefined||Math.abs(row.costPerCargo-prior)>Math.max(1,Math.abs(prior))*1e-12)rank=i+1;prior=row.costPerCargo;return {...row,rank};});
}

export function renderTruckService(document,trucks,options) {
  const passenger=options.passenger===true;
  const profile=options.routeProfile,directional=!!profile||!!options.gradePercent;
  const rows=analyseRoadFleet(trucks,options);
  const unit=UI_TERMS.capacityUnit;
  document.getElementById('truck-service-readout').closest('table').classList.toggle('has-targets',options.demandPerYear!=null||options.maxHeadwaySeconds!=null);
  renderServiceSummary(document.getElementById('truck-service-summary'),{names:rows.filter(row=>row.rank===1).map(row=>row.truck.name),cost:rows[0]?.costPerCargo,unit,emptyMessage:trucks.length?`No selected vehicle can complete this ${profile?'route':'gradient'} with the available mass, power and traction. Reduce the gradient or choose a stronger vehicle.`:'No vehicles selected for this category and year. Choose vehicles or adjust the filters.'});
  document.getElementById('road-service-caption').textContent=`A–B–A · ${fmt(options.distanceKm,profile?3:1)} km per leg${profile?` · ${profile.length} segment${profile.length===1?'':'s'} (${options.motion?'provisional acceleration and braking':'theoretical steady speeds'})`:options.gradePercent?` · ${fmt(options.gradePercent,1)}% A→B (theoretical)`:''} · ${passenger?'equal utilization in both directions':options.loadedReturn?'loaded in both directions':'empty return'}${!passenger&&rows.length?` · handling A ×${rows[0].handlingMultiplierA} / B ×${rows[0].handlingMultiplierB}`:''}. ${options.motion?'Road motion uses provisional rail-based coefficients; empty mass in both directions. ':''}Travel and handling times in m:ss; handling totals cover the entire round trip.`;
  if(document.getElementById('road-gradient-exclusions'))document.getElementById('road-gradient-exclusions').textContent=`Excluded on this ${profile?'route':'gradient'} (cannot climb or missing mechanical data): `+trucks.filter(t=>!rows.some(r=>r.truck.id===t.id)).map(t=>t.name).join(', ');
  if(document.getElementById('road-gradient-exclusions'))document.getElementById('road-gradient-exclusions').hidden=rows.length===trucks.length;
  if(document.getElementById('road-travel-column'))document.getElementById('road-travel-column').textContent=directional?'Travel A→B / B→A':'Travel / leg';
  renderTruckBars(document.getElementById('truck-bars'),rows);
  updateTablePreview(document,'truck-bar-list');
  document.getElementById('truck-service-readout').innerHTML=rows.map(row=>`<tr><td>${row.rank}</td><th scope="row">${escape(row.truck.name)}${row.truck.vehicleType?`<span class="road-vehicle-kind">${escape(row.truck.vehicleType)}</span>`:''}</th><td title="${escape(row.costPerCargo.toFixed(6))}">${fmt(row.costPerCargo,2,true)}</td><td>${fmt(row.cargoPerLeg,1)}</td><td>${directional?`${formatTime(row.outboundTravelSeconds)} / ${formatTime(row.returnTravelSeconds)}`:formatTime(row.travelSeconds)}</td><td>${formatTime(row.loadingSeconds)}</td><td>${formatTime(row.unloadingSeconds)}</td><td>${formatTime(row.roundTripSeconds)}</td><td class="road-fleet-column">${row.vehicleCount}</td><td class="road-fleet-column">${fmt(row.actualFillRatio*100,1)}%</td><td class="road-fleet-column">${formatTime(row.headwaySeconds)}</td><td class="road-fleet-column">${fmt(row.deliveredPerYear,0)}</td><td class="road-fleet-column">$${fmt(row.fleetMaintenance,0)}</td></tr>`).join('');
  updateTablePreview(document,'truck-service-readout');
}

function renderTruckBars(container,rows) {
  if(!rows.length){container.innerHTML='<p class="chart-help">No vehicles selected for this category and year. Choose vehicles or adjust the filters.</p>';return;}
  const maximum=Math.max(...rows.map(row=>row.costPerCargo));
  container.innerHTML=`<div class="truck-bar-axis" aria-hidden="true"><span>0</span><span>$${fmt(maximum,2)}</span></div><ol id="truck-bar-list" class="truck-bar-list compact-rows">${rows.map(row=>`<li class="truck-bar-row${row.rank===1?' is-best':''}"><span class="truck-bar-name">${escape(row.truck.name)}${row.truck.vehicleType?`<span class="road-vehicle-kind">${escape(row.truck.vehicleType)}</span>`:''}</span><span class="truck-bar-track" aria-hidden="true"><span class="truck-bar" style="width:${row.costPerCargo/maximum*100}%"></span></span><span class="truck-bar-value" title="${escape(row.costPerCargo.toFixed(6))}">$${fmt(row.costPerCargo,2,true)}</span></li>`).join('')}</ol>`;
}
