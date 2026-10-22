import assert from 'node:assert/strict';
import {generateModel} from '../js/geology.js';
import {relief} from '../js/terrain.js';
import {makeGrid} from '../js/grid.js';
import {DIVISIONS} from '../js/stratigraphy.js';
const base={minT:4,maxT:32,enableFaults:false,minFaults:0,maxFaults:0,intrusions:[],customLayerCount:false,structureType:'monocline',customDip:false,customAzimuth:false};
for(let n=1;n<=7;n++){
 const a=generateModel(42,Array.from({length:n},()=>({...base}))),b=generateModel(42,Array.from({length:n},()=>({...base})));
 assert.deepEqual(a,b,'reproducibility seed '+n);
 const times=[];
 for(let i=1;i<=a.totalUnits;i++){
  const style=a.unitStyles[i];
  assert.match(style.color,/^#[0-9a-f]{6}$/);
  assert.ok(DIVISIONS[style.eraKey].some(([period,name])=>period===style.period&&name===style.ageName));
  if(style.eraKey==='proterozoic')assert.equal(style.rank,'система');
  else assert.ok(['отдел','подсистема'].includes(style.rank));
  const eraOrder={proterozoic:0,paleozoic:1,mesozoic:2,cenozoic:3}[style.eraKey];
  times.push(eraOrder*100+style.ageOrder);
 }
 assert.ok(times.every((v,i)=>!i||times[i-1]<=v),'age order must be nondecreasing');
}
const cfg=Array.from({length:3},()=>({...base}));
const oldTerrain=generateModel(50,cfg),explicitDefault=generateModel(50,cfg,{dissection:100,intensity:100,incision:24,subhorizontal:false,positiveIntrusions:false});
assert.deepEqual(makeGrid(oldTerrain,3),makeGrid(explicitDefault,3));
const rugged=generateModel(50,cfg,{dissection:180,intensity:180,incision:40});
assert.notDeepEqual(Array.from(makeGrid(rugged,4).heights),Array.from(makeGrid(oldTerrain,4).heights));
const flat=generateModel(50,cfg,{subhorizontal:true});
function range(model){const arr=Array.from(makeGrid(model,3).heights);return Math.max(...arr)-Math.min(...arr)}
assert.ok(range(flat)<range(oldTerrain)*.25,[range(flat),range(oldTerrain)]);
const withIntrusion={...base,intrusions:[{type:'stock',area:1200,wallDip:0,applyDeformation:false,apophyses:false,roughContact:false,attachFault:false}]};
const noBump=generateModel(53,[withIntrusion],{positiveIntrusions:false});
const hasBump=generateModel(53,[withIntrusion],{positiveIntrusions:true});
assert.equal(noBump.intrusions.length,1);
const b=hasBump.intrusions[0];
assert.ok(relief(b.cx,b.cy,hasBump)>relief(b.cx,b.cy,noBump)+2);
assert.ok(hasBump.unitStyles[hasBump.totalUnits+1].intrusion);
assert.equal(hasBump.unitStyles[hasBump.totalUnits+1].pattern,'acidPlus');
const two=generateModel(12,[withIntrusion,withIntrusion,withIntrusion]);
const fromHex=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
function saturation(hex){const [r,g,b]=fromHex(hex);return Math.max(r,g,b)-Math.min(r,g,b)}
assert.ok(saturation(two.intrusions[0].color)>saturation(two.intrusions.at(-1).color));
console.log('PASS v22: subdivision ordering, default terrain, relief settings, intrusion bump, acid colors by age');
