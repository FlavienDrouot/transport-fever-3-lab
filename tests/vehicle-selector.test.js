import test from 'node:test';
import assert from 'node:assert/strict';
import {mountVehicleSelector, selectorResults, selectAll, vehicleRows} from '../src/vehicle-selector.js';
const items=[{id:'old',name:'Old',year:1900,maxSpeedKmh:50},{id:'fast',name:'Fast',year:2020,maxSpeedKmh:100},{id:'custom',name:'Custom',year:2025,maxSpeedKmh:80}];
function fixture(){
  const nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,handlers:{},addEventListener(type,handler){this.handlers[type]=handler;},querySelector(){return {value:this.order??'year'};},querySelectorAll(){return [];}});return nodes.get(id);};
  return {root:{classList:{add(){}},querySelector:selector=>get(selector.slice(1))},get};
}
for(const family of ['train','road'])test(`${family}: the shared picker selects only search results and preserves hidden choices`,()=>{
  const {root,get}=fixture();
  const ids=Object.fromEntries(['search','sort','count','select','clear','list','empty'].map(key=>[key,`${family}-${key}`]));
  let eligible=items,changes=0;
  const selected=new Set(items.map(t=>t.id));
  const picker=mountVehicleSelector(root,{ids,getItems:()=>eligible,getSelected:()=>selected,describe:t=>`${t.maxSpeedKmh} km/h`,onChange:()=>changes++});
  picker.render();assert.match(get(ids.count).textContent,/3 selected · 3 of 3 shown/);
  get(ids.search).value='Fast';get(ids.search).handlers.input();
  assert.deepEqual(picker.getVisible().map(t=>t.id),['fast']);
  get(ids.clear).handlers.click();assert.deepEqual([...selected],['old','custom']);
  get(ids.select).handlers.click();assert.equal(selected.has('fast'),true);
  eligible=items.slice(0,1);picker.clearSearch();picker.render();
  assert.match(get(ids.count).textContent,/1 selected · 2 hidden by filters · 1 of 1 shown/);
  get(ids.list).handlers.change({target:{matches:()=>true,value:'old',checked:false}});
  assert.equal(selected.has('old'),false);assert.equal(selected.has('custom'),true);
  get(ids.search).value='unmatched';get(ids.search).handlers.input();
  assert.equal(get(ids.empty).hidden,false);assert.equal(get(ids.select).disabled,true);assert.equal(get(ids.clear).disabled,true);
  selectAll(selected,items);picker.clearSearch();eligible=items;picker.render();
  assert.deepEqual([...selected],items.map(t=>t.id));assert.ok(changes>=5);
});
test('Order, year search and reset use the current catalogue including custom vehicles',()=>{
  assert.deepEqual(selectorResults(items,'','speed').map(t=>t.id),['fast','custom','old']);
  assert.deepEqual(selectorResults(items,'','year').map(t=>t.id),['custom','fast','old']);
  assert.deepEqual(selectorResults(items,'','name').map(t=>t.id),['custom','fast','old']);
  assert.deepEqual(selectorResults(items,' 2025 ').map(t=>t.id),['custom']);
  const selected=new Set(['deleted']);selectAll(selected,items);assert.deepEqual([...selected],['old','fast','custom']);
});
test('Both families have labelled checkboxes, highlight identifiers and visible fallback colours; content is escaped',()=>{
  const html=vehicleRows([{id:'x"',name:'<truck>',year:2030,maxSpeedKmh:70}],new Set(['x"']),()=>'<cargo>');
  assert.match(html,/--train-color:var\(--green\)/);assert.ok(html.includes('data-train="x&quot;"'));
  assert.match(html,/aria-label="Compare &lt;truck&gt;"/);assert.match(html,/ checked /);assert.match(html,/&lt;cargo&gt;/);assert.ok(!html.includes('<truck>'));
});
