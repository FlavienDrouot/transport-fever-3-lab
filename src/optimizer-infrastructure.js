import {UI_TERMS as T} from './ui-terms.js';

export const MAX_TERMINAL_CONFIGURATIONS=8;
// Maximum Rail platform length reported in-game by Flavien.
export const RAIL_PLATFORM_MAX_LENGTH=840;
// Annual tariffs reported by Flavien: Rail per 40 m, Road per 10 m (initial 20 m).
export const PLATFORM_TERMINAL_TARIFFS={passengers:60000,freight:30000,specialized:60000};
export const RAIL_TERMINAL_TARIFFS={sectionLength:40,track:30000,...PLATFORM_TERMINAL_TARIFFS};
export const WAREHOUSE_TARIFFS={capacityPerSection:500,generic:150000,specialized:300000};
export const STATION_TARIFFS={railBase:18000,roadBase:36000,roadAccess:6000};
export const BUS_STOP_TARIFFS={annualMaintenance:30000,vehicleSlots:1};
export const ROAD_PLATFORM_LENGTH=20;
export const ROAD_PLATFORM_EXTENSION_LENGTH=10;
export function roadPlatformVehicleSlots(vehicleLength,platformCount=1,platformLength=ROAD_PLATFORM_LENGTH){
  if(!Number.isFinite(vehicleLength)||vehicleLength<=0||!Number.isInteger(platformCount)||platformCount<1||!Number.isFinite(platformLength)||platformLength<20||platformLength%10)throw new RangeError('Road platform capacity requires a positive vehicle length, platform count and valid length.');
  return Math.max(1,Math.floor((platformLength+1e-9)/vehicleLength))*platformCount;
}
export const busStopAllowed=(domain,category,stop,siteType,loadedReturn=false)=>domain==='road'&&(category==='passengers'||stop==='stopB'&&siteType==='industrial'&&!loadedReturn);
// Reported infrastructure purchase price; reserved for future acquisition/amortization calculations.
export const INFRASTRUCTURE_PURCHASE_MULTIPLIER=6;

const stationRunningCosts=domain=>domain==='rail'?STATION_TARIFFS.railBase:STATION_TARIFFS.roadBase+STATION_TARIFFS.roadAccess;
function booleanSetting(input,key,fallback=false){
  const value=input[key]??fallback;
  if(typeof value!=='boolean')throw new RangeError(`Choose a valid ${key} setting.`);
  return value;
}

