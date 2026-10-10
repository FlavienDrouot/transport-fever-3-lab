import {readFile,writeFile} from 'node:fs/promises';
import {posix} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Resolve explicit source associations, never match vehicle names heuristically. */
export function vehicleAvailabilityIndex(catalogue,observations){
  const resources=new Map([...catalogue.vehicles,...catalogue.formations].map(item=>[item.id,item]));
  const associations=new Map();
  for(const item of resources.values()){
    const reference=item.nameReconciliation?.observation;
    if(reference)associations.set(reference,[...(associations.get(reference)??[]),item.id]);
  }
  function models(id,parents=[]){
    const resource=resources.get(id);
    if(!resource||parents.includes(id))throw new Error(`Unresolved availability resource: ${id}`);
    if(!resource.components)return [resource];
    const [owner,path]=id.split('::');
    return resource.components.flatMap(component=>models(`${owner}::${component.name.startsWith('/')?component.name:posix.join(posix.dirname(path),component.name)}`,[...parents,id]));
  }
  const entries={};
  for(const {reference,card} of observations){
    const provenance=card.dataProvenance??card.formationProvenance;
    const ids=provenance?.equivalentResourceIds??(provenance?.resourceId?[provenance.resourceId]:associations.get(reference));
    if(!ids?.length)throw new Error(`Missing source association: ${reference}`);
    // Equivalent selectable models must have identical availability; they are alternatives, not a formation.
    const groups=ids.map(id=>[...new Map(models(id).map(model=>[model.id,model])).values()]);
    const ends=groups.map(group=>{
      const dates=group.map(model=>model.availability?.raw?(model.availability.raw.yearTo??0):null);
      if(dates.some(value=>value!==null&&(!Number.isInteger(value)||value<0)))throw new Error(`Invalid retirement date: ${reference}`);
      const finite=dates.filter(value=>value>0);
      return finite.length?Math.min(...finite):dates.includes(null)?null:0;
    });
    if(!ends.every(value=>value===ends[0]))throw new Error(`Ambiguous alternative availability: ${reference}`);
    entries[reference]={yearTo:ends[0],resourceIds:[...new Set(groups.flat().map(model=>model.id))]};
  }
  return {schemaVersion:1,source:{catalogue:'source-catalogue.json',steamBuildId:catalogue.source.steamBuildId,
    sourceSha256:catalogue.source.sourceSha256,scope:'Source purchase availability; active save/mod overrides are not applied.',
    rule:'Formation end is the earliest component end. 0 means no declared end; null means unknown.'},entries};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const read=async name=>JSON.parse(await readFile(`data/${name}.json`,'utf8'));
  const catalogue=await read('source-catalogue'),observations=[];
  for(const [name,key] of [['trains','trains'],['rail-locomotives','locomotives'],['rail-passenger-wagons','wagons'],['rail-freight-wagons','wagons'],['buses','buses'],['trucks','trucks']]){
    const data=await read(name);observations.push(...data[key].map(card=>({reference:`data/${name}.json#${card.id}`,card})));
  }
  const index=vehicleAvailabilityIndex(catalogue,observations);
  await writeFile('data/vehicle-availability.json',JSON.stringify(index,null,2)+'\n');
  console.log(`Imported source availability for ${Object.keys(index.entries).length} selectable Rail/Road records.`);
}
