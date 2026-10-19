// A first comparison stays readable: until the player chooses vehicles, Compare shows the
// newest vehicles available under the current filters, i.e. what the game offers that year.
export const STARTER_SIZE=6;

const custom=id=>String(id).startsWith('custom:');

/** Newest catalogue vehicles first; player compositions are never part of the automatic pick. */
export function starterIds(items,size=STARTER_SIZE){
  return items.filter(t=>!custom(t.id)).sort((a,b)=>b.year-a.year||a.name.localeCompare(b.name,'en')).slice(0,size).map(t=>t.id);
}

/** Replace the automatic pick in place while keeping the player's compositions and previews. */
export function applyStarterSelection(selected,items,size=STARTER_SIZE){
  const kept=[...selected].filter(custom);
  selected.clear();
  for(const id of [...starterIds(items,size),...kept])selected.add(id);
  return selected;
}