/** One user-imposed use of each terminal; the search chooses only allowed improvements. */
function validateTerminalConstraint(input,domain,category,siteType,stop,loadedReturn){
  if(!input||typeof input!=='object')throw new RangeError('Choose how each terminal will serve this route.');
  const factory=domain==='road'&&category==='freight'&&siteType==='factory';
  const mode=input.mode;
  const terminalType=input.terminalType??'station';
  if(!['station','busStop'].includes(terminalType))throw new RangeError('Choose a station or bus stop.');
  if(terminalType==='busStop'&&(!busStopAllowed(domain,category,stop,siteType,loadedReturn)||!['new','reuse'].includes(mode)))throw new RangeError('Bus stops serve passengers, or unload freight at industrial destination B without a loaded return.');
  const allowBusStop=busStopAllowed(domain,category,stop,siteType,loadedReturn)&&booleanSetting(input,'allowBusStop');
  if(input.id!==undefined&&(typeof input.id!=='string'||!input.id||input.id.length>256))throw new RangeError('Choose a valid reusable infrastructure ID.');
  if(!['reuse','add','new','factory'].includes(mode)||mode==='factory'&&!factory)throw new RangeError('Choose an available platform, an additional platform, or a new station.');
  const specializedTerminal=category==='freight'&&mode==='reuse'?booleanSetting(input,'specializedTerminal'):mode==='factory';
  const allowSpecialization=category==='freight'&&mode!=='factory'&&!specializedTerminal?booleanSetting(input,'allowSpecialization'):false;
  const allowExtension=mode==='reuse'&&terminalType==='station'?booleanSetting(input,'allowExtension'):false;
  const existingLength=domain==='rail'&&mode==='reuse'?input.existingLength:null;
  const maxTrainLength=domain==='rail'?(mode==='reuse'&&!allowExtension?existingLength:input.maxTrainLength??null):null;
  const rail={};
  if(domain==='rail'){
    const validLength=n=>Number.isInteger(n)&&n>=40&&n<=RAIL_PLATFORM_MAX_LENGTH&&n%40===0;
    if(maxTrainLength!==null&&!validLength(maxTrainLength)||mode==='reuse'&&!validLength(existingLength))throw new RangeError(`Rail platform lengths must use whole 40 m sections, up to ${RAIL_PLATFORM_MAX_LENGTH} m.`);
    if(mode==='reuse'&&maxTrainLength!==null&&maxTrainLength<existingLength)throw new RangeError('Maximum platform length must accommodate the reused platform.');
    rail.platformTrackCount=input.platformTrackCount??1;
    rail.platformCount=input.platformCount??Math.ceil(rail.platformTrackCount/2);
    rail.allowParallelTracks=booleanSetting(input,'allowParallelTracks',mode!=='reuse');
    rail.maxPlatformTracks=mode==='reuse'&&!rail.allowParallelTracks?rail.platformTrackCount:input.maxPlatformTracks??rail.platformTrackCount;
    if(![rail.platformTrackCount,rail.platformCount,rail.maxPlatformTracks].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=100)||
      rail.platformCount<Math.ceil(rail.platformTrackCount/2)||rail.platformCount>rail.platformTrackCount||rail.maxPlatformTracks<rail.platformTrackCount)
      throw new RangeError('Rail needs 1–100 platform tracks, with one or two tracks per platform and limits accommodating reusable tracks.');
  }
  const road={};
  if(domain==='road'&&terminalType==='station'&&mode!=='factory'){
    road.platformLength=input.platformLength??20;road.platformCount=input.platformCount??1;
    road.allowParallelPlatforms=booleanSetting(input,'allowParallelPlatforms',mode!=='reuse');
    road.maxPlatformLength=mode==='reuse'&&!allowExtension?road.platformLength:input.maxPlatformLength??road.platformLength;
    road.maxPlatforms=mode==='reuse'&&!road.allowParallelPlatforms?road.platformCount:input.maxPlatforms??road.platformCount;
    if(![road.platformLength,road.maxPlatformLength].every(n=>Number.isSafeInteger(n)&&n>=20&&n<=10000&&n%10===0))throw new RangeError('Road platform lengths must use 10 m sections between 20 and 10,000 m.');
    if(![road.platformCount,road.maxPlatforms].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=100))throw new RangeError('Road platform counts must be whole numbers (1–100).');
    if(road.maxPlatformLength<road.platformLength||road.maxPlatforms<road.platformCount)throw new RangeError('Road limits must accommodate the available platforms.');
  }
  return {...(input.id===undefined?{}:{id:input.id}),...(input.tramOnly===undefined?{}:{tramOnly:booleanSetting(input,'tramOnly')}),mode,terminalType,allowBusStop,specializedTerminal:terminalType==='busStop'?false:specializedTerminal,allowSpecialization:terminalType==='busStop'?false:allowSpecialization,allowExtension,existingLength,maxTrainLength,siteType,...rail,...road};
}

