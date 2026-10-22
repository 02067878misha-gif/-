import { rad } from './core.js';
export const DEFAULT_TERRAIN=Object.freeze({dissection:100,intensity:100,incision:24,subhorizontal:false,positiveIntrusions:false});
function normalizeTerrain(s={}){
 const o={...DEFAULT_TERRAIN,...s};
 const inRange=(v,a,b)=>Number.isFinite(v)?Math.max(a,Math.min(b,v)):a;
 return {dissection:inRange(o.dissection,0,200),intensity:inRange(o.intensity,0,200),incision:inRange(o.incision,0,80),subhorizontal:!!o.subhorizontal,positiveIntrusions:!!o.positiveIntrusions};
}
function intrusionBump(x,y,m){
 if(!m.intrusions?.length)return 0;
 let maxRise=0;
 for(const b of m.intrusions){
  const dx=x-b.cx,dy=y-b.cy;
  let r;
  if(b.type==='stock'){
   const radius=Math.max(7,Math.sqrt(b.area/Math.PI));
   r=Math.hypot(dx,dy)/(radius*1.25);
  }else if(b.type==='sill'){
   const a=b.footA||Math.sqrt(b.spreadArea*1.65/Math.PI),s=b.footB||a/1.65;
   const cs=b.footCos||1,sn=b.footSin||0;
   r=Math.hypot((dx*cs+dy*sn)/a,(-dx*sn+dy*cs)/s);
  }else {
   const az=rad(b.azimuth),along=dx*Math.cos(az)-dy*Math.sin(az),cross=dx*Math.sin(az)+dy*Math.cos(az);
   const length=b.halfLength||Math.max(12,b.spreadArea/(Math.max(b.width,1)*1.5));
   r=Math.hypot(along/length,cross/Math.max(7,b.width*1.6));
  }
  // Support strictly local positive relief with smooth contact at edge.
  const t=Math.max(0,1-r*r);
  maxRise=Math.max(maxRise,Math.min(16,5+Math.sqrt(b.type==='stock'?b.area:b.spreadArea)*.13)*t*t);
 }
 return maxRise;
}
function relief(x,y,m){
 const o=m.terrain||DEFAULT_TERRAIN;
 const flat=o.subhorizontal||false;
 const intensity=(o.intensity??100)/100,dissection=(o.dissection??100)/100,incision=(o.incision??24);
 const scale=flat?.045:intensity;
 let h=58+(flat?.006:.06)*(x-100)-(flat?.004:.03)*(y-75);
 const spacing=Math.sqrt(Math.max(.15,dissection));
 for(let f of m.hills){let u=(x-f.cx)*spacing/f.sx,v=(y-f.cy)*spacing/f.sy;h+=f.amp*scale*Math.exp(-.5*(u*u+v*v))}
 for(let f of m.waves){const phase=2*Math.PI*dissection*(x*Math.cos(f.a)+y*Math.sin(f.a))/f.w+f.p;h+=f.amp*scale*Math.sin(phase)}
 let river=105+15*Math.sin(y/38)+4*Math.sin(y/17);
 const incisionScale=flat?.06:1;
 h-=incision*incisionScale*Math.exp(-.5*((x-river)/(11/spacing))**2);
 for(let f of m.branches){let dist=f.side*(x-f.jx),axis=f.jy+f.bend*dist+3*Math.sin(dist/25);
  let taper=.5*(1+Math.tanh(dist/12))*Math.exp(-Math.max(0,dist)/90);
  h-=(f.depth*(incision/24))*incisionScale*taper*Math.exp(-.5*((y-axis)/(f.width/spacing))**2);
 }
 if(o.positiveIntrusions)h+=intrusionBump(x,y,m);
 return h;
}
export { relief, normalizeTerrain };
