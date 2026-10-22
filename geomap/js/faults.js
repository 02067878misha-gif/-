import { rad } from "./core.js";
import { complexBasalSurface, undoFoldForOlderRocks } from "./structures.js";

function side(x,y,z,f){let a=rad(f.az);return (x-f.cx)*Math.cos(a)-(y-f.cy)*Math.sin(a)-(z-f.ref)/Math.tan(rad(f.dip))}
function undo(p,arr,fromIndex=0){let x=p.x,y=p.y,z=p.z;for(let i=arr.length-1;i>=fromIndex;i--){let f=arr[i];if(side(x,y,z,f)<=0)continue;let a=rad(f.az),v=f.slip;
  if(['вверх','вниз','взброс','сброс'].includes(f.kind)){let up=['вверх','взброс'].includes(f.kind),dz=up?-v:v;x+=dz*Math.cos(a)/Math.tan(rad(f.dip));y-=dz*Math.sin(a)/Math.tan(rad(f.dip));z+=dz}
  else {let s=f.kind==='левый сдвиг'?1:-1;x+=s*v*Math.sin(a);y+=s*v*Math.cos(a)}
 }return {x,y,z}}
function laterFaultValue(x,y,z,m,index){
 const f=m.faults[index];
 // With the new checkbox off, preserve the original v16 calculation exactly.
 if(!m.hasInheritedFolding || !m.complexes.some((c,ci)=>ci>f.complexIndex && c.foldAffectsOlder)){
  let p=undo({x,y,z},m.faults.slice(index+1));
  const next=m.complexes[f.complexIndex+1];
  if(next && p.z>=complexBasalSurface(next,p.x,p.y))return NaN;
  return side(p.x,p.y,p.z,f);
 }
 // For older faults, reverse younger faults and then younger inherited folds.
 let p={x,y,z};
 for(let ci=m.complexes.length-1;ci>f.complexIndex;ci--){
  const younger=m.complexes[ci];
  p=undo(p,younger.faults);
  if(ci===f.complexIndex+1 && p.z>=complexBasalSurface(younger,p.x,p.y))return NaN;
  p=undoFoldForOlderRocks(p,younger);
 }
 const own=m.complexes[f.complexIndex].faults;
 p=undo(p,own,own.indexOf(f)+1);
 return side(p.x,p.y,p.z,f);
}

export { side, undo, laterFaultValue };
