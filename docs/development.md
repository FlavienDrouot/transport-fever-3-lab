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
- `data/source-catalogue.json`: staged installed-resource metadata; observations and source estimates remain distinct.
- `src/source-catalogue.js`: searchable source inventory, independent of calculator datasets.
- `scripts/import-source-catalogue.mjs`: deterministic schema-3 metadata importer with local paths and original source bodies omitted.
- `src/model.js`: analytical motion model in SI units.
- `src/consists.js`: pure component-to-formation builder and tram / powered-multiple-unit source adapters.
- `src/consist-editor.js`: local experimental tram editor and category/cargo/year component filtering.
- `src/phase-diagram.js`: shared renderer for all six Race, Economics and Road phase plots. Owns winner styling for horizontal rank plateaus, neutral vertical rank transitions, clipped curves, wide pointer hit areas, endpoint labels, single-line leader names with compact markers with a minimum 24 px hover target independent of narrow phase widths and full-name tooltips, mobile legends and synchronized pointer/keyboard highlighting. Analyses supply model paths and axis/grid geometry; the application bridge updates the train picker without rebuilding the focused plot.
- `src/scales.js`, `src/phase-scale.js`: linear, logarithmic and phase axes.
- `src/race.js`, `src/crossovers.js`: horizons, crossings and ranking intervals.
- `src/line.js`: experimental A–B–A capacity and maintenance calculations.
- `src/economic-chart.js`: cached service samples and standard efficiency curves.
- `src/economic-crossovers.js`, `src/economic-crossover-chart.js`: bounded economic ranking changes, phase curves and rank charts.
- `src/app.js`: analysis views, controls, service readout and race SVG charts.
- `src/road-phases.js`: road cost/rank diagrams by year, distance or utilization, with shared economic crossover solving and exact introduction-year events.
- `src/table-preview.js`: ten-row previews for Road details and the collected catalogue table, with accessible expand/collapse buttons. Rows remain in the table for complete CSV export; filtering updates the count and preserves the expanded state.
- `src/panels.js`: per-view side-panel visibility and shared native-dialog mobile drawers. Race/Economics show the train picker; Road shows compact route settings with inline distance/speed fields, paired facility switches and individual info icons with native hover tooltips and accessible descriptions; Data & models has no side panel and presents a single collected catalogue, alongside useful model checks. Captured train cards remain calculation and reconciliation inputs, without a separate table.
- `tests/`: model, data, scale, crossing and preview-server checks.
- `scripts/build.mjs`: copies public site files into ignored `dist/`.

Use the existing vanilla JavaScript patterns. Keep the physical model independent of rendering. Add a train with a unique ID, positive physical parameters, an introduction year, a distinguishable colour/dash and documented provenance. Do not publish game screenshots without permission. The catalogue is not virtualized; revisit that choice only if a substantially larger real catalogue shows measurable slowdowns.

## GitHub Pages

Iterate in the private local preview first. Publish changes through a branch and pull request; do not push changes directly to `main`. Merging the reviewed pull request triggers publication.

`.github/workflows/ci.yml` tests and builds pull requests. Pushes to `main`, or a manual workflow run on `main`, publish `dist/` after checks pass. Pull requests do not deploy. Pages uses the GitHub Actions source and the `github-pages` environment, with `pages: write` and `id-token: write` permissions limited to deployment.

The build uses relative paths and works at the root or in a subdirectory without routing rewrites or secrets. Local edits appear only in the local preview until published. Check build/test logs, Pages settings and environment permissions for failed deployments. Restore an earlier version with a reviewed revert on `main`; do not replay an old run to bypass history.

Revisit static hosting if the project needs accounts, a backend or shared storage. No alternative hosting integration is currently configured.

## Acquire vehicle data from a Windows installation

`scripts/collect-game-vehicles.ps1` is an experimental, read-only source collector for Windows PowerShell 5.1 / PowerShell 7. It discovers TF3 in Steam libraries or accepts `-GamePath`. It writes a new ZIP to the Desktop (or an existing `-OutputDirectory`), containing vehicle `.mdl` definitions, `.mu.lua` formations, economy resources and selected metadata utilities from loose files or ZIP-compatible packs. It never runs game scripts or modifies the installation. Collected file size is limited to 2 MiB per resource and 32 MiB total; skipped resources and unreadable packs are listed in `manifest.json`. Original resource paths are preserved in the manifest rather than used as extraction destinations.

