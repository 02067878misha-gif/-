import { mulberry32, rnd, LX, LY, rad } from "./core.js";
import { undo } from "./faults.js";
import { relief, normalizeTerrain } from "./terrain.js";
import { assignChronostratigraphy } from "./stratigraphy.js";
import { complexBasalSurface, undoFoldForOlderRocks } from "./structures.js";
import { generateIntrusions, insideIntrusion } from "./intrusions.js";

// A stack of complexes with individually selectable layer counts, deformed in chronological order.
// To classify a point, undo faults youngest-to-oldest and check each
// progressively eroded complex against the basal angular unconformity.
function layer(x,y,z,m){
 let p={x,y,z};
 for(let ci=m.complexes.length-1;ci>=0;ci--){
  const c=m.complexes[ci];p=undo(p,c.faults);
  // Check intrusions of the current age before sedimentary strata.
  // Younger complexes above this level have already taken precedence.
  for(let ii=c.intrusions?.length-1;ii>=0;ii--)
   if(insideIntrusion(p,c.intrusions[ii],c))return c.intrusions[ii].id;
  if(ci>0){
   let b=complexBasalSurface(c,p.x,p.y);
   if(p.z<b){
    // Only rocks below the younger basal contact are affected by inherited folding.
    p=undoFoldForOlderRocks(p,c);
    continue;
   }
   let k=c.firstUnit;
   for(let j=0;j<c.T.length-1;j++){
    b+=c.T[j]/(c.structureType==='folding'?1:Math.cos(rad(c.d)));
    if(p.z>=b)k=c.firstUnit+j+1;
   }
   return k;
  }
  let b=complexBasalSurface(c,p.x,p.y);
  if(p.z<b)return 1;
  let k=c.T.length>1?c.firstUnit+1:c.firstUnit;
  for(let j=1;j<c.T.length-1;j++){
   b+=c.T[j]/(c.structureType==='folding'?1:Math.cos(rad(c.d)));
   if(p.z>=b)k=c.firstUnit+j+1;
  }
  return k;
 }
 return 1;
}
function generateModel(seed,settings,terrainSettings){
 const rng=mulberry32(seed),m={seed,terrain:normalizeTerrain(terrainSettings),hills:[],waves:[],branches:[],faults:[],complexes:[],totalUnits:settings.reduce((sum,c)=>sum+(c.customLayerCount?c.layerCount:5),0)};
 for(let i=0;i<8;i++)m.hills.push({cx:rnd(rng,-30,230),cy:rnd(rng,-30,180),sx:rnd(rng,18,50),sy:rnd(rng,18,50),amp:rnd(rng,-14,18)});
 for(let p of [[120,9],[68,5],[35,2]])m.waves.push({w:p[0],amp:p[1],a:rnd(rng,0,2*Math.PI),p:rnd(rng,0,2*Math.PI)});
 for(let i=0;i<6;i++){let jy=rnd(rng,12,138),jx=105+15*Math.sin(jy/38)+4*Math.sin(jy/17);
   m.branches.push({jy,jx,side:rng()<.5?-1:1,bend:rnd(rng,-.25,.25),depth:rnd(rng,6,12),width:rnd(rng,6,9)})}
 let sample=[];for(let j=0;j<=90;j++)for(let i=0;i<=120;i++)sample.push(relief(i*LX/120,j*LY/90,m));
 sample.sort((a,b)=>a-b);m.u0=sample[Math.floor(sample.length/2)];
 const n=settings.length;
 for(let i=0;i<n;i++){
  // A separate seeded stream keeps an older complex unchanged when a new one is added.
  const r=mulberry32((seed^(Math.imul(i+1,0x45d9f3b)))|0),cfg=settings[i];
  const choices=Array.from({length:26},(_,j)=>j+15).filter(d=>i===0||Math.abs(d-m.complexes[i-1].d)>=10);
  let dip=choices[Math.floor(r()*choices.length)],az=Math.floor(r()*360);
  // Consume the same seeded random numbers as v12 before applying manual overrides.
  if(cfg.customDip)dip=cfg.dip;
  if(cfg.customAzimuth)az=cfg.azimuth;
  const count=cfg.customLayerCount?cfg.layerCount:5,T=Array(count).fill(null);
  const bounded=Array.from({length:i===0?Math.max(0,count-2):Math.max(0,count-1)},(_,j)=>i===0?j+1:j);
  const values=bounded.map((_,k)=>Math.round(cfg.minT+(cfg.maxT-cfg.minT)*(k+r())/bounded.length));
  for(let k=values.length-1;k>0;k--){let j=Math.floor(r()*(k+1));[values[k],values[j]]=[values[j],values[k]]}
  bounded.forEach((idx,k)=>T[idx]=values[k]);
  m.complexes.push({index:i,firstUnit:1+m.complexes.reduce((sum,c)=>sum+c.T.length,0),az,d:dip,T,
   structureType:cfg.structureType==='folding'?'folding':'monocline',
   foldAmplitude:cfg.foldAmplitude??20,foldWidth:cfg.foldWidth??55,foldStrike:cfg.foldStrike??45,
   foldAffectsOlder:i>0&&cfg.structureType==='folding'&&cfg.foldAffectsOlder===true,
   baseZ:i===0?0:m.u0-22*(n-1-i),faults:[],cfg});
 }
 // The oldest reference is the first internal contact. Later basal surfaces
 // truncate older complexes and represent successive angular unconformities.
 m.complexes[0].baseZ=(n===1?m.u0:m.complexes[1].baseZ)-28;
 let counter=0;
 for(let ci=0;ci<n;ci++){
  const c=m.complexes[ci],cfg=c.cfg,r=mulberry32((seed^Math.imul(ci+11,0x27d4eb2d))|0);
  const count=cfg.enableFaults?(cfg.customFaultParams?cfg.faultCount:(cfg.minFaults+Math.floor(r()*(cfg.maxFaults-cfg.minFaults+1)))):0;
  const kinds=['вверх','вниз','левый сдвиг','правый сдвиг'];
  for(let j=kinds.length-1;j>0;j--){let k=Math.floor(r()*(j+1));[kinds[j],kinds[k]]=[kinds[k],kinds[j]]}
  for(let fi=0;fi<count;fi++){
   let xc=100,yc=75,z=relief(100,75,m);
   for(let tryNo=0;tryNo<180;tryNo++){
    let tx=rnd(r,20,180),ty=rnd(r,20,130),tz=relief(tx,ty,m),visible=0;
    for(let k=n-1;k>0;k--)if(tz>=complexBasalSurface(m.complexes[k],tx,ty)){visible=k;break}
    if(visible===ci){xc=tx;yc=ty;z=tz;break}
   }
   const randomKind=kinds[fi%4],manual=cfg.customFaultParams?cfg.manualFaults?.[fi]:null;
   const kind=manual?manual.type:randomKind.includes('сдвиг')?'сдвиг':(randomKind==='вверх'?'взброс':'сброс');
   const f={complexIndex:ci,old:ci<n-1,name:'F'+(++counter),az:manual?manual.az:rnd(r,0,180),dip:manual?manual.dip:Math.floor(rnd(r,40,81)),cx:xc,cy:yc,ref:z,
     kind,slip:manual?manual.slip:(randomKind.includes('сдвиг')?rnd(r,10,18):rnd(r,7,12))};
   c.faults.push(f);m.faults.push(f);
  }
 }
 if(m.complexes.some(c=>c.foldAffectsOlder))m.hasInheritedFolding=true;
 m.unitStyles=assignChronostratigraphy(m.complexes,m.totalUnits,seed);
 generateIntrusions(m,settings);
 return m;
}

export { layer, generateModel };
