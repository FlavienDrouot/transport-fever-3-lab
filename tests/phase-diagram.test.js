import test from 'node:test';
import assert from 'node:assert/strict';
import {phaseAppearance,rankPhaseSegments,renderPhaseDiagram,observePhaseHighlight} from '../src/phase-diagram.js';
const trains=[{id:'a',name:'A & train',color:'#123',dash:''},{id:'b',name:'B',color:'#456',dash:'2 3'}];
const phases=[{start:0,end:1,leaders:['a']},{start:1,end:2,leaders:['b']}];
const intervals=[{start:0,end:1,ranks:{a:1,b:null}},{start:1,end:2,ranks:{a:2,b:1}}];
const config={trains,segments:rankPhaseSegments(trains,phases,intervals,x=>x,y=>y),bands:phases.map(p=>({width:.5,leaders:p.leaders})),endpoints:trains.map((t,i)=>({t,y:40+i*30,winner:i===1})),width:900,height:400,left:65,right:220,top:35,bottom:55,title:'Phase diagram'};

test('One presentation contract highlights winners, ties and hovered losers',()=>{
  assert.deepEqual(phaseAppearance(true,true,undefined,'a'),{opacity:1,width:3.5});
  assert.deepEqual(phaseAppearance(false,true,undefined,'b'),{opacity:.2,width:1.7});
  assert.deepEqual(phaseAppearance(false,true,'b','b'),{opacity:1,width:4});
  assert.deepEqual(phaseAppearance(true,true,'b','a'),{opacity:.12,width:3.5});
  assert.deepEqual(phaseAppearance(false,false,undefined,'b'),{opacity:1,width:1.7});
});
test('Rank paths preserve leadership transitions and introduction gaps',()=>{
  const segments=config.segments;
  assert.equal(segments.length,3);
  assert.equal(segments.find(s=>s.t.id==='a'&&!s.winner).d,'M1,2 L2,2 ');
  assert.equal(segments.find(s=>s.t.id==='b').d,'M1,1 L2,1 ');
  assert.equal(segments.find(s=>s.t.id==='a'&&!s.winner).transitions,'M1,1 L1,2 ');
  assert.equal(segments.find(s=>s.t.id==='b').transitions,'');
  const tied=rankPhaseSegments(trains,[{start:0,end:2,leaders:['a','b']}],intervals,x=>x,y=>y);
  assert.ok(tied.every(s=>s.winner));
});
test('All diagrams get clipping, wide hit paths, leader names and responsive labels',()=>{
  const container={id:'cost',clientWidth:900};renderPhaseDiagram(container,config);
  assert.match(container.innerHTML,/clipPath id="cost-clip"/);
  assert.equal((container.innerHTML.match(/class="curve-hit"/g)||[]).length,3);
  assert.match(container.innerHTML,/stroke-width="12" pointer-events="stroke"/);
  assert.match(container.innerHTML,/A &amp; train/);
  assert.match(container.innerHTML,/class="end-label"/);
  renderPhaseDiagram(container,{...config,width:400});
  assert.match(container.innerHTML,/class="train-legend"/);
  assert.doesNotMatch(container.innerHTML,/class="end-label"/);
});

// Small event/DOM fixture: assertions exercise real delegated handlers rather
// than recreating the component's interaction logic.
function chart(document,id){
  const handlers={};
  const nodes=config.segments.map(s=>({dataset:{train:s.t.id,winner:String(s.winner)},attrs:{},setAttribute(k,v){this.attrs[k]=v;}}));
  const labels=trains.map(t=>({dataset:{train:t.id},attrs:{},style:{},classList:{contains:c=>c==='end-label'},setAttribute(k,v){this.attrs[k]=v;}}));
  const parent={appendChild(node){nodes.splice(nodes.indexOf(node),1);nodes.push(node);}};nodes.forEach(n=>n.parentNode=parent);
  const container={id,ownerDocument:document,addEventListener(name,handler){handlers[name]=handler;},contains(node){return labels.includes(node);},querySelectorAll(selector){return selector==='.phase-segment'?nodes:labels;}};
  renderPhaseDiagram(container,config);
  const target=label=>({closest:()=>label});
  return {container,nodes,labels,fire(name,event={}){handlers[name](event);},target};
}
test('Pointer and keyboard focus synchronize paired plots, isolate groups and restore baseline',()=>{
  const document={activeElement:null},a=chart(document,'a'),b=chart(document,'b'),road=chart(document,'road');
  renderPhaseDiagram(road.container,{...config,group:'road'});
  const seen=[];observePhaseHighlight(document,'rail',id=>seen.push(id));
  a.fire('pointerover',{target:a.target(a.labels[0])});
  for(const plot of [a,b]){
    assert.equal(plot.nodes.find(n=>n.dataset.train==='a').attrs['stroke-width'],4);
    assert.equal(plot.nodes.find(n=>n.dataset.train==='b').attrs.opacity,.12);
  }
  assert.equal(road.nodes.find(n=>n.dataset.train==='b').attrs.opacity,1);
  a.fire('pointerleave');
  assert.equal(b.nodes.find(n=>n.dataset.train==='a'&&n.dataset.winner==='false').attrs.opacity,.2);
  assert.equal(b.labels[0].attrs.opacity,.3);
  a.fire('focusin',{target:a.target(a.labels[1])});
  assert.equal(b.nodes.find(n=>n.dataset.train==='b').attrs['stroke-width'],4);
  a.fire('focusout',{relatedTarget:null});
  assert.equal(b.nodes.find(n=>n.dataset.train==='b').attrs['stroke-width'],3.5);
  assert.equal(a.labels[0].attrs.tabindex,'0');
  assert.deepEqual(seen,['a',undefined,'b',undefined]);
});
test('The winning envelope gets 15 percent headroom, with finite empty fallback',async()=>{
  const {winningValueCeiling}=await import('../src/phase-diagram.js');
  assert.ok(Math.abs(winningValueCeiling([10,100,50])-115)<1e-10);
  assert.equal(winningValueCeiling([null,NaN]),1);
});

test('Vertical rank transitions remain neutral even when their vehicle is highlighted',()=>{
  const container={id:'rank'};
  renderPhaseDiagram(container,{...config,highlighted:'a'});
  const transition=container.innerHTML.match(/<path class="rank-transition"[^>]*>/)[0];
  assert.match(transition,/stroke-width="1.2" opacity=".25" pointer-events="none"/);
  assert.doesNotMatch(transition,/data-train|winning-segment|phase-segment/);
  assert.match(container.innerHTML,/data-train="a"[^>]*stroke-width="4"/);
});
test('Narrow leadership bands use compact markers with complete accessible names',()=>{
  const container={id:'rank'};
  renderPhaseDiagram(container,{...config,bands:[{width:.005,leaders:['a']},{width:.995,leaders:['b']}]});
  assert.match(container.innerHTML,/class="phase-leader-compact"[^>]*><span data-train="a" title="A &amp; train" aria-label="A &amp; train"[^>]*>•<\/span>/);
  assert.match(container.innerHTML,/title="B" aria-label="B"[^>]*>B<\/span>/);
});
