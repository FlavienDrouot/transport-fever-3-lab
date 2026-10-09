# UI terminology

When changing user-facing metric labels in any tab, follow the maintained glossary in [docs/model.md](docs/model.md#ui-terminology). Reuse `UI_TERMS` from `src/ui-terms.js` in generated labels and the same spelling in static HTML. Frequency, Rate, Utilization, Capacity and Running costs retain their game names; put units and calculation qualifiers alongside them. Do not rename source fields or internal model variables to change UI wording. Confirm new game terms from a capture, extracted text or Flavien before adding them to the glossary.

Use `capacity` alone as the shared passenger/freight notation in transport metrics (Cost / capacity, capacity/year, capacity·km/year, capacity/s), without unit(s), passengers, seats, pax or cargo units in metric labels. Keep category names and explanations of actual passenger/freight behavior where necessary; retain directional qualifiers and existing calculation semantics.
