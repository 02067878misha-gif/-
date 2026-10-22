// Chronostratigraphic colouring by series/epochs (отделы), not stages (ярусы).
// Colours follow the published CGMW / ICS stratigraphic colour families and
// reference RGB values for the respective subdivisions. Each division has a
// single fixed colour. A repeated division NEVER receives another shade.
// Sources: https://stratigraphy.org/chart/ and
// https://ccgm.org/wp-content/uploads/2016/11/cms_Stratigraphic-Chart_Codes-CMYK_RGB.pdf
import { mulberry32 } from './core.js';

const ERA_LABELS={proterozoic:'Протерозой',paleozoic:'Палеозой',mesozoic:'Мезозой',cenozoic:'Кайнозой'};
// tuple format: period (system), subdivision label, map symbol, colour, rank.
// Oldest to youngest in each list. Historical Russian names are used for
// display; the ranking corresponds to the international chart.
const DIVISIONS={
 proterozoic:[
  ['Сидерий','Сидерий','PP₁','#f36d94','система'],
  ['Риасий','Риасий','PP₂','#f58ba7','система'],
  ['Орозирий','Орозирий','PP₃','#f79cb3','система'],
  ['Статерий','Статерий','PP₄','#f8a9bd','система'],
  ['Калиммий','Калиммий','MP₁','#f6b5ba','система'],
  ['Эктазий','Эктазий','MP₂','#f8c1c8','система'],
  ['Стений','Стений','MP₃','#f9cdcf','система'],
  ['Тоний','Тоний','NP₁','#f9d7b0','система'],
  ['Криогений','Криогений','NP₂','#fce1c1','система'],
  ['Эдиакарий','Эдиакарий','NP₃','#fdebcd','система']
 ],
 paleozoic:[
  ['Кембрий','Терреневский','Є₁','#8cb06c','отдел'],
  ['Кембрий','Кембрийский отдел 2','Є₂','#99c078','отдел'],
  ['Кембрий','Мяолинский','Є₃','#a6cf86','отдел'],
  ['Кембрий','Фуронгский','Є₄','#b3e095','отдел'],
  ['Ордовик','Нижний','O₁','#1a9d6f','отдел'],
  ['Ордовик','Средний','O₂','#4db47e','отдел'],
  ['Ордовик','Верхний','O₃','#7fca93','отдел'],
  ['Силур','Лландоверийский','S₁','#99d7b3','отдел'],
  ['Силур','Венлокский','S₂','#b3e1c2','отдел'],
  ['Силур','Лудловский','S₃','#bfe6cf','отдел'],
  ['Силур','Пржидольский','S₄','#e6f5e1','отдел'],
  ['Девон','Нижний','D₁','#e5ac4d','отдел'],
  ['Девон','Средний','D₂','#f1c868','отдел'],
  ['Девон','Верхний','D₃','#f1e19d','отдел'],
  ['Карбон','Миссисипская подсистема','C₁','#678f66','подсистема'],
  ['Карбон','Пенсильванская подсистема','C₂','#99c2b5','подсистема'],
  ['Пермь','Приуральский','P₁','#ef5845','отдел'],
  ['Пермь','Биармийский','P₂','#e36f5c','отдел'],
  ['Пермь','Татарский','P₃','#fba794','отдел']
 ],
 mesozoic:[
  ['Триас','Нижний','T₁','#812b92','отдел'],
  ['Триас','Средний','T₂','#b168b1','отдел'],
  ['Триас','Верхний','T₃','#c99bcb','отдел'],
  ['Юра','Нижний','J₁','#4eb3d3','отдел'],
  ['Юра','Средний','J₂','#80c5dd','отдел'],
  ['Юра','Верхний','J₃','#b3e3ee','отдел'],
  ['Мел','Нижний','K₁','#8ccd60','отдел'],
  ['Мел','Верхний','K₂','#a6d84a','отдел']
 ],
 cenozoic:[
  ['Палеоген','Палеоцен','Pg₁','#fda75f','отдел'],
  ['Палеоген','Эоцен','Pg₂','#fdb462','отдел'],
  ['Палеоген','Олигоцен','Pg₃','#fdc091','отдел'],
  ['Неоген','Миоцен','N₁','#fae664','отдел'],
  ['Неоген','Плиоцен','N₂','#fcef9c','отдел'],
  ['Четвертичная','Плейстоцен','Q₁','#ffefaf','отдел'],
  ['Четвертичная','Голоцен','Q₂','#fff8e6','отдел']
 ]
};
const PERIODS=Object.fromEntries(Object.values(DIVISIONS).flat().map(([period,,symbol,color])=>[period,{symbol,color}]));
function hexMix(a,b,t){
 const A=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16)),B=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));
 return '#'+A.map((v,i)=>Math.round(v*(1-t)+B[i]*t).toString(16).padStart(2,'0')).join('');
}
function complexEraKey(index,total){
 if(total<=1)return 'paleozoic';
 if(total===2)return index===0?'paleozoic':'mesozoic';
 if(total===3)return ['paleozoic','mesozoic','cenozoic'][index];
 if(index<total-3)return 'proterozoic';
 return ['paleozoic','mesozoic','cenozoic'][index-(total-3)];
}
function chooseDivisionIndices(count,poolLength,rng){
 const indices=[];
 if(count<=poolLength){
  // Random, ordered stratified selection across the available period. This
  // makes different systems visible instead of drawing 5 almost identical
  // consecutive stages in the same system.
  for(let i=0;i<count;i++){
   const lo=Math.floor(i*poolLength/count),hi=Math.floor((i+1)*poolLength/count)-1;
   indices.push(lo+Math.floor(rng()*(hi-lo+1)));
  }
 }else{
  // More beds than official subdivisions: several beds share the *same*
  // formal age and the same colour; never invent younger subdivisions.
  for(let i=0;i<count;i++)indices.push(Math.floor(i*(poolLength-1)/(count-1)));
 }
 return indices;
}
function assignChronostratigraphy(complexes,totalUnits,seed=42){
 const eraKeys=complexes.map(c=>complexEraKey(c.index,complexes.length));
 const styles=Array(totalUnits+1).fill(null);
 for(const eraKey of new Set(eraKeys)){
  const eraComplexes=complexes.filter((_,i)=>eraKeys[i]===eraKey);
  const total=eraComplexes.reduce((sum,c)=>sum+c.T.length,0),pool=DIVISIONS[eraKey];
  const rng=mulberry32((seed^Math.imul(total+13,0x9e3779b1)^Math.imul(eraComplexes[0].index+1,0x6d2b79f5))|0);
  const indices=chooseDivisionIndices(total,pool.length,rng);
  let used=0;
  for(const complex of eraComplexes){
   complex.eraKey=eraKey;complex.eraLabel=ERA_LABELS[eraKey];complex.colors=[];
   for(let i=0;i<complex.T.length;i++,used++){
    const ageOrder=indices[used], [period,ageName,symbol,color,rank]=pool[ageOrder];
    const unit=complex.firstUnit+i;
    complex.colors.push(color);
    styles[unit]={unit,complexIndex:complex.index,layerIndex:i+1,eraKey,eraLabel:ERA_LABELS[eraKey],period,ageName,rank,symbol,color,ageOrder};
   }
  }
 }
 return styles;
}
export { ERA_LABELS, PERIODS, DIVISIONS, complexEraKey, chooseDivisionIndices, assignChronostratigraphy, hexMix };
