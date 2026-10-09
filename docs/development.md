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
- `data/rail-locomotives.json`: 30 uniquely matched purchasable locomotives, including two complete two-element formations.
- `data/rail-passenger-wagons.json` / `data/rail-freight-wagons.json`: 16 passenger and 27 freight railway choices from condensed captures, including explicit equivalent British Mark 3 resource references.
- `data/source-catalogue.json`: staged installed-resource metadata; observations and source estimates remain distinct.
- `src/source-catalogue.js`: searchable source inventory, independent of calculator datasets.
- `scripts/import-source-catalogue.mjs`: deterministic schema-3 metadata importer with local paths and original source bodies omitted.
- `src/model.js`: calibrated 0.2-second rail increments with effective traction ×2 and resistance 0.02 m/s², extended by theoretical gravity. Bulk constant-traction segments and cached power-phase tables provide quadratic interpolation, fast inverse timing and speed-based service queries. Gradient adapters retain at most eight models per train; model-pair roots remain weakly cached. Calibration observations are in `data/experiments.json`.
- `src/gradient.js`: gravity, traction feasibility and directional steady road speeds. `src/gradient-control.js` mounts the shared bounded control, native validation and provisional-model help.
- `src/consists.js`: pure component-to-formation builder and tram / powered-multiple-unit source adapters.
- `src/consist-editor.js`: shared Rail/Tram Configurator, searchable component catalogue, ordered composition with quantities, totals and browser-stored definitions; saved compositions feed the existing analysis selectors. Duplication deep-copies a definition into an unsaved draft; catalogue filters are independent of draft compatibility.
- `src/vehicle-thumbnails.js`, `data/vehicle-thumbnails.json`, `assets/vehicle-thumbnails/`: original miniatures for every configurable choice; ordered formation previews reuse component images and display orientations.
- `src/phase-diagram.js`: shared renderer for all six Race, Economics and Road phase plots. Owns winner styling for horizontal rank plateaus, neutral vertical rank transitions, clipped curves, wide pointer hit areas, endpoint labels, single-line leader names with compact markers with a minimum 24 px hover target independent of narrow phase widths and full-name tooltips, compound paths grouped by vehicle/winner and shared SVG geometry for the visible stroke and hit target, foldable mobile legends. `src/chart-interactions.js` shares synchronized pointer/keyboard highlighting across classic and phase plots. Analyses supply model paths and axis/grid geometry; the application bridge updates the train picker without rebuilding the focused plot.
- `src/motion-chart.js`: shared motion abscissa/value mapping for speed/time, speed/distance and distance/time charts and CSV samples; physical transition coordinates and bounded hover/focus labels that avoid all transition markers and each other, including near plot edges. Markers are painted last; the transition table shares the graph’s equilibrium milestone. Speed ordinate bounds follow reached speeds with at most 5% rounding headroom (minimum domain 1 km/h). `chart-interactions.js` calls overlay hooks without rebuilding curves or losing keyboard focus.
- `src/scales.js`, `src/phase-scale.js`: linear, logarithmic and phase axes; phase lookup uses binary search.
- `src/race.js`, `src/crossovers.js`: horizons, crossings and ranking intervals. Pair roots use weak model caches and proven force/speed dominance shortcuts; the application shares one story for both phase views and slider limits. `speedViewSeconds` shortens only asymptotic speed-chart display to a 99% approach; physical timing retains its full tail. Regression tests check reuse by counted motion calls instead of machine-dependent timing thresholds.
- `src/route-profile.js`, `src/route-profile-control.js`: validated ordered rail segments, reverse traversal, finite 0.2-second motion with advance limit/terminal braking, cached trajectories and one accessible full-width editor in the Route profile tab. Race and Economics sidebars link to that editor. Its SVG sketches segment order and cumulative rise with equal-width or distance-linear horizontal scaling and exaggerated elevation; it is not a terrain map. The editor uses ordered rows with cumulative boundaries and per-row insert/reorder controls. Profile distance sweeps scale segment lengths; sampled crossover detection remains a documented limitation.
- `src/line.js`: experimental A–B–A capacity and maintenance calculations.
- `src/service-fleet.js`: whole-vehicle fleet sizing shared by road and railway services, including occupancy reduction under a fixed rate.
- `src/rail-freight.js`: freight A–B–A adapter and shared Economics dispatcher. Reuses `roundTripMotion` from `line.js` and the integer fleet solver; applies aggregate freight handling, independent A/B bonuses, total annual delivery targets and loaded/empty returns.
- `src/economic-selection.js`: passenger/freight cohorts, cargo/year/length/gradient exclusions, retained future selections and actionable empty states. Without a freight recipe, Economics hides results and opens Configurator with the appropriate context, preserving an existing draft.
- `src/rail-motion.js`: cached infrastructure speed caps and signed gradient models shared by Race and Economics; source models remain unchanged.
- `src/economic-chart.js`: cached service samples and standard efficiency curves.
- `src/economic-crossovers.js`, `src/economic-crossover-chart.js`: economic rankings by distance, year, utilization, target rate or target frequency, plus the shared value adapter used by Race introduction-year diagrams. Numeric fleet/composition changes are sampled; introduction years are discrete exact events.
- `src/app.js`: analysis views, domain loading, controls, service readout and race SVG charts; only the active analysis is rendered.
- `src/numeric-controls.js`: shared distance/year bindings and native validity feedback. Invalid settings retain the last valid calculation until every enabled input in the group is valid.
- `src/control-help.js`: visible help disclosures using existing descriptions or tooltip text.
- `src/data-loader.js`: deferred dataset loading, shared requests, success cache and retry after failure.
- `src/format.js`: common text escaping and number/time display formatting.
- `src/road-phases.js`: road cost/rank diagrams by year, distance or utilization, with shared economic crossover solving and exact introduction-year events. Fixed-rate sample costs use the shared fleet-count arithmetic without repeated validation/object creation. Consecutive equal-rank intervals and plateaus are merged; stepped cost curves sample every two SVG pixels rather than 51 times per arbitrarily narrow leadership phase. Sweeping the plotted parameter within a fixed domain updates only the current-setting marker; changing other inputs, scales, widths or domain invalidates the plot cache. The renderer supplies an intrinsic size for native content visibility, so offscreen diagrams do not incur full layout/paint. With a rate target the service readout updates immediately and phase refreshes debounce for 150 ms, coalescing input bursts while marking the panel aria-busy. Numerical crossover sampling retains its documented limitations around narrow fleet changes.
- `src/table-preview.js`: ten-item previews for Economics/Road details, Road bars and the collected catalogue table, with accessible expand/collapse buttons. Rows and bars remain in the DOM; the full compared cohort sets the bar scale; filtering updates the count and preserves the expanded state.
- `src/vehicle-styles.js`: catalogue-wide presentation colours/dashes, preserving existing styles when a selected subset is passed to the diagram renderer.
- `src/transport-category.js`: shared native Passengers/Freight control in the Economics and Road overview headers. Each view retains its own category and service settings; saving a custom composition updates the corresponding control without triggering another change event. Mobile vehicle drawers focus their own search field.
- `src/service-summary.js`: shared lowest-running-cost card for Economics and Road, showing all tied winners, the transported unit and costs with up to two decimal places. Empty results replace the card with the analysis message. Road route/return/handling context is retained in the table caption and calculation disclosure.
- `src/vehicle-selector.js`: shared Race/Economics/Road picker: search, year/name/speed ordering, accessible coloured checkboxes, selection counts and select/clear results. All vehicles (including saved compositions) start selected; filters hide choices without losing their selection, and Reset selects the full current catalogue. The containing panel/drawer owns vertical scrolling; the shared vehicle list has no independent scroll region. Road colours/dashes are assigned across the complete catalogue before filtering and selection, so the picker and phase diagrams use the same vehicle styles. Route and vehicle controls use native collapsible groups.
- `src/panels.js`: per-view side-panel visibility and shared native-dialog mobile drawers. Race/Economics combine route settings and the train picker in one panel; Road combines its vehicle selection and compact route settings with inline distance/speed fields, paired facility switches and individual info icons with hover tooltips, click/keyboard help and accessible descriptions; Configurator has its own carrier/category/cargo/year/search filters in the right panel. Data & models has no side panel and presents a single collected catalogue with native vehicle disclosures on mobile, alongside useful model checks. Captured train cards remain calculation and reconciliation inputs, without a separate table.
- `tests/`: model, data, scale, crossing and preview-server checks.
- `scripts/build.mjs`: copies public site files into ignored `dist/`.