/** Enumerate distinct serial-place layouts, retaining the cheapest length for each place count. */
function* roadTerminalVariants(constraint,category,vehicleLength,costCeiling){
  const reused=constraint.mode==='reuse',tariff=platformRunningCosts(constraint,category),station=stationRunningCosts('road');
  const existing=reused?Array(constraint.platformCount).fill(constraint.platformLength):[];
  const baseline=constraint.mode==='new'?0:station+existing.reduce((sum,length)=>sum+length/10*tariff,0);
  const lengths=minimum=>{
    const choices=[],seen=new Set();
    for(let length=minimum;length<=constraint.maxPlatformLength;length+=10){
      const places=vehicleLength>0?roadPlatformVehicleSlots(vehicleLength,1,length):length;
      if(!seen.has(places)){seen.add(places);choices.push(length);}
    }
    return choices;
  };
  const reusedLengths=lengths(constraint.platformLength),newLengths=lengths(20);
  // Identical existing platforms and new platforms each have interchangeable positions.
  function* extend(current,left,choices,start,reservedLength=0){
    const minimumLength=current.reduce((sum,n)=>sum+n,0)+(left?left*(choices[start]??Infinity):0)+reservedLength;
    if(station+minimumLength/10*tariff-baseline>costCeiling()+1e-7)return;
    if(!left){yield current;return;}
    for(let i=start;i<choices.length;i++)yield* extend([...current,choices[i]],left-1,choices,i,reservedLength);
  }
  const minimumCount=reused?constraint.platformCount:1;
  for(let count=minimumCount;count<=constraint.maxPlatforms;count++){
    const addedCount=count-existing.length;
    const priorLayouts=reused?extend([],existing.length,reusedLengths,0,addedCount*20):[[]];
    for(const prior of priorLayouts)for(const platformLengths of extend(prior,addedCount,newLengths,0))
      for(const specializedTerminal of constraint.allowSpecialization?[false,true]:[constraint.specializedTerminal]){
        const full=station+platformLengths.reduce((sum,length)=>sum+length/10*platformRunningCosts({specializedTerminal},category),0);
        if(full-baseline>costCeiling()+1e-7)continue;
        const platformSlots=vehicleLength>0?platformLengths.map(length=>roadPlatformVehicleSlots(vehicleLength,1,length)):undefined;
        yield {id:`${constraint.id??constraint.mode}:road:${platformLengths.join(',')}:${specializedTerminal}`,
          name:reused?'Reused terminal':constraint.mode==='add'?'Additional platforms':'New station',mode:constraint.mode,terminalType:'station',existing:reused,
          siteType:constraint.siteType,specializedTerminal,maxTrainLength:null,platformCount:platformLengths.length,platformLengths,
          ...(platformSlots?{platformSlots,vehicleSlots:platformSlots.reduce((sum,n)=>sum+n,0)}:{}),
          existingPlatformCount:existing.length,existingPlatformLength:reused?constraint.platformLength:null,
          platformExtended:reused&&platformLengths.slice(0,existing.length).some(length=>length>constraint.platformLength),
          addedPlatformCount:platformLengths.length-existing.length,existingRunningCosts:0,addedRunningCosts:full-baseline,
          excludedExistingRunningCosts:baseline,annualMaintenance:full-baseline};
      }
  }
}

function terminalVariants(constraint,domain,category,vehicleLength,costCeiling=()=>Infinity){
  const busStop={id:`${constraint.id??'bus-stop'}:busStop`,name:constraint.mode==='reuse'?'Reused bus stop':'New bus stop',mode:constraint.mode,terminalType:'busStop',
    siteType:constraint.siteType,existing:constraint.mode==='reuse',specializedTerminal:false,specializedWarehouse:false,maxTrainLength:null,vehicleSlots:BUS_STOP_TARIFFS.vehicleSlots,
    annualMaintenance:constraint.mode==='reuse'?0:BUS_STOP_TARIFFS.annualMaintenance,existingRunningCosts:0,
    addedRunningCosts:constraint.mode==='reuse'?0:BUS_STOP_TARIFFS.annualMaintenance,excludedExistingRunningCosts:constraint.mode==='reuse'?BUS_STOP_TARIFFS.annualMaintenance:0};
  if(constraint.terminalType==='busStop')return [busStop];
  if(constraint.mode==='factory')return [{id:constraint.id??'factory',name:`${T.industry} terminal`,mode:'factory',siteType:'factory',existing:true,specializedTerminal:true,
    annualMaintenance:0,existingRunningCosts:0,addedRunningCosts:0,excludedExistingRunningCosts:0,maxTrainLength:null}];
  if(domain==='road'){
    return (function*(){
      yield* roadTerminalVariants(constraint,category,vehicleLength,costCeiling);
      if(constraint.mode==='new'&&constraint.allowBusStop)yield busStop;
    })();
  }
  const reused=constraint.mode==='reuse';
  // Extra length has no benefit for this candidate. Retain all reused sections.
  const length=Math.max(reused?constraint.existingLength:40,Math.ceil((vehicleLength-1e-9)/40)*40);
  if(length>(constraint.maxTrainLength??RAIL_PLATFORM_MAX_LENGTH)+1e-9)return [];
  const priorPlatformTariff=platformRunningCosts(constraint,category);
  const station=stationRunningCosts(domain);
  const existingTracks=reused?constraint.platformTrackCount:0,existingPlatforms=reused?constraint.platformCount:0;
  const baseline=constraint.mode==='new'?0:station+(reused?constraint.existingLength/40*
    (existingTracks*RAIL_TERMINAL_TARIFFS.track+existingPlatforms*priorPlatformTariff):0);
  return (function*(){
    for(let platformTrackCount=reused?existingTracks:1;platformTrackCount<=constraint.maxPlatformTracks;platformTrackCount++){
      // Undeclared sides of existing platforms are not assumed available.
      const platformCount=existingPlatforms+Math.ceil((platformTrackCount-existingTracks)/2);
      for(const specializedTerminal of constraint.allowSpecialization?[false,true]:[constraint.specializedTerminal]){
        const tariff=platformRunningCosts({specializedTerminal},category);
        const full=station+length/40*(platformTrackCount*RAIL_TERMINAL_TARIFFS.track+platformCount*tariff);
        if(full-baseline>costCeiling()+1e-7)continue;
        yield {id:`${constraint.id??constraint.mode}:${length}:${platformTrackCount}:${specializedTerminal}`,
          name:reused?'Reused terminal':constraint.mode==='add'?'Additional platform tracks':'New station',
          mode:constraint.mode,terminalType:'station',existing:reused,siteType:constraint.siteType,specializedTerminal,maxTrainLength:length,
          platformTrackCount,platformCount,existingPlatformTrackCount:existingTracks,existingPlatformCount:existingPlatforms,
          addedPlatformTrackCount:platformTrackCount-existingTracks,platformExtended:reused&&length>constraint.existingLength,
          existingLength:constraint.existingLength,existingRunningCosts:0,addedRunningCosts:full-baseline,
          excludedExistingRunningCosts:baseline,annualMaintenance:full-baseline};
      }
    }
  })();
}

