import { fmt, clamp, unitColor, state } from "./core.js";

// Marching squares; all coordinates are vectors in metres (1 m = 1 mm in SVG).
function iso(values,nx,ny,stepX,stepY,yHeight,level,valid=null,positions=false){
 // Marching squares with shared-edge nodes: joins the individual cell
 // segments into continuous SVG polylines (no butt-cap gaps).
 const nodes=new Map(),horizontal=(nx-1)*ny;
 const get=(i,j,k,t)=>{
  let id,u,v;
  if(k===0){id=j*(nx-1)+i;u=i+t;v=j}
  else if(k===1){id=horizontal+j*nx+i+1;u=i+1;v=j+t}
  else if(k===2){id=(j+1)*(nx-1)+i;u=i+1-t;v=j+1}
  else{id=horizontal+j*nx+i;u=i;v=j+1-t}
  if(!nodes.has(id))nodes.set(id,{x:u*stepX,y:yHeight-v*stepY,adj:[]});
  return id
 };
 const connect=(a,b)=>{nodes.get(a).adj.push(b);nodes.get(b).adj.push(a)};
 for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
  let b=j*nx+i,a=values[b],c=values[b+1],d=values[b+nx+1],e=values[b+nx];
  if(!(Number.isFinite(a)&&Number.isFinite(c)&&Number.isFinite(d)&&Number.isFinite(e)))continue;
  if(valid&&!(valid[b]&&valid[b+1]&&valid[b+nx]&&valid[b+nx+1]))continue;
  const t=[a,c,d,e],cross=[];
  for(let k=0;k<4;k++){
   let v=t[k],w=t[(k+1)%4];
   if((v>=level)!==(w>=level))cross.push(get(i,j,k,(level-v)/(w-v)));
  }
  if(cross.length===2)connect(cross[0],cross[1]);
  else if(cross.length===4){
   let pairs=(a+c+d+e)/4>=level?[[0,1],[2,3]]:[[0,3],[1,2]];
   for(let p of pairs)connect(cross[p[0]],cross[p[1]])
  }
 }
 const seen=new Set(),paths=[],pts=[];
 function walk(start){
  let at=start,prev=-1,chain=[],closed=false,length=0;
  while(!seen.has(at)){
   seen.add(at);let node=nodes.get(at);chain.push(node);
   let next=node.adj.find(v=>v!==prev&&(!seen.has(v)||v===start));
   if(next===undefined)break;
   if(next===start){closed=true;break}
   prev=at;at=next;
  }
  if(chain.length<2)return;
  const d=['M'+fmt(chain[0].x)+' '+fmt(chain[0].y)];
  for(let q=1;q<chain.length;q++){
   length+=Math.hypot(chain[q].x-chain[q-1].x,chain[q].y-chain[q-1].y);
   d.push('L'+fmt(chain[q].x)+' '+fmt(chain[q].y));
  }
  if(closed){length+=Math.hypot(chain[0].x-chain.at(-1).x,chain[0].y-chain.at(-1).y);d.push('Z')}
  paths.push(d.join(''));
  if(positions&&length>18){
   // Calculate the text angle from a 6 m contour segment, rather than
   // from two adjacent raster-grid vertices (which made labels jump).
   const arc=[0];for(let i=1;i<chain.length;i++)
    arc.push(arc[i-1]+Math.hypot(chain[i].x-chain[i-1].x,chain[i].y-chain[i-1].y));
   const getAt=d=>{
    d=clamp(d,0,arc.at(-1));let i=1;
    while(i<arc.length-1&&arc[i]<d)i++;
    const t=(d-arc[i-1])/Math.max(1e-8,arc[i]-arc[i-1]);
    return {x:chain[i-1].x+t*(chain[i].x-chain[i-1].x),
            y:chain[i-1].y+t*(chain[i].y-chain[i-1].y)};
   };
   for(let f of [.22,.38,.56,.73,.85]){
    let d=arc.at(-1)*f;if(d<5||d>arc.at(-1)-5)continue;
    let p=getAt(d),l=getAt(d-4),rr=getAt(d+4),lc=getAt(d-2),rc=getAt(d+2);
    let a1=Math.atan2(lc.y-l.y,lc.x-l.x),a2=Math.atan2(rr.y-rc.y,rr.x-rc.x);
    let bend=Math.abs(Math.atan2(Math.sin(a2-a1),Math.cos(a2-a1)))*180/Math.PI;
    if(bend>22)continue; // don't label sharply bending/looping stretches
    let ang=Math.atan2(rr.y-l.y,rr.x-l.x)*180/Math.PI;
    if(ang>90)ang-=180;if(ang<-90)ang+=180;
    pts.push({x:p.x,y:p.y,length,angle:ang,bend});
   }
  }
 }
 for(let [key,node] of nodes)if(node.adj.length===1&&!seen.has(key))walk(key);
 for(let key of nodes.keys())if(!seen.has(key))walk(key);
 return {d:paths.join(''),points:pts.sort((a,b)=>(b.length-3*b.bend)-(a.length-3*a.bend))}
}
// Vector fills are grouped by horizontal runs, one SVG path per layer.
// This avoids hundreds of thousands of individual coloured cells.
function colorRuns(values,nx,ny,stepX,stepY,height,count,from=1){
 const paths=Array.from({length:count},()=>[]);
 for(let j=0;j<ny;j++){
  const yTop=Math.max(0,height-(j+.5)*stepY),yBot=Math.min(height,height-(j-.5)*stepY);
  for(let i=0;i<nx;){
   const k=values[j*nx+i];let next=i+1;
   while(next<nx&&values[j*nx+next]===k)next++;
   if(k>=from&&k<=count){
    const x0=Math.max(0,(i-.5)*stepX),x1=Math.min(nx*stepX,(next-.5)*stepX);
    paths[k-1].push(`M${fmt(x0)} ${fmt(yTop)}H${fmt(x1)}V${fmt(yBot)}H${fmt(x0)}Z`)
   }
   i=next
  }
 }
 return paths.map((p,i)=>{
  if(!p.length)return '';
  const id=i+1,d=p.join(''),color=unitColor(id);
  const base=`<path d="${d}" fill="${color}" stroke="${color}" stroke-width=".04"/>`;
  return state.model?.unitStyles?.[id]?.intrusion?base+`<path d="${d}" fill="url(#acidPlus)" stroke="none"/>`:base;
 }).join('')
}

function acidPattern(){return '<defs><pattern id="acidPlus" patternUnits="userSpaceOnUse" width="3.1" height="3.1"><path d="M1.55 .75V2.35M.75 1.55H2.35" stroke="#541023" stroke-width=".36" opacity=".80" fill="none"/></pattern></defs>'}
export { iso, colorRuns, acidPattern };
