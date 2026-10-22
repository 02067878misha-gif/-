// Standalone regression tests for optional counts / dips / azimuths.
// Run from project root: node tests/layer-controls.mjs
import assert from 'node:assert/strict';
import { generateModel, layer } from '../js/geology.js';
import { relief } from '../js/terrain.js';
import { makeGrid } from '../js/grid.js';
const base={minT:4,maxT:32,enableFaults:false,minFaults:0,maxFaults:0,customLayerCount:false,layerCount:5,customDip:false,dip:25,customAzimuth:false,azimuth:90};
const make=(opts={})=>({...base,...opts});
function check(settings,expected){
 const a=generateModel(42,settings),b=generateModel(42,settings);
 assert.deepEqual(a,b,'SEED must be reproducible');
 assert.equal(a.totalUnits,expected.reduce((a,b)=>a+b,0));
 let offset=1;
 for(let i=0;i<expected.length;i++){
  assert.equal(a.complexes[i].T.length,expected[i]);
  assert.equal(a.complexes[i].firstUnit,offset);
  assert.equal(a.complexes[i].T.at(-1),null);
  if(i===0)assert.equal(a.complexes[i].T[0],null);
  offset+=expected[i];
 }
 for(let i=0;i<41;i++)for(let j=0;j<31;j++){
  const x=i*5,y=j*5,z=relief(x,y,a),k=layer(x,y,z,a);
  assert.ok(Number.isInteger(k)&&k>=1&&k<=a.totalUnits,`Invalid layer ${k} at (${x},${y})`);
 }
 const grid=makeGrid(a,2);
 assert.ok(Array.from(grid.units).every(k=>k>=1&&k<=a.totalUnits));
 return a;
}
const defaultModel=check([make()],[5]);
assert.equal(defaultModel.complexes[0].T.length,5);
const mixed=check([
 make({customLayerCount:true,layerCount:3,customDip:true,dip:0,customAzimuth:true,azimuth:0}),
 make({customLayerCount:true,layerCount:8,customDip:true,dip:22.5,customAzimuth:true,azimuth:175.5}),
 make({customLayerCount:true,layerCount:2,customDip:true,dip:80,customAzimuth:true,azimuth:359.9}),
],[3,8,2]);
assert.deepEqual(mixed.complexes.map(c=>c.d),[0,22.5,80]);
assert.deepEqual(mixed.complexes.map(c=>c.az),[0,175.5,359.9]);
check([make({customLayerCount:true,layerCount:1}),make({customLayerCount:true,layerCount:1})],[1,1]);
check([make({customLayerCount:true,layerCount:20})],[20]);
const noOverrides=check([make({customDip:false,dip:80,customAzimuth:false,azimuth:301,customLayerCount:false,layerCount:19})],[5]);
assert.equal(noOverrides.complexes[0].d,defaultModel.complexes[0].d);
assert.equal(noOverrides.complexes[0].az,defaultModel.complexes[0].az);
console.log('PASS manual angles, azimuths, layer counts, deterministic SEED, indexes, sampled classification and gridding');