function platformRunningCosts(plan,category){
  return category==='passengers'?PLATFORM_TERMINAL_TARIFFS.passengers:plan.specializedTerminal?PLATFORM_TERMINAL_TARIFFS.specialized:PLATFORM_TERMINAL_TARIFFS.freight;
}
function additionalRunningCosts(plan){
  const additional=plan.additionalAnnualMaintenance;
  if(!Number.isFinite(additional)||additional<0||additional>1e12)throw new RangeError('Enter additional annual infrastructure Running costs.');
  return additional;
}

export function railTerminalRunningCosts(plan,category){
  const tariff=RAIL_TERMINAL_TARIFFS;
  const sections=plan.maxTrainLength/tariff.sectionLength;
  if(!Number.isInteger(sections)||sections<1||plan.maxTrainLength>RAIL_PLATFORM_MAX_LENGTH)throw new RangeError(`Rail terminals use whole 40 m sections, up to ${RAIL_PLATFORM_MAX_LENGTH} m.`);
  const tracks=plan.platformTrackCount??1,platforms=plan.platformCount??Math.ceil(tracks/2);
  if(![tracks,platforms].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=100)||platforms<Math.ceil(tracks/2)||platforms>tracks)
    throw new RangeError('Rail platforms must serve one or two platform tracks.');
  return STATION_TARIFFS.railBase+sections*(tracks*tariff.track+platforms*platformRunningCosts(plan,category))+additionalRunningCosts(plan);
}

export function roadTerminalRunningCosts(plan,category){
  if(category==='freight'&&plan.siteType==='factory')return additionalRunningCosts(plan);
  if(!Number.isInteger(plan.platformCount)||plan.platformCount<1||plan.platformCount>10000)throw new RangeError('Enter a whole number of Road platforms (1–10,000).');
  const additionalLanes=plan.additionalLanes??0;
  if(!Number.isInteger(additionalLanes)||additionalLanes<0||additionalLanes>plan.platformCount)throw new RangeError('Additional Road lanes must be a whole number, no greater than the platform count.');
  const length=plan.platformLength??20;
  if(!Number.isSafeInteger(length)||length<20||length%10)throw new RangeError('Road platforms start at 20 m and extend in 10 m sections.');
  return STATION_TARIFFS.roadBase+STATION_TARIFFS.roadAccess+plan.platformCount*length/10*platformRunningCosts(plan,category)+additionalRunningCosts(plan);
}

