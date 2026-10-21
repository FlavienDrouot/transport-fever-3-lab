# TF3 Lab

**Compare vehicles in Transport Fever 3, build trains and routes, and experiment with travel time and service costs.**

[Explore the site](https://flaviendrouot.github.io/transport-fever-3-lab/)

An open-source, independent community project for railway and road comparisons. The results come from a motion model calibrated against in-game measurements, using captured vehicle specifications.

## What you can do

The site has three spaces: **Compare**, **Design** and **Data & models**. A short guide at the top of Compare suggests where to start.

- **Race**: which vehicle is fastest? The answer comes first (winner, time and margin), then speed and distance over time. **Where the lead changes** shows overtakes and the ranking at each distance.
- **Service**: which vehicle is cheapest to run? It ranks Running costs per transported capacity on an A–B–A line. Set **Utilization**, a **Rate** or a **Frequency** to size a whole fleet; Freight adds loaded return and terminal/warehouse bonuses.
- **Composition** (*Build your own train*): assemble locomotives, multiple units, wagons or trams, check their performance, then race or compare them without saving.
- **Route**: draw the line from a starting shape (flat, climb, mountain pass…) with grades and speed limits per segment. Optionally declare what it carries: stops, trips with an annual Rate, buildings, storage and existing tracks or roads. Race, Service, Composition and the Optimizer then use these declarations, including the stops vehicles make along the line.
- **Optimizer** (experimental): enter a Rate and constraints, and it searches the cheapest Rail and Road fleets, optionally with the upkeep of new tracks, roads and stations.
- **Data & models**: the vehicle catalogue (downloadable), the calculation methods and the measurements behind them.

Every comparison uses either a quick **Simple** route (distance, grade, speed limit), the **Custom** route from Design, or **∞**, which extends charts until the ranking stops changing. **Share link** copies a link to the current comparison. Your theme and saved compositions stay in this browser; there is no sign-in.

## What the results mean

- **Fastest** means the shortest time over the distance. **Cheapest** means the lowest Running costs per transported capacity, including travel, loading and unloading, and whole-vehicle fleet rounding.
- Motion uses empty mass, traction force, power and top speed, with a 0.2-second step:

  ```text
  a(v) = min(2 × Fmax, P / v) / m − 0.02 − 0.38 × g × sin(atan(grade / 100))
  ```

  Rail acceleration and braking (2.5 m/s²) are calibrated on direct in-game measurements. Road braking is not modelled.
- **Not included**: purchase prices, ticket revenue, demand, traffic and queues. Road travel times are often underestimated, since traffic and slowing for bends are not modelled. Infrastructure costs only appear in the Optimizer, as upkeep (no construction cost).

Details, assumptions and limits: [model and data conventions](docs/model.md).

## Data

Vehicle specifications come from in-game captures matched with extracted game files, at normal difficulty. They cover the passenger and freight trains, locomotives, wagons, multiple units, buses, trucks and trams of the base game, excluding campaign content. The JSON files are in [`data/`](data/); see the [data provenance](docs/model.md#data-provenance) section for how they are matched and what remains outside the calculators.

## Inspiration and credit

The project was inspired by **[I Raced Every Multiple Unit in Transport Fever 3! Which one is the best?](https://www.youtube.com/watch?v=KgUHw9Ya60M)** by **[Flowengineer](https://www.youtube.com/@Flowengineer)**. Timings from that video helped validate the initial model.

The project is unaffiliated with the game's publisher. Game and vehicle names belong to their respective owners; game screenshots are not redistributed here. Vehicle miniatures are game artwork, separate from the MIT-licensed code; see [the thumbnail notice](assets/vehicle-thumbnails/NOTICE.md).

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
