import {validateRoutePlan,routePlanFlows} from './route-plan.js';
import {validateRouteProfile} from './route-profile.js';
import {busStopAllowed,MAX_TERMINAL_CONFIGURATIONS,DEFAULT_INDUSTRY_OUTPUT_STORAGE_CAPACITY,RAIL_PLATFORM_MAX_LENGTH} from './optimizer-infrastructure.js';
import {formatNumber} from './format.js';
import {UI_TERMS as T} from './ui-terms.js';

/** Adapters from a Route declaration to the inputs the calculators already have. Nothing here simulates; unsupported declarations come back as `issues`. */
const EPSILON=1e-9,fmt=n=>formatNumber(n,3);
const STOPS=['stopA','stopB'],LABELS={stopA:'A',stopB:'B'};
const endpoints=plan=>[plan.stops[0],plan.stops.at(-1)];
const CITY_TIERS=[40,50];

/** Per segment: which existing-infrastructure fields the declaration fixes. Tracks and lanes qualify a declared tier. */
export function declaredSegmentFields(input){
  return validateRoutePlan(input).segmentAssets.map(a=>({rail:a.railTier!==null,road:a.roadTier!==null,railTracks:a.railTier!==null&&a.railTracks===2,roadLanes:a.roadTier!==null,tram:a.tramTracks!=='none'}));
}

/** A declared tier caps the segment speed (the optimizer's tier ceiling); tracks, lanes and Tram infrastructure become the route constraints the Optimizer already reads. */
export function declaredRouteProfile(segments,input){
  const route=validateRouteProfile(segments),plan=validateRoutePlan(input);
  if(route.length!==plan.segmentAssets.length)return route;
  return validateRouteProfile(route.map((part,i)=>{
    const asset=plan.segmentAssets[i],next={...part};
    if(asset.railTier!==null){
      next.speedLimitKmh=Math.min(part.speedLimitKmh,asset.railTier);
      if(part.railSpeedConstraintKmh!=null)next.railSpeedConstraintKmh=Math.min(part.railSpeedConstraintKmh,asset.railTier);
      if(asset.railTracks===2)next.railTracks=2;
    }
    if(asset.roadTier!==null){
      next.roadSpeedLimitKmh=Math.min(part.roadSpeedLimitKmh??part.speedLimitKmh,asset.roadTier);
      if(part.roadSpeedConstraintKmh!=null)next.roadSpeedConstraintKmh=Math.min(part.roadSpeedConstraintKmh,asset.roadTier);
      next.roadLanes=asset.roadLanes;next.roadCity=CITY_TIERS.includes(asset.roadTier);
    }
    if(asset.tramTracks!=='none')next.tramInfrastructure=asset.tramTracks;
    return next;
  }));
}

/** Drop the line choices a declaration fixes from a profile that carries them, restoring the stored route's own values. */
export function withoutDeclaredLineChoices(profile,raw,input){
  const fields=declaredSegmentFields(input);
  if(profile.length!==raw.length||raw.length!==fields.length)return profile;
  return validateRouteProfile(profile.map((part,i)=>{
    const next={...part};
    for(const [flag,keys] of [['railTracks',['railTracks']],['roadLanes',['roadLanes','roadCity']],['tram',['tramInfrastructure']]])
      if(fields[i][flag])for(const key of keys){if(raw[i][key]==null)delete next[key];else next[key]=raw[i][key];}
    return next;
  }));
}

/** Line-control edits change only the choices the declaration leaves open, never the stored geometry. */
export function mergeUndeclaredLineChoices(raw,emitted,input){
  if(raw.length!==emitted.length)return emitted;
  return withoutDeclaredLineChoices(raw.map((part,i)=>({...part,railTracks:emitted[i].railTracks??null,roadLanes:emitted[i].roadLanes??null,tramInfrastructure:emitted[i].tramInfrastructure??null})),raw,input);
}