/** Route constraints, plus support for explicitly priced terminal configurations. */
export function validateOptimizerInfrastructure(input,domain,category='passengers',{loadedReturn=false}={}){
  if(input==null)return null;
  if(typeof input!=='object'||Array.isArray(input))throw new RangeError('Choose valid terminal configurations.');
  const result={};
  result.sites={};
  for(const stop of ['stopA','stopB']){
    const site=input.sites?.[stop]??{type:'industrial',warehouseSpecialization:'optimize'};
    if(!site||!['factory','warehouse','industrial'].includes(site.type))throw new RangeError('Choose a valid freight building at each stop.');
    const warehouseSpecialization=site.warehouseSpecialization??'optimize';
    if(!['optimize','generic','specialized'].includes(warehouseSpecialization))throw new RangeError('Choose allowed warehouse specialization options.');
    const warehouseCapacity=Object.hasOwn(site,'warehouseCapacity')?site.warehouseCapacity:500,maxWarehouseCapacity=Object.hasOwn(site,'maxWarehouseCapacity')?site.maxWarehouseCapacity:5000;
    if(site.type==='warehouse'&&category==='freight'){
      if(![warehouseCapacity,maxWarehouseCapacity].every(n=>Number.isInteger(n)&&n>=500&&n<=100000&&n%500===0))throw new RangeError('Warehouse capacities must be whole 500 capacity sections, between 500 and 100,000.');
      if(maxWarehouseCapacity<warehouseCapacity)throw new RangeError('Maximum warehouse capacity must accommodate the existing warehouse.');
    }
    const existingSpecializedWarehouse=booleanSetting(site,'existingSpecializedWarehouse',warehouseSpecialization==='specialized');
    if(existingSpecializedWarehouse&&warehouseSpecialization==='generic')throw new RangeError('A reused specialized warehouse cannot be downgraded.');
    const factoryTerminals=Object.hasOwn(site,'factoryTerminals')?site.factoryTerminals:2;
    if(site.type==='factory'&&category==='freight'&&domain!=='rail'&&![2,3].includes(factoryTerminals))throw new RangeError('Choose 2 or 3 parallel Road industry terminals.');
    result.sites[stop]={type:site.type,warehouseSpecialization:existingSpecializedWarehouse?'specialized':warehouseSpecialization,warehouseCapacity,maxWarehouseCapacity,existingSpecializedWarehouse,
      ...(site.type==='factory'?{factoryTerminals}:{})};
  }
  for(const kind of domain==='both'?['rail','road']:[domain]){
    result[kind]={};
    for(const stop of ['stopA','stopB']){
      const plans=input[kind]?.[stop];
      if(plans&&!Array.isArray(plans)){
        result[kind][stop]=validateTerminalConstraint(plans,kind,category,result.sites[stop].type,stop,loadedReturn);
        continue;
      }
      if(!Array.isArray(plans)||!plans.length||plans.length>MAX_TERMINAL_CONFIGURATIONS)throw new RangeError(`Provide 1–${MAX_TERMINAL_CONFIGURATIONS} ${kind} terminal configurations at ${stop==='stopA'?'A':'B'}.`);
      if(plans.some(plan=>plan&&Object.hasOwn(plan,'mode'))){
        result[kind][stop]=plans.map(plan=>validateTerminalConstraint(plan,kind,category,result.sites[stop].type,stop,loadedReturn));
        const ids=result[kind][stop].map(plan=>plan.id).filter(id=>id!==undefined);
        if(new Set(ids).size!==ids.length)throw new RangeError('Reusable infrastructure IDs must be unique.');
        continue;
      }
      const ids=new Set();
      result[kind][stop]=plans.map((plan,index)=>{
        const id=plan?.id??`${stop}-${index+1}`,name=plan?.name;
        if(typeof id!=='string'||!id||id.length>256||ids.has(id))throw new RangeError('Terminal configuration IDs must be unique.');
        ids.add(id);
        if(typeof name!=='string'||!name.trim()||name.length>120)throw new RangeError('Name each terminal configuration (1–120 characters).');
        const flags={};
        for(const key of ['existing','specializedTerminal','specializedWarehouse']){
          flags[key]=plan[key]??false;
          if(typeof flags[key]!=='boolean')throw new RangeError('Choose valid terminal flags.');
        }
        const siteType=category==='freight'?result.sites[stop].type:null;
        flags.specializedWarehouse=false; // The building is fixed; specialization is enumerated separately.
        if(siteType==='factory'&&kind==='road')flags.specializedTerminal=true;
        const pricedPlan={...plan,...flags,siteType};
        const maintenanceBasis=plan.maintenanceBasis??'manual';
        if(!['manual',kind==='rail'?'railSections':'roadPlatforms'].includes(maintenanceBasis))throw new RangeError('Choose a valid infrastructure cost model.');
        const automatic=maintenanceBasis!=='manual';
        const annualMaintenance=automatic?(kind==='rail'?railTerminalRunningCosts:roadTerminalRunningCosts)(pricedPlan,category):plan.annualMaintenance,constructionCost=plan.constructionCost??null;
        if(!Number.isFinite(annualMaintenance)||annualMaintenance<0||annualMaintenance>1e12)throw new RangeError(`Enter annual infrastructure Running costs for ${name}.`);
        if(constructionCost!==null&&(!Number.isFinite(constructionCost)||constructionCost<0||constructionCost>1e15))throw new RangeError(`Enter a valid construction cost for ${name}.`);
        const maxTrainLength=kind==='rail'?plan.maxTrainLength:null;
        if(kind==='rail'&&(!Number.isFinite(maxTrainLength)||maxTrainLength<1||maxTrainLength>RAIL_PLATFORM_MAX_LENGTH))throw new RangeError(`Enter an admissible train length for ${name}.`);
        const railGeometry=kind==='rail'&&(automatic||plan.platformTrackCount!==undefined)?{
          platformTrackCount:plan.platformTrackCount??1,platformCount:plan.platformCount??Math.ceil((plan.platformTrackCount??1)/2)}:{};
        if(Object.keys(railGeometry).length&&(![railGeometry.platformTrackCount,railGeometry.platformCount].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=100)||
          railGeometry.platformCount<Math.ceil(railGeometry.platformTrackCount/2)||railGeometry.platformCount>railGeometry.platformTrackCount))throw new RangeError('Rail platforms must serve one or two platform tracks.');
        return {id,name:name.trim(),annualMaintenance,constructionCost,maxTrainLength,maintenanceBasis,siteType,
          ...(plan.tramOnly===undefined?{}:{tramOnly:booleanSetting(plan,'tramOnly')}),
          ...(automatic?{additionalAnnualMaintenance:plan.additionalAnnualMaintenance}:{}),...railGeometry,
          ...(maintenanceBasis==='roadPlatforms'?{platformCount:plan.platformCount,platformLength:plan.platformLength??20,additionalLanes:plan.additionalLanes??0}:{}),...flags};
      });
    }
  }
  return result;
}

