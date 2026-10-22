import { mulberry32, rnd, rad, plane } from './core.js';
import { complexBasalSurface, foldDisplacement } from './structures.js';
import { relief } from './terrain.js';
import { hexMix } from './stratigraphy.js';

/** Simplified, deterministic 3D igneous bodies. Units: metres, m², degrees.
 * Structural displacement is evaluated relative to the intrusion anchor. This
 * avoids subtracting the full regional structural elevation (v19 bug).
 */
const INTRUSION_COLORS={stock:'#89182c',dike:'#89182c',sill:'#89182c'}; // acidic composition: all rock types share red hues
const TYPES={stock:'Шток',dike:'Дайка',sill:'Силл'};
const TAU=2*Math.PI;
function structuralOffset(c,x,y){
 return c.structureType==='folding'?foldDisplacement(c,x,y):plane(0,c.az,c.d,x,y);
}
function structuralGradient(c,x,y){
 if(c.structureType!=='folding'){
  const t=-Math.tan(rad(c.d));
  return {x:t*Math.sin(rad(c.az)),y:t*Math.cos(rad(c.az))};
 }
 const a=rad(c.foldStrike),across=(x-100)*Math.cos(a)-(y-75)*Math.sin(a);
 const v=-c.foldAmplitude*Math.PI/c.foldWidth*Math.sin(Math.PI*across/c.foldWidth);
 return {x:v*Math.cos(a),y:-v*Math.sin(a)};
}
function defaultIntrusion(i=0){
 return {type:['stock','dike','sill'][i%3],area:700,spreadArea:1000,wallDip:8,
  width:8,dip:70,azimuth:90,applyDeformation:false,attachFault:false,
  apophyses:false,roughContact:false};
}
function normalizeIntrusions(list){
 return (Array.isArray(list)?list:[]).slice(0,4).map((v,i)=>({...defaultIntrusion(i),...v,
  applyDeformation:v.type==='sill'?true:!!v.applyDeformation}));
}
// Natural irregularity: long-wavelength lobes always present. Short lobes and
// finger-like apophyses are independent options, with seeded, smooth shapes.
function rawStockOutline(theta,body){
 let v=1;
 for(const term of body.lobes)v+=term.amp*Math.cos(term.freq*theta+term.phase);
 if(body.roughContact){
  for(const term of body.roughLobes)v+=term.amp*Math.cos(term.freq*theta+term.phase);
 }
 if(body.apophyses){
  for(const a of body.fingers){
   const delta=Math.atan2(Math.sin(theta-a.angle),Math.cos(theta-a.angle));
   v+=a.amp*Math.exp(-.5*(delta/a.halfAngle)**2);
  }
 }
 return Math.max(.45,v);
}
function stockOutlineFactors(theta,body){
 if(!body.shapeLookup)return rawStockOutline(theta,body);
 const n=body.shapeLookup.length,at=((theta/TAU)%1+1)%1*n,i=Math.floor(at),f=at-i;
 return body.shapeLookup[i]*(1-f)+body.shapeLookup[(i+1)%n]*f;
}
function buildStockShape(rng,body){
 body.lobes=[2,3,5].map(freq=>({freq,phase:rnd(rng,0,TAU),amp:rnd(rng,.028,.075)}));
 body.roughLobes=[9,13,17,21].map(freq=>({freq,phase:rnd(rng,0,TAU),amp:rnd(rng,.012,.028)}));
 body.fingers=Array.from({length:2+Math.floor(rng()*3)},()=>({
  angle:rnd(rng,0,TAU),halfAngle:rnd(rng,.055,.14),amp:rnd(rng,.35,.95)
 }));
 let s=0;for(let i=0;i<360;i++){const r=rawStockOutline((i+.5)*TAU/360,body);s+=r*r;}
 body.shapeLookup=Float32Array.from({length:1440},(_,i)=>rawStockOutline(i*TAU/1440,body));
 body.referenceRadius=Math.sqrt(body.area/Math.PI);
 body.wallSlope=Math.tan(rad(body.wallDip));
 // Reference cross-sectional area remains the requested value, even with
 // apophyses or irregular contacts.
 body.shapeNorm=Math.sqrt(s/360);
}
function generateIntrusions(m,settings){
 m.intrusions=[];
 for(let ci=0;ci<m.complexes.length;ci++){
  const c=m.complexes[ci],cfg=settings[ci];
  c.intrusions=[];
  normalizeIntrusions(cfg.intrusions).forEach((params,idx)=>{
   const rng=mulberry32((m.seed^Math.imul(ci+41,0x45d9f3b)^Math.imul(idx+37,0x27d4eb2d))|0);
   const refFault=params.attachFault?c.faults[idx%c.faults.length]:null;
   const cx=refFault?refFault.cx:rnd(rng,45,155);
   const cy=refFault?refFault.cy:rnd(rng,35,115);
   const ref=relief(cx,cy,m)-7;
   const body={...params,index:m.intrusions.length,name:`I${m.intrusions.length+1}`,
    complexIndex:ci,id:m.totalUnits+m.intrusions.length+1,cx,cy,ref,centerZ:ref,
    baseAtCenter:complexBasalSurface(c,cx,cy),linkedFault:refFault?.name||null,
    color:hexMix('#89182c','#ca8a8e',m.complexes.length===1?.13:(ci/(m.complexes.length-1))*.90)};
   body.sinAz=Math.sin(rad(body.azimuth));body.cosAz=Math.cos(rad(body.azimuth));
   body.sinDip=Math.sin(rad(body.dip));body.cosDip=Math.cos(rad(body.dip));
   if(body.type==='sill'){
    body.applyDeformation=true; // A sill is always concordant to its host.
    body.aspect=1.65;
    body.footA=Math.sqrt(body.spreadArea*body.aspect/Math.PI);
    body.footB=body.footA/body.aspect;
    // Use a seeded rotation; independent from structural strike.
    body.footAngle=rnd(rng,0,Math.PI);body.footCos=Math.cos(body.footAngle);body.footSin=Math.sin(body.footAngle);
    body.structuralRef=structuralOffset(c,cx,cy);
   }else if(body.type==='dike'){
    const effectiveWidth=body.width/Math.max(.3,Math.abs(body.sinDip));
    // Taper factor ~2/3; the nominal area controls the strike length.
    body.halfLength=Math.max(8,Math.min(120,body.spreadArea/(Math.max(.5,effectiveWidth)*1.5)));
   }else if(body.type==='stock'){
    buildStockShape(rng,body);
   }
   m.intrusions.push(body);c.intrusions.push(body);
  });
 }
 m.totalMaterialUnits=m.totalUnits+m.intrusions.length;
 for(const b of m.intrusions)m.unitStyles[b.id]={unit:b.id,complexIndex:b.complexIndex,
  intrusion:true,name:b.name,type:b.type,color:b.color,pattern:"acidPlus",period:"Кислые интрузивные породы",ageName:m.complexes[b.complexIndex].eraLabel};
}

