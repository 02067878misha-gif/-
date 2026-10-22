
const LX=200,LY=150,SVG_W=270,SVG_H=215,MAP_X=10,MAP_Y=18,MAP_SX=1.25,MAP_SY=187/150, ns='http://www.w3.org/2000/svg';
const $=id=>document.getElementById(id);
function defaultManualFault(i=0){return {type:['сброс','взброс','сдвиг'][i%3],slip:10,az:45,dip:60}}
function normalizeManualFaults(list,count){const out=[];for(let i=0;i<count;i++)out.push({...defaultManualFault(i),...(list?.[i]||{})});return out}
function makeComplexConfig(base={}){
 const cfg={intrusions:[],minT:4,maxT:32,enableFaults:true,minFaults:1,maxFaults:2,customFaultParams:false,faultCount:2,manualFaults:normalizeManualFaults([],2),customLayerCount:false,layerCount:5,structureType:"monocline",foldAmplitude:20,foldWidth:55,foldStrike:45,foldAffectsOlder:false,customDip:false,dip:25,customAzimuth:false,azimuth:90,...base};
 cfg.manualFaults=normalizeManualFaults(cfg.manualFaults,cfg.faultCount||2);
 cfg.intrusions=(Array.isArray(cfg.intrusions)?cfg.intrusions:[]).map(v=>({...v}));
 return cfg
}
function cloneComplexConfig(cfg){return makeComplexConfig(JSON.parse(JSON.stringify(cfg)))}
const state={terrainConfig:{dissection:100,intensity:100,incision:24,subhorizontal:false,positiveIntrusions:false},showSectionLine:true,showAgeLabels:false,seed:42,params:null,heights:null,units:null,nx:201,ny:151,dx:1,dy:1,faults:[],complexConfig:[makeComplexConfig()],topoPath:'',geoPath:'',fillPath:'',topoLabels:'',faultPath:'',cx:100,cy:75,angle:15,len:185,labels:[],ready:false,model:null};
const palette=['#8bc7d8','#82c06f','#9cbf56','#c9b95b','#d89f57','#c96a55','#b57ac8','#6ea9d9','#8fcd73','#e99b58','#f0ba5c','#f4dd62','#f2bfd8','#d18bc5','#9c65aa'];
function unitColor(unit){return state.model?.unitStyles?.[unit]?.color||palette[(Math.max(1,unit)-1)%palette.length]}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmt=x=>(Math.round(x*100)/100).toString();
const boundaryW=()=>clamp(Number($('boundaryWidth').value)||0.5,0.1,3);
const faultW=()=>clamp(Number($('faultWidth').value)||0.75,0.1,3);
const fontMain=()=>clamp(Number($('fontMain').value)||3.5,2,8);
const fontContour=()=>clamp(Number($('fontContour').value)||3.0,2,8);
const fontLayer=()=>clamp(Number($('fontLayer').value)||3.2,2,8);
function faultDash(old){ const s=$('faultStyle').value; if(s==='solid'||s==='redsolid') return ''; if(s==='dash') return 'stroke-dasharray="2.2 1.2"'; return old?'stroke-dasharray="2.2 1.2"':''; }
const rad=d=>d*Math.PI/180;
const rnd=(rng,a,b)=>a+(b-a)*rng();
function mulberry32(seed){let a=seed|0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
function plane(z,az,d,x,y){return z-Math.tan(rad(d))*(Math.sin(rad(az))*(x-100)+Math.cos(rad(az))*(y-75))}

export { LX, LY, SVG_W, SVG_H, MAP_X, MAP_Y, MAP_SX, MAP_SY, ns, $, state, palette, unitColor, clamp, fmt, boundaryW, faultW, fontMain, fontContour, fontLayer, faultDash, rad, rnd, mulberry32, plane, defaultManualFault, normalizeManualFaults, makeComplexConfig, cloneComplexConfig };
