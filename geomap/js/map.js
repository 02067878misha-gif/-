import { state, $, LX, LY, MAP_X, MAP_Y, MAP_SX, MAP_SY, fmt, fontMain, fontLayer, rad } from "./core.js";
import { makeGrid } from "./grid.js";
import { buildPaths } from "./paths.js";
import { renderSection } from "./sections.js";
import { acidPattern } from "./contours.js";

function renderPreview(){let grid=makeGrid(state.model,Number($('previewStep').value));
 Object.assign(state,grid,buildPaths(grid,state.model));state.ready=true;
 if(state.showAgeLabels)state.ageLabels=calculateAgeLabels(grid,state.model);
 renderMap();renderSection()
}
function calculateAgeLabels(grid,m){
 // One compact label for each exposed unit, placed away from contacts.
 // Work on the calculated grid (including intrusions), not a new geological model.
 const {units,nx,ny,dx,dy}=grid;
 const candidates=[];
 for(let j=4;j<ny-4;j+=Math.max(1,Math.round(5/dy))){
  for(let i=4;i<nx-4;i+=Math.max(1,Math.round(5/dx))){
   const unit=units[j*nx+i],meta=m.unitStyles?.[unit];
   if(!meta)continue;
   let agreement=0;
   for(const oy of [-3,0,3])for(const ox of [-3,0,3]){
    const xx=Math.max(0,Math.min(nx-1,i+Math.round(ox/dx))),yy=Math.max(0,Math.min(ny-1,j+Math.round(oy/dy)));
    if(units[yy*nx+xx]===unit)agreement++;
   }
   if(agreement>=7)candidates.push({unit,x:i*dx,y:j*dy,score:agreement});
  }
 }
 const output=[];
 const used=new Set();
 candidates.sort((a,b)=>b.score-a.score||Math.hypot(a.x-100,a.y-75)-Math.hypot(b.x-100,b.y-75));
 for(const c of candidates){
  if(used.has(c.unit))continue;
  if(output.some(o=>Math.hypot(o.x-c.x,o.y-c.y)<13))continue;
  const meta=m.unitStyles[c.unit];
  output.push({...c,text:meta.intrusion?'γ':meta.symbol,title:meta.intrusion?`Кислые интрузии (${meta.ageName})`:`${meta.period} — ${meta.ageName} (${meta.rank})`});
  used.add(c.unit);
 }
 return output;
}
function linePoints(){let a=rad(state.angle),vx=Math.cos(a),vy=Math.sin(a),half=state.len/2,ts=[-half,half];
 // Clip requested line segment to the map rectangle.
 let mn=-half,mx=half;
 for(let [coord,v,limit] of [[state.cx,vx,LX],[state.cy,vy,LY]]){
  if(Math.abs(v)<1e-8)continue;
  let b0=(0-coord)/v,b1=(limit-coord)/v;mn=Math.max(mn,Math.min(b0,b1));mx=Math.min(mx,Math.max(b0,b1))
 }
 if(mx<mn)return [{x:state.cx,y:state.cy},{x:state.cx,y:state.cy}];
 return [{x:state.cx+mn*vx,y:state.cy+mn*vy},{x:state.cx+mx*vx,y:state.cy+mx*vy}]
}
function mapMarkup(paths=state,includeSection=true){let inner='';
 if($('showColors').checked)inner+=paths.fillPath;
 else inner+=paths.intrusionFillPath||'';
 if($('showContours').checked){
  inner+=`<defs><mask id="topoGap" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${LX}" height="${LY}"><rect width="${LX}" height="${LY}" fill="white"/>${paths.topoMask||''}</mask></defs><g mask="url(#topoGap)">${paths.topoPath}</g>`;
 }
 inner+=paths.geoPath;
 if($('showFaults').checked)inner+=paths.faultPath;
 if($('showContours').checked)inner+=paths.topoLabels;
 if(includeSection&&state.showSectionLine!==false){
 let [a,b]=linePoints();
 inner+=`<path class="sectionline" d="M${fmt(a.x)} ${fmt(LY-a.y)}L${fmt(b.x)} ${fmt(LY-b.y)}" stroke="#283442" stroke-width=".65" stroke-dasharray="3 1.8" stroke-linecap="round" fill="none"/>`;
 inner+=`<circle class="handle" data-end="0" cx="${fmt(a.x)}" cy="${fmt(LY-a.y)}" r="2.6" fill="#293646" fill-opacity=".12" stroke="#293646" stroke-width=".4"/>`;
 inner+=`<circle class="handle" data-end="1" cx="${fmt(b.x)}" cy="${fmt(LY-b.y)}" r="2.6" fill="#293646" fill-opacity=".12" stroke="#293646" stroke-width=".4"/>`;
 inner+=`<text class="sectionEnd" x="${fmt(a.x+1)}" y="${fmt(LY-a.y-3.2)}" font-size="${fmt(fontMain())}" fill="#283442" font-weight="bold">А</text>`;
 inner+=`<text class="sectionEnd" x="${fmt(b.x+1)}" y="${fmt(LY-b.y-3.2)}" font-size="${fmt(fontMain())}" fill="#283442" font-weight="bold">Б</text>`;
 }
 if(state.showAgeLabels)for(let l of (state.ageLabels||[]))inner+=`<text class="ageLabel" x="${fmt(l.x)}" y="${fmt(LY-l.y)}" text-anchor="middle" dominant-baseline="central" font-weight="bold" font-size="${fmt(Math.max(2.2,fontLayer()*.82))}" fill="#25313a" stroke="#fff" stroke-width=".85" paint-order="stroke"><title>${l.title}</title>${l.text}</text>`;
 for(let l of state.labels)inner+=`<text x="${fmt(l.x)}" y="${fmt(LY-l.y)}" text-anchor="middle" dominant-baseline="central" font-weight="bold" font-size="${fmt(fontLayer())}" fill="#181818" stroke="white" stroke-width=".75" paint-order="stroke">${l.k}</text>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="270mm" height="215mm" viewBox="0 0 270 215"><rect width="270" height="215" fill="white"/>`+
 `<text x="10" y="13" font-size="${fmt(fontMain()+0.5)}" font-weight="bold" font-family="Arial, sans-serif">Задание ${state.seed}.</text>`+
 `<text x="260" y="13" font-size="${fmt(fontMain())}" text-anchor="end" font-family="Arial, sans-serif">≈1:800</text>`+
 `<defs><clipPath id="mapClip"><rect x="0" y="0" width="200" height="150"/></clipPath></defs>`+acidPattern()+
 `<g transform="translate(${fmt(MAP_X)} ${fmt(MAP_Y)}) scale(${MAP_SX} ${MAP_SY.toFixed(10)})"><rect width="200" height="150" fill="white"/><g clip-path="url(#mapClip)" font-family="Arial,sans-serif">${inner}</g><rect x="0" y="0" width="200" height="150" fill="none" stroke="#111" stroke-width=".35"/></g></svg>`
}
function renderMap(){if(!state.ready)return;$('mapSvg').outerHTML=mapMarkup().replace('<svg xmlns=','<svg id="mapSvg" xmlns=').replace(' width="270mm" height="215mm"','');}

export { renderPreview, calculateAgeLabels, linePoints, mapMarkup, renderMap };
