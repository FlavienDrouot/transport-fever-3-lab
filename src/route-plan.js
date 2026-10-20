import {validateRouteProfile} from './route-profile.js';

export const ROUTE_STORAGE_KEY='tf3-routes-v1';
export const routeId=prefix=>`${prefix}:${crypto.randomUUID()}`;
export const newSegmentAssets=()=>({railTier:null,railTracks:2,roadTier:null,roadLanes:2,tramTracks:'none'});
const text=(value,label,max=120)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new RangeError(`${label} needs 1–${max} characters.`);return value.trim();};
const identity=(value,label)=>{const id=text(value,label,128);if(!/^[A-Za-z0-9:_-]+$/.test(id))throw new RangeError(`${label} contains unsupported characters.`);return id;};
const number=(value,label,min=0,max=1e12)=>{if(!Number.isFinite(value)||value<min||value>max)throw new RangeError(`${label} must be ${min}–${max}.`);return value;};
const whole=(value,label,min,max,step=1)=>{number(value,label,min,max);if(!Number.isSafeInteger(value)||value%step)throw new RangeError(`${label} must use whole ${step} sections.`);return value;};
const list=(value,label,max)=>{if(!Array.isArray(value)||value.length>max)throw new RangeError(`${label}: at most ${max} entries.`);return value;};
const identities=(items,label)=>{const ids=new Set();for(const item of items){const id=identity(item?.id,`${label} ID`);if(ids.has(id))throw new RangeError(`Duplicate ${label} ID.`);ids.add(id);}return ids;};
const choice=(value,values,label)=>{if(!values.includes(value))throw new RangeError(`Choose a valid ${label}.`);return value;};
const ratio=value=>{number(value,'Recipe ratio',0,1e9);if(value===0)throw new RangeError('Recipe ratio must be positive.');return value;};
/** Passengers or a freight group. General freight needs general-purpose vehicles; a specific group also admits them. */
export const LOAD_TYPES=Object.freeze(['passengers','general','bulk','goods','flatbed','liquid']);
export const newRouteBuilding=(name='Building 1',type='none')=>({id:routeId('building'),name,type,warehouseCapacity:500,industryTerminals:2,storage:[],recipe:{inputs:[],outputs:[]}});
export const newRouteStop=(boundary,name)=>({id:routeId('stop'),boundary,name,buildings:[],infrastructure:[],operations:[]});
export function createRoutePlan(segments,name='Custom route'){
  const profile=validateRouteProfile(segments);
  return {schemaVersion:3,id:routeId('route'),name,segments:profile,segmentAssets:profile.map(newSegmentAssets),goods:[],stops:[newRouteStop(0,'A'),newRouteStop(profile.length,'B')]};
}

/** Version 1's single building owns its existing storage, recipe and operations. */
function currentDefinition(input){
  if(input?.schemaVersion===3)return input;
  // Version 2 goods had no type; the user chooses one instead of a guess.
  if(input?.schemaVersion===2)return {...input,schemaVersion:3,goods:list(input.goods,'Goods',50).map(g=>({...g,type:null}))};
  if(input?.schemaVersion!==1)throw new RangeError('Unsupported route schema.');
  return currentDefinition({...input,schemaVersion:2,stops:list(input.stops,'Stops',25).map(stop=>{
    const building={id:`building:${identity(stop.id,'Stop ID').slice(0,100)}`,name:stop.name,type:stop.building,
      warehouseCapacity:stop.warehouseCapacity,industryTerminals:stop.industryTerminals,storage:stop.storage,recipe:stop.recipe};
    return {...stop,buildings:[building],operations:list(stop.operations,'Freight operations',200).map(op=>({...op,buildingId:building.id}))};
  })});
}

