'use strict';
(() => {
  const tabs = [...document.querySelectorAll('[data-suite-tab]')];
  const frame = document.getElementById('wulff-frame');
  const loading = document.getElementById('wulff-loading');
  const panel = document.getElementById('panel-wulff');
  function activate(name) {
    if (name !== 'wulff') name = 'map';
    tabs.forEach(tab => {
      const selected = tab.dataset.suiteTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    if (name === 'wulff' && !frame.hasAttribute('src')) {
      panel.setAttribute('aria-busy', 'true');
      frame.addEventListener('load', () => {
        loading.hidden = true;
        panel.setAttribute('aria-busy', 'false');
      }, { once: true });
      frame.src = 'wulff/?embedded=1';
    }
  }
  function choose(tab) {
    const name = tab.dataset.suiteTab;
    if (location.hash !== '#' + name) history.pushState(null, '', '#' + name);
    activate(name);
  }
  tabs.forEach(tab => {
    tab.addEventListener('click', () => choose(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
        (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      choose(tabs[index]); tabs[index].focus();
    });
  });
  addEventListener('popstate', () => activate(location.hash.slice(1)));
  addEventListener('hashchange', () => activate(location.hash.slice(1)));
  activate(location.hash.slice(1));
  document.getElementById('suite-exit').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await fetch('quit', { method: 'POST', keepalive: true });
      if (!response.ok) throw new Error();
      const message = document.createElement('section'); message.className = 'suite-closed';
      const title = document.createElement('h1'); title.textContent = 'Программа закрыта';
      const text = document.createElement('p'); text.textContent = 'Сохранённые файлы остались на компьютере. Эту вкладку можно закрыть.';
      message.append(title, text); document.body.replaceChildren(message);
    } catch {
      button.disabled = false;
      button.textContent = 'Повторить закрытие';
    }
  });
  const header = document.querySelector('.suite-header');
  const resize = () => document.documentElement.style.setProperty('--suite-header-height', header.getBoundingClientRect().height + 'px');
  new ResizeObserver(resize).observe(header);
  resize();
})();
