'use strict';
const form = document.querySelector('#settings');
const statusEl = document.querySelector('#status');
const button = document.querySelector('#generate');
const estimate = document.querySelector('#estimate');
function updateEstimate() {
  const tasks = form.querySelectorAll('[name=task]:checked').length;
  const count = Number(form.count.value);
  const modes = form.mode.value === 'both' ? 2 : 1;
  const pages = modes;
  estimate.textContent = tasks ? `${count || '—'} вариантов · ${pages} стр. на вариант · одна сетка 180 мм на лист · ${count * pages || '—'} стр. в PDF заданий + отдельный PDF ответов` : 'Выберите хотя бы один тип задания.';
}
form.addEventListener('input', updateEstimate);
updateEstimate();
form.addEventListener('submit', async event => {
  event.preventDefault();
  const tasks = [...form.querySelectorAll('[name=task]:checked')].map(el => el.value);
  if (!tasks.length) { statusEl.textContent = 'Выберите хотя бы один тип задания.'; statusEl.className = 'status error'; return; }
  const data = { count: Number(form.count.value), title: form.title.value.trim(), step: Number(form.step.value), mode: form.mode.value, seed: form.seed.value.trim(), tasks };
  button.disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = 'Подбираем значения и строим PDF…';
  try {
    const response = await fetch('generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Ошибка генерации');
    const names = { zip: 'wulff-set.zip', students: 'students.pdf', teacher: 'teacher.pdf', csv: 'answers.csv', json: 'settings.json' };
    for (const [id, name] of Object.entries(names)) {
      const a = document.getElementById(id); a.href = `download/${result.job}/${name}`; a.download = name;
    }
    document.getElementById('view').href = `download/${result.job}/students.pdf?inline=1`;
    document.getElementById('result-meta').textContent = `${result.count} вариантов · ${result.pages} стр. в каждом PDF · код набора: ${result.seed}`;
    document.getElementById('initial-preview').hidden = true;
    document.getElementById('result').hidden = false;
    statusEl.textContent = `Готово. Код набора: ${result.seed}. Файлы доступны справа.`;
    // Keep an empty seed empty: the next click should create a new set.
  } catch (error) {
    statusEl.className = 'status error';
    statusEl.textContent = `${error.message}. Если программа закрыта, запустите её снова.`;
  } finally { button.disabled = false; }
});
const heartbeat = setInterval(() => fetch('ping').catch(() => {}), 30000);
document.getElementById('quit').addEventListener('click', async () => {
  try {
    const r = await fetch('quit', { method: 'POST' });
    if (!r.ok) throw new Error();
    clearInterval(heartbeat);
    document.body.replaceChildren();
    const box = document.createElement('div'); box.className = 'closed';
    const h = document.createElement('h1'); h.textContent = 'Программа закрыта';
    const p = document.createElement('p'); p.textContent = 'Скачанные файлы сохранены в папке загрузок. Эту вкладку можно закрыть.';
    box.append(h, p); document.body.append(box);
  } catch { statusEl.className = 'status error'; statusEl.textContent = 'Программа уже закрыта или соединение потеряно.'; }
});