const operations=plan=>plan.stops.flatMap(stop=>stop.operations.map(op=>({...op,stopId:stop.id}))).filter(op=>op.quantity.value>0);
const serviceGoodIds=plan=>[...new Set(operations(plan).map(op=>op.cargoId))];

/** A–B–A ends at B: whatever is still onboard there is delivered, so the return leg carries only what the return direction loads. */
function deliveredAtTerminus(plan){
  const last=plan.stops.at(-1);
  return {...plan,stops:plan.stops.map(stop=>stop===last?{...stop,operations:[...stop.operations,
    ...plan.goods.map(good=>({id:`terminus:${good.id}`,cargoId:good.id,buildingId:null,direction:'outbound',action:'unload',quantity:{mode:'percent',value:100}}))]}:stop)};
}
/** Flows as the calculators read them: B is the terminus. */
export const terminusFlows=input=>routePlanFlows(deliveredAtTerminus(validateRoutePlan(input)));
const legLoads=(flows,goodId)=>['outbound','return'].map(direction=>flows.sections.find(s=>s.direction===direction).load[goodId]);

/** The loads a declaration moves, for messages that name them. */
export const declaredLoadNames=input=>{const plan=validateRoutePlan(input);return serviceGoodIds(plan).map(id=>plan.goods.find(g=>g.id===id).name);};
const LOAD_LABELS={passengers:'Passengers',bulk:'Bulk',goods:'Goods',flatbed:'Flatbed',liquid:'Liquid'};
export const loadTypeLabel=type=>LOAD_LABELS[type]??'type not chosen';

/** One load on an A–B–A service. Freight: annual quantities become the delivered Rate, return freight a loaded return. Passengers: the Rate per direction, equal both ways. */
export function declaredService(input){
  const plan=validateRoutePlan(input),goodIds=serviceGoodIds(plan);
  if(!goodIds.length)return {status:'none',issues:[]};
  const good=plan.goods.find(g=>g.id===goodIds[0]),passengers=good.type==='passengers',noun=passengers?'passenger':'freight';
  const issues=[],base={goodId:good.id,goodName:good.name,category:passengers?'passengers':'freight',cargo:passengers?null:good.type};
  if(plan.stops.length>2)issues.push(`Intermediate stops are not modelled: services run A–B–A, so the declared ${noun} flows are not used.`);
  if(goodIds.length>1)issues.push('Several goods share this service, but each calculator carries one good per service.');
  if(!passengers&&!good.type)issues.push(`Choose a type for ${good.name} (Bulk, Goods, Flatbed or Liquid): it decides which vehicles can carry it.`);
  if(issues.length)return {...base,status:'unsupported',issues};
  const [out,back]=legLoads(routePlanFlows(deliveredAtTerminus(plan)),good.id),[,carried]=legLoads(routePlanFlows(plan),good.id);
  // A load still onboard at B in the general flows is what this service delivers there.
  base.deliveredAtB=carried.year>back.year+EPSILON;
  if(out.visit>EPSILON||back.visit>EPSILON)issues.push(`Quantities per visit are no longer used: declare an annual ${T.rate} or a percentage. Infrastructure limits belong to the stop's infrastructure.`);
  if(out.year<=EPSILON&&back.year<=EPSILON)return {...base,status:'unsupported',issues};
  const differ=out.year>EPSILON&&back.year>EPSILON&&Math.abs(out.year-back.year)>1e-6*Math.max(out.year,back.year);
  if(passengers){
    if(differ)return {...base,status:'unsupported',issues:[...issues,`A → B (${fmt(out.year)}) and B → A (${fmt(back.year)}) ${T.capacityUnit}/year differ; passenger calculations use one ${T.rate} in both directions.`]};
    const rate=Math.ceil(Math.max(out.year,back.year)-EPSILON);
    if(rate>1e9)return {...base,status:'unsupported',issues:[...issues,`${T.rate} above 1,000,000,000 ${T.capacityUnit}/year is outside the calculators' range.`]};
    return {...base,status:'applied',rate:Math.max(1,rate),bothDirectionsDeclared:out.year>EPSILON&&back.year>EPSILON,issues};
  }
  if(out.year<=EPSILON)return {...base,status:'unsupported',issues:[...issues,'Freight is declared on the B → A leg only; the calculators load at A and deliver at B.']};
  if(differ)return {...base,status:'unsupported',issues:[...issues,`A → B (${fmt(out.year)}) and B → A (${fmt(back.year)}) ${T.capacityUnit}/year differ; a loaded return carries equal loads in both directions.`]};
  const rate=Math.ceil(out.year+back.year-EPSILON);
  if(rate>1e9)return {...base,status:'unsupported',issues:[...issues,`${T.rate} above 1,000,000,000 ${T.capacityUnit}/year is outside the calculators' range.`]};
  return {...base,status:'applied',rate:Math.max(1,rate),loadedReturn:back.year>EPSILON,issues};
}

