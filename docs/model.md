# Model, data and chart conventions

## Motion model

Each train starts at rest on level track. Force is `min(Fmax, P/v)`, bounded by its top speed. Maximum force is used at rest to avoid division by zero. Traction-limited acceleration, power-limited acceleration and steady speed are integrated analytically; distance-to-time inversion is analytical as well.

SI conversions: 1 kgf = 9.80665 N; 1 metric horsepower (ch) = 735.5 W. The picker shows kW, converted from `powerCh`. All charts identify every selected train, including the full catalogue. Wide charts use curve-end names; mobile charts use colored legends to preserve plot space, with arrival labels also kept above the distance/time chart. Hovering changes emphasis rather than hiding names. Charts and readouts use minutes:seconds, rounded to the nearest second; the model and CSV use seconds.

The motion model excludes resistance, grades, braking, stops, loading and variable formations. The separate line-capacity analysis adds terminal handling time without changing the motion curves. A few matching timings do not establish the game's full physics. Repeatable observations with accurately known distances would justify refining these assumptions.

## Data provenance

The catalogue contains 16 vehicle cards transcribed from game screenshots, including the Handcar (labelled “Draisine” in the original French capture). This is the captured catalogue, not a claim of completeness across game versions, mods or filters. The JSON retains original French values, source screenshot filenames, length, capacity, propulsion, normal-difficulty purchase/maintenance costs, loading/unloading multiplier, noise, pollution and comfort. No numeric scores are inferred from qualitative bars. Other difficulty multipliers and retirement dates are unknown. The year filter therefore means **introduced by this year**, not guaranteed availability to buy in the game.

Flowengineer's [multiple-unit race video](https://www.youtube.com/watch?v=KgUHw9Ya60M) inspired the project and provided initial observations. Those observations remain in the dataset as provenance and are not plotted or exported. Timings subtract a 32-second video offset; the Fuxing observation near 15 km / 247 s is approximate. Marker precision and video speed are not independently certified. Game screenshots and the conversation are not redistributed.

## Shared controls

The primary navigation separates **Race** (motion, arrival and crossover comparisons) from **Economics** (service model, efficiency and throughput), with **Data & models** for the catalogue and experimental observations. Section links change with the active view. Hash links open the appropriate view, including direct links to economic charts. Train selection, year, highlight and route distance remain shared across views.

Six trains are selected initially: Metroliner, RABe 502 Twindexx, TGV Duplex, Fuxing Hao, ICE 1 and Italian Class ETR 450. The picker initially sorts by introduction year, newest first. Search filters the list only. The 1900–2020 year filter affects charts, readouts and exports, retaining hidden selections for later years. Explore Train History selects every train, clears search and sets 1900, so future introductions automatically enter the charts as the year advances. Previous/next year buttons change the year by one and disable at 1900/2020. All three selection actions share one row. The always-visible service readout reserves a fixed viewport-bounded height with its own scroll; optional tables grow with their contents when opened; arrival-label space is based on the full catalogue, keeping subsequent charts stable as years reveal more trains. Reset restores the initial selection and 2020. Light/dark mode follows the system preference until the moon/sun navigation toggle is used; that choice is stored in the browser. Charts and controls adapt together, while exported SVG files retain their light background. Selection is local to the page; there is no account or stored user profile.

Hover a curve or focus a catalogue row to highlight the same train across charts. On mobile, the native train-picker dialog traps focus and closes with Escape, its close button or backdrop; closing returns focus to the trigger.

## Distance and speed views

The route slider starts at 0.5 km in 0.1 km steps. Its ceiling is 20% past the estimated final arrival-order crossing, rounded up to 5 km, bounded between 5 and 30 km. The number field permits longer routes. With the original four-train comparison the last ranking change is about 7.432 km; across all 16 it is about 100.979 km.

Distance over time ends when the last selected train reaches the target; its vertical ceiling is 110% of that distance. Time over distance ends at the target. Race readout always sorts individual arrival times at the target, with speed at arrival. Model transitions are expandable below Speed over time and show both time (minutes:seconds) and distance for the end of maximum traction (metres) and reaching top speed (kilometres), independent of the route slider.

Speed over time ends at 105% of the latest selected train's speed-cap time, independent of route distance. CSV and SVG exports are available for speed and distance/time charts. CSV includes the full sampled domain from zero; SVG reflects the selected axes and includes a legend.

