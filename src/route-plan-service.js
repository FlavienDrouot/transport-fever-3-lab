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
    // Vehicles stop at every declared intermediate stop.
    const stop=plan.stops.find(s=>s.boundary===i+1&&i<route.length-1);
    if(stop)next.stopAfter=stop.name;
    return next;
  }));
}

/** With route Running costs, the Optimizer treats a declared tier as a base it may upgrade: restore the stored geometry speeds on those segments. */
export function uncappedDeclaredTiers(profile,raw,input){
  const plan=validateRoutePlan(input),route=validateRouteProfile(profile),stored=validateRouteProfile(raw);
  if(route.length!==stored.length||stored.length!==plan.segmentAssets.length)return route;
  return validateRouteProfile(route.map((part,i)=>{
    const asset=plan.segmentAssets[i],next={...part};
    for(const [tier,keys] of [[asset.railTier,['speedLimitKmh','railSpeedConstraintKmh']],[asset.roadTier,['roadSpeedLimitKmh','roadSpeedConstraintKmh']]])
      if(tier!==null)for(const key of keys){if(stored[i][key]==null)delete next[key];else next[key]=stored[i][key];}
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
const LOAD_LABELS={passengers:'Passengers',general:'General',bulk:'Bulk',goods:'Goods',flatbed:'Flatbed',liquid:'Liquid'};
export const loadTypeLabel=type=>LOAD_LABELS[type]??'type not chosen';

/** One good per direction. Rate is per direction, as in the game: the load on the busiest section; the lighter direction carries a share of it.
 * With intermediate stops, `servicePattern` gives what each stop loads and unloads, as shares of that load. */
export function declaredService(input){
  const plan=validateRoutePlan(input),goodIds=serviceGoodIds(plan);
  if(!goodIds.length)return {status:'none',issues:[]};
  const flows=routePlanFlows(deliveredAtTerminus(plan));
  // Busiest section of each direction, per good.
  const load=Object.fromEntries(['outbound','return'].map(d=>[d,Object.fromEntries(goodIds.map(id=>[id,{year:Math.max(0,...flows.sections.filter(s=>s.direction===d).map(s=>s.load[id].year))}]))]));
  const moving=d=>goodIds.filter(id=>load[d][id].year>EPSILON),good=id=>plan.goods.find(g=>g.id===id);
  const [outIds,backIds]=[moving('outbound'),moving('return')],passengers=good(goodIds[0]).type==='passengers',noun=passengers?'passenger':'freight';
  const types=[...new Set([...outIds,...backIds].map(id=>good(id).type))];
  const leg=(ids,direction)=>ids.length===1?{goodId:ids[0],goodName:good(ids[0]).name,rate:load[direction][ids[0]].year}:null;
  const outbound=leg(outIds,'outbound'),back=leg(backIds,'return');
  const base={goodId:(outbound??back)?.goodId??goodIds[0],goodName:[...new Set([outbound,back].filter(Boolean).map(l=>l.goodName))].join(' / ')||good(goodIds[0]).name,
    category:passengers?'passengers':'freight',cargo:passengers?null:types.length===1&&types[0]&&types[0]!=='general'?types[0]:'all',outbound,return:back,issues:[]};
  const issues=base.issues;
  if(outIds.length>1||backIds.length>1)issues.push('Several goods in one direction: the calculators carry one good per direction.');
  for(const id of goodIds)if(!passengers&&!good(id).type)issues.push(`Choose a type for ${good(id).name}: it decides which vehicles can carry it.`);
  if(issues.length||!outbound&&!back)return {...base,status:'unsupported'};
  const qOut=outbound?.rate??0,qBack=back?.rate??0,busier=Math.max(qOut,qBack);
  const pattern=plan.stops.length>2?stopPattern(plan,flows,busier,passengers&&qBack<=EPSILON):null;
  if(passengers){
    const rate=Math.ceil(busier-EPSILON);
    if(rate>1e9)return {...base,status:'unsupported',issues:[`${T.rate} above 1,000,000,000 ${T.capacityUnit}/year is outside the calculators' range.`]};
    return {...base,status:'applied',rate:Math.max(1,rate),bothDirectionsDeclared:qOut>EPSILON&&qBack>EPSILON,servicePattern:pattern,stopNames:stopNames(plan)};
  }
  if(qOut<=EPSILON)return {...base,status:'unsupported',issues:['Freight on B → A only: declare the route from the loading stop.']};
  // Rate is per direction, as in the game: the busier leg; the return share adds its handling.
  const rate=Math.ceil(busier-EPSILON);
  if(rate>1e9)return {...base,status:'unsupported',issues:[`${T.rate} above 1,000,000,000 ${T.capacityUnit}/year is outside the calculators' range.`]};
  const share=qBack>EPSILON?Math.min(qOut,qBack)/busier:0;
  return {...base,status:'applied',rate:Math.max(1,rate),loadedReturn:share===1?true:share===0?false:share,returnShare:share,servicePattern:pattern,stopNames:stopNames(plan)};
}

const stopNames=plan=>plan.stops.slice(1,-1).map(stop=>stop.name);
/** What each stop loads and unloads per direction, as shares of the busiest section's load. A passenger flow declared one way is mirrored on the way back. */
function stopPattern(plan,flows,busiest,mirror){
  const moved=(stopId,direction,action)=>flows.visits.filter(v=>v.stopId===stopId&&v.direction===direction).flatMap(v=>v.moves)
    .filter(m=>m.action===action).reduce((sum,m)=>sum+m.quantity.year,0)/busiest;
  const share=value=>Math.min(1,value);
  return {stops:plan.stops.map(stop=>{
    const outbound={load:share(moved(stop.id,'outbound','load')),unload:share(moved(stop.id,'outbound','unload'))};
    return {outbound,return:mirror?{load:outbound.unload,unload:outbound.load}:{load:share(moved(stop.id,'return','load')),unload:share(moved(stop.id,'return','unload'))}};
  })};
}

/** One sentence describing an applied service, shared by every view. */
export function declaredServiceText(service){
  const leg=(l,label)=>l?`${l.goodName} ${label} ${formatNumber(l.rate,0)}/yr`:'';
  if(service.category==='passengers'){
    const uneven=service.outbound&&service.return&&Math.abs(service.outbound.rate-service.return.rate)>EPSILON;
    return `${service.goodName} · ${T.rate} ${formatNumber(service.rate,0)} ${T.capacityUnit}/year each way${!service.bothDirectionsDeclared?' (declared one way)':uneven?` (busier direction; ${leg(service.outbound,'A → B')}, ${leg(service.return,'B → A')})`:''}`;
  }
  const kind=service.cargo==='all'?(service.outbound&&service.return&&service.outbound.goodId!==service.return.goodId?'general-purpose vehicles for both goods':'General'):loadTypeLabel(service.cargo);
  return `${[leg(service.outbound,'A → B'),service.return?leg(service.return,'B → A'):'empty return'].join(' · ')} · ${kind} · ${T.rate} ${formatNumber(service.rate,0)} ${T.capacityUnit}/year${service.returnShare>0&&service.returnShare<1?` · return ${formatNumber(service.returnShare*100,0)}% loaded`:''}`;
}

/** The buildings a stop contributes: the one that loads and the one that receives, named by its trips (else its only typed building). The busier of the two sets the stop's handling. */
function endpointBuilding(stop){
  const ops=stop.operations.filter(op=>op.quantity.value>0),typed=stop.buildings.filter(b=>b.type!=='none'),find=id=>stop.buildings.find(b=>b.id===id);
  const role=action=>{const ids=[...new Set(ops.filter(op=>op.action===action&&op.buildingId).map(op=>op.buildingId))];return ids.length>1?{ambiguous:true}:{building:ids.length?find(ids[0]):ops.some(op=>op.action===action)&&typed.length===1?typed[0]:null};};
  const sender=role('load'),receiver=role('unload');
  if(sender.ambiguous||receiver.ambiguous)return {building:null,ambiguous:true};
  const volume=action=>ops.filter(op=>op.action===action).reduce((n,op)=>n+op.quantity.value,0);
  const busier=volume('load')>=volume('unload')?sender.building??receiver.building:receiver.building??sender.building;
  const building=busier??(typed.length===1?typed[0]:null);
  return {building:building?.type==='none'?null:building,sender:sender.building??building,receiver:receiver.building??building,ambiguous:false};
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
  const plan=validateRoutePlan(input),ends=endpoints(plan),service=declaredService(plan);
  if(!ends.some(stop=>stop.infrastructure.length||stop.buildings.some(b=>b.type!=='none')))return null;
  const goods=serviceGoodIds(plan),sites={},entries=[],lines=[],issues=[],notes=[];
  ends.forEach((stop,index)=>{
    const key=STOPS[index],label=LABELS[key],{building,sender,receiver,ambiguous}=endpointBuilding(stop),site={...SITE_DEFAULTS};
    if(ambiguous)issues.push(`${label}: several buildings load (or receive) one direction, so none is used.`);
    if(sender&&receiver&&sender!==receiver)notes.push(`${label}: ${sender.name} loads, ${receiver.name} receives; ${building.name} (busier) sets the handling`);
    if(building){
      site.type=building.type;
      if(building.type==='warehouse')Object.assign(site,{warehouseCapacity:building.warehouseCapacity,maxWarehouseCapacity:building.warehouseCapacity,existingSpecializedWarehouse:specializedFor(plan,stop)});
      // A loads the A → B good and receives the B → A good; B does the opposite.
      const sends=index===0?service.outbound?.goodId:service.return?.goodId,receives=index===0?service.return?.goodId:service.outbound?.goodId;
      const owner=side=>side==='output'?sender:receiver,stock=side=>owner(side)?.type==='factory'?owner(side).storage.find(s=>s.cargoId===(side==='output'?sends:receives)&&s.side===side):null;
      if(building.type==='factory')site.factoryTerminals=building.industryTerminals;
      if([sender,receiver].some(b=>b?.type==='factory')){
        for(const side of ['input','output'])if(stock(side))site[`${side}StorageCapacity`]=stock(side).capacity;
        if([sender,receiver].some(b=>b?.type==='factory'&&b.storage.length)&&!stock('input')&&!stock('output'))issues.push(`${label}: storage is declared for other goods, so default storage is used.`);
      }
      if([sender,receiver].some(b=>b?.type==='industrial'&&b.storage.length))issues.push(`${label}: industrial building storage is not limited by the calculators.`);
      lines.push(`${label} · ${building.name} · ${BUILDINGS[building.type]}${building.type==='warehouse'?` · ${formatNumber(building.warehouseCapacity,0)} ${T.capacityUnit}${building.warehouseSpecializedFor?` · specialized for ${plan.goods.find(g=>g.id===building.warehouseSpecializedFor).name}`:''}`:building.type==='factory'?` · ${building.industryTerminals} Truck terminals`:''}`);
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
  return {sites,entries,lines,issues,notes};
}

/** Hard bound on conventional Rail trains: the shortest of the longest declared Rail platform at each endpoint that declares one. */
export function declaredPlatformLength(input){
  const lengths=endpoints(validateRoutePlan(input)).map(stop=>Math.max(0,...stop.infrastructure.filter(e=>e.kind==='railPlatform').map(e=>e.length))).filter(Boolean);
  return lengths.length?Math.min(...lengths):null;
}

/** A warehouse specialized for the one good this service moves. */
const specializedFor=(plan,stop)=>{const building=endpointBuilding(stop).building,handled=stop.operations.filter(op=>op.buildingId===building?.id||op.buildingId==null).map(op=>op.cargoId);return building?.type==='warehouse'&&!!building.warehouseSpecializedFor&&handled.length>0&&handled.every(id=>id===building.warehouseSpecializedFor);};

/** Specialized Truck/platform terminals and specialized warehouses already present at an endpoint (the ×2 handling flags). Industry terminals serve trucks only. */
export function declaredHandling(input,{domain,includeTrams=false}){
  const plan=validateRoutePlan(input);
  return Object.fromEntries(endpoints(plan).map((stop,index)=>[STOPS[index],{specializedTerminal:
    stop.infrastructure.some(e=>e.specialized&&e.kind===(domain==='rail'?'railPlatform':'roadPlatform'))||
    domain==='road'&&!includeTrams&&endpointBuilding(stop).building?.type==='factory',
    specializedWarehouse:specializedFor(plan,stop)}]));
}

/** What the analyses take from the declaration, and what remains descriptive until the calculators support it. */
export function declarationReport(input,{includeTrams=false}={}){
  const plan=validateRoutePlan(input),fields=declaredSegmentFields(plan),service=declaredService(plan),issues=[...service.issues];
  const count=key=>fields.filter(f=>f[key]).length,segments=n=>`${n} segment${n===1?'':'s'}`;
  const used=[],notes=[];
  if(count('rail')||count('road'))used.push({views:['race','economics','trucks','configurator','optimizer'],text:`existing tiers as speed limits (${[count('rail')&&`Rail ${segments(count('rail'))}`,count('road')&&`Road ${segments(count('road'))}`].filter(Boolean).join(', ')}); the Optimizer may upgrade them`});
  if(count('railTracks')||count('roadLanes')||count('tram'))used.push({views:['optimizer'],text:`fixed tracks, lanes and Tram infrastructure (${segments(Math.max(count('railTracks'),count('roadLanes'),count('tram')))})`});
  if(service.status==='applied')used.push({category:service.category,views:['economics','trucks','configurator','optimizer'],text:declaredServiceText(service)});
  const length=declaredPlatformLength(plan);
  if(length)used.push({views:['economics','configurator'],text:`train length ≤ ${length} m (Rail platforms)`});
  const handling=['rail','road'].map(domain=>declaredHandling(plan,{domain,includeTrams}));
  if(handling.some(h=>h.stopA.specializedTerminal||h.stopB.specializedTerminal))used.push({category:'freight',views:['economics','trucks','configurator'],text:'specialized terminals'});
  if(handling[0].stopA.specializedWarehouse||handling[0].stopB.specializedWarehouse)used.push({category:'freight',views:['economics','trucks','configurator'],text:'specialized warehouses'});
  const model=declaredEndpointModel(plan,{category:service.category??'passengers',loadedReturn:service.loadedReturn,includeTrams});
  if(model){used.push({views:['optimizer'],text:'endpoint buildings, storage and terminals as constraints'});issues.push(...model.issues);for(const text of model.notes)used.push({views:['optimizer'],text});}
  for(const [i,asset] of plan.segmentAssets.entries())if(asset.railTier!==null&&asset.railTracks===1)notes.push(`Segment ${i+1}: single track, for one train (more trains add a second track)`);
  if(plan.stops.some(stop=>stop.buildings.some(b=>b.recipe.inputs.length||b.recipe.outputs.length)))issues.push('Industry recipes are only summarised on the Route page.');
  if(plan.stops.length>2)used.push({views:['race','economics','trucks','configurator','optimizer'],text:`vehicles stop at ${plan.stops.slice(1,-1).map(stop=>stop.name).join(', ')}`});
  for(const text of notes)used.push({views:['optimizer'],text});
  return {service,used,issues:[...new Set(issues)]};
}

/** Values the Compare and Composition service controls take from the declaration; null leaves a control to its user. */
export function declaredServiceInputs(input,{category,includeTrams=false}){
  const plan=validateRoutePlan(input),service=declaredService(plan),applied=service.status==='applied'&&service.category===category,freight=category==='freight';
  return {rate:applied?service.rate:null,loadedReturn:applied&&freight?service.loadedReturn:null,cargo:applied&&freight?service.cargo:null,servicePattern:applied?service.servicePattern??null:null,platformLengthMetres:declaredPlatformLength(plan),
    specializedTerminals:{rail:freight?declaredHandling(plan,{domain:'rail'}):null,road:freight?declaredHandling(plan,{domain:'road',includeTrams}):null}};
}