/** One sentence describing an applied service, shared by every view. */
export function declaredServiceText(service){
  if(service.category==='passengers')return `${service.goodName}: ${T.rate} ${formatNumber(service.rate,0)} ${T.capacityUnit}/year in each direction${service.bothDirectionsDeclared?'':' (the same Rate is used B → A)'}`;
  return `${service.goodName} (${loadTypeLabel(service.cargo)}): ${T.rate} ${formatNumber(service.rate,0)} ${T.capacityUnit}/year, ${service.loadedReturn?'loaded':'empty'} return${service.deliveredAtB?'; freight still onboard at B is delivered there, not carried back':''}`;
}

/** The building a stop contributes to the service: the one its operations name, else its only typed building. */
function endpointBuilding(stop){
  const named=[...new Set(stop.operations.filter(op=>op.quantity.value>0&&op.buildingId).map(op=>op.buildingId))];
  const candidates=named.length?named.map(id=>stop.buildings.find(b=>b.id===id)):stop.buildings.filter(b=>b.type!=='none');
  if(candidates.length>1)return {building:null,ambiguous:true};
  return {building:candidates[0]&&candidates[0].type!=='none'?candidates[0]:null,ambiguous:false};
}

const SITE_DEFAULTS={type:'industrial',factoryTerminals:2,inputStorageCapacity:100,outputStorageCapacity:DEFAULT_INDUSTRY_OUTPUT_STORAGE_CAPACITY,existingSpecializedWarehouse:false,
  allowWarehouseSpecialization:true,allowWarehouseExpansion:false,warehouseCapacity:500,maxWarehouseCapacity:500};
const ENTRY_DEFAULTS={specializedTerminal:false,allowSpecialization:true,allowExtension:false,existingLength:160,maxTrainLength:RAIL_PLATFORM_MAX_LENGTH,
  platformLength:20,platformCount:1,maxPlatformLength:40,maxPlatforms:2,allowParallelPlatforms:false,platformTrackCount:1,railPlatformCount:1,maxPlatformTracks:2,allowParallelTracks:false};
const BUILDINGS={factory:T.industry,warehouse:'Warehouse',industrial:'Industrial building'};

