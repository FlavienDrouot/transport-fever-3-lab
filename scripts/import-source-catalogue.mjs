import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Export selected metadata only; never distribute original resources or host paths.
const provenance=p=>({owner:p.owner,entry:p.entry,contentState:p.content_state,sha256:p.sha256_utf8_text});
export function importSourceCatalogue(input,sourceSha256) {
  if(input.schema_version!==3||!Array.isArray(input.vehicles)||!Array.isArray(input.formations))throw new TypeError('Expected source catalogue schema 3');
  const ids=new Set();
  const checkId=id=>{if(typeof id!=='string'||!id||ids.has(id))throw new TypeError('Missing or duplicate source ID');ids.add(id);return id;};
  const vehicles=input.vehicles.map(v=>({
    id:checkId(v.id),idStatus:v.id_status,kind:v.kind,category:v.category,carrier:v.carrier,isTransportVehicle:v.is_transport_vehicle,
    name:v.name,availability:v.availability,topSpeed:v.top_speed,emptyMass:v.empty_mass,length:v.length,
    engines:v.engines,propulsion:v.propulsion,capacity:v.capacity,compatibleCargo:v.compatible_cargo,loadingSpeed:v.loading_speed,
    purchasePrice:v.purchase_price,annualMaintenance:v.annual_maintenance,derivedCosts:v.derived_costs,
    provenance:provenance(v.provenance),validation:v.validation,
  }));
  const formations=input.formations.map(f=>({id:checkId(f.id),idStatus:f.id_status,aggregationStatus:f.aggregation_status,
    name:f.raw_definition.name,components:f.raw_definition.vehicles,filterTags:f.raw_definition.filterTags,
    provenance:provenance(f.provenance)}));
  return {schemaVersion:1,source:{generatedAt:input.generated_at_utc,scope:input.scope,steamAppId:input.provenance.steam_app_id,
    steamBuildId:input.provenance.steam_build_id,sourceSha256,validation:input.validation,
    ruleSources:input.provenance.rule_sources.map(r=>({entry:r.entry,sha256:r.sha256_utf8_text})),
    limitations:['Installed resources, not the effective catalogue of a save.','Localization, cargo expansion and runtime modifiers remain unresolved.','Estimated capacities and costs are not calculator inputs.']},vehicles,formations};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [, ,inputPath,outputPath]=process.argv;
  if(!inputPath||!outputPath)throw new Error('Usage: node scripts/import-source-catalogue.mjs PRIVATE/catalog.json data/source-catalogue.json');
  const bytes=await readFile(inputPath);
  const output=importSourceCatalogue(JSON.parse(bytes),createHash('sha256').update(bytes).digest('hex'));
  await writeFile(outputPath,JSON.stringify(output,null,2)+'\n');
  console.log(`Imported ${output.vehicles.length} source models and ${output.formations.length} ordered formations`);
}
