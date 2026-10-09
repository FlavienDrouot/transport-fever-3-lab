import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCompositionAnalysis} from '../src/composition-analysis-controls.js';
import {routeProfileDistance} from '../src/route-profile.js';

// An empty draft exercises route controls without rendering unrelated charts.
function fixture(initial){
  let settings=initial,frame;
  const changes=[],elements=new Map();
  const get=id=>{
    if(!elements.has(id)){
      const handlers={},attributes=new Map(),radios=new Map();
      const node={id,value:'0',checked:false,disabled:false,hidden:false,innerHTML:'',textContent:'',
        classList:{add(){}},get valueAsNumber(){return Number(this.value);},
        addEventListener(name,handler){handlers[name]=handler;},
        dispatch(name){handlers[name]?.({currentTarget:this});},
        getAttribute(name){return attributes.get(name)??null;},
        setAttribute(name,value){attributes.set(name,String(value));},
        checkValidity(){return true;},querySelectorAll(){return [];},
        querySelector(selector){
          const value=selector.match(/value="([^"]+)"/)?.[1];
          if(value){if(!radios.has(value))radios.set(value,{value,checked:false});return radios.get(value);}
          return [...radios.values()].find(radio=>radio.checked);
        }};
      elements.set(id,node);
    }
    return elements.get(id);
  };
  const document={getElementById:get,defaultView:{requestAnimationFrame(callback){frame=callback;}}};
  const controls=mountCompositionAnalysis(document,{getSettings:()=>settings,onSettingsChange(next){settings=next;changes.push(next);}});
  return {get,changes,settings:()=>settings,render(){controls.refresh();frame();}};
}

const settings={distanceKm:.037,gradePercent:.4,infrastructureSpeedKmh:160,fillRatio:.8,
  desiredFlow:null,maxHeadwaySeconds:null,frequencyMode:'maximum',platformLengthMetres:null,loadedReturn:false,stopA:{},stopB:{}};

test('Opening Configurator preserves precise uniform and profile distances without publishing settings',()=>{
  for(const routeProfile of [null,[{distanceKm:.023,gradePercent:1,speedLimitKmh:120},{distanceKm:.014,gradePercent:-.5,speedLimitKmh:75}]]){
    const initial={...settings,routeProfile},ui=fixture(initial);
    if(routeProfile){ui.get('composition-distance').value='invalid';ui.get('composition-distance').setAttribute('aria-invalid','true');}
    ui.render();
    assert.equal(ui.changes.length,0);
    assert.equal(ui.settings(),initial);
    assert.equal(Number(ui.get('composition-distance').value),routeProfile?routeProfileDistance(routeProfile):settings.distanceKm);
    for(const id of ['composition-distance','composition-distance-range','composition-gradient-input','composition-gradient-range','composition-speed-limit'])
      assert.equal(ui.get(id).disabled,!!routeProfile);
    assert.equal(ui.get('composition-route-profile-status').hidden,!routeProfile);
    if(routeProfile)assert.match(ui.get('composition-route-profile-status').innerHTML,/href="#route-profile"/);
  }
});

test('Changing utilization with a profile preserves segment distance and saved uniform reference controls',()=>{
  const routeProfile=[{distanceKm:.037,gradePercent:2,speedLimitKmh:75}],ui=fixture({...settings,routeProfile});
  ui.render();
  // Disabled displayed values must never be republished as uniform route settings.
  ui.get('composition-distance').value='0.1';ui.get('composition-gradient-input').value='9';
  ui.get('composition-fill').value='60';ui.get('composition-fill').dispatch('input');
  assert.equal(ui.changes.length,1);
  assert.equal(ui.settings().fillRatio,.6);
  assert.equal(ui.settings().distanceKm,.037);
  assert.equal(ui.settings().gradePercent,settings.gradePercent);
  assert.equal(ui.settings().infrastructureSpeedKmh,settings.infrastructureSpeedKmh);
  assert.equal(ui.settings().routeProfile,routeProfile);
  ui.render();
  assert.equal(ui.changes.length,1,'refresh remains read-only');
});