function declaredEntry(stopKey,entry){
  const base={...ENTRY_DEFAULTS,id:entry.id,stop:stopKey};
  switch(entry.kind){
    case 'railPlatform':return {...base,domain:'rail',kind:'platform',specializedTerminal:entry.specialized,existingLength:entry.length,maxTrainLength:entry.length,platformTrackCount:entry.tracks,railPlatformCount:entry.platforms,maxPlatformTracks:entry.tracks};
    case 'roadPlatform':return {...base,domain:'road',kind:'platform',specializedTerminal:entry.specialized,platformLength:entry.length,platformCount:entry.platforms,maxPlatformLength:entry.length,maxPlatforms:entry.platforms};
    case 'railStation':return {...base,domain:'rail',kind:'station'};
    case 'roadStation':return {...base,domain:'road',kind:'station'};
    default:return {...base,domain:'road',kind:'busStop'};
  }
}
const entryLine=(label,entry)=>`${label} · ${{railPlatform:`Rail station + platform · ${entry.length} m · ${entry.tracks} track${entry.tracks===1?'':'s'} · ${entry.platforms} platform${entry.platforms===1?'':'s'}`,
  roadPlatform:`Road station + platform · ${entry.length} m · ${entry.platforms} parallel platform${entry.platforms===1?'':'s'}`,railStation:'Rail station only',roadStation:'Road station only',busStop:'Bus stop'}[entry.kind]}${entry.specialized?' · specialized':''}`;

/** Endpoint buildings and reusable terminals in the Optimizer's own site/entry shape, or null when the endpoints declare nothing. */
export function declaredEndpointModel(input,{category='passengers',loadedReturn=false,includeTrams=false}={}){
  const plan=validateRoutePlan(input),ends=endpoints(plan);
  if(!ends.some(stop=>stop.infrastructure.length||stop.buildings.some(b=>b.type!=='none')))return null;
  const goods=serviceGoodIds(plan),sites={},entries=[],lines=[],issues=[];
  ends.forEach((stop,index)=>{
    const key=STOPS[index],label=LABELS[key],{building,ambiguous}=endpointBuilding(stop),site={...SITE_DEFAULTS};
    if(ambiguous)issues.push(`${label} serves several buildings for this service, so none is applied. Assign its operations to a single building.`);
    if(building){
      site.type=building.type;
      if(building.type==='warehouse')Object.assign(site,{warehouseCapacity:building.warehouseCapacity,maxWarehouseCapacity:building.warehouseCapacity});
      const stock=goods.length===1?building.storage.find(s=>s.cargoId===goods[0]):null;
      if(building.type==='factory'){
        site.factoryTerminals=building.industryTerminals;
        if(stock)Object.assign(site,{inputStorageCapacity:stock.inputCapacity,outputStorageCapacity:stock.outputCapacity});
        else if(building.storage.length)issues.push(`${label}: storage is declared for other goods; default storage is used for this service.`);
      }
      lines.push(`${label} · ${building.name} · ${BUILDINGS[building.type]}${building.type==='warehouse'?` · ${formatNumber(building.warehouseCapacity,0)} ${T.capacityUnit}`:building.type==='factory'?` · ${building.industryTerminals} Truck terminals`:''}`);
    }else lines.push(`${label} · building not specified`);
    sites[key]=site;
    const group=new Map();
    for(const entry of stop.infrastructure){
      const declared=declaredEntry(key,entry);
      if(declared.kind==='busStop'&&!busStopAllowed('road',category,key,site.type,loadedReturn)){issues.push(`${label}: the bus stop cannot serve this transport (passengers, or unloading at an industrial B without a loaded return) and is ignored.`);continue;}
      const kept=group.get(declared.domain)??[],maximum=MAX_TERMINAL_CONFIGURATIONS-(site.type==='factory'&&declared.domain==='road'&&category==='freight'&&includeTrams?1:0);
      if(kept.length>=maximum){issues.push(`${label}: only the first ${maximum} ${declared.domain==='rail'?'Rail':'Road'} infrastructure declarations are considered.`);continue;}
      kept.push(declared);group.set(declared.domain,kept);entries.push(declared);lines.push(entryLine(label,entry));
    }
  });
  return {sites,entries,lines,issues};
}

/** Hard bound on conventional Rail trains: the shortest of the longest declared Rail platform at each endpoint that declares one. */
export function declaredPlatformLength(input){
  const lengths=endpoints(validateRoutePlan(input)).map(stop=>Math.max(0,...stop.infrastructure.filter(e=>e.kind==='railPlatform').map(e=>e.length))).filter(Boolean);
  return lengths.length?Math.min(...lengths):null;
}