Logarithmic axes crop small values: time starts at 10 s, distance at 0.1 km and speed at 10 km/h. For very small domains the floor becomes one tenth of the maximum. Zero stays in CSV but has no logarithmic position. Axis reversal preserves each quantity's scale choice.

## Crossover experiments

Crossings during acceleration are located numerically with mixed linear/log samples and bisection. The steady-speed tail uses analytical intersections. Very close crossings or almost-identical trains would justify a fully analytical solver before claiming a guaranteed exact cutoff.

**Arrival curves around crossovers** follows the leader envelope, not crossings among slower trains. Its window ends 15% beyond the last leader-change distance. If there is no leader change, it covers the leaders' acceleration to 105% of their speed-cap distance, at least 1 km. Distance over time puts the winner at the top; reversing the axes puts it at the bottom. Winning segments can be emphasized while others fade. Here, “best” means fastest, not cheapest or most comfortable.

Phase focus axes are continuous piecewise-linear transforms based on leader-change distances and arrival times. Intermediate intervals get equal space; the final stable tail gets 30% of a normal interval. These axes can create visual bends where a curve crosses a scale boundary. Orange grid lines and axis marks identify real scale changes; a single phase has none. Linear axes remove these scale effects. The display keeps real units and sparse vertical labels.

**Rank crossovers** starts at 100 m, discarding earlier crossings from the display without altering ranks after that point. Linear uses a uniform distance scale. All crossovers assigns equally spaced positions to all distinct ranking changes, including non-leaders; simultaneous crossings share a position. The final stable tail is compressed. The ranking domain includes later crossings that do not extend the arrival-curves domain.

The shared table below the crossover views gives leadership ranges and arrival time at each range's start. Infinity means the last leader/ranking persists in this model; the plotted tail itself is finite. No Pareto frontier or network-wide economic optimization is implemented.

## Experimental A–B–A line capacity

Line capacity uses the active selection and shared one-way distance, including the Handcar when selected. Its unusually low maintenance can dominate the theoretical efficiency metric. The model assumes enough demand to sustain the selected occupancy regardless of journey duration; it does not model how longer trips reduce attractiveness and demand. In particular, slow Handcar service on long routes may attract too few passengers to achieve the assumed throughput. This ranking is conditional on occupancy, not a complete line recommendation. Users can deselect the Handcar for a comparison of other trains. Without service targets, one empty-mass train runs continuously with equal average occupancy in both directions, unlimited demand and a suitable platform. Optional flow and interval targets dimension a fleet as described below. Each leg starts and ends at rest. Fares, purchase costs, traffic and variable waits for late passengers are excluded. Race and crossover charts remain standing-start comparisons without braking or stops.

Let `N = passengerCapacity × occupancy`, `S = loadingUnloadingSpeedMultiplier`, `C = carCount`, and `r = baseRate × S × C`. Every counted car is provisionally assumed to contribute the same displayed multiplier. Formations supplied by Flavien cover all 16 catalogue trains; they are recorded in the dataset. The original four-car loading experiment used a locomotive and wagons, not the Autorail Uerdingen.

At each terminal everyone unloads, then the next group boards. Both transfers use the same base rate, default **1 passenger/s per multiplier unit**. Metroliner measurements with two cars at 1.5× yielded 38 passengers in approximately 12.45 seconds in continuous simulation, close to the predicted 12.67 seconds. A Roter Pfeil with one car at 5× transferred 19 additional passengers in 19 steps (3.8 seconds). Observed occasional waits for the last passengers are not included in this ideal throughput.

Fixed terminal delays default to **6 seconds**: 2 before unloading, 2 before loading and 2 before departure. Observed departure delays around 2–2.5 seconds remain an approximate calibration rather than a precise universal claim. Equal per-car contribution and these delay assumptions should be revisited if repeatable measurements of other formations disagree.

Constant braking defaults to **2.5 m/s²**. A simulation step was calibrated at 0.2 seconds by 200 steps over 1 km at constant 90 km/h. Braking took 50 steps from 90 km/h; the Metroliner took 87 steps from an observed 158 km/h, consistent with this deceleration. To preserve route distance, the analysis solves for the motion-model time `t` such that `distance(t) + speed(t)²/(2 × deceleration) = route distance`. Leg duration is `t + speed(t)/deceleration`. Short routes brake before top speed; the whole braking duration is not simply added to the original race time. Track speed limits are not yet modelled; measuring travel on restricted track would justify adding that control.

