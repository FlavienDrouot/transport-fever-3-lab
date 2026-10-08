import {mkdir, cp, rm} from 'node:fs/promises';
await rm('dist', {recursive: true, force: true});
await mkdir('dist');
for (const file of ['index.html', 'styles.css', 'src', 'data', 'assets']) await cp(file, `dist/${file}`, {recursive: true});
console.log('Site statique préparé dans dist/');
