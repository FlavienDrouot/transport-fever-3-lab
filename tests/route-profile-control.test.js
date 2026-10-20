import test from 'node:test';
import assert from 'node:assert/strict';
import {routeProfileSketch,gradeClass,ROUTE_SHAPES} from '../src/route-profile-control.js';
import {validateRouteProfile,routeProfileDistance} from '../src/route-profile.js';

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

test('the route map colours each track by grade and offers insertion at the selected segment ends',()=>{
  const parts=[{distanceKm:1,gradePercent:0,speedLimitKmh:100},{distanceKm:2,gradePercent:-3,speedLimitKmh:100},{distanceKm:1,gradePercent:5,speedLimitKmh:100}];
  const html=routeProfileSketch(parts,{selectedIndex:1});
  assert.deepEqual([...html.matchAll(/class="profile-track grade-(\w+)"/g)].map(m=>m[1]),['flat','steep','severe']);
  assert.deepEqual([...html.matchAll(/data-action="([\w-]+)" data-index="(\d)"/g)].map(m=>`${m[1]}:${m[2]}`),['insert-before:1','insert:1']);
  assert.match(html,/data-segment="1"[^>]+aria-pressed="true"/);
  assert.doesNotMatch(routeProfileSketch(Array(24).fill(parts[0]),{selectedIndex:0}),/data-action=/);
  assert.equal(gradeClass(-0.4),'flat');assert.equal(gradeClass(2),'steep');
});

test('starting shapes are valid routes within the editor limits',()=>{
  for(const shape of ROUTE_SHAPES){
    const route=validateRouteProfile(shape.segments);
    assert.ok(route.length<=24&&routeProfileDistance(route)<=100,shape.id);
    assert.ok(route.every(part=>part.roadSpeedLimitKmh!=null),shape.id);
  }
});

test('compact previews keep distance proportions and slope directions without editor actions',()=>{
  const html=routeProfileSketch([
    {distanceKm:1,gradePercent:4,speedLimitKmh:120},
    {distanceKm:3,gradePercent:-1,speedLimitKmh:80},
  ],{compact:true,scale:'linear',availableWidth:320,selectedIndex:0});
  const points=html.match(/<polyline points="([^"]+)"/)[1].split(' ').map(pair=>pair.split(',').map(Number));
  assert.equal((points[1][0]-points[0][0])/(points[2][0]-points[0][0]),.25);
  assert.ok(points[1][1]<points[0][1]);assert.ok(points[2][1]>points[1][1]);
  assert.match(html,/role="img"/);assert.match(html,/Segment 2: 3 km, -1 percent grade, 80 kilometres per hour limit/);
  assert.doesNotMatch(html,/data-action=|tabindex=|role="button"/);
});
