import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {defaultOptimizerRequest,optimizerCacheKey} from '../src/optimizer-cache.js';
import {loadOptimizerCatalogue} from '../src/optimizer-catalogue.js';
import {optimizeService} from '../src/optimizer.js';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildDefaultOptimizerCache(output=resolve(root,'data')){
  const load=async name=>JSON.parse(await readFile(resolve(root,`data/${name}.json`),'utf8'));
  const request=defaultOptimizerRequest(),catalogue=await loadOptimizerCatalogue(load,request,await load('trains'));
  const key=await optimizerCacheKey(request,catalogue);
  // Every source change gets a new immutable asset URL; no manual model version is needed.
  const revision=createHash('sha256').update(key);
  for(const name of (await readdir(resolve(root,'src'))).filter(name=>name.endsWith('.js')).sort()){
    revision.update(name).update(await readFile(resolve(root,'src',name)));
  }
  const asset=`optimizer-default-${revision.digest('hex')}.json`;
  const search=optimizeService(catalogue,request);let step;
  do{step=search.next();}while(!step.done);
  await mkdir(output,{recursive:true});
  await writeFile(resolve(output,asset),JSON.stringify(step.value));
  await writeFile(resolve(output,'optimizer-default.json'),JSON.stringify({version:1,key,asset}));
  console.log(`Default optimizer cache: ${step.value.stats.tested} designs → ${asset}`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildDefaultOptimizerCache();
