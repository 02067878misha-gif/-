import assert from 'node:assert/strict';
import { generateModel, layer } from '../js/geology.js';
import { complexBasalSurface, foldDisplacement } from '../js/structures.js';
import { makeGrid } from '../js/grid.js';
import { laterFaultValue } from '../js/faults.js';
import { relief } from '../js/terrain.js';

const base={minT:4,maxT:32,enableFaults:false,minFaults:0,maxFaults:0,customLayerCount:false,layerCount:5,customDip:false,dip:0,customAzimuth:false,azimuth:0};
const mono=(more={})=>({...base,structureType:'monocline',customDip:true,dip:0,...more});
const fold=(more={})=>({...base,structureType:'folding',foldAmplitude:38,foldWidth:55,foldStrike:0,foldAffectsOlder:false,...more});

const old=mono(), youngOff=fold(), youngOn=fold({foldAffectsOlder:true});
const off=generateModel(42,[old,youngOff]),on=generateModel(42,[old,youngOn]);
assert.equal(off.hasInheritedFolding,undefined);
assert.equal(on.hasInheritedFolding,true);
assert.deepEqual(off.complexes[0],on.complexes[0]);
assert.equal(complexBasalSurface(off.complexes[1],100,75),complexBasalSurface(on.complexes[1],100,75));
// At a younger crest older strata rise exactly by the younger fold displacement.
const olderOnly={complexes:[on.complexes[0]]};
const crest=100, y=75, shift=foldDisplacement(on.complexes[1],crest,y);
assert.equal(shift,38);
const originalZ=on.complexes[0].baseZ+10;
const currentZ=originalZ+shift;
assert.ok(currentZ < complexBasalSurface(on.complexes[1],crest,y));
assert.equal(layer(crest,y,currentZ,on),layer(crest,y,originalZ,olderOnly));
assert.notEqual(layer(crest,y,currentZ,on),layer(crest,y,currentZ,off), 'Old strata must change with inherited folding');
// Younger layers must NOT change with the toggle.
const above=complexBasalSurface(on.complexes[1],crest,y)+3;
assert.equal(layer(crest,y,above,on),layer(crest,y,above,off));
// Non-folded and first/oldest complex toggles have no effect.
const single=generateModel(42,[fold({foldAffectsOlder:true})]);
assert.equal(single.complexes[0].foldAffectsOlder,false);
const ineffective=generateModel(42,[mono(),mono({foldAffectsOlder:true})]);
assert.equal(ineffective.complexes[1].foldAffectsOlder,false);
// Gridded map must change, while topography stays identical.
const g0=makeGrid(off,2),g1=makeGrid(on,2);
assert.deepEqual(g1.heights,g0.heights);
assert.ok(g1.units.some((unit,i)=>unit!==g0.units[i]),'Inherited fold should alter visible old units on map');

// Sequential younger folds act cumulatively on the inherited stack.
const multi=generateModel(23,[mono(),fold({foldAmplitude:15,foldWidth:80,foldAffectsOlder:true}),fold({foldAmplitude:10,foldWidth:80,foldAffectsOlder:true})]);
assert.deepEqual(multi.complexes.map(c=>c.foldAffectsOlder),[false,true,true]);
for(let x=40;x<175;x+=23){
 const z=relief(x,75,multi);
 assert.ok(layer(x,75,z,multi)>=1);
}

// An older fault must receive the younger fold deformation, and still be
// truncated by the younger basal contact.
const synthetic=generateModel(21,[mono(),fold({foldAmplitude:22,foldWidth:50,foldAffectsOlder:true})]);
const oldFault={complexIndex:0,kind:'сброс',az:0,dip:60,cx:100,cy:75,ref:synthetic.complexes[1].baseZ-50,slip:9};
synthetic.complexes[0].faults=[oldFault];synthetic.faults=[oldFault];
const zf=oldFault.ref+foldDisplacement(synthetic.complexes[1],100,75);
assert.ok(Number.isFinite(laterFaultValue(100,75,zf,synthetic,0)));
assert.ok(Math.abs(laterFaultValue(100,75,zf,synthetic,0))<1e-9,'Old fault must be folded with older sequence');
assert.ok(Number.isNaN(laterFaultValue(100,75,complexBasalSurface(synthetic.complexes[1],100,75)+1,synthetic,0)));
console.log('PASS inheritance toggles / crest displacement / young unchanged / maps / multiple episodes / older fault');
