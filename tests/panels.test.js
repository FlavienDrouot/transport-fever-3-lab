import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {syncAnalysisPanels,mountPanelDrawers} from '../src/panels.js';
function fixture(){
  const nodes=new Map();
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{hidden:false,open:false,attrs:{},handlers:{},focus(){this.focused=true;},
      addEventListener(type,handler){this.handlers[type]=handler;},setAttribute(k,v){this.attrs[k]=v;},
      showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},
      append(panel){panel.parent=this;},before(panel){panel.parent=this;},matches(){return true;}});
    return nodes.get(id);
  };
  const classes=new Set();const classList={toggle(k,on){on?classes.add(k):classes.delete(k);},add(k){classes.add(k);},remove(k){classes.delete(k);}};
  const document={getElementById:node,querySelector:()=>({classList}),body:{classList}};
  return {node,document,classes};
}
test('Side panels follow the analysis tab and close inactive dialogs',()=>{
  const {node,document,classes}=fixture();
  syncAnalysisPanels(document,'trucks');assert.equal(node('catalogue').hidden,true);assert.equal(node('road-sidebar').hidden,false);assert.equal(node('road-picker-toggle').hidden,false);
  node('road-drawer').open=true;syncAnalysisPanels(document,'data');
  assert.equal(node('road-drawer').open,false);assert.equal(node('catalogue').hidden,true);assert.equal(node('road-sidebar').hidden,true);
  assert.equal(node('picker-toggle').hidden,true);assert.equal(node('road-picker-toggle').hidden,true);assert.ok(classes.has('data-view'));
  for(const view of ['race','economics']){syncAnalysisPanels(document,view);assert.equal(node('catalogue').hidden,false);assert.equal(node('road-sidebar').hidden,true);assert.ok(!classes.has('data-view'));}
  syncAnalysisPanels(document,'configurator');assert.equal(node('configuration-sidebar').hidden,false);assert.equal(node('catalogue').hidden,true);assert.equal(node('configuration-picker-toggle').hidden,false);
  node('configuration-drawer').open=true;syncAnalysisPanels(document,'race');assert.equal(node('configuration-drawer').open,false);assert.equal(node('line-capacity').hidden,true);syncAnalysisPanels(document,'economics');assert.equal(node('line-capacity').hidden,false);assert.equal(node('train-race-settings').hidden,true);
  node('train-drawer').open=true;syncAnalysisPanels(document,'trucks');assert.equal(node('train-drawer').open,false);
});
test('Mobile drawers move the same controls and preserve state across viewport changes',()=>{
  const {node,document}=fixture();const mobile={matches:true,handlers:[],addEventListener(type,handler){this.handlers.push(handler);}};
  node('road-sidebar').value='preserved state';mountPanelDrawers(document,mobile);
  assert.equal(node('road-sidebar').parent,node('road-drawer'));assert.equal(node('catalogue').parent,node('train-drawer'));
  node('road-picker-toggle').handlers.click();assert.equal(node('road-drawer').open,true);assert.equal(node('road-picker-toggle').attrs['aria-expanded'],'true');
  node('road-picker-close').handlers.click();assert.equal(node('road-drawer').open,false);assert.equal(node('road-picker-toggle').attrs['aria-expanded'],'false');
  mobile.matches=false;for(const handler of mobile.handlers)handler();
  assert.equal(node('road-sidebar').parent,node('road-sidebar-anchor'));assert.equal(node('road-sidebar').value,'preserved state');
});
test('Data is the last tab; route controls have one owner and labelled drawer',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  assert.deepEqual([...html.matchAll(/data-analysis="([^"]+)"/g)].map(m=>m[1]),['race','economics','trucks','configurator','data']);
  const sidebar=html.match(/<aside id="road-sidebar"[\s\S]*?<\/aside>/)?.[0];assert.ok(sidebar);
  for(const id of ['road-category','truck-distance','truck-utilization','truck-year','truck-specialized-terminal','road-selector']){
    assert.ok(sidebar.includes(`id="${id}"`));assert.equal([...html.matchAll(new RegExp(`id="${id}"`,'g'))].length,1);
  }
  const trains=html.match(/<aside id="catalogue"[\s\S]*?<\/aside>/)?.[0];assert.ok(trains.includes('id="line-capacity"'));assert.ok(trains.includes('id="route-distance"'));
  assert.match(html,/<dialog id="road-drawer" aria-labelledby="road-sidebar-heading">/);
});

test('A mobile picker opens collapsed ancestor groups before focusing its controls',()=>{
  const {node,document}=fixture();const mobile={matches:true,addEventListener(){}};
  const group={tagName:'DETAILS',open:false};node('train-search').parentElement=group;
  mountPanelDrawers(document,mobile);node('picker-toggle').handlers.click();
  assert.equal(group.open,true);assert.equal(node('train-search').focused,true);
});
test('Both families group route settings and vehicles in native disclosures',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const id of ['road-sidebar','catalogue']){
    const panel=html.match(new RegExp(`<aside id="${id}"[\\s\\S]*?<\\/aside>`))[0];
    assert.match(panel,/<details[^>]*class="panel-group[^>]*><summary>Vehicles<\/summary>/);
    assert.ok(panel.includes('class="panel-group'));
  }
  assert.ok(html.includes('id="road-selector"'));assert.ok(html.includes('id="train-selector"'));
});
