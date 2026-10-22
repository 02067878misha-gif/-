import { state, $, fmt, clamp, rad, LX, LY, MAP_X, MAP_Y, MAP_SX, MAP_SY, normalizeManualFaults } from "./core.js";
import { generateModel, layer } from "./geology.js";
import { relief } from "./terrain.js";
import { renderMap, renderPreview, linePoints } from "./map.js";
import { normalizeTerrain } from "./terrain.js";
import { queueSection } from "./sections.js";
import { normalizeIntrusions, TYPES } from "./intrusions.js";

function readControls(){state.cx=+$('cx').value;state.cy=+$('cy').value;state.angle=+$('angle').value;state.len=+$('len').value;updateValues()}
function writeControls(){for(let k of ['cx','cy','angle','len'])$(k).value=state[k];updateValues()}
function updateValues(){for(let [k,unit] of [['x','м'],['y','м'],['angle','°'],['len','м']])$(k+'Val').textContent=fmt(state[k==='x'?'cx':k==='y'?'cy':k])+unit}
function renderComplexPanels(){
 const holder=$('complexes');
 // Preserve manually collapsed complexes while controls are refreshed.
 const opened=new Map([...holder.querySelectorAll('.complex-card')].map(el=>[Number(el.dataset.index),el.open]));
 const expanded=new Map([...holder.querySelectorAll('.complex-card')].map(card=>[Number(card.dataset.index),Object.fromEntries([...card.querySelectorAll('details.complex-subsection')].map(el=>[el.dataset.section,el.open]))]));
 const sectionOpen=(i,key)=>expanded.get(i)?.[key]===false?'':'open';
 const faultsOpen=new Map([...holder.querySelectorAll('.complex-card')].map(c=>[Number(c.dataset.index),[...c.querySelectorAll('.fault-card')].map(f=>f.open)]));
 const intrusionsOpen=new Map([...holder.querySelectorAll('.complex-card')].map(c=>[Number(c.dataset.index),[...c.querySelectorAll('.intrusion-card')].map(f=>f.open)]));
 const itemOpen=(map,i,j)=>map.get(i)?.[j]===false?'':'open';
 holder.innerHTML=state.complexConfig.map((c,i)=>`<details class="complex-card" data-index="${i}" ${opened.get(i)===false?'':'open'}>
  <summary class="complex-header"><span class="complex-number">${String(i+1).padStart(2,'0')}</span><span class="complex-header-text"><strong>Комплекс ${i+1}</strong><small>${i===0?(state.complexConfig.length===1?'Единственный':'Древнейший'):i===state.complexConfig.length-1?'Самый молодой':'Промежуточный'}</small></span><span class="complex-caption">${c.customLayerCount?c.layerCount:5} слоёв · ${c.structureType==='folding'?'складчатость':'моноклиналь'}</span></summary>
  <div class="complex-body">
  ${i===state.complexConfig.length-1&&i>0?'<div class="complex-top-actions"><button type="button" class="remove-complex" title="Удалить последний комплекс">Удалить комплекс</button></div>':''}
  <details class="complex-subsection" data-section="layers" ${sectionOpen(i,'layers')}><summary class="section-label">Слои и залегание</summary><div class="complex-section-content">
  <div class="row"><label>Мощности, м: от <input data-field="minT" type="number" min="1" max="80" step="1" value="${c.minT}"></label>
  <label>до <input data-field="maxT" type="number" min="1" max="80" step="1" value="${c.maxT}"></label></div>
  <div class="layer-settings">
    <div class="setting-pair"><label class="opt"><input type="checkbox" data-field="customLayerCount" ${c.customLayerCount?'checked':''}> Задать число слоёв</label>
    ${c.customLayerCount?`<label class="override-value">Слоёв <input data-field="layerCount" type="number" min="1" max="20" step="1" value="${c.layerCount}"></label>`:''}</div>
    <label class="structure-selector">Тип залегания
      <select data-field="structureType"><option value="monocline" ${c.structureType!=='folding'?'selected':''}>Моноклинали</option><option value="folding" ${c.structureType==='folding'?'selected':''}>Складчатость</option></select>
    </label>
    ${c.structureType==='folding'?`<div class="fold-settings">
      <label>Амплитуда складок, м <input data-field="foldAmplitude" type="number" min="0" max="80" step="0.5" value="${c.foldAmplitude}"></label>
      <label>Ширина складок, м <input data-field="foldWidth" type="number" min="10" max="250" step="1" value="${c.foldWidth}"></label>
      <label>Азимут простирания осей, ° <input data-field="foldStrike" type="number" min="0" max="179.9" step="0.1" value="${c.foldStrike}"></label>
      ${i>0?`<label class="opt inherit-fold-toggle"><input type="checkbox" data-field="foldAffectsOlder" ${c.foldAffectsOlder?'checked':''}> Включить воздействие деформаций на древние породы</label>
      <div class="setting-note">Включено — складчатость этого комплекса накладывается на все более древние породы и их разломы. Выключено — молодой комплекс перекрывает и срезает древние структуры, как в v16.</div>`:''}
      <div class="setting-note">Ширина — расстояние между осями соседних антиклинали и синклинали. Амплитуда — от среднего уровня до свода или мульды. Оси прямолинейные, складки плавные и без погружения.</div>
    </div>`:`<div class="monocline-settings">
      <div class="setting-pair"><label class="opt"><input type="checkbox" data-field="customDip" ${c.customDip?'checked':''}> Задать угол падения</label>
      ${c.customDip?`<label class="override-value">Угол, ° <input data-field="dip" type="number" min="0" max="80" step="0.1" value="${c.dip}"></label>`:''}</div>
      <div class="setting-pair"><label class="opt"><input type="checkbox" data-field="customAzimuth" ${c.customAzimuth?'checked':''}> Задать азимут падения</label>
      ${c.customAzimuth?`<label class="override-value">Азимут, ° <input data-field="azimuth" type="number" min="0" max="359.9" step="0.1" value="${c.azimuth}"></label>`:''}</div>
      <div class="setting-note">Без галочек: угол 15–40° и азимут 0–359° (по SEED).</div>
    </div>`}
    <div class="setting-note">Если число слоёв не задано, по умолчанию создаются 5 слоёв.</div>
  </div>
  </div></details>
  <details class="complex-subsection" data-section="faults" ${sectionOpen(i,'faults')}><summary class="section-label">Разрывные нарушения</summary><div class="complex-section-content">
  <label class="opt"><input type="checkbox" data-field="enableFaults" ${c.enableFaults?'checked':''}> Генерировать разломы</label>
  <div class="row fault-count" style="opacity:${c.enableFaults && !c.customFaultParams?1:.45}"><label>Разломы: от <input data-field="minFaults" type="number" min="0" max="6" step="1" value="${c.minFaults}" ${(c.enableFaults && !c.customFaultParams)?'':'disabled'}></label>
  <label>до <input data-field="maxFaults" type="number" min="0" max="6" step="1" value="${c.maxFaults}" ${(c.enableFaults && !c.customFaultParams)?'':'disabled'}></label></div>
  <div class="layer-settings" style="opacity:${c.enableFaults?1:.55}">
    <div class="setting-pair"><label class="opt"><input type="checkbox" data-field="customFaultParams" ${c.customFaultParams?'checked':''} ${c.enableFaults?'':'disabled'}> Задать параметры разломов</label>
    ${c.enableFaults && c.customFaultParams?`<label class="override-value">Разломов <input data-field="faultCount" type="number" min="1" max="6" step="1" value="${c.faultCount}"></label>`:''}</div>
    <div class="setting-note">Без галочки: число разломов задаётся диапазоном, тип и параметры определяются по SEED. С галочкой: число разломов точное, а для каждого разлома задаются тип, амплитуда, азимут простирания и угол сместителя.</div>
    ${c.enableFaults && c.customFaultParams?`<div class="fault-list">${normalizeManualFaults(c.manualFaults,c.faultCount).map((f,fi)=>`<details class="fault-card" data-fault-index="${fi}" ${itemOpen(faultsOpen,i,fi)}><summary class="fault-title">Разлом ${fi+1}</summary><div class="fault-grid"><label>Тип <select data-fault-field="type"><option value="взброс" ${f.type==='взброс'?'selected':''}>взброс</option><option value="сброс" ${f.type==='сброс'?'selected':''}>сброс</option><option value="сдвиг" ${f.type==='сдвиг'?'selected':''}>сдвиг</option></select></label><label>Амплитуда, м <input data-fault-field="slip" type="number" min="0.1" max="50" step="0.1" value="${f.slip}"></label><label>Азимут, ° <input data-fault-field="az" type="number" min="0" max="179.9" step="0.1" value="${f.az}"></label><label>Угол, ° <input data-fault-field="dip" type="number" min="5" max="89" step="0.1" value="${f.dip}"></label></div></details>`).join('')}</div>`:''}
  </div>
  </div></details>
  <details class="complex-subsection" data-section="intrusions" ${sectionOpen(i,'intrusions')}><summary class="section-label">Интрузивные тела</summary><div class="complex-section-content"><div class="intrusion-settings">
    <div class="intrusion-head"><strong>Интрузивные тела (${(c.intrusions||[]).length}/4)</strong>
      <button type="button" class="add-intrusion" ${(c.intrusions||[]).length>=4?'disabled':''} title="Добавить интрузию">＋ Добавить интрузию</button>
    </div>
    ${normalizeIntrusions(c.intrusions).map((b,j)=>`<details class="intrusion-card" data-intrusion-index="${j}" ${itemOpen(intrusionsOpen,i,j)}>
      <summary class="intrusion-card-head"><strong>Интрузия ${j+1}</strong><button type="button" class="remove-intrusion" title="Удалить интрузию">×</button></summary>
      <label class="intrusion-type">Тип интрузии <select data-intrusion-field="type">
        <option value="stock" ${b.type==='stock'?'selected':''}>Шток</option>
        <option value="dike" ${b.type==='dike'?'selected':''}>Дайка</option>
        <option value="sill" ${b.type==='sill'?'selected':''}>Силл</option>
      </select></label>
      <div class="intrusion-grid">
        ${b.type==='stock'?`<label>Площадь сечения, м² <input data-intrusion-field="area" type="number" min="50" max="5000" step="10" value="${b.area}"></label>
          <label>Наклон стенок от вертикали, ° <input data-intrusion-field="wallDip" type="number" min="-45" max="80" step="0.1" value="${b.wallDip}"></label>`:''}
        ${b.type==='dike'?`<label>Ширина, м <input data-intrusion-field="width" type="number" min="0.5" max="40" step="0.5" value="${b.width}"></label>
          <label>Угол падения, ° <input data-intrusion-field="dip" type="number" min="5" max="90" step="0.1" value="${b.dip}"></label>
          <label>Азимут падения, ° <input data-intrusion-field="azimuth" type="number" min="0" max="359.9" step="0.1" value="${b.azimuth}"></label>
          <label>Площадь распространения, м² <input data-intrusion-field="spreadArea" type="number" min="50" max="12000" step="50" value="${b.spreadArea}"></label>`:''}
        ${b.type==='sill'?`<label>Ширина (мощность), м <input data-intrusion-field="width" type="number" min="0.5" max="40" step="0.5" value="${b.width}"></label>
          <label>Площадь распространения, м² <input data-intrusion-field="spreadArea" type="number" min="50" max="12000" step="50" value="${b.spreadArea}"></label>`:''}
      </div>
      ${b.type==='sill'?`<div class="setting-note">Силл всегда следует залеганию слоёв комплекса; деформация включена автоматически.</div>`:
        `<label class="opt"><input data-intrusion-field="applyDeformation" type="checkbox" ${b.applyDeformation?'checked':''}> Применить деформации комплекса к магматическому телу</label>`}
      ${b.type==='stock'?`<label class="opt"><input data-intrusion-field="apophyses" type="checkbox" ${b.apophyses?'checked':''}> Добавить апофизы</label>
        <label class="opt"><input data-intrusion-field="roughContact" type="checkbox" ${b.roughContact?'checked':''}> Неровный контакт</label>`:''}
      <label class="opt"><input data-intrusion-field="attachFault" type="checkbox" ${b.attachFault?'checked':''}> Приурочить интрузию к разлому</label>
      ${b.attachFault?'<div class="setting-note">Положение тела определяется автоматически по разлому данного комплекса. Разлом должен быть включён.</div>':''}
    </details>`).join('')}
    <div class="setting-note">Не более 4 тел на комплекс. Шток: 0° — вертикальные стенки, отрицательные углы — к центру вверх, положительные — от центра вверх. Площадь дайки и силла задаёт номинальное горизонтальное распространение; к краям тела выклиниваются. Силл всегда повторяет залегание вмещающих слоёв. Центры определяются по SEED.</div>
  </div>
  </div></details>
  </div>
 </details>`).join('');
 $('complexCount').textContent=state.complexConfig.length;
}
function renderAgeLegend(model){
 const container=$('ageLegend');if(!container)return;
 // Sorted younger to older; one swatch per formal division, not per bed.
 const unique=new Map();
 for(let i=1;i<=model.totalUnits;i++){
  const m=model.unitStyles?.[i];if(!m||m.intrusion)continue;
  const key=`${m.eraKey}|${m.period}|${m.ageName}`;
  if(!unique.has(key))unique.set(key,{...m,units:[]});
  unique.get(key).units.push(i);
 }
 const items=[...unique.values()].reverse();
 container.innerHTML=items.map(x=>`<div class="age-legend-row"><span class="age-legend-swatch" style="background:${x.color}"></span><b class="age-legend-symbol">${x.symbol}</b><div class="age-legend-text"><strong>${x.period} · ${x.ageName}</strong><small>${x.eraLabel} · ${x.rank} · слои ${x.units.join(', ')}</small></div></div>`).join('');
}
function syncFaultControls(){
 const enabled=state.complexConfig.some(c=>c.enableFaults&&(c.customFaultParams?c.faultCount>0:c.maxFaults>0));
 for(const id of ['showFaults','faultStyle','faultWidth'])$(id).disabled=!enabled;
}
function doGenerate(){
 let seed=Math.trunc(Number($('seed').value));if(!Number.isFinite(seed))seed=42;
 for(let [i,c] of state.complexConfig.entries()){
  if(!Number.isInteger(c.minT)||!Number.isInteger(c.maxT)||c.minT<1||c.maxT>80||c.minT>c.maxT){
   $('status').textContent=`Комплекс ${i+1}: мощности должны быть от 1 до 80 м; от ≤ до.`;return;
  }
  if(c.customLayerCount&&(!Number.isInteger(c.layerCount)||c.layerCount<1||c.layerCount>20)){
   $('status').textContent=`Комплекс ${i+1}: количество слоёв должно быть целым числом от 1 до 20.`;return;
  }
  if(c.structureType!=='folding'&&c.customDip&&(!Number.isFinite(c.dip)||c.dip<0||c.dip>80)){
   $('status').textContent=`Комплекс ${i+1}: угол падения должен быть от 0 до 80°.`;return;
  }
  if(c.structureType!=='folding'&&c.customAzimuth&&(!Number.isFinite(c.azimuth)||c.azimuth<0||c.azimuth>=360)){
   $('status').textContent=`Комплекс ${i+1}: азимут падения должен быть от 0 до 359,9°.`;return;
  }
  if(!['monocline','folding'].includes(c.structureType??'monocline')){
   $('status').textContent=`Комплекс ${i+1}: неизвестный тип залегания.`;return;
  }
  if(c.structureType==='folding'){
   if(!Number.isFinite(c.foldAmplitude)||c.foldAmplitude<0||c.foldAmplitude>80){
    $('status').textContent=`Комплекс ${i+1}: амплитуда складок от 0 до 80 м.`;return;
   }
   if(!Number.isFinite(c.foldWidth)||c.foldWidth<10||c.foldWidth>250){
    $('status').textContent=`Комплекс ${i+1}: ширина складок от 10 до 250 м.`;return;
   }
   if(!Number.isFinite(c.foldStrike)||c.foldStrike<0||c.foldStrike>=180){
    $('status').textContent=`Комплекс ${i+1}: азимут осей от 0 до 179,9°.`;return;
   }
  }
  if(c.enableFaults&&(!Number.isInteger(c.minFaults)||!Number.isInteger(c.maxFaults)||c.minFaults<0||c.maxFaults>6||c.minFaults>c.maxFaults)){
   $('status').textContent=`Комплекс ${i+1}: количество разломов должно быть от 0 до 6; от ≤ до.`;return;
  }
  if(c.enableFaults&&c.customFaultParams){
   if(!Number.isInteger(c.faultCount)||c.faultCount<1||c.faultCount>6){$('status').textContent=`Комплекс ${i+1}: число ручных разломов должно быть от 1 до 6.`;return;}
   c.manualFaults=normalizeManualFaults(c.manualFaults,c.faultCount);
   for(let fi=0;fi<c.faultCount;fi++){
    const f=c.manualFaults[fi];
    if(!['взброс','сброс','сдвиг'].includes(f.type)){ $('status').textContent=`Комплекс ${i+1}, разлом ${fi+1}: неверный тип.`; return;}
    if(!Number.isFinite(f.slip)||f.slip<=0||f.slip>50){ $('status').textContent=`Комплекс ${i+1}, разлом ${fi+1}: амплитуда должна быть от 0,1 до 50 м.`; return;}
    if(!Number.isFinite(f.az)||f.az<0||f.az>=180){ $('status').textContent=`Комплекс ${i+1}, разлом ${fi+1}: азимут должен быть от 0 до 179,9°.`; return;}
    if(!Number.isFinite(f.dip)||f.dip<5||f.dip>89){ $('status').textContent=`Комплекс ${i+1}, разлом ${fi+1}: угол сместителя должен быть от 5 до 89°.`; return;}
   }
  }
  const intrusions=c.intrusions||[];
  if(intrusions.length>4){$('status').textContent=`Комплекс ${i+1}: максимум 4 интрузии.`;return;}
  for(let bi=0;bi<intrusions.length;bi++){
   const b=intrusions[bi],prefix=`Комплекс ${i+1}, интрузия ${bi+1}`;
   if(!['stock','dike','sill'].includes(b.type)){$('status').textContent=`${prefix}: неизвестный тип.`;return;}
   const valid=(v,a,z)=>Number.isFinite(v)&&v>=a&&v<=z;
   if(b.type==='stock'&&(!valid(b.area,50,5000)||!valid(b.wallDip,-45,80))){
    $('status').textContent=`${prefix}: площадь 50–5000 м²; наклон стенок −45…80°.`;return;
   }
   if(b.type==='dike'&&(!valid(b.width,.5,40)||!valid(b.dip,5,90)||!Number.isFinite(b.azimuth)||b.azimuth<0||b.azimuth>=360||!valid(b.spreadArea,50,12000))){
    $('status').textContent=`${prefix}: ширина 0,5–40 м, угол 5–90°, азимут 0–359,9°, площадь 50–12000 м².`;return;
   }
   if(b.type==='sill'&&(!valid(b.width,.5,40)||!valid(b.spreadArea,50,12000))){$('status').textContent=`${prefix}: ширина 0,5–40 м, площадь 50–12000 м².`;return;}
   if(b.attachFault&&(!c.enableFaults||(c.customFaultParams?c.faultCount<1:c.minFaults<1))){
    $('status').textContent=`${prefix}: для привязки интрузии задайте не менее одного обязательного разлома комплекса (минимум ≥ 1).`;return;
   }
  }
 }
 $('seed').value=seed;state.ready=false;$('status').textContent='Создание геологической модели…';
 setTimeout(()=>{try{
  let m=generateModel(seed,state.complexConfig.map(c=>({...c})),state.terrainConfig);state.seed=seed;state.model=m;state.faults=m.faults;state.labels=[];state.ageLabels=[];
  renderPreview();syncFaultControls();
  let report=m.complexes.map((c,i)=>`Комплекс ${i+1}: ${c.T.length} слоёв, ${c.structureType==='folding'?`складчатость (амплитуда ${c.foldAmplitude} м, ширина ${c.foldWidth} м, азимут осей ${c.foldStrike}°${c.index>0?`, воздействие на древние: ${c.foldAffectsOlder?'да':'нет'}`:''})`:`моноклинальное залегание (угол ${c.d}°, азимут ${c.az}°)`}, мощности ${c.cfg.minT}–${c.cfg.maxT} м; разломов: ${c.faults.length}`).join('\n');
  let fl=m.faults.map(f=>`${f.name} (комплекс ${f.complexIndex+1}): ${f.kind}, азимут ${Math.round(f.az*10)/10}°, угол ${Math.round(f.dip*10)/10}°, амплитуда ${Math.round(f.slip*10)/10} м`).join('\n');
  const ig=m.intrusions.map(b=>`${b.name} (комплекс ${b.complexIndex+1}): ${TYPES[b.type]}${b.linkedFault?' · приурочена к '+b.linkedFault:''}${b.applyDeformation?' · деформирована':''}`).join('\n');
  $('modelInfo').textContent=`Комплексов: ${m.complexes.length}; слоёв: ${m.totalUnits}; интрузий: ${m.intrusions.length}\n${report}${fl?'\n\n'+fl:''}${ig?'\n\n'+ig:''}`;
  $('statComplexes').textContent=m.complexes.length;
  $('statLayers').textContent=m.totalUnits;
  $('statFaults').textContent=m.faults.length;
  $('statIntrusions').textContent=m.intrusions.length;
  for(const [i,c] of m.complexes.entries()){const caption=$('complexes').querySelector(`.complex-card[data-index="${i}"] .complex-caption`);if(caption)caption.textContent=`${c.T.length} слоёв · ${c.structureType==='folding'?'складчатость':'моноклиналь'} · ${c.faults.length} разломов · ${(c.intrusions||[]).length} интрузий`;}
  $('layersHeading').textContent=`Возраст, цвет и параметры ${m.totalUnits} слоёв`;
  const rows=m.complexes.flatMap((c,i)=>c.T.map((v,j)=>`<tr><td>${i+1}</td><td>${c.eraLabel||''}</td><td>${c.firstUnit+j}</td><td>${m.unitStyles[c.firstUnit+j]?.period||'—'}</td><td>${m.unitStyles[c.firstUnit+j]?.ageName||'—'}</td><td><span style="display:inline-block;width:14px;height:14px;border:1px solid #777;background:${c.colors?.[j]||'#fff'};border-radius:2px"></span></td><td>${v===null?'не огр.':v+' м'}</td><td>${c.structureType==='folding'?'—':c.az+'°'}</td><td>${c.structureType==='folding'?'—':c.d+'°'}</td></tr>`));
  $('layersInfo').innerHTML='<table><thead><tr><th>Кмпл.</th><th>Эратема</th><th>Слой</th><th>Система</th><th>Отдел / подразделение</th><th>Цвет</th><th>Мощность</th><th>Азимут</th><th>Угол</th></tr></thead><tbody>'+rows.join('')+'</tbody></table>';
  renderAgeLegend(m);
  $('status').textContent=`SEED ${seed} · ${m.complexes.length} компл. · ${m.totalUnits} слоёв · ${m.intrusions.length} интрузий · шаг ${$('previewStep').value} м`;
 }catch(e){console.error(e);$('status').textContent='Ошибка: '+e.message}
 },40);
}
function svgCoord(evt){let svg=$('mapSvg');let pt=svg.createSVGPoint();pt.x=evt.clientX;pt.y=evt.clientY;let p=pt.matrixTransform(svg.getScreenCTM().inverse());return {x:(p.x-MAP_X)/MAP_SX,y:LY-(p.y-MAP_Y)/MAP_SY}}
let drag=null;
function onPointerDown(e){if(!state.ready || e.button!==0)return;
 let p=svgCoord(e),within=p.x>=0&&p.x<=LX&&p.y>=0&&p.y<=LY;
 if(!within)return;
 let target=e.target;
 if(target.matches('.handle')){drag={mode:'end',idx:Number(target.dataset.end),opp:linePoints()[1-Number(target.dataset.end)]};e.preventDefault()}
 else if(target.matches('.sectionline')){drag={mode:'move',px:p.x,py:p.y,cx:state.cx,cy:state.cy};e.preventDefault()}
 else if($('placeLabels').checked){
  if(e.shiftKey && state.labels.length){let best=-1,dist=Infinity;state.labels.forEach((v,i)=>{let d=(v.x-p.x)**2+(v.y-p.y)**2;if(d<dist){dist=d;best=i}});
    if(best>=0&&dist<120)state.labels.splice(best,1)
  }else state.labels.push({x:p.x,y:p.y,k:layer(p.x,p.y,relief(p.x,p.y,state.model),state.model)});
  renderMap();return
 }
 if(drag){$('mapSvg').setPointerCapture(e.pointerId)}
}
function onPointerMove(e){if(!drag)return;
 let p=svgCoord(e);if(drag.mode==='move'){state.cx=clamp(drag.cx+p.x-drag.px,0,LX);state.cy=clamp(drag.cy+p.y-drag.py,0,LY)}
 else {p.x=clamp(p.x,0,LX);p.y=clamp(p.y,0,LY);let v=drag.idx===0?{x:drag.opp.x-p.x,y:drag.opp.y-p.y}:{x:p.x-drag.opp.x,y:p.y-drag.opp.y};
  state.angle=(Math.atan2(v.y,v.x)*180/Math.PI+360)%360;state.len=clamp(Math.hypot(v.x,v.y),30,240);state.cx=(p.x+drag.opp.x)/2;state.cy=(p.y+drag.opp.y)/2}
 writeControls();renderMap();queueSection()
}
function onPointerUp(){if(drag){drag=null;queueSection()}}

export { readControls, writeControls, updateValues, renderComplexPanels, syncFaultControls, doGenerate, svgCoord, drag, onPointerDown, onPointerMove, onPointerUp };
