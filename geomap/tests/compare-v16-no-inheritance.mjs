import assert from 'node:assert/strict';
import { generateModel as newModel } from '../js/geology.js';
import { makeGrid as newGrid } from '../js/grid.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const oldRoot=process.argv[2];
if(!oldRoot){console.error('Usage: node tests/compare-v16-no-inheritance.mjs /path/to/original-v16-source');process.exit(2);}
const {generateModel:oldModel}=await import(pathToFileURL(resolve(oldRoot,'js/geology.js')));
const {makeGrid:oldGrid}=await import(pathToFileURL(resolve(oldRoot,'js/grid.js')));

const base={minT:4,maxT:32,enableFaults:true,minFaults:1,maxFaults:2,customLayerCount:false,layerCount:5,customDip:false,dip:25,customAzimuth:false,azimuth:90};
const mono={...base,structureType:'monocline'};
const fold={...base,structureType:'folding',foldAmplitude:22,foldWidth:65,foldStrike:15};
const specs=[
 {seed:42,configs:[mono]},
 {seed:42,configs:[fold]},
 {seed:42,configs:[mono,fold]},
 {seed:179,configs:[fold,mono]},
 {seed:179,configs:[fold,fold]},
 {seed:-42,configs:[mono,fold,mono]},
 {seed:701,configs:[fold,mono,fold]},
 {seed:117,configs:[fold,fold,fold]}
];
for(const {seed,configs} of specs){
 const a=oldModel(seed,configs),b=newModel(seed,configs.map(c=>({...c,foldAffectsOlder:false})));
 assert.deepEqual(a.complexes.map(c=>({az:c.az,d:c.d,T:c.T,baseZ:c.baseZ,firstUnit:c.firstUnit,faults:c.faults})),b.complexes.map(c=>({az:c.az,d:c.d,T:c.T,baseZ:c.baseZ,firstUnit:c.firstUnit,faults:c.faults})),`Structural data for SEED ${seed}`);
 const ga=oldGrid(a,2),gb=newGrid(b,2);
 assert.deepEqual(ga.heights,gb.heights,`Relief mismatch for SEED ${seed}`);
 assert.deepEqual(ga.units,gb.units,`Geology mismatch for SEED ${seed}`);
 console.log(`PASS SEED ${seed}: ${configs.length} complexes with folding=${configs.some(c=>c.structureType==='folding')}`);
}
console.log('PASS v16 geology identical when inheritance disabled');