```text
terminalSeconds = 2 × N/r + fixedDelays
roundTripSeconds = 2 × travelSecondsIncludingBraking + 2 × terminalSeconds
journeysPerSecond = 2 × N / roundTripSeconds
journeysPerHour = journeysPerSecond × 3600
maintenancePerThroughput = annualMaintenance / journeysPerHour
transportPerMaintenance = journeysPerHour / annualMaintenance
maintenancePerJourney = annualMaintenance / (journeysPerSecond × 1460)
efficiency = journeysPerSecond / annualMaintenance  # internal ranking score
```

Both directions count as journeys, not unique passengers. An hour is 3,600 simulation seconds. The displayed absolute value is `annualMaintenance / (journeysPerSecond × 1460)`, in maintenance dollars per completed passenger journey; lower is better. Flavien supplied the calendar conversion: four simulation seconds per day and 365 days per game year, or 1,460 seconds. This assumes continuous operation at that calendar speed. An outward journey and return are counted separately. The value does not depend on selected competitors and excludes purchase cost and fares. The hourly ratios remain available in the model; the internal ranking score remains `journeysPerSecond / annualMaintenance`, giving the same ordering. The service readout reports passenger journeys per game year and direction, using the same 1,460-second conversion. Zero occupancy gives no best choice. Costs use normal difficulty and one continuously operated train.

A visual drag race between identical trains carrying 60 and two passengers showed no observable acceleration difference; passenger mass is omitted. Reproducible timing differences would justify revisiting this choice. The occupancy slider ranges from 1% to 100%, keeping all economic views visible when reducing occupancy. Distance and occupancy controls are local to the page; distance uses a slider from 0.5 to 30 km, extending to accommodate longer distances entered in its adjacent number field or in the race section. Calibration parameters are fixed model defaults, not editable page controls.

The method introduction explains the ratio before the controls, with a numerical example and a subsection on revenue exclusion. On the same station pair, equalizing throughput across proportional fleets makes revenue identical if fares per passenger are identical. Measurements on one route support this fare assumption, but do not establish the full game pricing formula. The comparison excludes purchase cost, congestion and endogenous demand changes; it does not claim to rank the profit of individual trains.

## Economic curves

Both Race and Economics use native, closed-by-default disclosures for model explanations, chart reading guides and supplementary result tables. The service readout table remains visible at all times. Short graph conclusions, controls and the economic winner stay visible. Links to Model & inspiration or Method & service open the relevant explanation; disclosures remain open while filters change. Tables inside disclosures grow naturally with their rows and keep horizontal scrolling when needed. The always-visible service readout retains a fixed height and its own vertical scroll for history exploration.

The service heading, distance and occupancy sliders, and the short service context stay sticky above the economic readout and graphs. Detailed assumptions, demand caveats, calibration, service-table definitions and economic chart reading guides share one disclosure immediately below the controls. Revenue exclusion is a subsection of the calculation explanation. Race route guidance is grouped with the model; the crossover charts share one reading guide. The block sits below the desktop navigation and uses at most half the viewport (42% on mobile), with its own scroll when the full notes do not fit. Anchor offsets account for its measured height so linked graph headings remain visible.

The standard efficiency chart samples the A–B–A model at 161 one-way distances up to the selected route distance. The lower bound is 0.5 km, or one tenth of the selected distance on short routes, to preserve a nonzero domain. A vertical marker identifies the selected route. Occupancy is shared with the service readout. Curves show the maintenance cost per passenger journey at each sampled distance, with the lowest curve representing the best result. Values are comparable across distances and remain unchanged when competitors are added or removed. Throughput remains available in the service readout as passenger journeys per 3,600 simulation seconds. The standalone throughput chart was removed because capacity dominates it and multiple trains can compensate for an individual train’s throughput. Demand caveats apply to all economic graphs.

The standard efficiency chart offers linear or logarithmic vertical scales; the horizontal distance scale is linear. Log scales crop values below the displayed minimum, with a floor bounded by one ten-thousandth of the chart ceiling. Zero occupancy has zero throughput and efficiency and cannot appear on a log scale. Empty selections display an explanatory message. Curves and legends share hover highlighting with the picker. Service samples are cached between hover events and recalculated when selection, occupancy or domain changes.

