import { LX, LY, $, fmt, boundaryW, faultW, fontContour, rad, faultDash } from "./core.js";
import { iso, colorRuns } from "./contours.js";
import { relief } from "./terrain.js";
import { layer } from "./geology.js";
import { laterFaultValue } from "./faults.js";

function buildPaths(grid,m){
 let {nx,ny,dx,dy,heights:ht,units}=grid;
 let contourMarkup='',geoMarkup='',faultMarkup='',topoLabels='',topoMask='';
 const placed=[];
 let min=Infinity,max=-Infinity;for(let v of ht){min=Math.min(v,min);max=Math.max(v,max)}
 let interval=Number($('ci').value);
 for(let lev=Math.ceil(min/interval)*interval;lev<=max;lev+=interval){
  let line=iso(ht,nx,ny,dx,dy,LY,lev,null,true);
  contourMarkup+=`<path d="${line.d}" fill="none" stroke="#b4b4b4" stroke-width=".18"/>`;
  if(lev%(interval*2)===0 && line.points.length){
   let count=0;
   for(let p of line.points){
    if(p.x<8||p.x>LX-8||p.y<8||p.y>LY-8)continue;
    if(placed.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<18))continue;
    // Avoid placing labels on faults or geological contacts.
    const a=rad(p.angle),vx=Math.cos(a),vy=Math.sin(a);
    const checks=[[0,0],[-4*vx,-4*vy],[4*vx,4*vy],[-2*vy,2*vx],[2*vy,-2*vx]];
    let baseUnit=null,clear=true;
    for(let [ox,oy] of checks){
     let xx=p.x+ox,yy=LY-p.y-oy,z=relief(xx,yy,m),u=layer(xx,yy,z,m);
     if(baseUnit!==null&&baseUnit!==u){clear=false;break}
     baseUnit=u;
     for(let fi=0;fi<m.faults.length;fi++){
      if(Math.abs(laterFaultValue(xx,yy,z,m,fi))<3){clear=false;break}
     }
     if(!clear)break;
    }
    if(!clear)continue;
    // White-out only the TOPOGRAPHIC line beneath each number;
    // the geology and faults remain untouched.
    let gap=String(lev).length*1.9+2.0;
    topoMask+=`<rect x="${fmt(p.x-gap/2)}" y="${fmt(p.y-2)}" width="${fmt(gap)}" height="4" transform="rotate(${fmt(p.angle)} ${fmt(p.x)} ${fmt(p.y)})" fill="black"/>`;
    topoLabels+=`<text x="${fmt(p.x)}" y="${fmt(p.y)}" transform="rotate(${fmt(p.angle)} ${fmt(p.x)} ${fmt(p.y)})" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="${fmt(fontContour())}" fill="#b4b4b4">${lev}</text>`;
    placed.push(p);if(++count===2)break;
   }
  }
 }
 // Trace a geological contact only once when two neighboring units differ.
 // At the fine export spacing (0.1 m), this produces smooth vector contacts.
 for(let k=1;k<=(m.totalMaterialUnits||m.totalUnits);k++){let mask=new Uint8Array(units.length);
  for(let j=0;j<units.length;j++)mask[j]=units[j]===k?1:0;
  let line=iso(mask,nx,ny,dx,dy,LY,.5);
  geoMarkup+=`<path d="${line.d}" fill="none" stroke="#191919" stroke-width="${fmt(boundaryW())}" stroke-linejoin="round"/>`
 }
 for(let f=0;f<m.faults.length;f++){
  let field=new Float32Array(ht.length);
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
   let pos=j*nx+i;field[pos]=laterFaultValue(i*dx,j*dy,ht[pos],m,f)
  }
  let line=iso(field,nx,ny,dx,dy,LY,0);
  faultMarkup+=`<path d="${line.d}" fill="none" stroke="#d32027" stroke-width="${fmt(faultW())}" ${faultDash(m.faults[f].old)}/>`
 }
 return {topoPath:contourMarkup,geoPath:geoMarkup,
  fillPath:$('showColors').checked?colorRuns(units,nx,ny,dx,dy,LY,m.totalMaterialUnits||m.totalUnits):'',
  intrusionFillPath:m.intrusions?.length?colorRuns(units,nx,ny,dx,dy,LY,m.totalMaterialUnits,m.totalUnits+1):'',
  topoLabels,topoMask,faultPath:faultMarkup}
}

export { buildPaths };
