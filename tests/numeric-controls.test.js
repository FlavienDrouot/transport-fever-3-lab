import test from 'node:test';
import assert from 'node:assert/strict';
import {mountDistanceControl,mountYearControl,validateNumberInputs,syncNumberInput} from '../src/numeric-controls.js';

function input(value,{min=0.1,max='',step=0.1,name='Distance'}={}){
  const element=new EventTarget();
  Object.assign(element,{value,min,max,step,disabled:false,attributes:{},validity:{}});
  element.setAttribute=(key,value)=>{element.attributes[key]=value;};
  element.getAttribute=key=>key==='aria-label'?name:element.attributes[key];
  Object.defineProperty(element,'valueAsNumber',{get:()=>element.value===''?NaN:Number(element.value)});
  element.checkValidity=()=>{
    const n=element.valueAsNumber;
    element.validity={rangeUnderflow:n<min,rangeOverflow:max!==''&&n>max,stepMismatch:Number.isFinite(n)&&Math.abs((n-min)/step-Math.round((n-min)/step))>1e-8};
    return Number.isFinite(n)&&!Object.values(element.validity).some(Boolean);
  };
  return element;
}
const fire=(target,event)=>target.dispatchEvent(new Event(event));

test('Invalid distance keeps the last calculation and the typed value until a valid commit',()=>{
  const number=input(1),range=input(1),notice={};let calculated=1;
  mountDistanceControl({number,range,validate:()=>validateNumberInputs([number],notice),onChange:value=>{calculated=value;}});
  for(const [value,message] of [['','valid number'],[0,'at least'],[0.15,'increments']]){
    number.value=value;fire(number,'input');fire(number,'change');
    assert.equal(calculated,1);assert.equal(notice.hidden,false);assert.match(notice.textContent,new RegExp(message));
    syncNumberInput(number,calculated);assert.equal(number.value,value);
    assert.equal(number.getAttribute('aria-invalid'),'true');
  }
  number.value=2;fire(number,'input');assert.equal(calculated,1);
  fire(number,'change');assert.equal(calculated,2);assert.equal(notice.hidden,true);
  range.value=3;fire(range,'input');assert.equal(number.value,3);assert.equal(calculated,3);
});

test('A distance change waits for other enabled constraints; disabled invalid controls are ignored',()=>{
  const distance=input(1),range=input(1),speed=input('',{min:1,step:1,name:'Speed limit'}),notice={};let changes=0;
  mountDistanceControl({number:distance,range,event:'input',validate:()=>validateNumberInputs([distance,speed],notice),onChange:()=>{changes++;}});
  distance.value=2;fire(distance,'input');assert.equal(changes,0);assert.match(notice.textContent,/Speed limit/);
  speed.disabled=true;fire(distance,'input');assert.equal(changes,1);assert.equal(notice.hidden,true);assert.equal(speed.getAttribute('aria-invalid'),'false');
});

test('Year buttons clamp to bounds and disable at the matching boundary',()=>{
  const range=input(1900,{min:1900,max:1902,step:1}),previous=new EventTarget(),next=new EventTarget(),output={};const years=[];
  mountYearControl({range,output,previous,next,onChange:year=>years.push(year)});
  assert.equal(previous.disabled,true);assert.equal(next.disabled,false);
  fire(next,'click');fire(next,'click');fire(next,'click');
  assert.equal(output.textContent,1902);assert.equal(next.disabled,true);assert.equal(previous.disabled,false);
  fire(previous,'click');assert.equal(output.textContent,1901);assert.equal(next.disabled,false);
  assert.deepEqual(years,[1901,1902,1902,1901]);
});

test('Positive distance controls accept sub-0.5 km values with no fixed step while rejecting zero',()=>{
  const distance=input(.1,{min:0,step:'any'}),notice={};
  distance.setAttribute('data-strict-positive','true');
  for(const value of [.25,.01,.0005,1e-7]){
    distance.value=value;assert.equal(validateNumberInputs([distance],notice),true);
  }
  for(const value of [0,-.01]){
    distance.value=value;assert.equal(validateNumberInputs([distance],notice),false);assert.match(notice.textContent,/greater than zero/);
  }
});


test('Live distance updates preserve decimal entry while focused and still synchronize external changes',()=>{
  const number=input(10,{step:'any'}),range=input(10,{step:'any'}),notice={};let calculated=10;
  number.ownerDocument={activeElement:number};
  mountDistanceControl({number,range,event:'input',validate:()=>validateNumberInputs([number],notice),onChange:value=>{
    calculated=value;syncNumberInput(number,value);range.value=value;
  }});
  for(const text of ['1','17','17.','17.5','17.50']){
    number.value=text;fire(number,'input');
    assert.equal(number.value,text,'model refresh must not rewrite an active edit');
    assert.equal(calculated,Number(text));assert.equal(range.value,Number(text));assert.equal(notice.hidden,true);
  }
  number.ownerDocument.activeElement=null;syncNumberInput(number,18.5);assert.equal(number.value,18.5);
  range.value=19.5;fire(range,'input');assert.equal(number.value,19.5);assert.equal(calculated,19.5);
});
