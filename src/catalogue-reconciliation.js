// Rounded card values are evidence for identity, not runtime validation.
const tolerances={year:0,speed:0.6,mass:0.55,length:0.2,capacity:0,power:0.6,traction:1,handling:0.01};
const sum=(items,read)=>{const values=items.map(read);return values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;};
const minimum=(items,read)=>{const values=items.map(read);return values.every(Number.isFinite)?Math.min(...values):null;};
// Some DLC sources omit cargo compartments. Resource suffixes identify their
// variants; explicit source cargo classes always take precedence.
export function sourceCargoClasses(v){
  const explicit=v.compatibleCargo.classes_included??[];
  if(explicit.length)return explicit;
  if(v.category==='bus')return ['PASSENGERS'];
  if(!['truck','tram'].includes(v.category))return [];
  const variant=v.id.match(/_(box|bulk|stake|tank)\.mdl$/)?.[1];
  return variant?[{box:'GOODS',bulk:'BULK',stake:'FLATBED',tank:'LIQUID'}[variant]]:[];
}
export function isCampaignResource(v){return /(?:^|_)campaign(?:_|$)/i.test(v.provenance?.owner??'');}

export function modelFingerprint(v){
  const engines=v.engines.raw??[];
  const candidate=v.capacity.display_candidate;
  const capacity=v.capacity.display_observed??(Number.isFinite(candidate)?Math.round(candidate):candidate);
  return {year:v.availability.raw?.yearFrom,speed:v.topSpeed.unit==='m/s'&&v.topSpeed.value!=null?v.topSpeed.value*3.6:null,
    mass:v.emptyMass.unit==='kg'&&v.emptyMass.value!=null?v.emptyMass.value/1000:null,length:v.length.value,
    capacity,
    power:engines.every(e=>Number.isFinite(e.power))?sum(engines,e=>e.power)*1000/735.5:null,
    traction:engines.every(e=>Number.isFinite(e.tractiveEffort))?sum(engines,e=>e.tractiveEffort)*1000/9.80665:null,
    handling:v.loadingSpeed.value,cargoClasses:sourceCargoClasses(v)};
}
export function formationFingerprint(formation,vehicles){
  const prefix=formation.id.slice(0,formation.id.lastIndexOf('/')+1);
  const components=formation.components.map(c=>vehicles.find(v=>v.id===prefix+c.name));
  if(components.some(c=>!c))return null;
  const items=components.map(modelFingerprint);
  return {year:Math.max(...items.map(x=>x.year)),speed:minimum(items,x=>x.speed),mass:sum(items,x=>x.mass),length:sum(items,x=>x.length),
    capacity:sum(items,x=>x.capacity),power:sum(items,x=>x.power??(x.capacity>0?0:null)),
    traction:sum(items,x=>x.traction??(x.capacity>0?0:null)),handling:sum(items,x=>x.capacity===0?0:x.handling),
    cargoClasses:[...new Set(items.flatMap(x=>x.cargoClasses))],componentIds:components.map(v=>v.id)};
}
function observationFingerprint(card,formation){
  const observed=card.dataProvenance?.observedFields;
  const read=field=>!observed||observed.includes(field)?card[field]:null;
  return {year:read('year'),speed:read('maxSpeedKmh'),mass:read('massTonnes'),length:read('lengthMetres'),
    capacity:read('passengerCapacity')??read('cargoCapacity'),power:read('powerCh'),traction:read('tractionKgf'),
    handling:formation&&card.formationLoadingUnloadingSpeedMultiplier!=null?card.formationLoadingUnloadingSpeedMultiplier:
      read('loadingUnloadingSpeedMultiplier')==null?null:read('loadingUnloadingSpeedMultiplier')*(formation?card.carCount??1:1)};
}

