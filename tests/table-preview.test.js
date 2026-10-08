import test from 'node:test';
import assert from 'node:assert/strict';
import {mountTablePreviews,updateTablePreview} from '../src/table-preview.js';

test('Bar previews preserve all data and the expansion choice across render and empty states',()=>{
  const classes=new Set(),body={children:Array.from({length:46},()=>({})),classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}}};
  const button=new EventTarget();Object.assign(button,{dataset:{expandTable:'bars',previewLabel:'vehicles'},attrs:{'aria-expanded':'false'}});
  button.getAttribute=name=>button.attrs[name];button.setAttribute=(name,value)=>{button.attrs[name]=value;};
  let rendered=body;
  const document={getElementById:()=>rendered,querySelector:()=>button,querySelectorAll:()=>[button]};
  mountTablePreviews(document);assert.equal(button.textContent,'Show all 46 vehicles');assert.ok(classes.has('compact-rows'));assert.equal(body.children.length,46);
  button.dispatchEvent(new Event('click'));assert.equal(button.textContent,'Show first 10 vehicles');assert.ok(!classes.has('compact-rows'));
  rendered=null;updateTablePreview(document,'bars');assert.equal(button.hidden,true);
  rendered=body;body.children=body.children.slice(0,25);updateTablePreview(document,'bars');assert.equal(button.hidden,false);assert.ok(!classes.has('compact-rows'));assert.equal(body.children.length,25);
});