Use the existing vanilla JavaScript patterns. Keep the physical model independent of rendering. Add a train with a unique ID, positive physical parameters, an introduction year, a distinguishable colour/dash and documented provenance. Do not publish game screenshots without permission. The catalogue is not virtualized; revisit that choice only if a substantially larger real catalogue shows measurable slowdowns.

## Deferred data and recovery

Startup loads `trains.json` for Race and Economics. The first Road visit loads trucks, buses and trams; the first Configurator visit loads the rail/tram components, powered trams and thumbnail index. Saved compositions trigger that configuration load in the background after startup so their definitions can be restored against the current catalogue. Successful dataset requests are reused across domains.

Data & models loads the inventory and experiments independently; motion checks use the already loaded trains. Road, Configurator, inventory and experiments each show a local error and retry button on failure. Missing thumbnails leave the composition editor usable without images. Route/filter controls remain inert while their data loads; drawer close buttons stay available. A failure of the core train dataset still prevents startup. Revisit that dependency if an independent Road-only entry point is required.

The two comparison pickers use `src/vehicle-selector.js` for their entire search, order, count, action and row presentation. Domain adapters supply eligible vehicles, selected IDs and descriptive values. Pointer and keyboard identification use the same row event bindings. Selection updates retain focus and scroll when the displayed catalogue is unchanged.

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

