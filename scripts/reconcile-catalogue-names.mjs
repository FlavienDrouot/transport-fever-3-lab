import {readFile,writeFile} from 'node:fs/promises';
import {reconcileNames,applyReconciledNames} from '../src/catalogue-reconciliation.js';
const catalogue=JSON.parse(await readFile('data/source-catalogue.json','utf8'));
const files=[['buses','buses','bus'],['trucks','trucks','truck'],['trams','trams','tram'],['trams','freightTrams','tram'],['tram-locomotives','locomotives','tram'],['tram-passenger-wagons','wagons','tram'],['tram-freight-wagons','wagons','tram'],['trains','trains','train'],['rail-locomotives','locomotives','train'],['rail-passenger-wagons','wagons','waggon'],['rail-freight-wagons','wagons','waggon'],['vehicle-name-observations','vehicles','bus']];
const observations=[];
for(const [file,key,category] of files){
  const data=JSON.parse(await readFile(`data/${file}.json`,'utf8'));
  observations.push(...data[key].map(card=>({reference:`data/${file}.json#${card.id}`,category:card.dataProvenance?.sourceCategory??category,card})));
}
const results=reconcileNames(catalogue,observations);
await writeFile('data/source-catalogue.json',JSON.stringify(applyReconciledNames(catalogue,results),null,2)+'\n');
for(const status of ['matched','ambiguous','unmatched'])console.log(`${status}: ${results.filter(r=>r.status===status).length}`);
// Detailed delivery evidence is emitted, not stored as a report in the product repository.
if(process.argv.includes('--details'))console.log(JSON.stringify(results.map(({reference,status,sourceId,candidates})=>({reference,status,sourceId,candidates})),null,2));
