import { state, $, LY, cloneComplexConfig, normalizeManualFaults } from "./core.js";
import { readControls, updateValues, renderComplexPanels, doGenerate, syncFaultControls, onPointerDown, onPointerMove, onPointerUp, drag } from "./ui.js";
import { renderPreview, renderMap, calculateAgeLabels } from "./map.js";
import { queueSection } from "./sections.js";
import { colorRuns } from "./contours.js";
import { buildPaths } from "./paths.js";
import { saveSVG, savePDF } from "./export.js";
import { defaultIntrusion, normalizeIntrusions } from "./intrusions.js";

$('generate').addEventListener('click',doGenerate);
$('addComplex').addEventListener('click',()=>{
 const newComplex=cloneComplexConfig(state.complexConfig.at(-1));
 newComplex.intrusions=[]; // Newly added young complexes do not copy older magma bodies.
 state.complexConfig.push(newComplex);
 renderComplexPanels();doGenerate();
});
$('complexes').addEventListener('click',e=>{
 const card=e.target.closest('.complex-card');
 if(card){
  const cfg=state.complexConfig[Number(card.dataset.index)];
  if(e.target.closest('.add-intrusion')){
   cfg.intrusions=normalizeIntrusions(cfg.intrusions);
   if(cfg.intrusions.length<4){cfg.intrusions.push(defaultIntrusion(cfg.intrusions.length));renderComplexPanels();doGenerate()}
   return;
  }
  const remove=e.target.closest('.remove-intrusion');
  if(remove){e.preventDefault();cfg.intrusions.splice(Number(remove.closest('.intrusion-card').dataset.intrusionIndex),1);renderComplexPanels();doGenerate();return;}
 }
 if(!e.target.closest('.remove-complex'))return;
 if(state.complexConfig.length>1){state.complexConfig.pop();renderComplexPanels();doGenerate()}
});
$('complexes').addEventListener('change',e=>{
 const card=e.target.closest('.complex-card');if(!card)return;
 const index=Number(card.dataset.index),cfg=state.complexConfig[index];
 const intrEl=e.target.closest('[data-intrusion-field]');
 if(intrEl){
  const ii=Number(intrEl.closest('.intrusion-card').dataset.intrusionIndex);
  const field=intrEl.dataset.intrusionField;
  const obj=cfg.intrusions[ii];
  obj[field]=['type'].includes(field)?intrEl.value:
    ['applyDeformation','attachFault','apophyses','roughContact'].includes(field)?intrEl.checked:Number(intrEl.value);
  if(field==='type'){if(obj.type==='sill')obj.applyDeformation=true;renderComplexPanels();}
  doGenerate();return;
 }
 const fieldEl=e.target.closest('[data-field]');
 if(fieldEl){
  const field=fieldEl.dataset.field;
  cfg[field]=field==='structureType'?fieldEl.value:(['enableFaults','customLayerCount','customDip','customAzimuth','customFaultParams','foldAffectsOlder'].includes(field)?fieldEl.checked:Number(fieldEl.value));
  if(field==='faultCount')cfg.manualFaults=normalizeManualFaults(cfg.manualFaults,cfg.faultCount);
  if(field==='enableFaults' && !cfg.enableFaults) cfg.customFaultParams=false;
  if(['enableFaults','customLayerCount','customDip','customAzimuth','customFaultParams','faultCount','structureType'].includes(field))renderComplexPanels();
  doGenerate();
  return;
 }
 const faultEl=e.target.closest('[data-fault-field]'); if(!faultEl)return;
 const fi=Number(faultEl.closest('.fault-card').dataset.faultIndex),ff=faultEl.dataset.faultField;
 cfg.manualFaults=normalizeManualFaults(cfg.manualFaults,cfg.faultCount||2);
 cfg.manualFaults[fi][ff]=ff==='type'?faultEl.value:Number(faultEl.value);
 doGenerate();
});
$('prevSeed').addEventListener('click',()=>{$('seed').value=Math.trunc(Number($('seed').value))-1;doGenerate()});
$('nextSeed').addEventListener('click',()=>{$('seed').value=Math.trunc(Number($('seed').value))+1;doGenerate()});
$('previewStep').addEventListener('change',()=>{if(!state.ready)return;state.ready=false;$('status').textContent='Обновление сетки предпросмотра…';setTimeout(()=>{try{renderPreview();$('status').textContent='Шаг предпросмотра '+$('previewStep').value+' м; модель и SEED сохранены.'}catch(e){console.error(e);$('status').textContent='Ошибка: '+e.message}},40)});
for(let id of ['cx','cy','angle','len'])$(id).addEventListener('input',()=>{readControls();renderMap();queueSection()});
for(let id of ['showFaults','showContours','showColors'])$(id).addEventListener('change',()=>{if(id==='showColors'&&$('showColors').checked){state.fillPath=colorRuns(state.units,state.nx,state.ny,state.dx,state.dy,LY,state.model.totalMaterialUnits||state.model.totalUnits)}renderMap();queueSection()});
for(let id of ['boundaryWidth','faultWidth','fontMain','fontContour','fontLayer'])$(id).addEventListener('input',()=>{if(!state.ready)return;Object.assign(state,buildPaths(state,state.model));renderMap();queueSection()});
$('faultStyle').addEventListener('change',()=>{if(!state.ready)return;Object.assign(state,buildPaths(state,state.model));renderMap();queueSection()});
$('ci').addEventListener('change',()=>{if(!state.ready)return;Object.assign(state,buildPaths(state,state.model));renderMap();queueSection()});
$('clearLabels').addEventListener('click',()=>{state.labels=[];renderMap()});
$('showSectionLine').addEventListener('change',()=>{state.showSectionLine=$('showSectionLine').checked;renderMap()});
function setAgeLabels(value){
 state.showAgeLabels=value;
 state.ageLabels=value&&state.ready?calculateAgeLabels(state,state.model):[];
 $('labelAges').classList.toggle('primary',value);
 $('labelAges').textContent=value?'Обновить подписи возрастов':'Подписать возраста пород';
 $('clearAges').disabled=!value;
 renderMap();
}
$('labelAges').addEventListener('click',()=>setAgeLabels(true));
$('clearAges').addEventListener('click',()=>setAgeLabels(false));
function updateTerrainLabels(){
 for(const [id,suffix] of [['terrainDissection','%'],['terrainIntensity','%'],['terrainIncision',' м']])$(id+'Val').textContent=$(id).value+suffix;
}
function saveTerrainControls(){
 state.terrainConfig={dissection:Number($('terrainDissection').value),intensity:Number($('terrainIntensity').value),incision:Number($('terrainIncision').value),subhorizontal:$('terrainFlat').checked,positiveIntrusions:$('terrainPositiveIntrusions').checked};
 updateTerrainLabels();doGenerate();
}
for(const id of ['terrainDissection','terrainIntensity','terrainIncision'])$(id).addEventListener('change',saveTerrainControls);
for(const id of ['terrainFlat','terrainPositiveIntrusions'])$(id).addEventListener('change',saveTerrainControls);
updateTerrainLabels();
$('save').addEventListener('click',saveSVG);
$('savePdf').addEventListener('click',savePDF);
$('exit').addEventListener('click',()=>{fetch('quit',{method:'POST',keepalive:true}).finally(()=>{document.body.innerHTML='<main style="padding:40px;font:20px Arial">Приложение закрыто. Вкладку можно закрыть.</main>'})});
// The map element is replaced when redrawn, so delegate all input events.
document.addEventListener('pointerdown',e=>{if(e.target.closest?.('#mapSvg'))onPointerDown(e)});
document.addEventListener('pointermove',e=>{if(drag)onPointerMove(e)});
document.addEventListener('pointerup',onPointerUp);
document.addEventListener('pointercancel',onPointerUp);
setInterval(()=>fetch('ping').catch(()=>{}),12000);
updateValues();renderComplexPanels();syncFaultControls();doGenerate();
