import { execFile, spawn } from 'node:child_process';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createDevServer } from './dev-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const worktree = basename(root);
const execute = promisify(execFile);
const lifetime = new AbortController();
let server;
let relay;

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => lifetime.abort());
}
// Clean up the owned relay even on direct process exit.
process.on('exit', () => relay?.child.kill());

async function tailscaleJson(args) {
  try {
    const { stdout } = await execute('tailscale', args, {
      timeout: 10_000,
      signal: lifetime.signal,
    });
    return JSON.parse(stdout);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Tailscale est introuvable. Installe son CLI sur cette machine.', { cause: error });
    }
    throw new Error(`Tailscale ne répond pas : ${error.stderr?.trim() || error.message}`, { cause: error });
  }
}

function usedPorts(config) {
  return new Set([
    ...Object.keys(config?.TCP ?? {}).map(Number),
    ...Object.values(config?.Foreground ?? {}).flatMap(entry => [...usedPorts(entry)]),
  ]);
}

function startRelay(port) {
  const child = spawn('tailscale', [
    'serve', `--https=${port}`, `http://127.0.0.1:${port}`,
  ], { stdio: ['ignore', 'pipe', 'pipe'], signal: lifetime.signal });
  let output = '';
  let timer;
  const closed = new Promise(resolve => child.once('close', resolve));
  const ready = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.includes('Press Ctrl+C to exit')) resolve();
    });
    child.once('close', () => reject(new Error(output.trim() || 'Tailscale Serve a quitté.')));
    timer = setTimeout(() => reject(new Error(
      `Tailscale Serve ne démarre pas. ${output.trim()}`,
    )), 15_000);
  }).finally(() => clearTimeout(timer));
  return { child, ready, closed };
}

async function stopRelay() {
  if (!relay) return;
  relay.child.kill();
  const force = setTimeout(() => relay.child.kill('SIGKILL'), 3_000);
  await relay.closed;
  clearTimeout(force);
  relay = undefined;
}

async function closeServer() {
  if (!server) return;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  server = undefined;
}

try {
  const status = await tailscaleJson(['status', '--json', '--peers=false']);
  if (status.BackendState !== 'Running') {
    throw new Error('Connecte cette machine à Tailscale, puis relance l’aperçu.');
  }
  const hostname = status.Self?.DNSName?.replace(/\.$/, '');
  if (!hostname || !status.CertDomains?.includes(hostname)) {
    throw new Error('Active MagicDNS et les certificats HTTPS dans Tailscale avant de lancer l’aperçu.');
  }

  // The loopback listener reserves the port between concurrent launchers.
  // Foreground Serve rejects occupied ports instead of replacing another route.
  let nextPort = 8443;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const occupied = usedPorts(await tailscaleJson(['serve', 'status', '--json']));
    while (occupied.has(nextPort)) nextPort += 1;
    lifetime.signal.throwIfAborted();
    for (;;) {
      server = createDevServer(root);
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(nextPort, '127.0.0.1', resolve);
        });
        break;
      } catch (error) {
        if (error.code !== 'EADDRINUSE') throw error;
        nextPort += 1;
      }
    }
    lifetime.signal.throwIfAborted();
    const { port } = server.address();
    nextPort = port + 1;
    if (occupied.has(port)) {
      await closeServer();
      server = undefined;
      continue;
    }

    relay = startRelay(port);
    try {
      await relay.ready;
    } catch (error) {
      await stopRelay();
      if (attempt < 4 && /Another client is changing|listener already exists/.test(error.message)) {
        await closeServer();
        server = undefined;
        await delay(150, undefined, { signal: lifetime.signal });
        continue;
      }
      throw error;
    }

    const url = `https://${hostname}:${port}/`;
    const response = await fetch(url, {
      signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(15_000)]),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`L’aperçu HTTPS répond HTTP ${response.status}.`);
    console.log(`\nAperçu TF3 Lab — ${worktree}\n\n  ${url}\n\nOuvre ce lien depuis Windows connecté à Tailscale.\nCtrl+C pour arrêter cet aperçu.\n`);
    await relay.closed;
    if (!lifetime.signal.aborted) throw new Error('Tailscale Serve s’est arrêté. Relance l’action Aperçu.');
    break;
  }
  if (!lifetime.signal.aborted && !relay) throw new Error('Aucun port disponible pour l’aperçu. Relance l’action.');
} catch (error) {
  if (!lifetime.signal.aborted) {
    console.error(`\nAperçu impossible : ${error.message}`);
    process.exitCode = 1;
  }
} finally {
  await stopRelay();
  await closeServer();
}