Road and tram entries outside campaign content are all linked to their calculator/configurator records. Thirty purchasable railway locomotives are also matched; capture-confirmed EMD F-Unit and SS4G formations are listed with their whole-locomotive totals, while their raw component records stay separate. Reconciliation emits `displayValues` from those records so the inventory uses the same capacities, costs and dimensions, including DLC resources with omitted source fields. Raw metadata remains unchanged. Maintenance from the checked source formula is usable alongside captured maintenance; public rows show values without origin/status badges. All 43 captured railway wagon choices are matched too, covering the 41 standalone wagon resources plus the Swiss DPZ and British Mark 3 models stored with multiple units. Air/water and remaining internal railway components require separate checks before entering calculators. All seventeen captured multiple units now match their resources or ordered formations and use the extracted component handling sum; the visual car count is retained separately and is not multiplied into that sum.

### Reconcile captured names

`scripts/reconcile-catalogue-names.mjs` compares source metadata with the existing captured datasets and `data/vehicle-name-observations.json` (additional identity-only evidence). Costs are excluded from detailed-card matching because capture difficulty may differ. Condensed locomotive matching requires a unique agreement in year, speed, power and exact normal-scale purchase cost; mass, length and traction copied from source are never independent evidence. Condensed wagon matching requires year, speed, capacity and exact normal-scale purchase cost to agree, plus handling whenever present in source; candidates must be unpowered wagons with compatible cargo classes. Missing source handling is supplied by the capture (1899 universal freight wagon: 1×). Source IDs are kept; matching names and their capture references are recorded separately from runtime validation. Re-run reconciliation after importing a new export or correcting a card. `--details` emits candidate evidence to stdout for review; keep one-off results in the private work-vault or GitHub rather than the product repository.

For condensed-capture additions, `dataProvenance.observedFields` limits identity evidence to fields actually visible in the capture. Source-backed mass, traction and bounding-box length never count as independent confirmation. Stadler Citylink, Stadler TINA and the 2030 articulated freight tram use this path: five observed identity fields and an exact purchase-price check, with annual maintenance retained as a source-formula value.

Matching requires the same category and introduction year, compatible source cargo classes, and at least five concordant characteristics within display-rounding tolerances. Missing values provide no evidence. Source conversion capacity candidates are rounded per model before aggregation/matching, consistent with the detailed rail and road captures. Explicit cargo classes take precedence; absent bus classes imply passengers, and absent truck/tram classes can be inferred from exact `_box`, `_bulk`, `_stake` or `_tank` resource suffixes. This fallback never overrides contradictory explicit classes. Significant capacity, mass, speed, power or traction differences block an automatic association. Source bounding-box lengths and inferred per-car formation handling are secondary: differences are retained but may be accepted with at least five other concordant characteristics for model extents, or six for formation handling. A unique candidate is required; ties and conflicting captured names remain unresolved. The British Mark 3 is an explicit exception: its two documented internal resources must agree in every calculator fingerprint field and both costs, and must be the entire matching candidate set. They retain separate raw identities but one configurable choice. Additional duplicates or divergent physical properties invalidate that equivalence; the rule is not generalized to other ambiguous resources. Unmatched candidates, disagreements and provenance remain in the metadata JSON for maintenance, without per-row diagnostic disclosures in the public catalogue. Source and captured names remain searchable via their resource IDs and translation keys.