### Economic crossover views

Economic crossovers compare the same throughput-per-maintenance score. All pairwise ranking changes within **0.1 km to the selected route distance** are searched on a combined 512-interval linear/logarithmic grid, with bisection of sign changes and deduplication of coincident roots. Persistent ties retain shared ranks; zero occupancy and empty selections have no meaningful crossover story. This numerical search may miss very closely spaced crossings without a sign change on the sampling grid; an analytical solver would be justified if repeatable examples expose that limitation.

The efficiency crossover curves merge ranking intervals with the same leaders into leadership phases. Phase focus gives each phase equal space and compresses the last to 30% when several exist. A single phase remains uniform. Winning curve segments are emphasized; other segments fade. Linear distance and linear/log maintenance-cost controls are independent of the standard efficiency chart. Marks at phase boundaries identify distance scale changes.

The economic rank chart includes crossings among non-leading trains. Its distance modes are Linear and All crossovers; the latter gives equal space to every interval between ranking changes. Closely packed tick labels are thinned to preserve readability. Both views end at the selected distance, without implying the final ranking holds at infinity. One shared table lists leadership phases. Selection, occupancy, distance and hover stay synchronized with the service readout and picker. Motion and economic rankings remain separate.


## Annual flow and station interval targets

Both targets are optional and disabled initially. Flow is completed passenger journeys per **game year per direction**; convert it to per-second flow with `D = annualDirectionalDemand / 1460`. The occupancy slider becomes an upper limit when flow is fixed. Identical trains are assumed evenly spaced and unimpeded at stations; platforms, traffic and bunching are excluded.

Let `C0 = 2 × travelSeconds + 2 × fixedTerminalDelay`, `r` be the per-train transfer rate, `Pmax` the capacity at the occupancy limit, and `n` the number of trains. A train carries `P = D × C0 / (n − 4D/r)` passengers per leg. This solves the flow and loading-time equations together, rather than assuming full trains after scaling fleet size. Capacity requires `n ≥ D × (C0 + 4Pmax/r) / Pmax`. An interval no larger than `h` additionally requires `n ≥ 4D/r + C0/h`. Choose the smallest feasible whole count, then recompute handling times and actual occupancy.

The **Closest to target** policy compares the adjacent whole counts around the ideal interval count, bounded by the minimum count needed for capacity. It minimizes absolute interval error, breaking ties toward fewer trains; the obtained interval can exceed the target. With no flow target, occupancy stays fixed and frequency alone scales capacity and maintenance together, leaving cost per journey unchanged.

With a fixed flow, fleet maintenance is divided by `2 × annualDirectionalDemand`. Spare capacity still costs maintenance, so tighter intervals may make a fleet less economical. The readout includes fleet size, actual interval, actual occupancy, annual directional flow and fleet maintenance. These settings propagate to all economic graphs and their caches; Race remains unchanged. Fixed-flow cost curves are sampled staircases because whole fleet counts create jumps. The numerical crossover search can miss very narrow ranking intervals between densely spaced fleet changes; a repeatable missed interval would justify enumerating every fleet-count boundary.

## Data and experimental evidence view

Data & models shows every catalogue entry matching the year/search filters, independent of checkbox selection. Displayed power is in kW; the JSON download retains original metric horsepower, qualitative French card text and source capture filenames. A CSV export covers the displayed table. Formation counts are supplied observations, not inferred from the cards.

Maintained observations in `data/experiments.json` distinguish measured, calibrated, observed, reported and provisional evidence. These labels do not certify the complete game physics. Motion checks compare the nine recorded video observations with model arrivals, after the 32-second departure offset. Vehicles without observations are skipped; filters with no observations show an explicit empty state. Manual step timing, visual mass comparison and fare comparisons retain their limitations. No source screenshots or recordings are redistributed.

UI terminology follows the game: Capacity, Utilization, Frequency and Rate. Frequency is an interval between vehicles, not departures per unit time. Target rate and the service readout explicitly use passengers per game year **per direction**; this is our directional convention, not a claim that the game’s displayed Rate uses the identical aggregation. Running costs refer to the captured annual vehicle maintenance values; purchase and infrastructure costs are excluded. Source field names and original capture values remain unchanged.