/** A service declaration, not a vehicle definition or a cached simulation. */
export function validateRoutePlan(input){
  input=currentDefinition(input);
  const segments=validateRouteProfile(input.segments),goods=list(input.goods,'Loads',50).map(g=>({id:identity(g.id,'Load ID'),name:text(g.name,'Load name'),type:g.type==null?null:choice(g.type,LOAD_TYPES,'load type')}));
  if(goods.filter(g=>g.type==='passengers').length>1)throw new RangeError('Declare passengers once.');
  if(goods.some(g=>g.type==='passengers')&&goods.some(g=>g.type!=='passengers'))throw new RangeError('A route carries passengers or freight, not both yet. Remove one kind of load.');
  const cargoIds=identities(goods,'good'),names=new Set();
  const segmentAssets=list(input.segmentAssets??segments.map(newSegmentAssets),'Segment infrastructure',24).map(asset=>{
    const railTier=choice(asset.railTier,[null,100,160,350],'existing Rail tier'),roadTier=choice(asset.roadTier,[null,40,60,50,80,100,120],'existing Road tier');
    const railTracks=choice(asset.railTracks,[1,2],'existing Rail track count'),roadLanes=choice(asset.roadLanes,[2,4],'existing Road lanes');
    const tramTracks=choice(asset.tramTracks,['none','road','dedicated'],'existing Tram tracks');
    if(roadTier===100&&roadLanes!==2||roadTier===120&&roadLanes!==4)throw new RangeError('100 km/h Road requires 2 lanes; 120 km/h requires 4 lanes.');
    if(tramTracks==='road'&&(roadTier==null||roadTier===100||roadTier===120))throw new RangeError('Declare a compatible Road tier for street Tram tracks; highways cannot carry them.');
    return {railTier,railTracks,roadTier,roadLanes,tramTracks};
  });
  if(segmentAssets.length!==segments.length)throw new RangeError('Declare infrastructure for each route segment.');
  for(const good of goods){const key=good.name.toLocaleLowerCase('en');if(names.has(key))throw new RangeError('Load names must be distinct.');names.add(key);}
  const cargo=value=>{if(!cargoIds.has(value))throw new RangeError('Choose a declared load.');return value;};
  const freight=new Set(goods.filter(g=>g.type!=='passengers').map(g=>g.id)),stocked=item=>{if(!freight.has(item.cargoId))throw new RangeError('Storage and recipes apply to freight only.');return item;};
  const row=(item)=>({id:identity(item.id,'Row ID'),cargoId:cargo(item.cargoId)});
  const stops=list(input.stops,'Stops',25).map(stop=>{
    const buildings=list(stop.buildings,'Buildings at a stop',20).map(building=>{
      const type=choice(building.type,['none','factory','warehouse','industrial'],'building');
      const storage=list(building.storage,'Storage',50).map(s=>({...row(stocked(s)),inputCapacity:whole(s.inputCapacity,'Input storage',100,Number.MAX_SAFE_INTEGER,100),outputCapacity:whole(s.outputCapacity,'Output storage',100,Number.MAX_SAFE_INTEGER,100)}));
      const recipe=Object.fromEntries(['inputs','outputs'].map(key=>[key,list(building.recipe?.[key],`Recipe ${key}`,50).map(r=>({...row(stocked(r)),ratio:ratio(r.ratio)}))]));
      for(const [key,items] of Object.entries({storage,...recipe})){
        identities(items,key);
        if(new Set(items.map(r=>r.cargoId)).size!==items.length)throw new RangeError(`Declare each good once in ${key} for this building.`);
      }
      return {id:identity(building.id,'Building ID'),name:text(building.name,'Building name'),type,
        warehouseCapacity:whole(building.warehouseCapacity,'Warehouse Capacity',500,100000,500),industryTerminals:choice(building.industryTerminals,[2,3],'parallel industry terminals'),storage,recipe};
    });
    const buildingIds=identities(buildings,'building');
    if(new Set(buildings.map(b=>b.name.toLocaleLowerCase('en'))).size!==buildings.length)throw new RangeError('Building names must be distinct within a stop.');
    const infrastructure=list(stop.infrastructure,'Infrastructure',20).map(entry=>{
      const kind=choice(entry.kind,['railPlatform','roadPlatform','railStation','roadStation','busStop'],'infrastructure');
      const result={id:identity(entry.id,'Infrastructure ID'),kind};
      if(kind==='railPlatform'){
        result.length=whole(entry.length,'Rail platform length',40,840,40);
        result.tracks=whole(entry.tracks,'Platform tracks',1,100);
        result.platforms=whole(entry.platforms,'Platforms',Math.ceil(result.tracks/2),result.tracks);
      }else if(kind==='roadPlatform'){
        result.length=whole(entry.length,'Road platform length',20,10000,10);result.platforms=whole(entry.platforms,'Parallel platforms',1,100);
      }
      if(kind.endsWith('Platform')){if(typeof entry.specialized!=='boolean')throw new RangeError('Choose a valid specialization.');result.specialized=entry.specialized;}
      return result;
    });
    const operations=list(stop.operations,'Freight operations',200).map(op=>{
      if(op.buildingId!==null&&!buildingIds.has(op.buildingId))throw new RangeError('Choose a building at this stop, or leave it unspecified.');
      return {...row(op),buildingId:op.buildingId,direction:choice(op.direction,['outbound','return'],'direction'),action:choice(op.action,['load','unload'],'operation'),
        quantity:{mode:choice(op.quantity?.mode,['visit','year','percent'],'quantity mode'),value:number(op.quantity?.value,'Quantity',0,op.quantity?.mode==='percent'?100:1e12)}};
    });
    identities(infrastructure,'infrastructure');identities(operations,'operations');
    return {id:identity(stop.id,'Stop ID'),name:text(stop.name,'Stop name'),boundary:whole(stop.boundary,'Stop boundary',0,segments.length),buildings,infrastructure,operations};
  }).sort((a,b)=>a.boundary-b.boundary);
  identities(stops,'stop');
  if(stops.length<2||stops[0].boundary!==0||stops.at(-1).boundary!==segments.length)throw new RangeError('Keep a source and destination at the route ends.');
  if(new Set(stops.map(s=>s.boundary)).size!==stops.length)throw new RangeError('Two stops cannot occupy the same boundary. Remove one stop before removing their connecting segment.');
  return {schemaVersion:3,id:identity(input.id,'Route ID'),name:text(input.name,'Route name'),segments,segmentAssets,goods,stops};
}

