/** Load only the requested search domain/category; the core train dataset is already loaded at startup. */
export async function loadOptimizerCatalogue(load,request,dataset){
  const rail=request.domain!=='road',road=request.domain!=='rail',freight=request.category==='freight';
  const files=[...rail?['rail-locomotives',freight?'rail-freight-wagons':'rail-passenger-wagons']:[],
    ...road?[freight?'trucks':'buses']:[],...(rail||request.includeTrams?['trams']:[]),
    ...(road&&request.includeTrams?['tram-locomotives',freight?'tram-freight-wagons':'tram-passenger-wagons']:[]),...request.ignoreRetirements?[]:['vehicle-availability']];
  const loaded=Object.fromEntries(await Promise.all(files.map(async name=>[name,await load(name)])));
  const availability=loaded['vehicle-availability'];
  const records=(name,key,data=loaded[name])=>(data?.[key]??[]).map(item=>request.ignoreRetirements?item:{...item,yearTo:availability.entries[`data/${name}.json#${item.id}`]?.yearTo??null});
  return {units:dataset.source,trains:rail?records('trains','trains',dataset):[],
    locomotives:records('rail-locomotives','locomotives'),passengerWagons:records('rail-passenger-wagons','wagons'),
    freightWagons:records('rail-freight-wagons','wagons'),buses:records('buses','buses'),trucks:records('trucks','trucks'),
    trams:records('trams','trams'),freightTrams:records('trams','freightTrams'),tramLocomotives:records('tram-locomotives','locomotives'),
    tramPassengerWagons:records('tram-passenger-wagons','wagons'),tramFreightWagons:records('tram-freight-wagons','wagons')};
}
