// Usage: node tests/compare-v19-without-intrusions.mjs /path/to/original-v19-source-root
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateModel as currentModel } from '../js/geology.js';
import { makeGrid as currentGrid } from '../js/grid.js';
const path=process.argv[2];if(!path)throw new Error('Pass original v19 source root');
const {generateModel:oldModel}=await import(pathToFileURL(resolve(path,'js/geology.js')).href);
const {makeGrid:oldGrid}=await import(pathToFileURL(resolve(path,'js/grid.js')).href);
const base={minT:4,maxT:32,enableFaults:true,minFaults:1,maxFaults:2,customFaultParams:false,
 customLayerCount:false,structureType:'monocline',customDip:false,customAzimuth:false,intrusions:[]};
const cases=[
 {seed:42,cfg:[base]},
 {seed:179,cfg:[base,{...base,structureType:'folding',foldAmplitude:22,foldWidth:65,foldStrike:45,foldAffectsOlder:false}]},
 {seed:51,cfg:[base,{...base,structureType:'folding',foldAmplitude:25,foldWidth:45,foldStrike:90,foldAffectsOlder:true},{...base,structureType:'monocline',enableFaults:false}]},
 {seed:92,cfg:[{...base,enableFaults:false},{...base,structureType:'folding',foldAmplitude:13,foldWidth:55,foldStrike:155,foldAffectsOlder:true},{...base,structureType:'folding',foldAmplitude:31,foldWidth:82,foldStrike:20,foldAffectsOlder:true}]},
];
for(const {seed,cfg} of cases){
 const a=oldModel(seed,cfg),b=currentModel(seed,cfg);
 assert.deepEqual(b,a,'Model changed for SEED '+seed);
 const ga=oldGrid(a,2),gb=currentGrid(b,2);
 assert.deepEqual(Array.from(gb.units),Array.from(ga.units));
 assert.deepEqual(Array.from(gb.heights),Array.from(ga.heights));
 console.log('PASS unchanged geology without intrusions: SEED',seed,'complexes',cfg.length);
}