/** Stops stay attached to the following segment; reordering geometry keeps stop order. Split halves share their infrastructure. */
export function updateRoutePlanSegments(input,segments,edit=null){
  const plan=validateRoutePlan(input),next=validateRouteProfile(segments),oldLength=plan.segments.length;
  const delta=next.length-oldLength;
  if(delta&&!edit)throw new RangeError('Load a complete route when replacing its segment structure.');
  const insertion=edit?.action==='add'?oldLength:edit?.action==='insert'||edit?.action==='split'?edit.index+1:edit?.index;
  const segmentAssets=structuredClone(plan.segmentAssets);
  if(delta===1)segmentAssets.splice(insertion,0,edit.action==='split'?{...segmentAssets[edit.index]}:newSegmentAssets());
  else if(delta===-1)segmentAssets.splice(edit.index,1);
  else if(edit?.action==='up'||edit?.action==='down'){const other=edit.index+(edit.action==='up'?-1:1);[segmentAssets[edit.index],segmentAssets[other]]=[segmentAssets[other],segmentAssets[edit.index]];}
  const stops=plan.stops.map(stop=>{
    let boundary=stop.boundary;
    if(delta===1&&boundary>0&&boundary>=insertion)boundary++;
    else if(delta===-1&&boundary>edit.index)boundary--;
    return {...stop,boundary};
  });
  return validateRoutePlan({...plan,segments:next,segmentAssets,stops});
}

export function restoreRoutePlans(raw){
  if(!raw)return {routes:[],skipped:0};
  try{
    if(raw.length>4_000_000)throw new RangeError('Route storage is too large.');
    const parsed=JSON.parse(raw);if(parsed.schemaVersion!==1)throw new RangeError('Unsupported route library.');
    const definitions=list(parsed.routes,'Saved routes',100),routes=[],ids=new Set();let skipped=0;
    for(const definition of definitions)try{const plan=validateRoutePlan(definition);routePlanFlows(plan);if(!plan.id.startsWith('route:')||ids.has(plan.id))throw new RangeError('Duplicate route.');ids.add(plan.id);routes.push(plan);}catch{skipped++;}
    return {routes,skipped};
  }catch{return {routes:[],skipped:1};}
}

