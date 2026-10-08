import {matchesFreightFilter} from './trucks.js';
import {serviceEligible} from './line.js';

export function economicCandidates(trains,{freight=false,cargo='all',year=2035}={}) {
  return trains.filter(train=>train.year<=year&&(freight
    ? train.carrier==='rail'&&train.category==='freight'&&train.components?.length>0&&train.cargoCapacity>0&&matchesFreightFilter(train,cargo)
    : train.passengerCapacity>0));
}

/** Keep future/filtered selections intact, and distinguish the actions needed for an empty view. */
export function economicSelection(trains,selected,options={}) {
  const compatible=economicCandidates(trains,{...options,year:Infinity});
  const available=economicCandidates(compatible,options);
  const chosen=available.filter(train=>selected.has(train.id));
  const eligible=chosen.filter(train=>serviceEligible(train,options));
  const phaseItems=compatible.filter(train=>selected.has(train.id)&&serviceEligible(train,options));
  const empty=!compatible.length?'create':!available.length?'year':!chosen.length?'selection':!eligible.length?'length':null;
  return {compatible,available,chosen,eligible,phaseItems,excluded:chosen.filter(train=>!serviceEligible(train,options)),empty};
}

export function economicEmptyContent(reason,freight) {
  const create=freight?'Create your own freight train':'Create your own train';
  const messages={
    create:freight?'Assemble a locomotive and compatible freight wagons in Configurator, then save your composition to compare its service costs.':'Save a composition in Configurator to compare it here.',
    year:'Your compatible trains are introduced after the selected year. Advance the game year or configure a train for this period.',
    selection:'Select trains in the panel to compare their service costs.',
    length:'The selected trains exceed the maximum length. Increase the limit or configure a shorter train.',
  };
  return `<h2>${reason==='create'?create:reason==='selection'?'Choose trains to compare':reason==='year'?'No trains available in this year':'No selected train fits the length limit'}</h2><p>${messages[reason]}</p><div class="selection-actions">${reason==='selection'?'<button type="button" id="economic-empty-select">Select available trains</button>':reason==='length'?'<a href="#platform-length">Adjust length limit ↗</a>':reason==='year'?'<a href="#catalogue-year">Change game year ↗</a>':''}<a href="#configurator" data-economic-configure>Open Configurator ↗</a></div>`;
}
