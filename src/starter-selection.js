// A first comparison stays readable: until the player chooses vehicles, Compare shows a
// starter selection. Rail passengers use a curated cast; other catalogues use their newest vehicles.
export const STARTER_SIZE=6;
export const RAIL_PASSENGER_STARTER=['metroliner','avelia-liberty','fuxing','twindexx','tgv','rail:light-rail:stadler-citylink'];

const custom=id=>String(id).startsWith('custom:');

/** Curated vehicles available under the current filters, else the newest catalogue vehicles. */
export function starterIds(items,{preferred=[],size=STARTER_SIZE}={}){
  const catalogue=items.filter(t=>!custom(t.id)),available=new Set(catalogue.map(t=>t.id));
  const curated=preferred.filter(id=>available.has(id));
  // A single curated survivor is not a comparison; early years fall back to the newest vehicles.
  if(curated.length>=2)return curated;
  return catalogue.sort((a,b)=>b.year-a.year||a.name.localeCompare(b.name,'en')).slice(0,size).map(t=>t.id);
}

/** Replace the automatic pick in place while keeping the player's compositions and previews. */
export function applyStarterSelection(selected,items,options){
  const kept=[...selected].filter(custom);
  selected.clear();
  for(const id of [...starterIds(items,options),...kept])selected.add(id);
  return selected;
}
