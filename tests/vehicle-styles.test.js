import test from 'node:test';
import assert from 'node:assert/strict';
import {styleVehicleCatalogues} from '../src/vehicle-styles.js';
import {vehicleRows,selectorResults} from '../src/vehicle-selector.js';
import {selectRoadVehicles} from '../src/trucks.js';
import {renderRoadPhases} from '../src/road-phases.js';
const vehicle=(id,year,specialization='general')=>({id,name:id,year,freightSpecialization:specialization,cargoCapacity:20,maxSpeedKmh:80,loadingUnloadingSpeedMultiplier:4,economy:{annualMaintenance:10000}});
const source={trucks:[vehicle('old',1900),vehicle('specialized',1950,'bulk'),vehicle('new',2000)],buses:[],trams:[],freightTrams:[]};

test('Catalogue colours stay attached to the same vehicle through cargo/year/search/selection filters',()=>{
  const before=structuredClone(source),styled=styleVehicleCatalogues(source);
  assert.equal(new Set(styled.trucks.map(v=>v.color)).size,3);assert.deepEqual(source,before);
  const filtered=selectRoadVehicles(styled,{category:'freight',cargo:'all',year:2035});
  for(const sort of ['year','name','speed'])for(const item of selectorResults(filtered,'new',sort))assert.equal(item.color,styled.trucks[2].color);
  assert.equal(selectRoadVehicles(styled,{category:'freight',cargo:'bulk',year:1960})[1].color,styled.trucks[1].color);
  const subset=styleVehicleCatalogues({...styled,trucks:styled.trucks.slice(2)});
  assert.equal(subset.trucks[0].color,styled.trucks[2].color);assert.equal(subset.trucks[0].dash,styled.trucks[2].dash);
  assert.match(vehicleRows(filtered,new Set(),()=>''),new RegExp(`--train-color:${styled.trucks[2].color}`));
});

test('The shared picker and road phase renderer retain the same colour for a selected subset',()=>{
  const styled=styleVehicleCatalogues(source),chosen=styled.trucks[2];
  const nodes=Object.fromEntries(['road-phase-axis','road-cost-scale','road-rank-scale','road-phase-help','road-cost-phases-chart','road-rank-phases-chart'].map(id=>[id,{id,value:'linear',clientWidth:900,querySelector(){return {value:this.value};}}]));
  nodes['road-phase-axis'].value='distance';
  renderRoadPhases({getElementById:id=>nodes[id]},{...styled,trucks:[chosen]},{category:'freight',year:2035},{distanceKm:1,fillRatio:1,loadedReturn:false});
  const picker=vehicleRows([chosen],new Set([chosen.id]),()=> '');
  assert.ok(picker.includes(`--train-color:${chosen.color}`));
  for(const id of ['road-cost-phases-chart','road-rank-phases-chart'])assert.ok(nodes[id].innerHTML.includes(`stroke="${chosen.color}"`));
});
