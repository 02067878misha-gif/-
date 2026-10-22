import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {generateModel as current} from '../js/geology.js';
import {makeGrid as gridCurrent} from '../js/grid.js';
const root=process.argv[2];if(!root)throw Error('v20 source root needed');
const {generateModel:old}=await import(pathToFileURL(resolve(root,'js/geology.js')).href);
const {makeGrid:gridOld}=await import(pathToFileURL(resolve(root,'js/grid.js')).href);
const base={minT:4,maxT:32,enableFaults:true,minFaults:1,maxFaults:2,customLayerCount:false,structureType:'monocline',intrusions:[]};
for(const [seed,cfg] of [[42,[base]],[179,[base,{...base,structureType:'folding',foldAmplitude:27,foldWidth:56,foldStrike:85,foldAffectsOlder:true}]],[17,[base,{...base,structureType:'monocline'},{...base,structureType:'folding',foldAmplitude:18,foldWidth:90,foldStrike:125,foldAffectsOlder:true}]]]){
 const a=old(seed,cfg),b=current(seed,cfg),g1=gridOld(a,2),g2=gridCurrent(b,2);
 assert.deepEqual(Array.from(g1.heights),Array.from(g2.heights),`SEED ${seed} relief`);
 assert.deepEqual(Array.from(g1.units),Array.from(g2.units),`SEED ${seed} units`);
 assert.deepEqual(a.complexes.map(c=>({az:c.az,d:c.d,T:c.T,baseZ:c.baseZ,faults:c.faults})),b.complexes.map(c=>({az:c.az,d:c.d,T:c.T,baseZ:c.baseZ,faults:c.faults})),`SEED ${seed} geometry`);
 console.log('PASS v20 geometry:',seed,cfg.length);
}

const magma=[{type:'stock',area:850,wallDip:12,applyDeformation:true,apophyses:true,roughContact:true},{type:'dike',width:7,spreadArea:900,dip:65,azimuth:55,applyDeformation:true},{type:'sill',width:6,spreadArea:1400}];
for(const seed of [14,42]){
 const cfg=[{...base,intrusions:magma},{...base,structureType:'folding',foldAmplitude:21,foldWidth:57,foldStrike:80,foldAffectsOlder:true,intrusions:magma}];
 const a=old(seed,cfg),b=current(seed,cfg),g1=gridOld(a,2),g2=gridCurrent(b,2);
 assert.deepEqual(Array.from(g1.heights),Array.from(g2.heights),'intrusive relief');
 assert.deepEqual(Array.from(g1.units),Array.from(g2.units),'intrusive material geometry');
 console.log('PASS unchanged v20 intrusive volume',seed);
}
