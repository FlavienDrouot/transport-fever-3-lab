import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const data = JSON.parse(await readFile(new URL('../data/trains.json', import.meta.url)));
const names = ['Draisine','ACF M-300','CLe 2/4 Roter Pfeil','Autorail Uerdingen','TEE VT 11.5','Shinkansen série 0','Metroliner','Inter-City 125','Italian Class ETR 450','Swiss Re 450 DPZ','ICE 1','TGV Duplex','Talbot Talent 1','ES1 Lastochka','RABe 502 Twindexx','Fuxing Hao'];
test('Every distinct vehicle in the three list captures has exactly one data card', () => {
 assert.equal(data.trains.length, 16);
 assert.equal(new Set(data.trains.map(t=>t.id)).size,16);
 assert.deepEqual(data.trains.map(t=>t.name).sort(), [...names].sort());
 assert.deepEqual(data.trains.slice(0,4).map(t=>t.id),['metroliner','twindexx','tgv','fuxing']);
});
test('Screenshot values retain physical units, normal difficulty, all indicators and provenance', () => {
 for (const t of data.trains) {
  assert.equal(t.economy.difficulty,'normal');
  assert.ok(t.economy.purchasePrice>0 && t.economy.annualMaintenance>0);
  assert.ok(t.lengthMetres>0 && t.passengerCapacity>0 && t.loadingUnloadingSpeedMultiplier>0);
  assert.equal(t.sourceCapture.indicators.length,4);
  assert.equal(t.sourceCapture.raw.name,t.name);
  assert.equal(t.sourceCapture.raw.year,String(t.year));
  assert.equal(t.sourceCapture.raw.maxSpeed,`${t.maxSpeedKmh} km/h`);
  assert.equal(t.sourceCapture.raw.mass.replace(',','.').replace(' t','')*1,t.massTonnes);
  assert.equal(t.sourceCapture.raw.tractiveEffort.replaceAll(' ','').replace('kgf','')*1,t.tractionKgf);
  assert.equal(t.sourceCapture.raw.power.replaceAll(' ','').replace(',','.').replace('ch','')*1,t.powerCh);
  assert.equal(t.sourceCapture.raw.purchasePrice.replaceAll(' ','').replace('$','')*1,t.economy.purchasePrice);
  assert.equal(t.sourceCapture.raw.maintenance.replaceAll(' ','').replace('$','').replace('/an','')*1,t.economy.annualMaintenance);
  assert.ok(t.sourceCapture.attachment.endsWith('.png'));
  assert.equal(t.sourceCapture.indicators[1].displayValue,t.noise);
  assert.equal(t.sourceCapture.indicators[2].displayValue,t.pollution);
  assert.equal(t.sourceCapture.indicators[3].displayValue,t.comfort);
 }
 const draisine=data.trains.find(t=>t.id==='draisine');
 assert.equal(draisine.powerCh,1.4);
 assert.equal(draisine.propulsion,'horse');
 assert.equal(data.trains.find(t=>t.id==='roter-pfeil').economy.purchasePrice/ data.trains.find(t=>t.id==='roter-pfeil').economy.annualMaintenance,12);
});