/** Specialized Truck/platform terminals already present at an endpoint (the ×2 handling flag). Industry terminals serve trucks only. */
export function declaredHandling(input,{domain,includeTrams=false}){
  const plan=validateRoutePlan(input);
  return Object.fromEntries(endpoints(plan).map((stop,index)=>[STOPS[index],{specializedTerminal:
    stop.infrastructure.some(e=>e.specialized&&e.kind===(domain==='rail'?'railPlatform':'roadPlatform'))||
    domain==='road'&&!includeTrams&&endpointBuilding(stop).building?.type==='factory'}]));
}

/** What the analyses take from the declaration, and what remains descriptive until the calculators support it. */
export function declarationReport(input,{includeTrams=false}={}){
  const plan=validateRoutePlan(input),fields=declaredSegmentFields(plan),service=declaredService(plan),issues=[...service.issues];
  const count=key=>fields.filter(f=>f[key]).length,segments=n=>`${n} segment${n===1?'':'s'}`;
  const used=[];
  if(count('rail')||count('road'))used.push({views:['race','economics','trucks','configurator','optimizer'],text:`speed ceilings from declared tiers (${[count('rail')&&`Rail ${segments(count('rail'))}`,count('road')&&`Road ${segments(count('road'))}`].filter(Boolean).join(', ')})`});
  if(count('railTracks')||count('roadLanes')||count('tram'))used.push({views:['optimizer'],text:`fixed Rail tracks, Road lanes and Tram infrastructure (${segments(Math.max(count('railTracks'),count('roadLanes'),count('tram')))})`});
  if(service.status==='applied')used.push({category:service.category,views:['economics','trucks','configurator','optimizer'],text:declaredServiceText(service)});
  const length=declaredPlatformLength(plan);
  if(length)used.push({views:['economics','configurator'],text:`maximum train length ${length} m (Rail platforms)`});
  const handling=['rail','road'].map(domain=>declaredHandling(plan,{domain,includeTrams}));
  if(handling.some(h=>h.stopA.specializedTerminal||h.stopB.specializedTerminal))used.push({category:'freight',views:['economics','trucks','configurator'],text:'specialized terminals at the endpoints (Freight)'});
  const model=declaredEndpointModel(plan,{category:service.category??'passengers',loadedReturn:service.loadedReturn,includeTrams});
  if(model){used.push({views:['optimizer'],text:`endpoint buildings, storage and reusable terminals (constraints; their ${T.runningCosts} are counted when infrastructure ${T.runningCosts} is included)`});issues.push(...model.issues);}
  for(const [i,asset] of plan.segmentAssets.entries())if(asset.railTier!==null&&asset.railTracks===1)issues.push(`Segment ${i+1}: a single existing Rail track cannot be fixed; the calculator sizes tracks from the fleet.`);
  if(plan.stops.some(stop=>stop.buildings.some(b=>b.recipe.inputs.length||b.recipe.outputs.length)))issues.push('Industry recipes are summarised on the Route page only.');
  if(plan.stops.length>2&&service.status!=='unsupported')issues.push('Intermediate stops are ignored by A–B–A calculations.');
  return {service,used,issues:[...new Set(issues)]};
}

/** Values the Compare and Composition service controls take from the declaration; null leaves a control to its user. */
export function declaredServiceInputs(input,{category,includeTrams=false}){
  const plan=validateRoutePlan(input),service=declaredService(plan),applied=service.status==='applied'&&service.category===category,freight=category==='freight';
  return {rate:applied?service.rate:null,loadedReturn:applied&&freight?service.loadedReturn:null,cargo:applied&&freight?service.cargo:null,platformLengthMetres:declaredPlatformLength(plan),
    specializedTerminals:{rail:freight?declaredHandling(plan,{domain:'rail'}):null,road:freight?declaredHandling(plan,{domain:'road',includeTrams}):null}};
}
