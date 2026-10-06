import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyseLine} from '../src/line.js';
import {createModel} from '../src/model.js';
const train = {passengerCapacity: 60, carCount: 4, loadingUnloadingSpeedMultiplier: 2,
  economy: {annualMaintenance: 1200},
  // Constant 1 m/s² acceleration to 90 km/h, then cruise.
  model: {timeAt: km => km * 1000 <= 312.5 ? Math.sqrt(km * 2000) : 25 + (km * 1000 - 312.5) / 25,
    stateAt: t => ({speedKmh: Math.min(t,25)*3.6, distanceKm: (t<=25 ? t*t/2 : 312.5+(t-25)*25)/1000})}};
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} ≠ ${b}`);
test('Long route replaces the end of cruise with braking, instead of adding all braking time', () => {
  const r=analyseLine(train,{distanceKm:1});
  close(r.travelSeconds,57.5); // 25 acceleration + 22.5 cruise + 10 braking.
  close(r.brakingSeconds,10);
  close(r.peakSpeedKmh,90);
  close(r.travelSeconds-train.model.timeAt(1),5);
});
test('Short route accelerates then brakes without reaching top speed', () => {
  const r=analyseLine(train,{distanceKm:.1});
  const accelTime=Math.sqrt(200/1.4);
  close(r.travelSeconds,accelTime*1.4);
  assert.ok(r.peakSpeedKmh<90);
  close(accelTime**2/2+(accelTime**2/(2*2.5)),100);
});
test('Per-car throughput, terminal delays and both directions are included', () => {
  const r=analyseLine(train,{distanceKm:1});
  assert.equal(r.rate,8);
  assert.equal(r.loadingSeconds,7.5);
  assert.equal(r.stationSeconds,21);
  close(r.roundTripSeconds,157);
  close(r.journeysPerHour,120*3600/157);
  close(r.efficiency,(120/157)/1200);
});
test('Occupancy affects capacity and transfers but not empty-mass travel or fixed delays', () => {
  const full=analyseLine(train,{distanceKm:1});
  const half=analyseLine(train,{distanceKm:1,fillRatio:.5});
  assert.equal(half.travelSeconds,full.travelSeconds);
  assert.equal(half.loadingSeconds,full.loadingSeconds/2);
  close(full.roundTripSeconds-half.roundTripSeconds,15);
  const zero=analyseLine(train,{distanceKm:1,fillRatio:0});
  close(zero.roundTripSeconds,2*full.travelSeconds+12);
  assert.equal(zero.journeysPerHour,0);
  assert.equal(zero.efficiency,0);
});
test('Lower maintenance improves efficiency without changing throughput or travel', () => {
  const a=analyseLine(train,{distanceKm:1});
  const b=analyseLine({...train,economy:{annualMaintenance:600}},{distanceKm:1});
  assert.equal(a.journeysPerHour,b.journeysPerHour);
  assert.equal(a.travelSeconds,b.travelSeconds);
  assert.equal(b.efficiency,2*a.efficiency);
});
test('All 16 supplied formations contribute their expected aggregate rate', async () => {
  const data=JSON.parse(await readFile(new URL('../data/trains.json',import.meta.url)));
  const rates={'draisine':2,'uerdingen':2.5,'acf-m300':2,'roter-pfeil':5,'metroliner':3,'tee-vt115':42,'shinkansen-0':16,'intercity-125':30,'etr-450':44,'re450':12,'ice-1':44,'tgv':30,'talent-1':12,'lastochka':10,'twindexx':12,'fuxing':28};
  assert.equal(data.trains.length,Object.keys(rates).length);
  for(const t of data.trains){
    const r=analyseLine({...t,model:createModel(t,data.source)},{distanceKm:10});
    assert.equal(r.rate,rates[t.id]);
    assert.ok(r.travelSeconds>createModel(t,data.source).timeAt(10));
  }
});
test('Invalid service parameters fail; zero fixed delay is allowed', () => {
  for(const change of [{distanceKm:0},{distanceKm:NaN},{fillRatio:1.1},{fillRatio:-.1},{baseRate:0},{brakingDeceleration:0},{stationDelaySeconds:-1}]){
    assert.throws(()=>analyseLine(train,{distanceKm:1,...change}),RangeError);
  }
  assert.throws(()=>analyseLine({...train,carCount:1.5},{distanceKm:1}),RangeError);
  assert.equal(analyseLine(train,{distanceKm:1,stationDelaySeconds:0}).stationSeconds,15);
});
