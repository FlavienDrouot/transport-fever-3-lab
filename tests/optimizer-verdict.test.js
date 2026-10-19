import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOptimizerVerdict} from '../src/optimizer-proposals.js';

const proposal=(domain,name,cost,fleet=3)=>({domain,name,cost,fleet,frequency:120,parts:[{quantity:2,name}]});

test('the verdict names the cheapest proposal and compares it with the other domain',()=>{
  const html=renderOptimizerVerdict({request:{domain:'both',includeTrams:false},best:{rail:[proposal('rail','Alpha',900)],road:[proposal('road','Bus',1000)]}});
  assert.match(html,/Cheapest way to meet your service/);
  assert.match(html,/Alpha · Rail/);
  assert.match(html,/3 trains of 2 × Alpha/);
  assert.match(html,/\$900\/year/);
  assert.match(html,/10% less than the best Road option, Bus \(\$1,000\/year\)/);
});

test('a single-domain search reads as that domain, and an empty search has no verdict',()=>{
  const html=renderOptimizerVerdict({request:{domain:'road',includeTrams:true},best:{road:[proposal('road','Tram',500,1)]}});
  assert.match(html,/Cheapest Road \+ Tram option/);
  assert.match(html,/1 vehicle of 2 × Tram/);
  assert.doesNotMatch(html,/less than/);
  assert.equal(renderOptimizerVerdict({request:{domain:'rail'},best:{rail:[]}}),'');
});
