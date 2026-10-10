import {createModel} from './model.js';
import {FREIGHT_LOAD_SPEED_FACTOR, PASSENGER_LOAD_SPEED_FACTOR} from './trucks.js';

const carriers = ['rail', 'tram'];
const roles = ['locomotive', 'wagon', 'powered-carriage'];
const cargoGroups = ['all', 'bulk', 'goods', 'flatbed', 'liquid'];

/** Annotate stored tram sources without changing raw records or claiming coupling compatibility. */
export function poweredVehicleComponents(vehicles, {carrier, catalogue, perCarHandling=false}) {
  if(!carriers.includes(carrier)||typeof catalogue!=='string'||!catalogue)throw new RangeError('Powered vehicle catalogue identity is required');
  return vehicles.map(item=>({...item,id:`${carrier}:${catalogue}:${item.id}`,carrier,role:'powered-carriage',
    loadingUnloadingSpeedMultiplier:perCarHandling?
      (item.formationLoadingUnloadingSpeedMultiplier??item.loadingUnloadingSpeedMultiplier*(item.carCount??1)):item.loadingUnloadingSpeedMultiplier}));
}

export function tramComponents({locomotives, passengerWagons, freightWagons, passengerTrams=[], freightTrams=[]}) {
  return [
    ...locomotives.map(item=>({...item,id:`tram:locomotive:${item.id}`,carrier:'tram',role:'locomotive'})),
    ...passengerWagons.map(item=>({...item,id:`tram:passenger-wagon:${item.id}`,carrier:'tram',role:'wagon'})),
    ...freightWagons.map(item=>({...item,id:`tram:freight-wagon:${item.id}`,carrier:'tram',role:'wagon'})),
    ...poweredVehicleComponents(passengerTrams,{carrier:'tram',catalogue:'passenger-motor'}),
    ...poweredVehicleComponents(freightTrams,{carrier:'tram',catalogue:'freight-motor'}),
  ];
}

/** Acquired railway choices, keeping fixed multiple units as whole powered vehicles. */
export function railComponents({locomotives, passengerWagons, freightWagons, multipleUnits=[]}) {
  return [
    ...locomotives.map(item=>({...item,id:`rail:locomotive:${item.id}`,carrier:'rail',role:'locomotive'})),
    ...passengerWagons.map(item=>({...item,id:`rail:passenger-wagon:${item.id}`,carrier:'rail',role:'wagon'})),
    ...freightWagons.map(item=>({...item,id:`rail:freight-wagon:${item.id}`,carrier:'rail',role:'wagon'})),
    ...poweredVehicleComponents(multipleUnits,{carrier:'rail',catalogue:'multiple-unit',perCarHandling:true}),
  ];
}

/** Confirmed light-rail trams are whole powered units, with their captured handling counted once. */
export function lightRailComponents(vehicles) {
  return poweredVehicleComponents(vehicles.filter(item=>item.lightRailCompatible===true),{carrier:'rail',catalogue:'light-rail'});
}