export function optimizerTrainLengthLimit(request){
  if(!request.infrastructure?.rail)return Math.min(request.maxTrainLength,RAIL_PLATFORM_MAX_LENGTH);
  return Math.min(request.maxTrainLength,RAIL_PLATFORM_MAX_LENGTH,...['stopA','stopB'].map(stop=>{
    const terminal=request.infrastructure.rail[stop];
    return Array.isArray(terminal)?Math.max(...terminal.map(plan=>plan.maxTrainLength??Infinity)):terminal.maxTrainLength??Infinity;
  }));
}

export function* optimizerTerminalChoices(request,domain,vehicleCapacity=Infinity,vehicleLength=0,{costCeiling=()=>Infinity,vehicleType}={}){
  if(!request.infrastructure){yield {stopA:request.stopA,stopB:request.stopB,maxTrainLength:request.maxTrainLength,selection:null};return;}
  const {stopA,stopB}=request.infrastructure[domain];
  function* variants(terminal,stop){
    for(const definition of Array.isArray(terminal)?terminal:[terminal]){
      if(definition.tramOnly&&vehicleType!=='Tram')continue;
      const plans=definition.mode?terminalVariants(definition,domain,request.category,vehicleLength,costCeiling):
        [domain==='road'&&vehicleLength>0&&definition.maintenanceBasis==='roadPlatforms'&&definition.siteType!=='factory'?{...definition,
          platformLengths:Array(definition.platformCount).fill(definition.platformLength),
          platformSlots:Array(definition.platformCount).fill(roadPlatformVehicleSlots(vehicleLength,1,definition.platformLength)),
          vehicleSlots:roadPlatformVehicleSlots(vehicleLength,definition.platformCount,definition.platformLength)}:definition];
      for(const selected of plans){
        const factory=domain==='road'&&request.category==='freight'&&(selected.mode==='factory'||!selected.mode&&selected.siteType==='factory');
        // Industry's built-in loading bays cannot serve trams, including legacy priced plans.
        if(factory&&vehicleType==='Tram')continue;
        const count=request.infrastructure.sites[stop].factoryTerminals??2;
        const plan=factory?{...selected,name:selected.mode==='factory'?`${T.industry} terminals`:selected.name,
          factoryTerminals:count,platformCount:count,platformSlots:Array(count).fill(1),vehicleSlots:count}:selected;
        if(request.category!=='freight'||request.infrastructure.sites[stop].type!=='warehouse'){yield plan;continue;}
        const site=request.infrastructure.sites[stop],allowed=site.warehouseSpecialization;
        const minimum=site.warehouseCapacity/WAREHOUSE_TARIFFS.capacityPerSection;
        // More storage than the largest possible single load has no service benefit. Retain all existing storage.
        const maximum=Math.max(minimum,Math.min(site.maxWarehouseCapacity/WAREHOUSE_TARIFFS.capacityPerSection,Math.ceil(vehicleCapacity*request.fillRatio/WAREHOUSE_TARIFFS.capacityPerSection)));
        for(let sections=minimum;sections<=maximum;sections++)for(const specializedWarehouse of allowed==='optimize'?[false,true]:[allowed==='specialized']){
          const fullWarehouseCosts=sections*(specializedWarehouse?WAREHOUSE_TARIFFS.specialized:WAREHOUSE_TARIFFS.generic);
          const baseline=minimum*(site.existingSpecializedWarehouse?WAREHOUSE_TARIFFS.specialized:WAREHOUSE_TARIFFS.generic);
          // Route access constraints use incremental costs. Explicitly priced legacy plans retain their total-cost semantics.
          const warehouseExistingRunningCosts=plan.mode?0:baseline;
          const warehouseAddedRunningCosts=fullWarehouseCosts-baseline;
          const warehouseRunningCosts=warehouseExistingRunningCosts+warehouseAddedRunningCosts;
          yield {...plan,specializedWarehouse,warehouseCapacity:sections*WAREHOUSE_TARIFFS.capacityPerSection,
            warehouseExpanded:sections>minimum,warehouseRunningCosts,warehouseExistingRunningCosts,warehouseAddedRunningCosts,
            ...(plan.mode?{existingRunningCosts:plan.existingRunningCosts+warehouseExistingRunningCosts,addedRunningCosts:plan.addedRunningCosts+warehouseAddedRunningCosts,
              excludedExistingRunningCosts:plan.excludedExistingRunningCosts+baseline}:{}),
            annualMaintenance:plan.annualMaintenance+warehouseRunningCosts};
        }
      }
    }
  }
  for(const a of variants(stopA,'stopA'))for(const b of variants(stopB,'stopB'))yield {stopA:a,stopB:b,
    maxTrainLength:domain==='rail'?Math.min(request.maxTrainLength,a.maxTrainLength,b.maxTrainLength):request.maxTrainLength,
    selection:{stopA:a,stopB:b,annualMaintenance:a.annualMaintenance+b.annualMaintenance}};
}

/** Transfer the selected handling bonuses and physical length limit to the vehicle service views. */
export function optimizerProposalRequest(proposal,request){
  if(proposal.routeInfrastructure)request={...request,routeProfile:proposal.routeInfrastructure.routeProfile};
  const selected=proposal.infrastructure;
  if(!selected)return request;
  const flags=plan=>({specializedTerminal:plan.specializedTerminal,specializedWarehouse:plan.specializedWarehouse});
  const storage=Math.min(selected.stopA.warehouseCapacity??Infinity,selected.stopB.warehouseCapacity??Infinity);
  return {...request,stopA:flags(selected.stopA),stopB:flags(selected.stopB),
    fillRatio:request.category==='freight'?Math.min(request.fillRatio,storage/proposal.capacity):request.fillRatio,
    maxTrainLength:proposal.domain==='rail'?Math.min(request.maxTrainLength,selected.stopA.maxTrainLength,selected.stopB.maxTrainLength):request.maxTrainLength};
}