Multiple-unit candidates resolve every ordered component ID within its source directory before comparing aggregate physical characteristics; repeated cars are counted repeatedly. A matched formation name is not copied onto its component records. This aggregation is for identity evidence only: it does not validate coupling, purchase availability or calculator handling. Resolve those through in-game observations before promoting entries into calculators. Existing screenshot-confirmed names are retained.

## Custom compositions

Configurator loads both acquired rail and tram adapters into the same composition builder. Carrier and transport category prevent mixing rail/tram or passenger/freight capacities. All freight selects general-purpose vehicles that can carry every freight type in Configurator, Road and railway Freight Economics. Specific freight-group filters also include these general-purpose components alongside the matching specialized vehicles. Specialized compositions require an explicit cargo group; incompatible specializations are rejected. Catalogue filters preserve the draft's carrier/category/cargo context and ordered components; incompatible additions are rejected. New composition explicitly starts a draft in the selected catalogue context. The year filter can make a draft component unavailable without deleting it. Saved recipes keep ordered resource references and quantities; totals are recalculated, not persisted. The browser storage key is `tf3-compositions-v1`; definitions are limited to 100 compositions and 100 rows each, with 1–1,000 vehicles per row. Invalid, obsolete or incomplete definitions are skipped on restore. If storage is unavailable, compositions remain usable until reload and the save status explains this. Existing records can be edited or deleted; Data & models remains installation source data.

Rail passenger compositions join Race and Economics. Rail freight compositions join Race and Freight Economics; passenger and freight cohorts remain separate. Tram compositions join Road when Include trams and the year/category/cargo filters match; saving a tram sets those filters to its context. Road checkboxes determine both the current ranking and all phase diagrams; search only narrows the picker. Custom compositions use explicit aggregate handling and disable automatic recoupling. Freight Economics compares delivery cost with train acceleration/braking, terminal/warehouse bonuses at each stop and loaded/empty returns. Saving a rail composition selects the matching economic category and cargo filter. The annual freight target counts deliveries across both legs when return is loaded, while passenger demand remains per direction. No default freight recipes are manufactured. All five economic axes dispatch through the same service model; freight and passenger rendering reuse the same charts and phase component. Actual in-game coupling restrictions and model-extent lengths retain the existing limitations.

Custom composition rows in the shared vehicle picker have a separate pencil button, outside the selection label, which opens the saved recipe in Configurator and focuses its name without changing selection. The same editor loader handles these shortcuts and the existing Edit/Duplicate actions. Saved recipes and route/service parameters are preserved.

### Vehicle miniatures

The configurator catalogue and composition cards display the original purchase-list miniatures, including complete ordered previews for extracted formations. Metroliner and SS4G repeat the same motor-section image with the rear section mirrored; Avelia uses its dedicated rear miniature. Single-model articulated vehicles retain their supplied whole-vehicle image. Quantity controls count complete configurable choices, independently of the number of images in a formation preview. Mechanical and economic totals are unaffected.

To refresh from a private Windows collection, run `python3 scripts/import-thumbnails.py /absolute/path/to/tf3-vehicle-thumbnails.zip`. The importer uses exact resource references and the existing identity reconciliation, verifies PNG hashes and original-size lossless conversions, and requires coverage of every configurator choice before writing. It copies only needed PNGs and a compact index with source identity, dimensions and checksums; original TGA files, campaign miniatures, unrelated vehicles and the complete private manifest stay in the input package. Keep that package under `.git/tf3-imports/` or another private location. The static build includes `assets/`; the development server permits only hashed PNG filenames in the thumbnail directory and continues to reject private imports. See `assets/vehicle-thumbnails/NOTICE.md` for artwork attribution separate from the code licence.
