# Development and deployment

The site is static HTML, CSS and native JavaScript modules, with no runtime dependencies or CDN. Node.js 22+ is required for tests and builds; Python 3 runs the basic local preview.

```sh
npm test
npm run build
npm run dev
```

Open http://127.0.0.1:4173. No `npm install` is needed. Serve over HTTP: opening `index.html` as a local file cannot load the modules and dataset. Refresh after edits; the preview has no automatic reload.

## Remote preview

When the checkout is on another computer, forward its loopback port:

```sh
ssh -N -L 4173:127.0.0.1:4173 user@development-host
```

Then open http://127.0.0.1:4173 on your computer. Stop the server and tunnel with Ctrl+C.

Alternatively, `npm run dev:remote` (also the Codex **Aperçu** action in `.codex/environments/environment.toml`) starts a private Tailscale Serve preview. Open the HTTPS URL printed in the terminal from a computer on the same tailnet. The launcher selects an available port starting at 8443, binds the server to loopback and relays only public site files. It does not use Funnel or change firewall rules.

Prerequisites: connected Tailscale CLI, MagicDNS/HTTPS certificates, Serve permissions and tailnet access rules allowing the chosen port. Keep the terminal open; Ctrl+C stops its server and Serve session. After forced termination, clean up only this preview's processes and relay; do not use `tailscale serve reset`, which affects other previews. For failures, inspect the terminal message, `tailscale status` and `tailscale serve status`. SSH forwarding remains an alternative.

## Repository map

- `data/trains.json`: train specifications, provenance and original observations.
- `src/model.js`: analytical motion model in SI units.
- `src/scales.js`, `src/phase-scale.js`: linear, logarithmic and phase axes.
- `src/race.js`, `src/crossovers.js`: horizons, crossings and ranking intervals.
- `src/app.js`: controls and SVG charts.
- `tests/`: model, data, scale, crossing and preview-server checks.
- `scripts/build.mjs`: copies public site files into ignored `dist/`.

Use the existing vanilla JavaScript patterns. Keep the physical model independent of rendering. Add a train with a unique ID, positive physical parameters, an introduction year, a distinguishable colour/dash and documented provenance. Do not publish game screenshots without permission. The catalogue is not virtualized; revisit that choice only if a substantially larger real catalogue shows measurable slowdowns.

## GitHub Pages

`.github/workflows/ci.yml` tests and builds pull requests. Pushes to `main`, or a manual workflow run on `main`, publish `dist/` after checks pass. Pull requests do not deploy. Pages uses the GitHub Actions source and the `github-pages` environment, with `pages: write` and `id-token: write` permissions limited to deployment.

The build uses relative paths and works at the root or in a subdirectory without routing rewrites or secrets. Local edits appear only in the local preview until published. Check build/test logs, Pages settings and environment permissions for failed deployments. Restore an earlier version with a reviewed revert on `main`; do not replay an old run to bypass history.

Revisit static hosting if the project needs accounts, a backend or shared storage. No alternative hosting integration is currently configured.
