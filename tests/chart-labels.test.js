import test from 'node:test';
import assert from 'node:assert/strict';
import {stackArrivalLabels} from '../src/chart-labels.js';

test('arrival labels stay horizontal and take the lowest row without overlapping',()=>{
  const {labels,rows}=stackArrivalLabels([
    {x:300,text:'Bravo · 3:54'},{x:100,text:'Alpha · 3:49'},{x:110,text:'Charlie · 3:50'},{x:600,text:'Delta · 9:26'},
  ],{left:65,right:640,charWidth:6,gap:10});
  const byText=Object.fromEntries(labels.map(l=>[l.text.split(' ')[0],l]));
  assert.equal(rows,2);
  assert.equal(byText.Alpha.row,0);
  assert.equal(byText.Charlie.row,1);
  assert.equal(byText.Bravo.row,0);
  // Near the right edge the label ends at its marker instead of overflowing.
  assert.equal(byText.Delta.anchor,'end');
  assert.equal(byText.Delta.labelX,600);
  for(const row of [0,1]){
    const spans=labels.filter(l=>l.row===row).map(l=>[l.anchor==='end'?l.labelX-l.text.length*6:l.labelX,l.anchor==='end'?l.labelX:l.labelX+l.text.length*6]).sort((a,b)=>a[0]-b[0]);
    spans.forEach((span,i)=>{if(i)assert.ok(span[0]>=spans[i-1][1]+10);});
  }
});