Run from Windows PowerShell in the directory containing the downloaded script:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\collect-game-vehicles.ps1
# Or provide the installation directory explicitly:
powershell -NoProfile -ExecutionPolicy Bypass -File .\collect-game-vehicles.ps1 -GamePath 'D:\SteamLibrary\steamapps\common\Transport Fever 3'
```

The execution-policy override applies only to this process. The collector has not yet been executed on a real TF3 installation or validated in PowerShell; a successful source collection is not a verified catalogue export. Unsupported packaging requires inspection of the actual installation or a documented in-game resource export. Keep collected game sources private and outside this repository. Do not publish them or overwrite the captured catalogues.

Evaluate metadata in the proper game context before importing: Lua expressions and automatic values (such as `-1` prices, maintenance and loading speed) cannot be treated as displayed values. Compare an exported locomotive and passenger/freight wagons against existing cards, verify units and difficulty, and retain model identifiers, game version and mods as provenance. The official [resource API](https://wiki.transportfever3.com/script-doc/api/res.html), [model metadata](https://wiki.transportfever3.com/doku.php?id=modding:general:resourcetypes:mdl) and [vehicle metadata](https://wiki.transportfever3.com/doku.php?id=modding:vehicles:basics) describe the starting points.

## Import a collected metadata catalogue

The external Windows schema-3 export can be staged without overwriting screenshot-derived datasets:

```sh
node scripts/import-source-catalogue.mjs /private/export/catalog.json data/source-catalogue.json
node scripts/reconcile-catalogue-names.mjs
npm test
npm run build
```

The importer retains resource IDs, units, raw negative sentinels, compartment alternatives, ordered formation components, field status and source hashes. It omits installation/archive paths and original model source bodies. The source JSON SHA-256 identifies the exact input; keep that export privately for reproducibility. Review the generated metadata before publishing. The Data & models inventory filters installed source models by introduction year, category and search; an optional checkbox includes non-transport models. Campaign resources remain in the raw download but are excluded from catalogue views and identity matching. Year selectors default to 2035, the last introduction year in the current collection, and reset to that maximum. Formation definitions remain separate, without inferred aggregation or purchasability. Retirement dates and active save modifiers are not applied.

Road and tram entries outside campaign content are all linked to their calculator/configurator records. Reconciliation emits `displayValues` from those records so the inventory uses the same capacities, costs and dimensions, including DLC resources with omitted source fields. Raw metadata remains unchanged. Maintenance from the checked source formula is usable alongside captured maintenance; public rows show values without origin/status badges. Unresolved railway/air/water records still require capacity, formation and localization checks before entering calculators.

### Reconcile captured names

`scripts/reconcile-catalogue-names.mjs` compares source metadata with the existing captured datasets and `data/vehicle-name-observations.json` (additional identity-only evidence). Costs are excluded because capture difficulty may differ. Source IDs are kept; matching names and their capture references are recorded separately from runtime validation. Re-run reconciliation after importing a new export or correcting a card. `--details` emits candidate evidence to stdout for review; keep one-off results in the private work-vault or GitHub rather than the product repository.

For condensed-capture additions, `dataProvenance.observedFields` limits identity evidence to fields actually visible in the capture. Source-backed mass, traction and bounding-box length never count as independent confirmation. Stadler Citylink, Stadler TINA and the 2030 articulated freight tram use this path: five observed identity fields and an exact purchase-price check, with annual maintenance retained as a source-formula value.

Matching requires the same category and introduction year, compatible source cargo classes, and at least five concordant characteristics within display-rounding tolerances. Missing values provide no evidence. For road/tram capacities, source conversion candidates are rounded to the displayed integer before matching. Explicit cargo classes take precedence; absent bus classes imply passengers, and absent truck/tram classes can be inferred from exact `_box`, `_bulk`, `_stake` or `_tank` resource suffixes. This fallback never overrides contradictory explicit classes. Significant capacity, mass, speed, power or traction differences block an automatic association. Source bounding-box lengths and inferred per-car formation handling are secondary: differences are retained but may be accepted with at least five other concordant characteristics for model extents, or six for formation handling. A unique candidate is required; ties and conflicting captured names remain unresolved. Unmatched candidates, disagreements and provenance remain in the metadata JSON for maintenance, without per-row diagnostic disclosures in the public catalogue. Source and captured names remain searchable via their resource IDs and translation keys.

Multiple-unit candidates resolve every ordered component ID within its source directory before comparing aggregate physical characteristics; repeated cars are counted repeatedly. A matched formation name is not copied onto its component records. This aggregation is for identity evidence only: it does not validate coupling, purchase availability or calculator handling. Resolve those through in-game observations before promoting entries into calculators. Existing screenshot-confirmed names are retained.