// Inverse deformation for stocks and dikes. The material frame undergoes
// relative vertical bending PLUS horizontal tilt of its long axis. A local
// slope correction is bounded at steep dips to keep the mapping stable.
function inverseDeformation(p,body,c){
 if(!body.applyDeformation)return p;
 const offset=structuralOffset(c,p.x,p.y)-structuralOffset(c,body.cx,body.cy);
 const g=structuralGradient(c,p.x,p.y);
 const modulus=Math.hypot(g.x,g.y),factor=modulus>0?Math.atan(modulus)/modulus:1;
 const dz=p.z-body.ref;
 return {x:p.x+dz*g.x*factor,y:p.y+dz*g.y*factor,z:p.z-offset};
}
function insideIntrusion(p,body,complex){
 // Evaluate the stratiform sill directly against the *actual* folded or
 // monoclinal bedding surface: no optional checkbox, always concordant.
 if(body.type==='sill'){
  const dx=p.x-body.cx,dy=p.y-body.cy;
  const xx=dx*body.footCos+dy*body.footSin,yy=-dx*body.footSin+dy*body.footCos;
  const normalized=(xx/body.footA)**2+(yy/body.footB)**2;
  if(normalized>=1)return false;
  const taper=(1-normalized)**1.5;
  const hostRelief=structuralOffset(complex,p.x,p.y)-body.structuralRef;
  const centralSurface=body.ref+hostRelief;
  return Math.abs(p.z-centralSurface)<=body.width*.5*taper;
 }
 const q=inverseDeformation(p,body,complex);
 const dx=q.x-body.cx,dy=q.y-body.cy,dz=q.z-body.ref;
 if(body.type==='stock'){
  const theta=Math.atan2(dy,dx);
  const r0=body.referenceRadius;
  // 0°: vertical walls. Negative: radius reduces *upward* toward centre.
  // Positive: radius increases upward away from centre.
  const radius=r0+dz*body.wallSlope;
  if(radius<=0)return false;
  const shape=stockOutlineFactors(theta,body)/body.shapeNorm;
  return dx*dx+dy*dy<=(radius*shape)**2;
 }
 if(body.type==='dike'){
  const cross=dx*body.sinAz+dy*body.cosAz;
  const along=dx*body.cosAz-dy*body.sinAz;
  const v=Math.abs(along)/body.halfLength;
  if(v>=1)return false;
  // Continuous pinching to zero at both lateral tips; the dip is preserved.
  const halfThickness=body.width*.5*(1-v*v)**1.35;
  const normal=cross*body.sinDip+dz*body.cosDip;
  return Math.abs(normal)<=halfThickness;
 }
 return false;
}
export { INTRUSION_COLORS,TYPES,defaultIntrusion,normalizeIntrusions,generateIntrusions,insideIntrusion,
 structuralOffset,structuralGradient,inverseDeformation,stockOutlineFactors };
