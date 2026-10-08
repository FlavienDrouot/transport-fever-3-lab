import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevServer} from '../scripts/dev-server.mjs';
import {mkdtemp, writeFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Le serveur sert les assets actuels et refuse les fichiers privés, traversées et méthodes', async () => {
  const root = new URL('../', import.meta.url).pathname;
  const server = createDevServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/', '/styles.css', '/src/model.js', '/data/trains.json']) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const thumbnails=JSON.parse(await (await fetch(base+'/data/vehicle-thumbnails.json')).text());
    const image=Object.values(thumbnails.components)[0].parts[0].src.slice(1);
    const png=await fetch(base+image);assert.equal(png.status,200);assert.equal(png.headers.get('content-type'),'image/png');
    for (const path of ['/.git/config', '/.git/tf3-imports/thumbnails-20261008-123815/tf3-vehicle-thumbnails.zip', '/assets/vehicle-thumbnails/NOTICE.md', '/package.json', '/README.md', '/src/..%2f..%2f.git/config', '/%ff', '/.codex/environments/environment.toml']) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base, {method: 'POST'})).status, 405);
    assert.equal(await (await fetch(base, {method: 'HEAD'})).text(), '');
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('Une modification est visible au rafraîchissement ; les liens hors racine sont refusés', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tf3-preview-'));
  const root = join(dir, 'site');
  const {mkdir} = await import('node:fs/promises');
  await mkdir(root); await writeFile(join(root, 'index.html'), 'before');
  await writeFile(join(dir, 'outside.css'), 'private'); await symlink(join(dir, 'outside.css'), join(root, 'styles.css'));
  const server = createDevServer(root); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await (await fetch(base)).text(), 'before');
    await writeFile(join(root, 'index.html'), 'after');
    assert.equal(await (await fetch(base)).text(), 'after');
    assert.equal((await fetch(base + '/styles.css')).status, 404);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(dir, {recursive:true,force:true});
  }
});