function cargoCompatible(card,classes){
  if(card.passengerCapacity>0)return classes.includes('PASSENGERS');
  if(!(card.cargoCapacity>0))return true;
  if(classes.includes('PASSENGERS'))return false;
  const desired={bulk:'BULK',goods:'GOODS',flatbed:'FLATBED',liquid:'LIQUID'}[card.freightSpecialization];
  return desired?classes.length===1&&classes[0]===desired:classes.length>0;
}
export function reconcileNames(catalogue,observations){
  const candidates=[...catalogue.vehicles.filter(v=>v.isTransportVehicle&&!isCampaignResource(v)).map(v=>({record:v,category:v.category,formation:false,values:modelFingerprint(v)})),
    ...catalogue.formations.map(f=>({record:f,category:'train',formation:true,values:formationFingerprint(f,catalogue.vehicles)})).filter(c=>c.values)];
  const results=observations.map(observation=>{
    // Condensed locomotive lists expose three physical fields and purchase cost.
    // Require all four to agree uniquely; derived physical fields are not evidence.
    const condensedLocomotive=observation.category==='train'&&observation.card.role==='locomotive'&&
      observation.card.dataProvenance?.observedFields?.includes('economy.purchasePrice');
    const condensedWagon=observation.card.role==='wagon'&&['train','waggon'].includes(observation.category)&&
      observation.card.dataProvenance?.observedFields?.includes('economy.purchasePrice');
    const ranked=candidates.filter(c=>c.category===observation.category&&cargoCompatible(observation.card,c.values.cargoClasses)).map(c=>{
      const expected=observationFingerprint(observation.card,c.formation);
      const evidence=Object.keys(tolerances).filter(field=>Number.isFinite(expected[field])&&Number.isFinite(c.values[field])).map(field=>({field,observed:expected[field],source:c.values[field],difference:Math.abs(expected[field]-c.values[field]),tolerance:tolerances[field]}));
      if((condensedLocomotive&&c.values.capacity===0&&c.values.power>0)||
        (condensedWagon&&!c.formation&&/wagon$/.test(c.record.kind)&&c.values.capacity>0&&c.values.power===0)){
        const price=c.formation?sum(c.values.componentIds,id=>catalogue.vehicles.find(v=>v.id===id)?.derivedCosts?.purchase_price):c.record.derivedCosts?.purchase_price;
        const captured=observation.card.economy?.purchasePrice;
        if(Number.isFinite(price)&&Number.isFinite(captured))evidence.push({field:'purchasePrice',observed:captured,source:price,difference:Math.abs(captured-price),tolerance:0.5});
      }
      const matches=evidence.filter(e=>e.difference<=e.tolerance);
      const conflicts=evidence.filter(e=>e.difference>e.tolerance);
      return {sourceId:c.record.id,formation:c.formation,matches:matches.length,evidence,conflicts:conflicts.map(e=>e.field)};
    }).filter(c=>c.evidence.some(e=>e.field==='year'&&e.difference===0)&&c.matches>=4).sort((a,b)=>a.conflicts.length-b.conflicts.length||b.matches-a.matches||a.sourceId.localeCompare(b.sourceId));
    const strong=ranked.filter(c=>condensedWagon?
      c.conflicts.length===0&&['year','speed','capacity','purchasePrice'].every(field=>c.evidence.some(e=>e.field===field&&e.difference<=e.tolerance)):
      condensedLocomotive?
      c.conflicts.length===0&&['year','speed','power','purchasePrice'].every(field=>c.evidence.some(e=>e.field===field&&e.difference<=e.tolerance)):
      c.matches>=5&&(c.conflicts.length===0||
      (c.conflicts.every(field=>field==='length')||(c.matches>=6&&c.formation&&c.conflicts.every(field=>field==='length'||field==='handling')))));
    // One captured wagon can have explicitly documented cosmetic source variants.
    // Accept the group only when ALL candidates are those variants, and their
    // complete calculator properties agree. Never collapse arbitrary duplicates.
    const aliases=observation.card.dataProvenance?.equivalentResourceIds;
    const signature=id=>{
      const v=catalogue.vehicles.find(v=>v.id===id);
      return v?JSON.stringify([v.category,v.kind,modelFingerprint(v),v.derivedCosts?.purchase_price,v.derivedCosts?.annual_maintenance]):null;
    };
    const equivalent=condensedWagon&&strong.length>1&&Array.isArray(aliases)&&aliases.length===strong.length&&
      new Set(aliases).size===aliases.length&&strong.every(c=>aliases.includes(c.sourceId))&&
      signature(aliases[0])!=null&&aliases.every(id=>signature(id)===signature(aliases[0]));
    const matched=strong.length===1||equivalent;
    return {...observation,status:matched?'matched':strong.length>1?'ambiguous':'unmatched',sourceId:matched?strong[0].sourceId:null,
      ...(equivalent?{sourceIds:strong.map(c=>c.sourceId)}:{}),candidates:ranked.slice(0,5)};
  });
  // A resource must not silently inherit different names from multiple cards.
  const matched=results.filter(r=>r.status==='matched');
  const ids=result=>result.sourceIds??[result.sourceId];
  const conflictingIds=new Set(matched.flatMap(result=>matched.some(other=>other!==result&&ids(other).some(id=>ids(result).includes(id))&&other.card.name!==result.card.name)?ids(result):[]));
  for(const result of matched)if(ids(result).some(id=>conflictingIds.has(id))){result.status='ambiguous';result.sourceId=null;delete result.sourceIds;}
  return results;
}
export function applyReconciledNames(catalogue,results){
  const output=structuredClone(catalogue);
  for(const item of [...output.vehicles,...output.formations]){
    // Make re-running reconciliation deterministic without overriding observed names.
    if(item.name.status==='matched_to_captured_characteristics')item.name={...item.name,value:null,status:'requires_game_localization'};
    delete item.displayValues;
    delete item.nameReconciliation;
    delete item.nameCandidates;
    const proposals=results.filter(r=>r.status!=='matched'&&r.candidates.some(c=>c.sourceId===item.id));
    if(proposals.length)item.nameCandidates=proposals.map(r=>({observation:r.reference,name:r.card.name,status:r.status,evidence:r.candidates.find(c=>c.sourceId===item.id).evidence,conflicts:r.candidates.find(c=>c.sourceId===item.id).conflicts}));
    const matches=results.filter(r=>r.status==='matched'&&(r.sourceIds??[r.sourceId]).includes(item.id));
    if(!matches.length)continue;
    const match=matches[0];
    item.nameReconciliation={method:'unique_characteristic_match',observation:match.reference,sourceCapture:match.card.sourceCapture,
      sourceName:match.card.sourceName??match.card.name,secondaryFieldsRule:'Source extents and inferred formation handling are supporting evidence; Model extent differences are allowed with at least five concordant characteristics; formation handling differences require six.',evidence:match.candidates.find(c=>c.sourceId===item.id).evidence,
      ...(match.sourceIds?{equivalentResourceIds:match.sourceIds}:{}),
      limitation:'Identity match only; capacity candidates, predicted costs and runtime availability retain their original validation status.'};
    if(['bus','truck','tram','train','waggon'].includes(item.category)||match.card.role==='locomotive'){
      const card=match.card;
      item.displayValues={...(card.role?{role:card.role}:{}),year:card.year,capacity:card.passengerCapacity??card.cargoCapacity??0,maxSpeedKmh:card.maxSpeedKmh,
        massTonnes:card.massTonnes,lengthMetres:card.lengthMetres,powerKw:card.powerCh==null?0:card.powerCh*735.5/1000,
        loadingUnloadingSpeedMultiplier:card.loadingUnloadingSpeedMultiplier,purchasePrice:card.economy?.purchasePrice,
        annualMaintenance:card.economy?.annualMaintenance};
    }
    const economy=match.card.economy;
    if(economy?.status==='verified-difficulty-normalization'&&item.derivedCosts){
      const observed=economy.observedCosts;
      const factors=[observed.purchaseMultiplier,observed.maintenanceMultiplier];
      const source=[item.derivedCosts.purchase_price,item.derivedCosts.annual_maintenance];
      const captured=[observed.purchasePrice,observed.annualMaintenance];
      if(factors.every(f=>Number.isFinite(f)&&f>0)&&source.every((value,i)=>Number.isFinite(value)&&Math.abs(value*factors[i]-captured[i])<=0.50000001)){
        item.costValidation={status:'verified_difficulty_normalization',observation:match.reference,observedCosts:observed,
          method:'Source normal-scale costs agree with capture after confirmed difficulty factors, within currency display rounding.'};
      }
    }
    if(!item.name.value)item.name={...item.name,value:match.card.name,status:'matched_to_captured_characteristics'};
  }
  return output;
}
