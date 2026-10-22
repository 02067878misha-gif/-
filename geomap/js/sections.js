import { state, $, fmt, boundaryW, faultW, faultDash } from "./core.js";
import { laterFaultValue } from "./faults.js";
import { iso, colorRuns, acidPattern } from "./contours.js";
import { linePoints } from "./map.js";
import { relief } from "./terrain.js";
import { layer } from "./geology.js";

function colorFaults(m,xArr,yArr,zArr,nx,ny,sx,sy,h){let d='';
 for(let index=0;index<m.faults.length;index++){let vals=new Float32Array(nx*ny);
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)vals[j*nx+i]=laterFaultValue(xArr[i],yArr[i],zArr[j],m,index);
 let line=iso(vals,nx,ny,sx,sy,h,0);
 d+=`<path d="${line.d}" fill="none" stroke="#d32027" stroke-width=".45" ${faultDash(m.faults[index].old)}/>`
 }return d}
function renderSection(){if(!state.ready)return;
 let m=state.model,ends=linePoints(),a=ends[0],b=ends[1],length=Math.hypot(b.x-a.x,b.y-a.y);
 if(length<1)return;let nx=540,top=new Float32Array(nx),xs=new Float32Array(nx),ys=new Float32Array(nx),lo=Infinity,hi=-Infinity;
 for(let i=0;i<nx;i++){let t=i/(nx-1),x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;xs[i]=x;ys[i]=y;top[i]=relief(x,y,m);lo=Math.min(lo,top[i]);hi=Math.max(hi,top[i])}
 let zmin=Math.floor((lo-Math.max(42,25*m.complexes.length))/10)*10,zmax=Math.ceil((hi+6)/10)*10,height=zmax-zmin;
 let nz=360,vals=new Uint16Array(nx*nz),zArr=new Float32Array(nz);
 for(let j=0;j<nz;j++){let z=zmin+height*j/(nz-1);zArr[j]=z;
 for(let i=0;i<nx;i++)vals[j*nx+i]=z<=top[i]?layer(xs[i],ys[i],z,m):0}
 let geo='',step=length/(nx-1),stepz=height/(nz-1);
 if($('showColors').checked)geo+=colorRuns(vals,nx,nz,step,stepz,height,m.totalMaterialUnits||m.totalUnits);
 else if(m.intrusions?.length)geo+=colorRuns(vals,nx,nz,step,stepz,height,m.totalMaterialUnits,m.totalUnits+1);
 for(let k=1;k<=(m.totalMaterialUnits||m.totalUnits);k++){let mask=new Uint8Array(vals.length);for(let i=0;i<vals.length;i++)mask[i]=vals[i]===k?1:0;
  let c=iso(mask,nx,nz,step,stepz,height,.5);geo+=`<path d="${c.d}" fill="none" stroke="#181818" stroke-width="${fmt(Math.max(.2,boundaryW()*.55))}"/>`
 }
 let fpath='';if($('showFaults').checked){for(let index=0;index<m.faults.length;index++){
  let field=new Float32Array(nx*nz);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)field[j*nx+i]=zArr[j]<=top[i]?laterFaultValue(xs[i],ys[i],zArr[j],m,index):NaN;
  let c=iso(field,nx,nz,step,stepz,height,0);fpath+=`<path d="${c.d}" fill="none" stroke="#d32027" stroke-width="${fmt(Math.max(.35,faultW()*.6))}" ${faultDash(m.faults[index].old)}/>`
 }}
 let topPath='';for(let i=0;i<nx;i++)topPath+=(i===0?'M':'L')+fmt(i*step)+' '+fmt(zmax-top[i]);
 let w=length+40,h=height+34;
 let str=`<rect width="${fmt(w)}" height="${fmt(h)}" fill="white"/>${acidPattern()}<defs><clipPath id="secClip"><rect width="${fmt(length)}" height="${fmt(height)}"/></clipPath></defs>`+
  `<g transform="translate(20 14)"><g clip-path="url(#secClip)">${geo}${fpath}<path d="${topPath}" stroke="black" stroke-width=".45" fill="none"/></g>`+
  `<rect width="${fmt(length)}" height="${fmt(height)}" stroke="#444" stroke-width=".25" fill="none"/>`+
  `<text x="0" y="-3" font-size="3" font-family="Arial">А</text><text x="${fmt(length)}" y="-3" font-size="3" text-anchor="end" font-family="Arial">Б</text>`+
  `<text x="0" y="${fmt(height+8)}" font-size="2.8" fill="#555">0 м</text><text x="${fmt(length)}" y="${fmt(height+8)}" text-anchor="end" font-size="2.8" fill="#555">${fmt(length)} м</text></g>`;
 let sec=$('sectionSvg');sec.setAttribute('viewBox',`0 0 ${fmt(w)} ${fmt(h)}`);sec.style.aspectRatio=`${w}/${h}`;sec.innerHTML=str;
}
let sectionTimer=null;function queueSection(){clearTimeout(sectionTimer);sectionTimer=setTimeout(renderSection,120)}

export { colorFaults, renderSection, queueSection };
