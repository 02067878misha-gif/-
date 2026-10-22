import { state, $ } from "./core.js";

function currentMapForExport(){
 // Clone the actual on-screen SVG DOM. Do not regenerate contours or labels.
 const cloned=$('mapSvg').cloneNode(true);
 cloned.removeAttribute('id');
 cloned.setAttribute('xmlns','http://www.w3.org/2000/svg');
 cloned.setAttribute('width','270mm');
 cloned.setAttribute('height','215mm');
 cloned.querySelectorAll('.sectionline,.handle,.sectionEnd').forEach(n=>n.remove());
 return cloned;
}
function saveSVG(){
 if(!state.ready)return;
 try{
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(currentMapForExport());
  const blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'}),href=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=href;a.download=`Геологическая_карта_${state.seed}.svg`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),1500);
  $('status').textContent='SVG сохранён из текущей карты, без повторного расчёта.';
 }catch(e){console.error(e);$('status').textContent='Ошибка сохранения SVG: '+e.message}
}
function savePDF(){
 if(!state.ready)return;
 // Open synchronously in the click handler to avoid popup blockers.
 const page=window.open('','_blank','width=1150,height=900');
 if(!page){$('status').textContent='Разрешите всплывающие окна для сохранения PDF.';return}
 const svg=new XMLSerializer().serializeToString(currentMapForExport());
 const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Геологическая карта ${state.seed}</title>
 <style>@page {size:270mm 215mm;margin:0}html,body{margin:0;padding:0;width:270mm;height:215mm;overflow:hidden}
 svg{display:block;width:270mm;height:215mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>
 </head><body>${svg}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`;
 page.document.open();page.document.write(html);page.document.close();
 $('status').textContent='Выберите «Сохранить как PDF» в окне печати. Размер поля карты 250 × 187 мм.';
}

export { currentMapForExport, saveSVG, savePDF };
