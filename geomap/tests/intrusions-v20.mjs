import assert from 'node:assert/strict';
import { generateModel } from '../js/geology.js';
import { makeGrid } from '../js/grid.js';
import { insideIntrusion, defaultIntrusion, stockOutlineFactors } from '../js/intrusions.js';
import { foldDisplacement } from '../js/structures.js';
const base={minT:4,maxT:32,enableFaults:false,minFaults:0,maxFaults:0,customFaultParams:false,
 customLayerCount:false,structureType:'monocline',customDip:true,dip:25,customAzimuth:true,azimuth:110,intrusions:[]};
const mk=(i={},c={})=>generateModel(42,[{...base,...c,intrusions:[{...defaultIntrusion(),...i}]}]);
function volumeDifference(a,b,part,range=30){
 let n=0;const first=a.intrusions[0],ca=a.complexes[0],cb=b.complexes[0];
 for(let z=-35;z<=35;z+=5)for(let x=-range;x<=range;x+=4)for(let y=-range;y<=range;y+=4){
  const p={x:first.cx+x,y:first.cy+y,z:first.ref+z};
  if(insideIntrusion(p,first,ca)!==insideIntrusion(p,b.intrusions[0],cb))n++;
 }
 assert.ok(n>0,part+' must alter intrusion geometry');
 return n;
}
// Changing only intrusion settings never changes the sediment layer geometry.
const baseline=generateModel(42,[{...base,intrusions:[]}]);
const withStock=mk({type:'stock',area:1100,wallDip:0});
assert.deepEqual(withStock.complexes[0].T,baseline.complexes[0].T);
assert.deepEqual(withStock.hills,baseline.hills);
assert.deepEqual(Array.from(makeGrid(baseline,2).heights),Array.from(makeGrid(withStock,2).heights));
const b=withStock.intrusions[0],c=withStock.complexes[0];
// At 0° stock walls are vertical in the undeformed mode: ray is unchanged
// for equal offset at different elevations.
for(let angle=0;angle<Math.PI*2;angle+=Math.PI/6){
 const d=14,xx=b.cx+d*Math.cos(angle),yy=b.cy+d*Math.sin(angle);
 assert.equal(insideIntrusion({x:xx,y:yy,z:b.ref-25},b,c),insideIntrusion({x:xx,y:yy,z:b.ref+25},b,c));
}
// At positive angles, walls expand upward; at negative angles they contract.
const aPos=mk({type:'stock',area:1100,wallDip:40}).intrusions[0];
const aNeg=mk({type:'stock',area:1100,wallDip:-40}).intrusions[0];
const aZero=mk({type:'stock',area:1100,wallDip:0}).intrusions[0];
function rAt(body,height,angle){return (Math.sqrt(body.area/Math.PI)+height*Math.tan(body.wallDip*Math.PI/180))*stockOutlineFactors(angle,body)/body.shapeNorm}
assert.equal(rAt(aZero,20,0),rAt(aZero,-20,0));
assert.ok(rAt(aPos,20,0)>rAt(aPos,-20,0));
assert.ok(rAt(aNeg,20,0)<rAt(aNeg,-20,0));
// Intrusion shapes have distinct random irregular perimeter, independent of width.
const ap=mk({type:'stock',apophyses:true});
const rough=mk({type:'stock',roughContact:true});
volumeDifference(mk({type:'stock'}),ap,'Apophyses');
volumeDifference(mk({type:'stock'}),rough,'Rough contact');
// Folding and monoclinal deformation must change both dikes and stocks, not
// simply metadata: compare sampled 3D classification with an identical SEED.
for(const structure of [{structureType:'monocline'},{structureType:'folding',foldAmplitude:35,foldWidth:70,foldStrike:45}]){
 for(const type of ['stock','dike']){
  const params={type,area:1000,spreadArea:1000,wallDip:0,azimuth:90,dip:72,width:12};
  volumeDifference(mk({...params,applyDeformation:false},structure),mk({...params,applyDeformation:true},structure),`${type} / ${structure.structureType}`,45);
 }
}
// The sill is ALWAYS concordant: checkbox cannot disable the actual deformation.
for(const structure of [{structureType:'monocline'},{structureType:'folding',foldAmplitude:35,foldWidth:70,foldStrike:45}]){
 const model=mk({type:'sill',applyDeformation:false,width:18,spreadArea:1500},structure);
 const b=model.intrusions[0],c=model.complexes[0];
 assert.equal(b.applyDeformation,true);
 const pts=[[0,0],[7,3],[-5,8]];
 for(const [dx,dy] of pts){
  const x=b.cx+dx,y=b.cy+dy;
  const at=b.ref+(c.structureType==='folding' ?
   foldDisplacement(c,x,y)-foldDisplacement(c,b.cx,b.cy):
   (-Math.tan(c.d*Math.PI/180)*(Math.sin(c.az*Math.PI/180)*dx+Math.cos(c.az*Math.PI/180)*dy)));
  assert.equal(insideIntrusion({x,y,z:at},b,c),true);
 }
 // Elliptic rim is pinched to zero thickness at nominal footprint edge.
 const a=b.footAngle;
 const x=b.cx+Math.cos(a)*b.footA*.995,y=b.cy+Math.sin(a)*b.footA*.995;
 const z=b.ref+(c.structureType==='folding'?foldDisplacement(c,x,y)-foldDisplacement(c,b.cx,b.cy):
 -Math.tan(c.d*Math.PI/180)*(Math.sin(c.az*Math.PI/180)*(x-b.cx)+Math.cos(c.az*Math.PI/180)*(y-b.cy)));
 assert.equal(insideIntrusion({x,y,z:z+1},b,c),false,'Sill must pinch out at rim');
}
// Dike footprints respond to requested nominal spread area and pinch out at ends.
const short=mk({type:'dike',spreadArea:350,azimuth:90,dip:90,width:9}).intrusions[0];
const long=mk({type:'dike',spreadArea:1250,azimuth:90,dip:90,width:9}).intrusions[0];
assert.ok(long.halfLength>short.halfLength);
const cm=mk({type:'dike',spreadArea:1250,azimuth:90,dip:90,width:9});
const body=cm.intrusions[0],host=cm.complexes[0];
assert.equal(insideIntrusion({x:body.cx,y:body.cy,z:body.ref},body,host),true);
assert.equal(insideIntrusion({x:body.cx,y:body.cy+body.halfLength*1.01,z:body.ref},body,host),false);
console.log('PASS v20 stock angles, irregularity, apophyses, rough contact, sill deformation and pinch-out, dike area/pinch-out, stock and dike deformation');
