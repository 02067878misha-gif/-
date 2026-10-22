// Compare the original v12 single-file engine with the refactored ES modules.
// v14 intentionally changes only the colour scheme, so this test keeps colours disabled and checks geometry.
// Usage: node tests/compare-v12.mjs /path/to/original/index.html
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import crypto from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const original=process.argv[2];
if(!original){console.error('Usage: node tests/compare-v12.mjs /path/to/original/index.html');process.exit(2)}
const html=readFileSync(resolve(original),'utf8');
const inline=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
// We do not run DOM event registration in this scientific-model comparison.
const originalEngine=inline.slice(0,inline.indexOf("$('generate').addEventListener"));
function makeDom(){
 const nodes={ci:{value:'5'},boundaryWidth:{value:'0.5'},faultWidth:{value:'0.75'},fontContour:{value:'3.0'},fontLayer:{value:'3.2'},fontMain:{value:'3.5'},faultStyle:{value:'geo'},showColors:{checked:false},showContours:{checked:true},showFaults:{checked:true},sectionSvg:{innerHTML:'',style:{},setAttribute(k,v){this[k]=v;}}};
 return {nodes,document:{getElementById(id){return nodes[id]||(nodes[id]={value:'',checked:false})}}};
}
const oldDOM=makeDom(),newDOM=makeDom();
const context=vm.createContext({document:oldDOM.document,console,Math,Number,Date,Uint8Array,Uint16Array,Float32Array,Map,Set,setTimeout,clearTimeout,URL});
vm.runInContext(originalEngine,context,{timeout:120000});
globalThis.document=newDOM.document;
const {generateModel}=await import('../js/geology.js');
const {makeGrid}=await import('../js/grid.js');
const {buildPaths}=await import('../js/paths.js');
const {state}=await import('../js/core.js');
const {mapMarkup}=await import('../js/map.js');
const {renderSection}=await import('../js/sections.js');
const configurations=[
 {seed:42,settings:[{minT:4,maxT:32,enableFaults:true,minFaults:1,maxFaults:2}],color:false},
 {seed:179,settings:[{minT:3,maxT:34,enableFaults:true,minFaults:2,maxFaults:2},{minT:4,maxT:32,enableFaults:true,minFaults:1,maxFaults:2}],color:false},
 {seed:-42,settings:[{minT:10,maxT:50,enableFaults:false,minFaults:0,maxFaults:0},{minT:2,maxT:38,enableFaults:true,minFaults:1,maxFaults:3},{minT:4,maxT:24,enableFaults:false,minFaults:0,maxFaults:0}],color:false},
];
for(const {seed,settings,color} of configurations){
 oldDOM.nodes.showColors.checked=color;newDOM.nodes.showColors.checked=color;
 const old=JSON.parse(JSON.stringify(vm.runInContext(`(()=>{const model=generateModel(${seed},${JSON.stringify(settings)});const grid=makeGrid(model,1);const paths=buildPaths(grid,model);Object.assign(state,grid,paths,{ready:true,seed:${seed},model,labels:[]});renderSection();return {model:JSON.stringify(model),grid:{heights:Array.from(grid.heights),units:Array.from(grid.units)},paths,map:mapMarkup(),section:document.getElementById('sectionSvg').innerHTML}})()`,context,{timeout:120000})));
 const model=generateModel(seed,settings),grid=makeGrid(model,1),paths=buildPaths(grid,model);
 Object.assign(state,grid,paths,{ready:true,seed,model,labels:[]});renderSection();
 const actual={model:JSON.stringify(model),grid:{heights:Array.from(grid.heights),units:Array.from(grid.units)},paths,map:mapMarkup(),section:newDOM.nodes.sectionSvg.innerHTML};
 for(const key of ['grid','paths','map','section'])assert.deepStrictEqual(actual[key],old[key],`Differences for seed ${seed}, ${key}`);
 console.log(`PASS SEED ${seed}, complexes ${settings.length}, grid+paths+map+section: `+crypto.createHash('sha256').update(actual.map).digest('hex').slice(0,16));
}
console.log('ALL ORIGINAL v12 GEOMETRY EQUIVALENCE CHECKS PASSED');
