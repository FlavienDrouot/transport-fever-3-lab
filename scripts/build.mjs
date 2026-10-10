import {mkdir, cp, rm} from 'node:fs/promises';
import {buildDefaultOptimizerCache} from './optimizer-cache.mjs';
import {basename} from 'node:path';
await rm('dist', {recursive: true, force: true});
await mkdir('dist');
for (const file of ['index.html', 'styles.css', 'src', 'data', 'assets']) await cp(file, `dist/${file}`, {recursive: true,filter:source=>!/^optimizer-default(?:-[a-f0-9]{64})?\.json$/.test(basename(source))});
await buildDefaultOptimizerCache('dist/data');
console.log('Site statique préparé dans dist/');
