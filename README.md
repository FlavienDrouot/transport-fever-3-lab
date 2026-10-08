# TF3 Lab

**Compare trains in Transport Fever 3 and see when a faster train becomes the better choice for your route.**

[Explore the site](https://flaviendrouot.github.io/transport-fever-3-lab/)

An open-source, independent community project. Choose trains, adjust the route distance and explore their theoretical acceleration, arrival times and changes in ranking. The current catalogue contains 17 captured multiple units and railcars; it will grow as verified data becomes available.

## Start exploring

Switch between **Race** for travel-time comparisons and **Economics** for A–B–A service efficiency. **Data & models** presents the collected vehicle catalogue and model checks. Each view has its own section links; Race and Economics share the train selection.

1. Choose trains in the right-hand picker, or open **Trains** on mobile. The list is sorted by introduction year, newest first. Search by name and use the year slider to explore vehicles introduced by that date.
2. **Speed over time** shows acceleration and top speed.
3. **Distance & time** compares progress or arrival time. Set a route distance and read the arrival ranking in **Race readout**.
4. **Crossovers** reveals where the best choice changes. The arrival curves emphasize winning segments; the rank chart also shows overtakes among the other trains.
5. In **Economics**, **Line capacity** explores A–B–A passenger throughput per maintenance cost, with distance and utilization sliders. Optional target rate (per game year per direction) and frequency targets choose a whole fleet and report its actual utilization and frequency. Choose a maximum interval or the achievable interval closest to your target. Economics also supports infrastructure speed limits of 100, 160 or 350 km/h, optional coupling of identical multiple units when a frequency target is active, and an optional platform length limit. Distance, utilization and track speed stay visible; optional settings live under **Service targets & train composition**, with an active-settings summary when folded. The service readout shows trains, units per train, composition length and capacity, with short headings and units on a second line. **Show calculation details** reveals fleet costs, loading and cycle timing columns within the same table. Coupling minimizes frequency error at one-second display precision first, then fleet running costs; overlong units are explicitly excluded. These constraints do not change Race charts. The method explains maintenance cost per completed passenger journey, using four simulation seconds per day and 365 days per game year. Lower values indicate less maintenance for the same throughput. Provisional assumptions are shown beside the controls. **Running cost over distance** shows this ratio across distances. **Running cost around crossovers** emphasizes winning segments with phase focus, while **Economic rank crossovers** shows every train’s ranking changes.

6. **Data & models** provides downloadable catalogue data, measured/calibrated model assumptions and model-versus-video arrival checks. Evidence limitations are kept alongside the observations.
7. **Road** compares vehicles by **Freight / Passengers**. Freight compares compatible trucks (52 variants); Passengers compares buses (25). Enable **Include trams** to add compatible freight trams (9 variants) or passenger trams (21) to the same cost ranking, chart and detailed table. Choose freight specialization and introduction year; retirement dates are unknown. Set distance (slider: 0.1–5 km; longer values can be entered), utilization and an optional infrastructure speed cap. Freight supports loaded or empty returns and specialized terminal/warehouse handling bonuses (×2 each, ×4 together). Passenger service uses equal utilization in both directions and ignores freight bonuses. Costs are per delivered cargo unit or passenger journey on A–B–A. Handling factors are fixed at 0.0625 for freight and 1 for passengers, with 6 seconds of pauses per terminal when both unloading and loading occur, or 4 seconds for a single transfer operation; approximate MAN measurements support the freight factor, while bus/tram terminal timing needs independent validation; city routes with frequent stops, traffic and tight turns are not accurately modelled. At long distances the ranking approaches maintenance / (capacity × effective speed). Source JSON downloads are available under the method disclosure.

**Explore Train History** selects the complete catalogue and sets the year to 1900. Move the year slider or use the − / + buttons to advance one year at a time; newly introduced trains automatically enter the graphs.

Use the **moon / sun** navigation button to change the theme; your browser remembers the choice.

Methods, assumptions, chart reading guides and supplementary tables are folded by default in both views. Open their labelled sections for the full explanation or exact results.

Hover a curve or focus a train in the picker to identify it across the page. Try linear and logarithmic axes, or **Phase focus** to give crossover intervals more room. The rank chart's **All crossovers** mode spaces each ranking change equally, ignoring crossings before 100 m. Non-uniform axes show real values at their ticks, but their visual spacing is deliberately stretched.

Download CSV data or SVG charts from the speed and distance/time sections. There is no sign-in or saved user profile.

## What the comparisons mean

The model uses each train's mass, tractive effort, power and maximum speed. It assumes a standing start on level track, with maximum traction followed by maximum power and a speed cap:

```text
F(v) = min(Fmax, P / v)
```

It does not include braking, stops, slopes or resistance. “Best” in the race charts means **fastest for the distance**. The experimental **Line capacity** section instead compares passenger throughput per maintenance cost, including braking, sequential unloading and loading, and fixed delays at both terminals. Ticket revenue is excluded because the comparison equalizes passenger throughput on the same route: assuming the same fare per passenger, revenue is then identical. This assumption is supported by measurements on one route, not a complete game pricing formula. Purchase cost is excluded; optional service targets account for whole-train fleet rounding, and sufficient demand is assumed regardless of travel time. This can favor the low-maintenance Handcar, even when long journeys would make its assumed occupancy unrealistic. Purchase and maintenance values in the source dataset were recorded on normal difficulty. The year filter uses introduction dates; retirement dates are not known.

This is a proof of concept, not a complete simulation of the game. [Model and data notes](docs/model.md) explain assumptions, provenance and the experimental scales.

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

The Configurator displays original vehicle miniatures in its catalogue and composition cards. Complete formation previews reuse their component images in order. Game artwork is separate from the MIT-licensed code; see [the thumbnail notice](assets/vehicle-thumbnails/NOTICE.md).

Tram locomotive source cards are stored separately in [`data/tram-locomotives.json`](data/tram-locomotives.json) for a future consist calculator. The five records retain their captured costs and mechanical properties. Six passenger tram wagons are stored in [`data/tram-passenger-wagons.json`](data/tram-passenger-wagons.json), with capacity, handling and source values. Fifteen freight tram wagons are stored in [`data/tram-freight-wagons.json`](data/tram-freight-wagons.json), grouped by freight specialization. Open **Configurator**, choose **Tram**, then combine these components with powered passenger/freight trams. Save named compositions to compare them in **Road** with **Include trams** enabled. They can be edited, reordered or removed; definitions are retained in browser storage and their totals are recalculated from the current catalogue after reload. Actual coupling compatibility remains experimental. Individual wagons/locomotives are not ranked as standalone services.

The **Data & models → Collected catalogue** inventory also exposes collected installation metadata, including locomotives, wagons and future vehicles. All road and tram entries outside campaign content, plus the captured railway roster, are matched to the calculator and configurator datasets. Remaining internal railway components and other transport categories stay outside the calculators until their names and usable values have been resolved. See [the metadata import workflow](docs/development.md#import-a-collected-metadata-catalogue).

Thirty purchasable railway locomotives are stored in [`data/rail-locomotives.json`](data/rail-locomotives.json), combining condensed captures with uniquely matched extracted model values. EMD F-Unit and Chinese Class SS4G retain their complete two-element formation. All thirty are named in the Data & models catalogue; locomotives alone are not ranked as passenger services. All seventeen multiple units use extracted aggregate handling, including zero-loading-speed power cars and single-model articulated railcars.

The complete captured railway wagon roster contains 16 passenger carriages in [`data/rail-passenger-wagons.json`](data/rail-passenger-wagons.json) and 27 freight wagons in [`data/rail-freight-wagons.json`](data/rail-freight-wagons.json). Condensed captures supply identity, capacity, handling and purchase costs; matched extracted metadata supplies mass, model extent and maintenance. The British Mark 3 retains two equivalent internal resource references as one configurable choice. Together with the 30 locomotives and 17 multiple units, these form 90 choices in **Configurator → Rail**. Passenger compositions join Race and Economics; freight compositions join Race, as Economics currently models passengers. Route settings and the vehicle selection share the right panel in the analysis tabs; Data & models keeps the full-width inventory.
