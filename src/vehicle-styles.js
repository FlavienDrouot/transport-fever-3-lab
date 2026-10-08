const palette=['#147d64','#527ac1','#ad5a28','#9270b9','#bf5074','#798329','#3897a7','#bf8437'];

/** Assign presentation once across the complete catalogue, before filtering or selection.
 * Existing styles survive a second pass over a selected subset.
 */
export function styleVehicleCatalogues(catalogues) {
  let index=0;
  return Object.fromEntries(Object.entries(catalogues).map(([key,vehicles])=>[key,vehicles.map(vehicle=>{
    const position=index++;
    return {...vehicle,color:vehicle.color??palette[position%palette.length],
      dash:vehicle.dash??(position>=palette.length?`${2+Math.floor(position/palette.length)*2} 3`:'')};
  })]));
}
