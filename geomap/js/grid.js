import { LX, LY } from "./core.js";
import { relief } from "./terrain.js";
import { layer } from "./geology.js";

// Generation resolution is independent from the random geological model.
function makeGrid(m,step){
 let nx=Math.round(LX/step)+1,ny=Math.round(LY/step)+1,dx=LX/(nx-1),dy=LY/(ny-1);
 let heights=new Float32Array(nx*ny),units=new Uint16Array(nx*ny);
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  let k=j*nx+i,xx=i*dx,yy=j*dy,h=relief(xx,yy,m);
  heights[k]=h;units[k]=layer(xx,yy,h,m)
 }
 return {nx,ny,dx,dy,heights,units}
}

export { makeGrid };
