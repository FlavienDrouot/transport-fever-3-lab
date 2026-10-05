# Model, data and chart conventions

## Motion model

Each train starts at rest on level track. Force is `min(Fmax, P/v)`, bounded by its top speed. Maximum force is used at rest to avoid division by zero. Traction-limited acceleration, power-limited acceleration and steady speed are integrated analytically; distance-to-time inversion is analytical as well.

SI conversions: 1 kgf = 9.80665 N; 1 metric horsepower (ch) = 735.5 W. The picker shows kW, converted from `powerCh`. Charts and readouts use minutes:seconds, rounded to the nearest second; the model and CSV use seconds.

The model excludes resistance, grades, braking, stops, loading and variable formations. A few matching timings do not establish the game's full physics. Repeatable observations with accurately known distances would justify refining these assumptions.

## Data provenance

The catalogue contains 16 vehicle cards transcribed from game screenshots, including the Draisine. This is the captured catalogue, not a claim of completeness across game versions, mods or filters. The JSON retains original French values, source screenshot filenames, length, capacity, propulsion, normal-difficulty purchase/maintenance costs, loading/unloading multiplier, noise, pollution and comfort. No numeric scores are inferred from qualitative bars. Other difficulty multipliers and retirement dates are unknown. The year filter therefore means **introduced by this year**, not guaranteed availability to buy in the game.

Flowengineer's [multiple-unit race video](https://www.youtube.com/watch?v=KgUHw9Ya60M) inspired the project and provided initial observations. Those observations remain in the dataset as provenance and are not plotted or exported. Timings subtract a 32-second video offset; the Fuxing observation near 15 km / 247 s is approximate. Marker precision and video speed are not independently certified. Game screenshots and the conversation are not redistributed.

## Shared controls

Four trains are selected initially: Metroliner, RABe 502 Twindexx, TGV Duplex and Fuxing Hao. The picker initially sorts by introduction year, newest first. Search filters the list only. The 1900–2020 year filter affects charts, readouts and exports, retaining hidden selections for later years. Reset restores the initial selection and 2020. Selection is local to the page; there is no account or stored user profile.

Hover a curve or focus a catalogue row to highlight the same train across charts. On mobile, the native train-picker dialog traps focus and closes with Escape, its close button or backdrop; closing returns focus to the trigger.

## Distance and speed views

The route slider starts at 0.5 km in 0.1 km steps. Its ceiling is 20% past the estimated final arrival-order crossing, rounded up to 5 km, bounded between 5 and 30 km. The number field permits longer routes. With the default four trains the last ranking change is about 7.432 km; across all 16 it is about 100.979 km.

Distance over time ends when the last selected train reaches the target; its vertical ceiling is 110% of that distance. Time over distance ends at the target. Race readout always sorts individual arrival times at the target, with speed at arrival. Model transitions are expandable immediately below it.

Speed over time ends at 105% of the latest selected train's speed-cap time, independent of route distance. CSV and SVG exports are available for speed and distance/time charts. CSV includes the full sampled domain from zero; SVG reflects the selected axes and includes a legend.

Logarithmic axes crop small values: time starts at 10 s, distance at 0.1 km and speed at 10 km/h. For very small domains the floor becomes one tenth of the maximum. Zero stays in CSV but has no logarithmic position. Axis reversal preserves each quantity's scale choice.

## Crossover experiments

Crossings during acceleration are located numerically with mixed linear/log samples and bisection. The steady-speed tail uses analytical intersections. Very close crossings or almost-identical trains would justify a fully analytical solver before claiming a guaranteed exact cutoff.

**Arrival curves around crossovers** follows the leader envelope, not crossings among slower trains. Its window ends 15% beyond the last leader-change distance. If there is no leader change, it covers the leaders' acceleration to 105% of their speed-cap distance, at least 1 km. Distance over time puts the winner at the top; reversing the axes puts it at the bottom. Winning segments can be emphasized while others fade. Here, “best” means fastest, not cheapest or most comfortable.

Phase focus axes are continuous piecewise-linear transforms based on leader-change distances and arrival times. Intermediate intervals get equal space; the final stable tail gets 30% of a normal interval. These axes can create visual bends where a curve crosses a scale boundary. Orange grid lines and axis marks identify real scale changes; a single phase has none. Linear axes remove these scale effects. The display keeps real units and sparse vertical labels.

**Rank crossovers** starts at 100 m, discarding earlier crossings from the display without altering ranks after that point. Linear uses a uniform distance scale. All crossovers assigns equally spaced positions to all distinct ranking changes, including non-leaders; simultaneous crossings share a position. The final stable tail is compressed. The ranking domain includes later crossings that do not extend the arrival-curves domain.

The shared table below the crossover views gives leadership ranges and arrival time at each range's start. Infinity means the last leader/ranking persists in this model; the plotted tail itself is finite. No Pareto frontier or economic optimization is implemented.
