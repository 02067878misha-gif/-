import assert from 'node:assert/strict';
import { generateModel, layer } from '../js/geology.js';
import { insideIntrusion, defaultIntrusion } from '../js/intrusions.js';
import { foldDisplacement } from '../js/structures.js';
import { relief } from '../js/terrain.js';
import { makeGrid } from '../js/grid.js';
const config={minT:4,maxT:32,enableFaults:false,minFaults:0,maxFaults:0,customFaultParams:false,customLayerCount:false,structureType:'monocline'};
const make=(overrides={})=>({...config,intrusions:[],...overrides});
const baseline=generateModel(42,[make()]);
assert.equal(baseline.totalMaterialUnits,5);
assert.equal(baseline.intrusions.length,0);
// The generating geometry is reproducible and each intrusion has an independent material id.
const objects=[
 {...defaultIntrusion(0),type:'stock',area:1200,wallDip:0},
 {...defaultIntrusion(1),type:'dike',width:14,azimuth:90,dip:65},
 {...defaultIntrusion(2),type:'sill',width:16},
 {...defaultIntrusion(0),type:'stock',area:350,wallDip:-15}
];
const model=generateModel(42,[make({intrusions:objects})]);
assert.deepEqual(model,generateModel(42,[make({intrusions:objects})]));
assert.deepEqual(model.intrusions.map(i=>i.id),[6,7,8,9]);
assert.deepEqual(model.intrusions.map(i=>i.type),['stock','dike','sill','stock']);
assert.equal(model.totalMaterialUnits,9);
const grid=makeGrid(model,1);
assert.ok([...grid.units].some(k=>k>model.totalUnits),'Bodies must appear at surface');
for(const body of model.intrusions){
 assert.ok(insideIntrusion({x:body.cx,y:body.cy,z:body.ref},body,model.complexes[body.complexIndex])||body.type==='sill');
}
// Unfolded and folded intrusions are different geometries; stock is evaluated
// in the reference coordinate frame if its checkbox is checked.
const folding={...make({structureType:'folding',foldAmplitude:30,foldWidth:60,foldStrike:0})};
const foldedBody={...defaultIntrusion(0),type:'stock',area:700,wallDip:22,applyDeformation:true};
const unfoldedBody={...foldedBody,applyDeformation:false};
const foldedModel=generateModel(51,[{...folding,intrusions:[foldedBody]}]);
const unfoldedModel=generateModel(51,[{...folding,intrusions:[unfoldedBody]}]);
assert.equal(foldedModel.intrusions[0].cx,unfoldedModel.intrusions[0].cx);
let diff=0;
for(let dz=-30;dz<=30;dz+=6)for(let dx=-35;dx<=35;dx+=5)for(let dy=-35;dy<=35;dy+=5){
 const b=foldedModel.intrusions[0],p={x:b.cx+dx,y:b.cy+dy,z:b.ref+dz};
 if(insideIntrusion(p,b,foldedModel.complexes[0])!==insideIntrusion(p,unfoldedModel.intrusions[0],unfoldedModel.complexes[0]))diff++;
}
assert.ok(diff>0,'Fold deformation must alter intrusive stock footprint');
// Tying a stock to a fault puts its centre on that fault's reference point.
const link=generateModel(24,[make({enableFaults:true,customFaultParams:true,faultCount:1,
 manualFaults:[{type:'сброс',slip:10,az:80,dip:65}],intrusions:[{...defaultIntrusion(0),attachFault:true}]})]);
assert.equal(link.intrusions[0].linkedFault,link.faults[0].name);
assert.equal(link.intrusions[0].cx,link.faults[0].cx);
assert.equal(link.intrusions[0].cy,link.faults[0].cy);
// No intrusions: old sediment layer codes and grids remain unchanged.
const withEmpty=generateModel(42,[make({intrusions:[]})]);
assert.deepEqual(Array.from(makeGrid(withEmpty,2).units),Array.from(makeGrid(baseline,2).units));
console.log('PASS intrusive stock/dike/sill volume / material ids / folding / fault link / default compatibility');
