import test from 'node:test';
import assert from 'node:assert/strict';
import {routeProfileSketch} from '../src/route-profile-control.js';

test('symbolic route sketch identifies each section and its relative rise and fall',()=>{
  const html=routeProfileSketch([
    {distanceKm:2,gradePercent:3,speedLimitKmh:120},
    {distanceKm:1,gradePercent:-2,speedLimitKmh:80},
  ]);
  assert.match(html,/Route from A to B, 3 km over 2 segments/);
  assert.match(html,/Segment 1: 2 km, 3 percent grade, 120 kilometres per hour limit/);
  assert.match(html,/Segment 2: 1 km, -2 percent grade, 80 kilometres per hour limit/);
  assert.match(html,/A · 0 km/);
  assert.match(html,/B · 3 km/);
  const points=html.match(/<polyline points="([^"]+)"/)?.[1].split(' ').map(pair=>pair.split(',').map(Number));
  assert.equal(points.length,3);
  assert.ok(points[1][1]<points[0][1]);
  assert.ok(points[2][1]>points[1][1]);
});

test('linear route view positions boundaries in proportion to travelled distance',()=>{
  const parts=[
    {distanceKm:1,gradePercent:0,speedLimitKmh:100},
    {distanceKm:3,gradePercent:4,speedLimitKmh:160},
  ];
  const equal=routeProfileSketch(parts);
  const linear=routeProfileSketch(parts,{scale:'linear'});
  const xValues=html=>html.match(/<polyline points="([^"]+)"/)[1].split(' ').map(pair=>Number(pair.split(',')[0]));
  const [a,b,c]=xValues(equal),[d,e,f]=xValues(linear);
  assert.equal((b-a)/(c-a),.5);
  assert.equal((e-d)/(f-d),.25);
  assert.match(linear,/Distance from A \(km\) · linear/);
  assert.match(linear,/Horizontal distance is linear/);
});
