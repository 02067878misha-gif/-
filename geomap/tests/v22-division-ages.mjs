import assert from 'node:assert/strict';
import { generateModel } from '../js/geology.js';
import { DIVISIONS, chooseDivisionIndices } from '../js/stratigraphy.js';
const base={minT:4,maxT:32,enableFaults:false,minFaults:0,maxFaults:0,intrusions:[],customLayerCount:false,structureType:'monocline',customDip:false,customAzimuth:false};
for(let seed of [0,1,42,888,-735])for(let n=1;n<=9;n++){
 const settings=Array.from({length:n},()=>({...base}));
 const m=generateModel(seed,settings),a=generateModel(seed,settings);
 assert.deepEqual(m.unitStyles,a.unitStyles);
 let age=-1;const assignments=new Map();
 for(let k=1;k<=m.totalUnits;k++){
  const s=m.unitStyles[k],pool=DIVISIONS[s.eraKey],idx=pool.findIndex(([p,name])=>p===s.period&&name===s.ageName);
  assert.ok(idx>=0,`unknown division ${s.period} ${s.ageName}`);
  assert.equal(s.ageOrder,idx);
  assert.equal(s.color,pool[idx][3]);
  assert.match(s.color,/^#[0-9a-fA-F]{6}$/);
  assert.ok(['отдел','подсистема','система'].includes(s.rank));
  assert.ok(!s.symbol.includes('·'),'no stage abbreviation on map');
  const era={proterozoic:0,paleozoic:1,mesozoic:2,cenozoic:3}[s.eraKey];
  const t=era*100+idx;
  assert.ok(t>=age,'age sequence must never become older');age=t;
  const key=`${s.eraKey}:${s.period}:${s.ageName}`;
  if(assignments.has(key))assert.equal(assignments.get(key),s.color,'a repeated subdivision must repeat its color');
  assignments.set(key,s.color);
 }
}
const many=generateModel(42,[{...base,customLayerCount:true,layerCount:20},{...base,customLayerCount:true,layerCount:20},{...base,customLayerCount:true,layerCount:20}]);
const ageNames=many.unitStyles.slice(1,many.totalUnits+1).map(s=>s.ageName);
assert.ok(new Set(ageNames).size<ageNames.length,'more beds than formal subdivisions need repeated ages');
console.log('PASS v22: reproducible official division ranks, correct chronological order, same color for repeated ages');