/** Keep annual and per-visit quantities separate until a service Frequency is known. */
export function routePlanFlows(input){
  const plan=validateRoutePlan(input),load=new Map(plan.goods.map(g=>[g.id,{visit:0,year:0}])),visits=[],sections=[],warnings=[];
  const amount=()=>Object.fromEntries([...load].map(([id,q])=>[id,{...q}]));
  for(const direction of ['outbound','return']){
    const ordered=direction==='outbound'?plan.stops:plan.stops.toReversed();
    for(let i=0;i<ordered.length;i++){
      const stop=ordered[i],moves=[];
      const operations=stop.operations.filter(op=>op.direction===direction).toSorted((a,b)=>Number(a.action==='load')-Number(b.action==='load'));
      for(const op of operations){
        const current=load.get(op.cargoId),q={visit:0,year:0};
        if(op.quantity.mode==='percent')for(const basis of ['visit','year'])q[basis]=current[basis]*op.quantity.value/100;
        else q[op.quantity.mode]=op.quantity.value;
        if(op.action==='load'&&op.quantity.mode==='percent'&&op.quantity.value>0&&q.visit===0&&q.year===0)warnings.push({stopId:stop.id,cargoId:op.cargoId,message:'A percentage load needs this good already onboard. Initialize it with a quantity per visit or a Rate.'});
        for(const basis of ['visit','year']){
          if(op.action==='unload'&&q[basis]>current[basis]+1e-8)warnings.push({stopId:stop.id,cargoId:op.cargoId,message:`Declared unloading exceeds the ${basis==='year'?'annual':'per-visit'} load arriving here.`});
          current[basis]=op.action==='load'?current[basis]+q[basis]:Math.max(0,current[basis]-q[basis]);
          if(!Number.isFinite(current[basis]))throw new RangeError('Planned quantities overflow. Reduce the quantities or percentage operations.');
        }
        moves.push({cargoId:op.cargoId,buildingId:op.buildingId,action:op.action,quantity:q});
      }
      visits.push({stopId:stop.id,direction,moves,load:amount()});
      if(i<ordered.length-1)sections.push({from:stop.id,to:ordered[i+1].id,direction,startBoundary:Math.min(stop.boundary,ordered[i+1].boundary),endBoundary:Math.max(stop.boundary,ordered[i+1].boundary),load:amount()});
    }
  }
  const production=plan.stops.flatMap(stop=>stop.buildings.filter(b=>b.type==='factory'&&(b.recipe.inputs.length||b.recipe.outputs.length)).map(building=>{
    const moves=visits.filter(v=>v.stopId===stop.id).flatMap(v=>v.moves).filter(m=>m.buildingId===building.id),required={},plannedOutputs={},incoming={};
    for(const basis of ['visit','year']){
      const quantity=(cargoId,action)=>moves.filter(m=>m.cargoId===cargoId&&m.action===action).reduce((sum,m)=>sum+m.quantity[basis],0);
      const cycles=Math.max(0,...building.recipe.outputs.map(r=>quantity(r.cargoId,'load')/r.ratio));
      if(!Number.isFinite(cycles))throw new RangeError('Production requirements overflow. Use representable recipe ratios.');
      required[basis]=Object.fromEntries(building.recipe.inputs.map(r=>[r.cargoId,cycles*r.ratio]));
      plannedOutputs[basis]=Object.fromEntries(building.recipe.outputs.map(r=>[r.cargoId,cycles*r.ratio]));
      if([...Object.values(required[basis]),...Object.values(plannedOutputs[basis])].some(n=>!Number.isFinite(n)))throw new RangeError('Production quantities overflow. Reduce the recipe ratios.');
      incoming[basis]=Object.fromEntries(building.recipe.inputs.map(r=>[r.cargoId,quantity(r.cargoId,'unload')]));
    }
    return {stopId:stop.id,buildingId:building.id,required,plannedOutputs,incoming,incomplete:!building.recipe.outputs.length};
  }));
  return {visits,sections,production,warnings,remaining:amount()};
}
