import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { generateModel,layer } from '../js/geology.js';
import { makeGrid } from '../js/grid.js';
const oldRoot=process.argv[2];
if(!oldRoot)throw Error('Usage: node tests/compare-v17-without-intrusions.mjs <v17-src-dir>');
const {generateModel:oldModel}=await import(pathToFileURL(resolve(oldRoot,'js/geology.js')));
const {makeGrid:oldGrid}=await import(pathToFileURL(resolve(oldRoot,'js/grid.js')));
const cfg={minT:4,maxT:32,enableFaults:true,minFaults:1,maxFaults:2,customFaultParams:false,faultCount:2,customLayerCount:false,layerCount:5,customDip:false,dip:25,customAzimuth:false,azimuth:90};
const fold={...cfg,structureType:'folding',foldAmplitude:32,foldWidth:48,foldStrike:12};
const specs=[[42,[cfg]],[53,[cfg,fold]],[71,[cfg,{...fold,foldAffectsOlder:true}]],[88,[fold,{...fold,foldAffectsOlder:false},cfg]],[-42,[fold,{...fold,foldAffectsOlder:true},fold]]];
function hash(vals){return createHash('sha256').update(new Uint8Array(vals.buffer,vals.byteOffset,vals.byteLength)).digest('hex').slice(0,20)}
for(const [seed,configs] of specs){
 const old=oldModel(seed,configs),neo=generateModel(seed,configs.map(c=>({...c,intrusions:[]})));
 const a=oldGrid(old,2),b=makeGrid(neo,2);
 assert.deepEqual(a.units,b.units);
 assert.deepEqual(a.heights,b.heights);
 assert.deepEqual(neo.complexes.map(c=>c.faults),old.complexes.map(c=>c.faults));
 assert.equal(neo.intrusions.length,0);
 console.log('PASS v17 geometric compatibility',seed,configs.length,'complexes:',hash(b.units));
}
