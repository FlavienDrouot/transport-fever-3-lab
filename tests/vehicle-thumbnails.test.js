import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {railComponents,tramComponents} from '../src/consists.js';

const load=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url)));
const index=await load('vehicle-thumbnails');

test('Every configurable vehicle has complete, locally available original miniature parts',async()=>{
  const [railLocos,railPassenger,railFreight,trains,tramLocos,tramPassenger,tramFreight,trams]=await Promise.all(
    ['rail-locomotives','rail-passenger-wagons','rail-freight-wagons','trains','tram-locomotives','tram-passenger-wagons','tram-freight-wagons','trams'].map(load));
  const catalogue=[...railComponents({locomotives:railLocos.locomotives,passengerWagons:railPassenger.wagons,freightWagons:railFreight.wagons,multipleUnits:trains.trains}),
    ...tramComponents({locomotives:tramLocos.locomotives,passengerWagons:tramPassenger.wagons,freightWagons:tramFreight.wagons,passengerTrams:trams.trams,freightTrams:trams.freightTrams})];
  assert.equal(Object.keys(index.components).length,catalogue.length);
  for(const item of catalogue){
    const thumbnail=index.components[item.id];assert.ok(thumbnail?.parts.length,`Missing ${item.id}`);
    for(const part of thumbnail.parts){
      assert.match(part.src,/^\.\/assets\/vehicle-thumbnails\/[a-f0-9]{64}\.png$/);
      const asset=index.assets[part.src.split('/').at(-1)];assert.ok(asset);
      assert.equal(part.width,asset.width);assert.equal(part.height,asset.height);
    }
  }
  await Promise.all(Object.entries(index.assets).map(async([name,asset])=>{
    assert.doesNotMatch(asset.sourceContent,/mission|campaign/);
    const png=await readFile(new URL(`../assets/vehicle-thumbnails/${name}`,import.meta.url));
    assert.equal(createHash('sha256').update(png).digest('hex'),asset.sha256);
    assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(png.readUInt32BE(16),asset.width);assert.equal(png.readUInt32BE(20),asset.height);
  }));
});

test('Repeated motors and the Avelia rear image follow their complete acquired formations',()=>{
  for(const id of ['rail:multiple-unit:metroliner','rail:locomotive:chinese-class-ss4g']){
    const parts=index.components[id].parts;
    assert.equal(parts.length,2);assert.equal(parts[0].src,parts[1].src);
    assert.equal(parts[0].reverse,false);assert.equal(parts[1].reverse,true);
  }
  const avelia=index.components['rail:multiple-unit:avelia-liberty'].parts;
  assert.equal(avelia.length,11);assert.notEqual(avelia[0].src,avelia.at(-1).src);
  const rear=index.assets[avelia.at(-1).src.split('/').at(-1)];
  assert.match(rear.sourceResource,/avelia_liberty_back_icon_small@2x\.tga$/);
  assert.equal(avelia.at(-1).reverse,false);
});
