import test from 'node:test';
import assert from 'node:assert/strict';
import {spreadDiagonalLabels} from '../src/chart-labels.js';

test('diagonal arrival labels keep their gap and stay inside the chart',()=>{
  const {labels,height}=spreadDiagonalLabels([
    {x:300,text:'Bravo · 3:54'},{x:100,text:'Alpha · 3:49'},{x:105,text:'Charlie · 3:50'},{x:630,text:'Delta · 9:26'},
  ],{left:65,right:640,charWidth:6,gap:20});
  assert.deepEqual(labels.map(l=>l.text.split(' ')[0]),['Alpha','Charlie','Bravo','Delta']);
  labels.forEach((label,i)=>{
    if(i)assert.ok(label.labelX-labels[i-1].labelX>=20-1e-9);
    assert.ok(label.labelX+label.reach<=635+1e-9);
  });
  assert.equal(labels[0].labelX,100);
  assert.ok(labels[3].labelX<630);
  assert.ok(Math.abs(height-'Charlie · 3:50'.length*6*Math.SQRT1_2)<1e-9);
});
