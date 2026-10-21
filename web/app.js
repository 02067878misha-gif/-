'use strict';
const $ = selector => document.querySelector(selector);
const form = $('#settings');
const fields = form.elements;
const statusEl = $('#status');
const resultEl = $('#result');
const dialog = $('#help-dialog');
const generateButton = $('#generate');
const taskInputs = [...form.querySelectorAll('[name=task]')];
const colorInputs = [...form.querySelectorAll('[data-color-key]')];
const palette = [
  ['синий', '#2457a7', 'синим'], ['красный', '#c23632', 'красным'],
  ['зелёный', '#18784a', 'зелёным'], ['фиолетовый', '#7541a0', 'фиолетовым'],
  ['оранжевый', '#a54c13', 'оранжевым'], ['бирюзовый', '#087c8c', 'бирюзовым'],
  ['коричневый', '#864a2b', 'коричневым'], ['розовый', '#ad286b', 'розовым'],
  ['чёрный', '#0f0f0f', 'чёрным'], ['серый', '#656565', 'серым'],
];
const normalizedColor = name => name.trim().toLowerCase().replaceAll('ё', 'е');
let busy = false;
let lastSet = null;
let previewMode = 'forward';
let copyTimer;
const defaultTitle = 'Стереографические проекции';
const modeNames = { both: 'прямые и обратные', forward: 'прямые задачи', inverse: 'обратные задачи' };
function plural(n, forms) {
  const k = Math.abs(n) % 100;
  return k > 10 && k < 20 ? forms[2] : (k % 10 === 1 ? forms[0] : (k % 10 >= 2 && k % 10 <= 4 ? forms[1] : forms[2]));
}
function readConfig() {
  return {
    count: Number(fields.namedItem('count').value),
    title: fields.namedItem('title').value.trim() || defaultTitle,
    step: Number(fields.namedItem('step').value),
    mode: fields.namedItem('mode').value,
    seed: fields.namedItem('seed').value.trim(),
    tasks: taskInputs.filter(el => el.checked).map(el => el.value),
    colors_enabled: $('#colors-enabled').checked,
    element_colors: Object.fromEntries(colorInputs.map(el => [el.dataset.colorKey, {
      hex: el.value, name: $(`#color-name-${el.dataset.colorKey}`).value.trim() || $(`#color-name-${el.dataset.colorKey}`).defaultValue,
    }])),
  };
}
function setStatus(message = '', error = false) {
  statusEl.className = error ? 'status error' : 'status';
  statusEl.textContent = message;
}
function clearErrors() {
  for (const name of ['count', 'tasks', 'colors']) {
    const el = $(`#${name}-error`); el.textContent = ''; el.hidden = true;
  }
  fields.namedItem('count').removeAttribute('aria-invalid');
  taskInputs.forEach(el => el.removeAttribute('aria-invalid'));
  document.querySelectorAll('[data-color-name]').forEach(el => el.removeAttribute('aria-invalid'));
}
function updateColors(c) {
  $('#color-palette').hidden = !c.colors_enabled;
  const keys = [];
  document.querySelectorAll('[data-color-task]').forEach(group => {
    group.hidden = !c.tasks.includes(group.dataset.colorTask);
    if (!group.hidden) group.querySelectorAll('[data-color-key]').forEach(el => keys.push(el.dataset.colorKey));
  });
  const summary = $('#color-summary');
  summary.hidden = !c.colors_enabled || !keys.length;
  summary.replaceChildren(...keys.map(key => {
    const chip = document.createElement('span');
    const swatch = document.createElement('i'); swatch.style.backgroundColor = c.element_colors[key].hex;
    const name = document.createElement('span');
    const label = key === 'pi' ? 'π' : key.replace('OP', 'ОП');
    name.textContent = `${label} — ${c.element_colors[key].name || 'укажите цвет'}`;
    chip.append(swatch, name); return chip;
  }));
  document.querySelectorAll('.net-overlay [data-plot]').forEach(group => {
    const key = group.querySelector('text')?.textContent;
    const color = c.colors_enabled ? c.element_colors[key]?.hex : '#0f0f0f';
    group.querySelectorAll('path').forEach(el => { el.style.stroke = color; });
    group.querySelectorAll('circle, text').forEach(el => { el.style.fill = color; });
  });
}
function updatePreview(c) {
  if (c.mode !== 'both') previewMode = c.mode;
  const panel = $('#overview'); panel.dataset.mode = c.mode; panel.dataset.preview = previewMode;
  for (const tab of document.querySelectorAll('[data-preview]')) {
    tab.hidden = c.mode !== 'both' && tab.dataset.preview !== c.mode;
    const selected = tab.dataset.preview === previewMode;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
  }
  $('#sheet-preview').setAttribute('aria-labelledby', `preview-${previewMode}`);
  $('#sheet-mode').textContent = previewMode === 'inverse' ? 'Обратная задача' : 'Прямая задача';
  document.querySelectorAll('[data-plot]').forEach(el => { el.hidden = !c.tasks.includes(el.dataset.plot); });
  const lines = c.tasks.map(() => document.createElement('i'));
  $('.sheet-lines').replaceChildren(...lines);
}
function updateSummary() {
  const c = readConfig();
  const validCount = Number.isInteger(c.count) && c.count >= 1 && c.count <= 20;
  const count = validCount ? c.count : null;
  const pages = c.mode === 'both' ? 2 : 1;
  const total = count && c.tasks.length ? count * pages : null;
  $('#task-count').textContent = `${c.tasks.length} / 4`;
  $('#toggle-tasks').textContent = c.tasks.length === 4 ? 'Снять всё' : 'Выбрать всё';
  $('#summary-count').textContent = count ?? '—';
  $('#summary-count-label').textContent = count ? plural(count, ['вариант', 'варианта', 'вариантов']) : 'вариантов';
  $('#summary-pages').textContent = pages;
  $('#summary-pages-label').textContent = pages === 2 ? 'листа на вариант' : 'лист на вариант';
  $('#summary-total').textContent = total ?? '—';
  const pageText = total ? `${total} ${plural(total, ['страница', 'страницы', 'страниц'])}` : 'выберите параметры';
  $('#students-pages').textContent = `PDF · ${pageText}`;
  $('#teacher-pages').textContent = `PDF · ${pageText} + таблица Excel`;
  $('#estimate').textContent = total ? `${count} ${plural(count, ['вариант', 'варианта', 'вариантов'])} · ${total} стр. заданий + ${total} стр. ответов` : (c.tasks.length ? 'Укажите от 1 до 20 вариантов' : 'Выберите хотя бы один тип задания');
  $('#count-minus').disabled = busy || (validCount && count <= 1);
  $('#count-plus').disabled = busy || (validCount && count >= 20);
  document.querySelectorAll('[data-count]').forEach(el => el.setAttribute('aria-pressed', String(Number(el.dataset.count) === count)));
  $('#dirty-note').hidden = !lastSet || JSON.stringify(c) === JSON.stringify(lastSet.input) || JSON.stringify(c) === JSON.stringify(lastSet.config);
  if (validCount) { $('#count-error').hidden = true; fields.namedItem('count').removeAttribute('aria-invalid'); }
  if (c.tasks.length) { $('#tasks-error').hidden = true; taskInputs.forEach(el => el.removeAttribute('aria-invalid')); }
  updatePreview(c);
  updateColors(c);
}
function focusSection(selector) {
  const el = $(selector);
  el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  if (selector === '#result') $('#result-heading').focus({ preventScroll: true });
}
function navState(which) {
  $('#nav-create').classList.toggle('is-active', which === 'create');
  $('#nav-files').classList.toggle('is-active', which === 'files');
  if (which === 'create') { $('#nav-create').setAttribute('aria-current', 'location'); $('#nav-files').removeAttribute('aria-current'); }
  else { $('#nav-files').setAttribute('aria-current', 'location'); $('#nav-create').removeAttribute('aria-current'); }
}
function setBusy(value) {
  busy = value;
  form.setAttribute('aria-busy', String(value));
  form.querySelectorAll('input, select, button').forEach(el => { el.disabled = value; });
  $('#reuse-settings').disabled = value; $('#copy-seed').disabled = value;
  $('#summary-generate').disabled = value; $('#summary-generate span').textContent = value ? 'Создаём PDF…' : 'Создать комплект PDF';
  generateButton.querySelector('.button-label').textContent = value ? 'Создаём варианты и PDF…' : 'Создать комплект PDF';
  generateButton.querySelector('.spinner').hidden = !value;
  generateButton.querySelector('.button-arrow').hidden = value;
  updateSummary();
}
function validate(c) {
  clearErrors(); let target = null;
  if (!Number.isInteger(c.count) || c.count < 1 || c.count > 20) {
    $('#count-error').textContent = 'Введите целое число от 1 до 20.'; $('#count-error').hidden = false;
    fields.namedItem('count').setAttribute('aria-invalid', 'true'); target = fields.namedItem('count');
  }
  if (!c.tasks.length) {
    $('#tasks-error').textContent = 'Выберите хотя бы один элемент для построения.'; $('#tasks-error').hidden = false;
    taskInputs.forEach(el => el.setAttribute('aria-invalid', 'true')); target ??= taskInputs[0];
  }
  if (c.colors_enabled) {
    for (const el of document.querySelectorAll('[data-color-name]')) {
      if (el.closest('[data-color-task]').hidden) continue;
      const name = el.value.trim();
      if ([...name].length < 1 || [...name].length > 12 || /[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
        $('#colors-error').textContent = 'Укажите названия цветов: от 1 до 12 символов, без переносов строк.';
        $('#colors-error').hidden = false; el.setAttribute('aria-invalid', 'true');
        target ??= el;
      }
    }
  }
  if (target) { target.focus(); setStatus('Проверьте выделенные настройки перед созданием PDF.', true); return false; }
  return true;
}
form.addEventListener('input', updateSummary);
form.addEventListener('change', updateSummary);
for (const input of colorInputs) {
  const nameInput = $(`#color-name-${input.dataset.colorKey}`);
  input.addEventListener('input', () => {
    nameInput.value = palette.find(color => color[1] === input.value)?.[0] || input.value;
    updateSummary();
  });
  nameInput.addEventListener('input', () => {
    const color = palette.find(color => [color[0], color[2]].some(name => normalizedColor(name) === normalizedColor(nameInput.value)));
    if (color) input.value = color[1];
    updateSummary();
  });
}
for (const button of document.querySelectorAll('[data-count]')) {
  button.addEventListener('click', () => { fields.namedItem('count').value = button.dataset.count; updateSummary(); });
}
for (const [selector, delta] of [['#count-minus', -1], ['#count-plus', 1]]) {
  $(selector).addEventListener('click', () => {
    const current = Number(fields.namedItem('count').value);
    fields.namedItem('count').value = Math.min(20, Math.max(1, (Number.isFinite(current) ? Math.round(current) : 1) + delta));
    updateSummary();
  });
}
$('#toggle-tasks').addEventListener('click', () => {
  const chooseAll = taskInputs.some(el => !el.checked);
  taskInputs.forEach(el => { el.checked = chooseAll; }); updateSummary();
});
$('#reset').addEventListener('click', () => { HTMLFormElement.prototype.reset.call(form); previewMode = 'forward'; clearErrors(); setStatus(); updateSummary(); });
for (const tab of document.querySelectorAll('[data-preview]')) {
  tab.addEventListener('click', () => { previewMode = tab.dataset.preview; updatePreview(readConfig()); });
  tab.addEventListener('keydown', event => {
    const tabs = [...document.querySelectorAll('[data-preview]')].filter(el => !el.hidden);
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let index = tabs.indexOf(tab);
    index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[index].click(); tabs[index].focus();
  });
}
function showSet(result, config) {
  lastSet = { input: structuredClone(config), config: { ...structuredClone(config), seed: result.seed }, result };
  const names = { zip: 'wulff-set.zip', students: 'students.pdf', teacher: 'teacher.pdf', guide: 'student_guide.pdf', csv: 'answers.csv', json: 'settings.json' };
  for (const [id, name] of Object.entries(names)) {
    for (const anchor of [$(`#${id}`), ...document.querySelectorAll(`[data-download="${id}"]`)]) {
      anchor.href = `download/${result.job}/${name}`; anchor.download = name;
    }
  }
  $('#view').href = `download/${result.job}/students.pdf?inline=1`;
  $('#result-heading').textContent = config.title;
  $('#result-meta').textContent = `${result.count} ${plural(result.count, ['вариант', 'варианта', 'вариантов'])} · ${modeNames[config.mode]} · ${result.pages} стр. заданий и ${result.pages} стр. ответов`;
  $('#result-seed').textContent = result.seed;
  $('#students-description').textContent = `${result.pages} ${plural(result.pages, ['страница', 'страницы', 'страниц'])} · A4 · сетка 180 мм`;
  $('#teacher-description').textContent = `${result.pages} ${plural(result.pages, ['страница', 'страницы', 'страниц'])} · построения и численные ответы`;
  $('#nav-files').disabled = false; $('#nav-files').title = 'Перейти к готовым файлам'; $('#nav-file-count').textContent = '6';
  $('#workflow-ready').classList.add('is-ready');
  $('#result-notice').textContent = ''; clearTimeout(copyTimer); $('#copy-seed span').textContent = 'Копировать';
  resultEl.hidden = false;
  updateSummary(); navState('files');
  if (!dialog.open) focusSection('#result');
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  const config = readConfig(); if (!validate(config)) return;
  setBusy(true); setStatus('Подбираем разные значения, строим задания и отдельный ключ преподавателя…');
  try {
    const response = await fetch('generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Не удалось создать комплект. Попробуйте ещё раз.');
    showSet(result, config);
    setStatus('Комплект готов. Скачайте задания и ответы в блоке «Готовые файлы».');
  } catch (error) {
    setStatus(error instanceof TypeError ? 'Нет соединения с программой. Запустите WulffGenerator.exe заново и повторите создание.' : error.message, true);
  } finally { setBusy(false); }
});
$('#nav-create').addEventListener('click', () => navState('create'));
$('#nav-files').addEventListener('click', () => { if (lastSet) { navState('files'); focusSection('#result'); } });
$('#reuse-settings').addEventListener('click', () => {
  if (!lastSet || busy) return;
  const c = lastSet.config;
  fields.namedItem('title').value = c.title; fields.namedItem('count').value = c.count;
  fields.namedItem('step').value = c.step; fields.namedItem('mode').value = c.mode; fields.namedItem('seed').value = c.seed;
  taskInputs.forEach(el => { el.checked = c.tasks.includes(el.value); });
  $('#colors-enabled').checked = c.colors_enabled;
  colorInputs.forEach(el => {
    el.value = c.element_colors[el.dataset.colorKey].hex;
    $(`#color-name-${el.dataset.colorKey}`).value = c.element_colors[el.dataset.colorKey].name;
  });
  $('#seed-options').open = true; clearErrors(); updateSummary(); navState('create');
  focusSection('#settings');
  setStatus('Настройки и код этого набора восстановлены. Нажмите «Создать комплект PDF», чтобы повторить его.');
});
$('#copy-seed').addEventListener('click', async () => {
  if (!lastSet) return;
  let ok = false;
  try { await navigator.clipboard.writeText(lastSet.result.seed); ok = true; }
  catch {
    const input = document.createElement('textarea'); input.value = lastSet.result.seed;
    input.setAttribute('aria-label', 'Код набора для копирования'); input.className = 'copy-fallback'; document.body.append(input); input.select();
    try { ok = document.execCommand('copy'); } catch {}
    input.remove();
  }
  if (ok) {
    $('#copy-seed span').textContent = 'Скопировано'; $('#result-notice').textContent = 'Код набора скопирован. Для повторения используйте те же настройки.';
    clearTimeout(copyTimer); copyTimer = setTimeout(() => { $('#copy-seed span').textContent = 'Копировать'; }, 2200);
  } else { $('#result-notice').textContent = 'Выделите код набора и скопируйте его сочетанием Ctrl+C.'; }
});
for (const button of document.querySelectorAll('[data-help]')) {
  button.addEventListener('click', () => { dialog.showModal(); document.body.classList.add('dialog-open'); });
}
$('#close-help').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const r = dialog.getBoundingClientRect();
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !busy && !dialog.open) { event.preventDefault(); form.requestSubmit(); }
});
const heartbeat = setInterval(() => fetch('ping').catch(() => {}), 30000);
$('#quit').addEventListener('click', async () => {
  try {
    const response = await fetch('quit', { method: 'POST' }); if (!response.ok) throw new Error();
    clearInterval(heartbeat); clearTimeout(copyTimer);
    document.body.replaceChildren(); document.body.className = 'closed-page';
    const box = document.createElement('section'); box.className = 'card closed-card';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'icon');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'm5 12 4 4L19 6'); svg.append(path);
    const h = document.createElement('h1'); h.textContent = 'Программа закрыта';
    const p = document.createElement('p'); p.textContent = 'Скачанные файлы остались в папке загрузок. Эту вкладку можно закрыть.';
    const small = document.createElement('small'); small.textContent = 'Чтобы создать новую работу, снова запустите WulffGenerator.exe.';
    box.append(svg, h, p, small); document.body.append(box); h.tabIndex = -1; h.focus();
  } catch { setStatus('Программа уже закрыта или соединение потеряно.', true); }
});
updateSummary();
