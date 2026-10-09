# TF3 Lab

**Compare trains in Transport Fever 3 and see when a faster train becomes the better choice for your route.**

[Explore the site](https://flaviendrouot.github.io/transport-fever-3-lab/)

An open-source, independent community project. Choose trains, adjust the route distance and explore their theoretical acceleration, arrival times and changes in ranking. The current catalogue contains 17 captured multiple units and railcars; it will grow as verified data becomes available.

## Start exploring

The site has three spaces: **Compare**, **Design** and **Data & models**. Compare keeps **Race / Service** in fixed tabs. Race compares railway travel times; selecting it from Road switches back to Rail. In the comparison sidebar, **Rail / Road** selects the Service domain; Road currently offers Service only. Both domains use the same route. Design contains **Composition** for building trains and **Route** for editing that shared route. Data & models groups **Catalogue**, **Models** and **Checks**, including detailed methods, inspiration and experimental evidence. Existing `#race`, `#economics`, `#trucks`, `#configurator` and `#route-profile` links still open the corresponding view.

1. Launch **Avelia vs TGV** or **Avelia vs Fuxing** for a quick duel that keeps the current route, or choose trains in the right-hand picker (**Route & trains** on mobile). The list is sorted by introduction year, newest first. Search by name and use the year slider to explore vehicles introduced by that date.
2. **Speed over time** shows acceleration and top speed.
3. **Distance & time** compares progress or arrival time. Set a route distance and read the arrival ranking.
4. **Crossovers** reveals where the best choice changes. The arrival curves emphasize winning segments; the rank chart also shows overtakes among the other trains.
5. In **Compare → Rail → Service**, choose **Passengers / Freight** to explore A–B–A transport throughput per maintenance cost, with route and utilization controls. Freight uses your custom railway compositions: if no compatible train exists, an invitation opens Design → Composition in the chosen cargo context while preserving any existing draft. Freight costs are per delivered cargo unit, with empty or loaded return and separate terminal/warehouse bonuses at A and B. Its target rate is total cargo delivered per game year; the existing passenger target remains per direction. Freight copies whole configured trains without automatic recoupling. Optional target rate (per game year per direction) and frequency targets choose a whole fleet and report its actual utilization and frequency. Choose a maximum interval or the achievable interval closest to your target. Service also supports infrastructure speed limits of 100, 160 or 350 km/h, optional coupling of identical multiple units when both rate and frequency targets are active, and an optional platform length limit. The shared route summary and utilization stay visible; optional settings live under **Service targets & train composition**, with an active-settings summary when folded. Service opens with the lowest-cost train and its cost per transported unit, followed by a six-column service ranking (rank, train, unit cost, fleet, interval and rate). The table previews ten rows with an expand button and has no vertical scroll region. Composition dimensions and the remaining calculations live under Show calculation details; detailed methods and assumptions live in **Data & models → Models**. **Show calculation details** reveals loading and cycle timing columns within the same table; freight also reports handling rates and stop times separately for A and B. Coupling minimizes frequency error at one-second display precision first, then fleet running costs; overlong units are explicitly excluded. These constraints do not change Race charts. The method explains maintenance cost per completed passenger journey, using four simulation seconds per day and 365 days per game year. Lower values indicate less maintenance for the same throughput. Provisional assumptions are shown beside the controls. **Running cost over distance** shows this ratio across distances. **Running cost around crossovers** emphasizes winning segments with phase focus, while **Economic rank crossovers** shows every train’s ranking changes.

6. **Data & models → Catalogue** provides downloadable vehicle data; **Models** explains measured/calibrated assumptions; **Checks** presents direct increment and race checkpoint comparisons. Evidence limitations stay alongside the observations.
7. **Compare → Road → Service** uses the same **Passengers / Freight** mode selector in the analysis header as **Compare → Rail → Service**. Rail and Road retain their own category and service targets; the route is shared. Freight compares compatible trucks (52 variants); Passengers compares buses (25). Enable **Include trams** to add compatible freight trams (9 variants) or passenger trams (21) to the same cost ranking, chart and detailed table. Choose freight specialization and introduction year; retirement dates are unknown. Edit the shared route’s segment distances, gradients and speed limits in Design → Route, then set utilization. Freight supports loaded or empty returns and specialized terminal/warehouse handling bonuses (×2 each, ×4 together). Passenger service uses equal utilization in both directions and ignores freight bonuses. Costs are per delivered cargo unit or passenger journey on A–B–A. Handling factors are fixed at 0.0625 for freight and 1 for passengers, with 6 seconds of pauses per terminal when both unloading and loading occur, or 4 seconds for a single transfer operation; approximate MAN measurements support the freight factor, while bus/tram terminal timing needs independent validation; city routes with frequent stops, traffic and tight turns are not accurately modelled. At long distances the ranking approaches maintenance / (capacity × effective speed). Source JSON downloads are available in Data & models.

Use **Design → Composition** to change vehicles and quantities and immediately inspect the draft’s steady-running reference and transient curves. These curves describe one train at a uniform gradient, speed cap and utilization reference, independently of Rate, Frequency, platform and fleet targets. A single route segment supplies the reference gradient; with several segments the saved uniform reference is retained. A single segment also supplies the reference speed cap. Selected-route service results use every shared route segment. Open the current composition in Compare without saving it to try it against other vehicles; save it to keep it after reload. The comparison sidebar’s composition action opens Composition. **Design → Route** provides direct links back to Race or Service after a route change.

**Explore Train History** selects the complete catalogue and sets the year to 1900. Move the year slider or use the − / + buttons to advance one year at a time; newly introduced trains automatically enter the graphs.

Use the **moon / sun** navigation button to change the theme; your browser remembers the choice.

Short assumptions and chart guides remain beside the comparisons. Open **Data & models → Models** for the full methods and inspiration, or **Checks** for experimental observations. Supplementary calculation tables remain available beside their results.

Hover a curve or focus a curve label, legend entry or vehicle in either picker to identify it across the page. Try linear and logarithmic axes, or **Phase focus** to give crossover intervals more room. The rank chart's **All crossovers** mode spaces each ranking change equally, searching from 100 m or one tenth of the selected route on shorter routes. Non-uniform axes show real values at their ticks, but their visual spacing is deliberately stretched.

Both analysis pickers use the same search, ordering, selection counter, buttons and vehicle rows. Search changes the list only; selection changes the comparisons. Invalid numeric settings show a message and retain the last valid calculation until corrected. Info buttons open help on click or keyboard activation. The mobile data catalogue uses expandable vehicle summaries with all fields available inside.

Download CSV data or SVG charts from the speed and distance/time sections. There is no sign-in or saved user profile.

## What the comparisons mean

The model uses each train's mass, tractive effort, power and maximum speed. Traction is displayed in newtons in the picker and Composition; source captures retain kgf. The speed chart offers time or distance on its horizontal axis, stopping at arrival at B, with matching CSV/SVG exports. Hover or focus a train to see its phase-transition points and their coordinates. It assumes a standing start, with maximum traction followed by maximum power and a speed cap. The route is always an ordered A→B list of one to 24 segments, shared by Rail and Road; one segment describes a constant gradient and speed limit. Grades span −20% to +20% (default 0%) for both domains. **Design → Route** edits segment lengths, gradients and speed limits, with a symbolic elevation sketch. Select a segment in the sketch to edit its fields directly below the preview. Use the + buttons at the selected segment’s left or right edge to insert before or after it, the arrows to move it, or the trash icon to remove it. The right sidebar summarizes all segments, with add-after and remove controls on the selected row and add-at-end below the list. Length and grade have sliders alongside precise numeric fields; speed limits have 100, 160 and 350 km/h presets plus a numeric field for other values. Edits immediately update the shared route. You can switch the sketch's horizontal axis between equal segment widths and a linear distance scale. Elevation remains exaggerated; it is not a surveyed terrain map:

```text
a(v) = min(2 × Fmax, P / v) / m − 0.02 − g × sin(atan(grade / 100))
Step = 0.2 s; distance increment = (initial speed + final speed) / 2 × Step
```

Flat-track acceleration is calibrated against synchronized Avelia/TGV speed and distance measurements. Race includes constant resistance of 0.02 m/s² and excludes additional aerodynamic drag and terminal stops; a segment profile anticipates braking for lower track limits. Optional gradients add gravity using empty mass; this extension has not been calibrated against the game and is identified in control help. Positive grade climbs from A to B; A–B–A services reverse the segment order and grade signs. Rail speed remains continuous across boundaries and services stop only at A and B. Vehicles unable to climb are explicitly excluded from service results. Road applies each shared segment separately: its steady-speed model limits uphill speed by power and checks traction, while downhill remains speed-capped. It sums segment travel times on each leg and excludes acceleration and braking. Rail Race and passenger/freight Service share the calibrated motion model; Road retains its steady-speed calculation. “Best” in the race charts means **fastest for the distance**. Rail **Service** instead compares passenger throughput per maintenance cost, including braking, sequential unloading and loading, and fixed delays at both terminals. Ticket revenue is excluded because the comparison equalizes passenger throughput on the same route: assuming the same fare per passenger, revenue is then identical. This assumption is supported by measurements on one route, not a complete game pricing formula. Purchase cost is excluded; optional service targets account for whole-train fleet rounding, and sufficient demand is assumed regardless of travel time. This can favor the low-maintenance Handcar, even when long journeys would make its assumed occupancy unrealistic. Purchase and maintenance values in the source dataset were recorded on normal difficulty. The year filter uses introduction dates; retirement dates are not known.

Profile distance charts proportionally scale all segment lengths when varying the total distance; profile crossover searches are sampled and limited to the configured A–B route. Segment braking remains theoretical. This is a proof of concept, not a complete simulation of the game. [Model and data notes](docs/model.md) explain assumptions, provenance and the experimental scales.

## Inspiration and credit

The project was inspired by **[I Raced Every Multiple Unit in Transport Fever 3! Which one is the best?](https://www.youtube.com/watch?v=KgUHw9Ya60M)** by **[Flowengineer](https://www.youtube.com/@Flowengineer)**. Timings from that video helped validate the initial model. The charts now show theoretical curves, not video observations.

The project is unaffiliated with the game's publisher. Game and vehicle names belong to their respective owners; game screenshots are not redistributed here.

## Run locally

Requires Node.js 22+ and Python 3. No npm dependencies need installing.

```sh
git clone https://github.com/FlavienDrouot/transport-fever-3-lab.git
cd transport-fever-3-lab
npm test
npm run dev
```

Open http://127.0.0.1:4173. `npm run build` creates a static site in `dist/`. See [development and deployment](docs/development.md) for remote previews, repository structure and GitHub Pages.

## Support and contribute

- [Star the repository](https://github.com/FlavienDrouot/transport-fever-3-lab) if you find the explorer useful.
- [Open an issue](https://github.com/FlavienDrouot/transport-fever-3-lab/issues/new) to report a bug, request a feature or suggest verified train data.
- [Open a pull request](https://github.com/FlavienDrouot/transport-fever-3-lab/compare) to contribute code, documentation or data. Please include provenance for new specifications and relevant checks for changes.

- For other messages, [email Flavien](mailto:flavien.drouot@gmail.com).

Code is released under the [MIT licence](LICENSE).

The Composition displays original vehicle miniatures in its catalogue and composition cards. Complete formation previews reuse their component images in order. Game artwork is separate from the MIT-licensed code; see [the thumbnail notice](assets/vehicle-thumbnails/NOTICE.md).

Tram locomotive source cards are stored separately in [`data/tram-locomotives.json`](data/tram-locomotives.json) for a future consist calculator. The five records retain their captured costs and mechanical properties. Six passenger tram wagons are stored in [`data/tram-passenger-wagons.json`](data/tram-passenger-wagons.json), with capacity, handling and source values. Fifteen freight tram wagons are stored in [`data/tram-freight-wagons.json`](data/tram-freight-wagons.json), grouped by freight specialization. Open **Design → Composition**, choose **Tram**, then combine these components with powered passenger/freight trams. Save named compositions to compare them in **Road** with **Include trams** enabled. They can be edited, reordered or removed; definitions are retained in browser storage and their totals are recalculated from the current catalogue after reload. Actual coupling compatibility remains experimental. Individual wagons/locomotives are not ranked as standalone services.

The **Data & models → Catalogue** inventory also exposes collected installation metadata, including locomotives, wagons and future vehicles. All road and tram entries outside campaign content, plus the captured railway roster, are matched to the calculator and configurator datasets. Remaining internal railway components and other transport categories stay outside the calculators until their names and usable values have been resolved. See [the metadata import workflow](docs/development.md#import-a-collected-metadata-catalogue).

Thirty purchasable railway locomotives are stored in [`data/rail-locomotives.json`](data/rail-locomotives.json), combining condensed captures with uniquely matched extracted model values. EMD F-Unit and Chinese Class SS4G retain their complete two-element formation. All thirty are named in the Data & models catalogue; locomotives alone are not ranked as passenger services. All seventeen multiple units use extracted aggregate handling, including zero-loading-speed power cars and single-model articulated railcars.

The complete captured railway wagon roster contains 16 passenger carriages in [`data/rail-passenger-wagons.json`](data/rail-passenger-wagons.json) and 27 freight wagons in [`data/rail-freight-wagons.json`](data/rail-freight-wagons.json). Condensed captures supply identity, capacity, handling and purchase costs; matched extracted metadata supplies mass, model extent and maintenance. The British Mark 3 retains two equivalent internal resource references as one configurable choice. Together with the 30 locomotives and 17 multiple units, these form 90 choices in **Design → Composition → Rail**. Passenger compositions join Race and Service; freight compositions join Race and the Freight mode in Service. Route settings and the vehicle selection share the right panel in the Compare views; Data & models keeps the full-width inventory.
