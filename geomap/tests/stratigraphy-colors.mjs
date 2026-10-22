import assert from "node:assert/strict";
import { generateModel } from "../js/geology.js";
const base={minT:4,maxT:32,enableFaults:false,minFaults:0,maxFaults:0,customLayerCount:false,layerCount:5,customDip:false,dip:25,customAzimuth:false,azimuth:90};
const mk=(n)=>Array.from({length:n},()=>({...base}));
let m=generateModel(42,mk(1));
assert.deepEqual(m.complexes.map(c=>c.eraKey),['paleozoic']);
m=generateModel(42,mk(2));
assert.deepEqual(m.complexes.map(c=>c.eraKey),['paleozoic','mesozoic']);
m=generateModel(42,mk(3));
assert.deepEqual(m.complexes.map(c=>c.eraKey),['paleozoic','mesozoic','cenozoic']);
m=generateModel(42,mk(5));
assert.deepEqual(m.complexes.map(c=>c.eraKey),['proterozoic','proterozoic','paleozoic','mesozoic','cenozoic']);
for(const c of m.complexes){assert.equal(c.colors.length,c.T.length);for(const col of c.colors)assert.match(col,/^#[0-9a-fA-F]{6}$/)}
console.log('PASS stratigraphic color assignment by complex age and layer count');
