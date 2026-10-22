import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {generateModel} from '../js/geology.js';
import {makeGrid} from '../js/grid.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/v15-monocline-baseline.json',import.meta.url),'utf8'));
const hash=arr=>createHash('sha256').update(Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength)).digest('hex');
for(const entry of fixtures){
  const {seed,configs,complexes,hashUnits,hashHeights}=entry;
  const model=generateModel(seed,configs.map(c=>({...c,structureType:'monocline'})));
  const actual=model.complexes.map(c=>({az:c.az,d:c.d,T:c.T,baseZ:c.baseZ,firstUnit:c.firstUnit,faults:c.faults}));
  assert.deepEqual(actual,complexes,`SEED ${seed} structural data differs from v15`);
  const grid=makeGrid(model,2);
  assert.equal(hash(grid.units),hashUnits,`SEED ${seed} geological map differs from v15`);
  assert.equal(hash(grid.heights),hashHeights,`SEED ${seed} relief differs from v15`);
  console.log(`PASS SEED ${seed}: monocline structure, faults, map and terrain identical to v15`);
}
