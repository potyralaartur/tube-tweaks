(async () => {
  'use strict';
  const { DEFAULTS, QUALITIES, load, save, normalize } = window.TTSettings;
  let settings = await load();

  // Same names and order as the comment sort menu on YouTube.
  const SORTS = () => [
    ...(settings.popularSort ? [{ id: 'popular', label: 'Most popular' }] : []),
    { id: 'top', label: 'Top' },
    { id: 'newest', label: 'Newest' },
  ];
  const OPTIONS = {
    quality: () => QUALITIES.map(q => ({ id: q.id, label: q.label })),
    defaultSort: SORTS,
  };
  // The chip shows a short label; the menu shows the full one.
  const shortLabel = (key, opt) => (key === 'quality' && opt.id === 'auto' ? 'Auto' : opt.label);

  const status = document.getElementById('status');
  const statusText = status.textContent;
  let statusTimer;
  // Changes apply to `settings` right away and saves run one after another, so quick changes in a
  // row can't overwrite each other.
  let saving = Promise.resolve();
  function update(patch) {
    settings = normalize({ ...settings, ...patch });
    render();
    const snapshot = settings;
    saving = saving.then(() => save(snapshot)).then(() => {
      status.textContent = 'Saved';
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => { status.textContent = statusText; }, 1200);
    }, () => {});
    return saving;
  }

  // ---------- Select (chip + menu) ----------
  const TICK = '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CHEVRON = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let openSelect = null;

  function buildSelect(host) {
    const key = host.dataset.setting;
    host.innerHTML = '';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-labelledby', host.getAttribute('aria-labelledby'));
    const menu = document.createElement('ul');
    menu.className = 'select-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    host.append(trigger, menu);

    const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); if (openSelect === close) openSelect = null; };
    const open = () => {
      if (openSelect) openSelect();
      menu.innerHTML = '';
      for (const opt of OPTIONS[key]()) {
        const li = document.createElement('li');
        li.className = 'select-option';
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(settings[key] === opt.id));
        li.dataset.id = opt.id;
        li.innerHTML = TICK;
        li.append(opt.label);
        li.addEventListener('click', () => { close(); trigger.focus(); update({ [key]: opt.id }); });
        menu.appendChild(li);
      }
      menu.hidden = false;
      // Open upwards if there's no room below inside the popup.
      menu.classList.remove('up');
      const r = menu.getBoundingClientRect();
      if (r.bottom > document.documentElement.clientHeight && host.getBoundingClientRect().top > r.height) menu.classList.add('up');
      trigger.setAttribute('aria-expanded', 'true');
      const sel = menu.querySelector('[aria-selected="true"]') || menu.firstChild;
      sel.classList.add('active');
      sel.scrollIntoView({ block: 'nearest' });
      openSelect = close;
    };
    trigger.addEventListener('click', () => (menu.hidden ? open() : close()));
    trigger.addEventListener('keydown', e => {
      if (menu.hidden) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } return; }
      const items = [...menu.children];
      let i = items.findIndex(li => li.classList.contains('active'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[i]?.classList.remove('active');
        i = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[i].classList.add('active');
        items[i].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); items[i]?.click();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        close();
      }
    });
    host._render = () => {
      const opt = OPTIONS[key]().find(o => o.id === settings[key]) || OPTIONS[key]()[0];
      trigger.innerHTML = '';
      trigger.append(shortLabel(key, opt));
      trigger.insertAdjacentHTML('beforeend', CHEVRON);
    };
  }

  document.addEventListener('click', e => { if (openSelect && !e.target.closest('.select')) openSelect(); });

  // ---------- Toggles and number field ----------
  const selects = [...document.querySelectorAll('.select')];
  selects.forEach(buildSelect);

  const toggles = [...document.querySelectorAll('.toggle')];
  toggles.forEach(t => t.addEventListener('change', () => update({ [t.dataset.setting]: t.checked })));

  const minViews = document.getElementById('min-views');
  const fmt = n => Number(n).toLocaleString('en-US');
  let numTimer = null;
  const typedViews = () => Number(minViews.value.replace(/\D/g, '') || 0);
  // Saves what was typed now instead of after the pause (leaving the field, closing the popup).
  const flushViews = () => { if (numTimer === null) return; clearTimeout(numTimer); numTimer = null; update({ minViews: typedViews() }); };
  minViews.addEventListener('input', () => {
    clearTimeout(numTimer);
    numTimer = setTimeout(() => { numTimer = null; update({ minViews: typedViews() }); }, 400);
  });
  minViews.addEventListener('blur', () => { flushViews(); minViews.value = fmt(settings.minViews); });
  window.addEventListener('pagehide', flushViews);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushViews(); });
  minViews.addEventListener('keydown', e => { if (e.key === 'Enter') minViews.blur(); });

  document.getElementById('reset').addEventListener('click', () => update({ ...DEFAULTS }));

  function render() {
    for (const t of toggles) t.checked = !!settings[t.dataset.setting];
    for (const s of selects) s._render();
    document.getElementById('row-min-views').hidden = !settings.hideLowViews;
    if (document.activeElement !== minViews) minViews.value = fmt(settings.minViews);
  }
  render();
})();
