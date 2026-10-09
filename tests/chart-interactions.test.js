import test from 'node:test';
import assert from 'node:assert/strict';
import {mountChartInteractions} from '../src/chart-interactions.js';

function chart(document,options={}){
  const element=(id,isLabel=false)=>({dataset:{train:id},attrs:{},style:{},classList:{contains:name=>isLabel&&name==='end-label'},setAttribute(key,value){this.attrs[key]=value;},closest(){return this;}});
  const curves=['a','b'].map(id=>element(id)),labels=['a','b'].map(id=>element(id,true)),handlers={};
  const parent={appendChild(node){curves.splice(curves.indexOf(node),1);curves.push(node);}};
  for(const curve of curves)curve.parentNode=parent;
  const container={ownerDocument:document,addEventListener(name,handler){handlers[name]=handler;},contains:node=>labels.includes(node),querySelectorAll:selector=>selector==='.train-curve'?curves:labels};
  // Any attempted rebuild would lose the focused label and fail this check.
  Object.defineProperty(container,'innerHTML',{set(){assert.fail('highlighting rebuilt the chart');}});
  mountChartInteractions(container,options);
  return {curves,labels,handlers};
}

test('Classic charts share focus highlighting and keep focus when the pointer leaves',()=>{
  const document={activeElement:null},speed=chart(document),distance=chart(document);
  document.activeElement=speed.labels[1];
  speed.handlers.focusin({target:speed.labels[1]});
  for(const plot of [speed,distance]){
    assert.equal(plot.curves.find(c=>c.dataset.train==='b').attrs['stroke-width'],4);
    assert.equal(plot.curves.find(c=>c.dataset.train==='a').attrs.opacity,.16);
    assert.equal(plot.labels[1].attrs.tabindex,'0');
  }
  speed.handlers.pointerleave();assert.equal(distance.labels[0].attrs.opacity,.25);
  speed.handlers.focusout({relatedTarget:null});
  assert.ok(distance.curves.every(c=>c.attrs.opacity===1));
  assert.ok(distance.curves.every(c=>c.attrs['stroke-width']===2));
});

test('Phase overlays follow shared pointer/focus changes without rebuilding or remounting curves',()=>{
  const document={activeElement:null},seen=[];
  const first=chart(document,{onHighlight:id=>seen.push(['speed',id])});
  const second=chart(document,{onHighlight:id=>seen.push(['distance',id])});
  seen.length=0;
  first.handlers.pointerover({target:first.labels[0]});
  assert.deepEqual(seen,[['speed','a'],['distance','a']]);
  document.activeElement=second.labels[1];
  second.handlers.focusin({target:second.labels[1]});
  assert.deepEqual(seen.slice(-2),[['speed','b'],['distance','b']]);
  second.handlers.pointerleave();
  assert.deepEqual(seen.slice(-2),[['speed','b'],['distance','b']]);
  second.handlers.focusout({relatedTarget:null});
  assert.deepEqual(seen.slice(-2),[['speed',undefined],['distance',undefined]]);
});
