# TF3 Lab

**Compare vehicles in Transport Fever 3, build trains and routes, and experiment with travel time and service costs.**

[Explore the site](https://flaviendrouot.github.io/transport-fever-3-lab/)

An open-source, independent community project for railway and road comparisons. Explore modelled acceleration, arrival times and changes in ranking using captured specifications and documented experiments.

## Start exploring

The site has three spaces: **Compare**, **Design** and **Data & models**. Compare keeps **Race / Service** in fixed tabs. The sidebar’s **Rail / Road** and **Passengers / Freight** selectors apply to both views; switching domain keeps the transport category. Each domain retains its own vehicle selection, year and service targets. The route is shared.

1. Try **Avelia vs TGV** or **Avelia vs Fuxing** for a passenger-train duel on the current route, or choose vehicles in **Route & vehicles**. Search, sort and filter by introduction year without losing hidden selections.
2. **Race** shows acceleration, distance/time, arrival rankings and crossovers. On a constant-grade/limit route, the speed chart focuses on acceleration independently of route length. On a changing route, it follows the route to B. Freight railway comparisons use your compositions; an empty catalogue invites you to build one.
3. **Service** compares Running costs per transported capacity on A–B–A. Set **Utilization**, then optionally **Targets & constraints** to size a whole fleet for Rate or Frequency. With Freight selected, open **Freight handling & facilities** for Loaded return and separate Terminal/Warehouse bonuses at A and B. Rail also offers coupling of identical multiple units and a maximum train length. These targets do not change Race or the single-train composition curves. **Show calculation details** reveals cycle timing and handling.
4. **Simple / Custom route** switches between quick distance, gradient and speed settings and the route designed from segments. Each keeps its settings during the session. Opening the route editor leaves the active route unchanged; editing or **Use this route** activates the custom route. Route presets are 100/160/350 km/h for Rail and 50/80/120 for Road; the numeric limit accepts 10–350 km/h. Changing domain changes the suggestions, preserving the actual limit.
5. **Design → Composition** assembles railway or tram vehicles and quantities, then shows a steady-running reference and transient curves. These describe one train at uniform gradient, limit and utilization, independently of route segments and service targets. **Route & service** uses the active shared route and offers the same Simple/Custom switch. Open a valid draft in Compare to experiment without saving; **Save composition** keeps it in browser storage after reload. Tram compositions appear in Road with **Include trams** enabled.
6. **Design → Route** edits one to 24 segments, with a symbolic elevation sketch, direct segment selection and insert/move/remove actions. Grades span −20% to +20%, segment lengths start at 10 m, and the total route is limited to 100 km. Choose equal segment widths or linear distance; elevation is exaggerated.
7. **Data & models → Catalogue / Models / Checks** groups downloadable specifications, calculation methods, inspiration and experimental evidence. Short help remains beside the controls and charts.

Hover or focus a curve, label or vehicle to identify it across the page. Linear/log axes and **Phase focus** make different parts of the comparisons easier to inspect. Invalid numeric settings retain the last valid calculation and show a message. Download CSV or SVG from the speed and distance/time sections. The theme and saved compositions persist locally; Simple/Custom routes last only for the current session. There is no sign-in or automatic composition optimizer.

## What the comparisons mean

Motion uses empty mass, traction, power and maximum speed. Displayed traction stays in newtons; the acceleration model applies an effective ×2 multiplier. Each 0.2-second step updates speed and advances using the mean of initial and final speed:

```text
a(v) = min(2 × Fmax, P / v) / m − 0.02 − 0.38 × g × sin(atan(grade / 100))
```

Flat rail acceleration is calibrated against synchronized Avelia/TGV measurements. Initial MAN road tests and one TGV Duplex run on a displayed 5% slope support the shared provisional gravity factor of 0.38. Other vehicles, slopes and formations still need checks. Rail braking remains a provisional 2.5 m/s², anticipating lower segment limits; services stop at A and B, while Race ends at B without a terminal stop. Road acceleration uses the same structure, but braking is omitted: the available MAN/FAW stopping tests do not establish a common constant deceleration. Road lower limits apply instantly, and each service leg restarts without adding stopping time or distance. Tram motion needs independent calibration.

“Best” in Race means fastest for the distance. Service means lowest Running costs per transported capacity, including travel, handling, terminal pauses and optional whole-fleet rounding. Passenger target Rate is per direction; freight target Rate counts loaded deliveries. Road passenger tables report total Rate across both directions. Facilities double handling at each selected stop, with terminal and warehouse bonuses stacking to ×4. Capacity denotes transported load in cost denominators. Costs use four simulation seconds per day and 365 days per game year, at normal difficulty.

Purchase, infrastructure, traffic, queues, ticket revenue and demand generated by travel time are excluded. Assuming sufficient demand can favour slow, low-maintenance vehicles even when their real occupancy would be unrealistic. Introduction years are known; retirements are not. Distance sweeps proportionally scale custom segment lengths; crossover searches are sampled and may miss narrow fleet boundaries. [Model and data notes](docs/model.md) describe the evidence and conditions for revisiting these assumptions.

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
