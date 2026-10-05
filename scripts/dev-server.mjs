import {createServer} from 'node:http';
import {readFile, realpath} from 'node:fs/promises';
import {resolve, sep} from 'node:path';

const types = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8'};

/** Only public site assets: repository metadata and developer files are never served. */
export function createDevServer(root) {
  const directory = resolve(root);
  return createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, {Allow: 'GET, HEAD'}).end(); return;
    }
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = path === '/' ? 'index.html' : path.slice(1);
      if (!['index.html', 'styles.css'].includes(file) && !/^(src\/[^/]+\.js|data\/[^/]+\.json)$/.test(file)) {
        response.writeHead(404).end('Not found'); return;
      }
      const target = await realpath(resolve(directory, file));
      if (!target.startsWith(directory + sep)) {response.writeHead(404).end('Not found'); return;}
      const content = await readFile(target);
      const ext = file.slice(file.lastIndexOf('.'));
      response.writeHead(200, {'Content-Type': types[ext], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}