/** Build one complete formation. Missing mechanical/economic values stay unknown. */
export function buildConsist(definition, catalogue, units) {
  if(definition?.schemaVersion!==1)throw new RangeError('Unsupported consist schema');
  if(typeof definition.id!=='string'||!definition.id.trim())throw new TypeError('Consist ID is required');
  if(typeof definition.name!=='string'||!definition.name.trim()||definition.name.length>120)throw new TypeError('Consist name must contain 1–120 characters');
  if(!['passengers','freight'].includes(definition.category))throw new RangeError('Unsupported consist category');
  if(!carriers.includes(definition.carrier))throw new RangeError('Unsupported consist carrier');
  const freight=definition.category==='freight',cargo=definition.cargo??'all';
  if(freight&&!cargoGroups.includes(cargo))throw new RangeError('Unsupported freight group');
  if(!Array.isArray(definition.components)||!definition.components.length)throw new RangeError('A consist needs components');
  const index=new Map();
  for(const item of catalogue){
    if(!item.id||index.has(item.id))throw new RangeError('Component IDs must be unique');
    index.set(item.id,item);
  }
  const missing=new Set(),components=[];
  const chosen=definition.components.map(entry=>index.get(entry.componentId)).filter(Boolean);
  if(chosen.some(item=>item.lightRailCompatible===true)&&chosen.some(item=>item.lightRailCompatible!==true))throw new RangeError('Light-rail trams can only be coupled with other compatible light-rail trams.');
  const positive=(item,key)=>{
    const value=item[key];
    if(value==null){missing.add(`${item.id}:${key}`);return null;}
    if(!Number.isFinite(value)||value<=0)throw new RangeError(`Invalid ${key} for ${item.id}`);
    return value;
  };
  const sum={massTonnes:0,lengthMetres:0,powerCh:0,tractionKgf:0,capacity:0,multiplier:0,purchasePrice:0,annualMaintenance:0};
  let maxSpeedKmh=Infinity,year=0,carCount=0,poweredCount=0;
  const propulsion=new Set();
  for(const entry of definition.components){
    if(!Number.isSafeInteger(entry.quantity)||entry.quantity<1||entry.quantity>1000)throw new RangeError('Component quantity must be an integer from 1 to 1000');
    const item=index.get(entry.componentId);
    if(!item)throw new RangeError(`Unknown component: ${entry.componentId}`);
    if(item.carrier!==definition.carrier)throw new RangeError('Rail and tram components cannot be mixed');
    if(!roles.includes(item.role))throw new RangeError(`Unknown role: ${item.id}`);
    const q=entry.quantity;
    components.push({componentId:item.id,quantity:q});
    if(item.carCount!=null&&(!Number.isSafeInteger(item.carCount)||item.carCount<1))throw new RangeError(`Invalid car count: ${item.id}`);
    carCount+=q*(item.carCount??1);
    for(const key of ['massTonnes','lengthMetres']){
      const value=positive(item,key);
      sum[key]=sum[key]===null||value===null?null:sum[key]+q*value;
    }
    const speed=positive(item,'maxSpeedKmh');
    maxSpeedKmh=maxSpeedKmh===null||speed===null?null:Math.min(maxSpeedKmh,speed);
    if(!Number.isInteger(item.year)||item.year<0)throw new RangeError(`Invalid introduction year: ${item.id}`);
    year=Math.max(year,item.year);
    if(item.role!=='wagon'){
      poweredCount+=q;
      if(item.propulsion)propulsion.add(item.propulsion);
      for(const key of ['powerCh','tractionKgf']){
        const value=positive(item,key);
        sum[key]=sum[key]===null||value===null?null:sum[key]+q*value;
      }
    }
    const capacityKey=freight?'cargoCapacity':'passengerCapacity';
    const oppositeKey=freight?'passengerCapacity':'cargoCapacity';
    if(item[oppositeKey]>0)throw new RangeError('Passenger and freight components cannot be mixed');
    if(item[capacityKey]!=null||item.role!=='locomotive'){
      if(freight){
        const group=item.freightSpecialization;
        if(group!=='general'&&!cargoGroups.slice(1).includes(group))throw new RangeError(`Unsupported component freight group: ${item.id}`);
        if(group!=='general'&&group!==cargo)throw new RangeError(`Component incompatible with selected freight: ${item.id}`);
      }
      const capacity=positive(item,capacityKey),multiplier=positive(item,'loadingUnloadingSpeedMultiplier');
      sum.capacity=sum.capacity===null||capacity===null?null:sum.capacity+q*capacity;
      sum.multiplier=sum.multiplier===null||multiplier===null?null:sum.multiplier+q*multiplier;
    }
    for(const key of ['purchasePrice','annualMaintenance']){
      const value=item.economy?.[key];
      if(value==null){sum[key]=null;missing.add(`${item.id}:economy.${key}`);}
      else {
        if(!Number.isFinite(value)||value<0)throw new RangeError(`Invalid ${key}: ${item.id}`);
        if(sum[key]!==null)sum[key]+=q*value;
      }
    }
  }
  if(!poweredCount)throw new RangeError('A consist needs a powered component');
  if(sum.capacity===0)throw new RangeError('A service consist needs transport capacity');
  for(const value of Object.values(sum))if(value!==null&&!Number.isFinite(value))throw new RangeError('Consist totals overflow');
  const train={
    id:definition.id,name:definition.name.trim(),category:definition.category,carrier:definition.carrier,
    isCustomConsist:true,automaticCouplingAllowed:false,components,year,carCount,
    ...(chosen.every(item=>item.lightRailCompatible===true)?{lightRailCompatible:true,vehicleType:'Tram'}:{}),
    massTonnes:sum.massTonnes,lengthMetres:sum.lengthMetres,powerCh:sum.powerCh,tractionKgf:sum.tractionKgf,maxSpeedKmh,
    [freight?'cargoCapacity':'passengerCapacity']:sum.capacity,
    formationLoadingUnloadingSpeedMultiplier:sum.multiplier,
    handlingRate:sum.multiplier===null?null:sum.multiplier*(freight?FREIGHT_LOAD_SPEED_FACTOR:PASSENGER_LOAD_SPEED_FACTOR),
    economy:{purchasePrice:sum.purchasePrice,annualMaintenance:sum.annualMaintenance},
    propulsion:[...propulsion],missing:[...missing],
    assumptions:['Locomotives without capacity fields contribute no transport capacity or handling rate.'],
  };
  if(freight){train.freightSpecialization=cargo==='all'?'general':cargo;train.assumptions.push('Same-cargo aggregate handling; mixed commodities are not modelled.');}
  train.model=[train.massTonnes,train.powerCh,train.tractionKgf,train.maxSpeedKmh].every(n=>Number.isFinite(n)&&n>0)?createModel(train,units):null;
  train.serviceReady=Boolean(train.model)&&sum.capacity>0&&sum.multiplier>0&&sum.annualMaintenance>0;
  return train;
}
