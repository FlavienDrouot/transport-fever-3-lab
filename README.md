# TF3 Lab

**Compare trains in Transport Fever 3 and see when a faster train becomes the better choice for your route.**

[Explore the site](https://flaviendrouot.github.io/transport-fever-3-lab/)

An open-source, independent community project. Choose trains, adjust the route distance and explore their theoretical acceleration, arrival times and changes in ranking. The current catalogue contains 16 captured multiple units and railcars; it will grow as verified data becomes available.

## Start exploring

1. Choose trains in the right-hand picker, or open **Trains** on mobile. The list is sorted by introduction year, newest first. Search by name and use the year slider to explore vehicles introduced by that date.
2. **Speed over time** shows acceleration and top speed.
3. **Distance & time** compares progress or arrival time. Set a route distance and read the arrival ranking in **Race readout**.
4. **Crossovers** reveals where the best choice changes. The arrival curves emphasize winning segments; the rank chart also shows overtakes among the other trains.

Hover a curve or focus a train in the picker to identify it across the page. Try linear and logarithmic axes, or **Phase focus** to give crossover intervals more room. The rank chart's **All crossovers** mode spaces each ranking change equally, ignoring crossings before 100 m. Non-uniform axes show real values at their ticks, but their visual spacing is deliberately stretched.

Download CSV data or SVG charts from the speed and distance/time sections. There is no sign-in or saved user profile.

## What the comparisons mean

The model uses each train's mass, tractive effort, power and maximum speed. It assumes a standing start on level track, with maximum traction followed by maximum power and a speed cap:

```text
F(v) = min(Fmax, P / v)
```

It does not include braking, stops, slopes or resistance. “Best” currently means **fastest for the distance**, rather than lowest cost or best overall service. Purchase and maintenance values in the source dataset were recorded on normal difficulty. The year filter uses introduction dates; retirement dates are not known.

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
