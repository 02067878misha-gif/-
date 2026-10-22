import assert from 'node:assert/strict';
import { generateModel, layer } from '../js/geology.js';
import { complexBasalSurface } from '../js/structures.js';
import { makeGrid } from '../js/grid.js';
import { relief } from '../js/terrain.js';
const defaults={minT:4,maxT:32,enableFaults:false,minFaults:0,maxFaults:0,customLayerCount:false,layerCount:5,customDip:false,dip:25,customAzimuth:false,azimuth:90};
const folding=(extra={})=>({...defaults,structureType:'folding',foldAmplitude:20,foldWidth:50,foldStrike:0,...extra});
const mono=(extra={})=>({...defaults,structureType:'monocline',...extra});

// Axes strike north and are parallel to Y: crest at x=100, trough x=150.
const m=generateModel(42,[folding()]);
const c=m.complexes[0];
assert.equal(c.structureType,'folding');
assert.ok(Math.abs(complexBasalSurface(c,100,75)-(c.baseZ+20))<1e-9);
assert.ok(Math.abs(complexBasalSurface(c,150,75)-(c.baseZ-20))<1e-9);
assert.ok(Math.abs(complexBasalSurface(c,100,140)-complexBasalSurface(c,100,10))<1e-9);
assert.ok(Math.abs(complexBasalSurface(c,50,75)-(c.baseZ-20))<1e-9);
const inclined=generateModel(42,[folding({foldStrike:90})]).complexes[0];
assert.ok(Math.abs(complexBasalSurface(inclined,10,75)-complexBasalSurface(inclined,180,75))<1e-9);
assert.ok(Math.abs(complexBasalSurface(inclined,100,125)-(inclined.baseZ-20))<1e-8);

// Constant offsets ensure consistent thickness of each folded layer.
for (let x=30;x<=170;x+=7) for(let y=25;y<=125;y+=10){
  const z=complexBasalSurface(c,x,y);
  assert.equal(layer(x,y,z+0.5,m),c.firstUnit+1);
  assert.equal(layer(x,y,z+0.5+c.T[1],m),c.firstUnit+2);
}
// Create mono / folding, folding / mono and multiple folded complexes.
for(const config of [
 [folding()], [mono(),folding()], [folding(),mono()], [folding({foldStrike:25}),folding({foldStrike:115}),mono()],
 [mono({enableFaults:true,minFaults:1,maxFaults:1}), folding({enableFaults:true,minFaults:1,maxFaults:1})]
]){
  const a=generateModel(123,config),b=generateModel(123,config);
  assert.deepEqual(a,b,'same settings and seed must be deterministic');
  const grid=makeGrid(a,2);
  assert.ok(grid.units.every(k=>k>0&&k<=a.totalUnits));
  for(let x=0;x<=200;x+=10)for(let y=0;y<=150;y+=10){
   const k=layer(x,y,relief(x,y,a),a);
   assert.ok(Number.isInteger(k)&&k>0&&k<=a.totalUnits);
  }
}
console.log('PASS fold axes, amplitude, width, stratigraphic boundaries, mixed complexes, faults and deterministic model');
