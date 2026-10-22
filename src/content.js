// Isolated-world content script: owns settings, page attributes and all DOM-level features.
// Player API work (quality, Premium, 2K badge state, subscriptions) lives in page.js.
(() => {
  'use strict';

  const root = document.documentElement;
  const { parseCount, VIEW_WORDS, LIVE_WORDS } = window.TTNumbers;
  let S = window.TTSettings.normalize(null);
  let ready = false;

  const isWatch = () => location.pathname === '/watch';
  const isHome = () => location.pathname === '/';
  const videoId = () => new URLSearchParams(location.search).get('v');

  // ---------- Cinema mode ----------
  // YouTube opens the watch page in theater view when the "wide" cookie is 1, so setting it
  // before the page renders gives cinema mode with no flash. A remembered flag lets us do that
  // synchronously at document_start, before chrome.storage answers.
  const setWideCookie = () => { document.cookie = 'wide=1; domain=.youtube.com; path=/; max-age=31536000; secure; samesite=lax'; };
  try { if (localStorage.getItem('tt-cinema') === '1') setWideCookie(); } catch {}

  let cinemaVid = null, cinemaTries = 0, cinemaLastClick = 0;
  function enforceCinema() {
    if (!S.cinemaMode || !isWatch()) return;
    const vid = videoId();
    if (cinemaVid !== vid) { cinemaVid = vid; cinemaTries = 0; }
    const flexy = document.querySelector('ytd-watch-flexy');
    if (!flexy || flexy.hasAttribute('hidden')) return;
    if (flexy.hasAttribute('theater') || flexy.hasAttribute('fullscreen') || document.fullscreenElement) return;
    if (cinemaTries >= 5 || Date.now() - cinemaLastClick < 1000) return;
    const btn = document.querySelector('#movie_player .ytp-size-button');
    if (!btn) return;
    cinemaTries++; cinemaLastClick = Date.now();
    btn.click();
  }

  // ---------- Hide low-view videos on Home ----------
  let subs = null, subsSets = null, subsRequested = 0;

  document.addEventListener('tt-subs', e => {
    try { subs = JSON.parse(e.detail); } catch { subs = null; }
    if (!subs) return;
    const dec = s => { try { return decodeURIComponent(s).toLowerCase(); } catch { return String(s).toLowerCase(); } };
    subsSets = {
      ids: new Set(subs.ids.map(s => s.toLowerCase())),
      urls: new Set(subs.urls.map(dec)),
      names: new Set(subs.names.map(s => s.toLowerCase())),
    };
    schedule();
  });

  function ensureSubs() {
    if (subs || Date.now() - subsRequested < 15000) return;
    subsRequested = Date.now();
    document.dispatchEvent(new CustomEvent('tt-request-subs'));
  }

  function itemInfo(item) {
    let channel = null;
    for (const a of item.querySelectorAll('a[href^="/@"], a[href^="/channel/"]')) {
      let path = a.getAttribute('href').split(/[?#]/)[0];
      try { path = decodeURIComponent(path); } catch {}
      const m = path.toLowerCase().match(/^\/(@[^/]+|channel\/[^/]+)/);
      if (m) { channel = '/' + m[1]; break; }
    }
    const nameEl = item.querySelector('ytd-channel-name #text, ytd-channel-name a, .yt-content-metadata-view-model-wiz__metadata-row a, .yt-content-metadata-view-model__metadata-row a');
    const name = nameEl ? nameEl.textContent.trim() : null;

    let views = null, live = false;
    const texts = item.querySelectorAll('#metadata-line span, .inline-metadata-item, .yt-content-metadata-view-model-wiz__metadata-text, .yt-content-metadata-view-model__metadata-text, span.yt-core-attributed-string');
    for (const el of texts) {
      for (const part of el.textContent.split('•')) {
        if (LIVE_WORDS.test(part)) live = true;
        else if (views === null && VIEW_WORDS.test(part)) views = parseCount(part);
      }
    }
    return { channel, name, views, live };
  }

  function isSubscribed(info) {
    if (!subsSets) return false;
    if (info.channel) {
      if (subsSets.urls.has(info.channel)) return true;
      const m = info.channel.match(/^\/channel\/(uc[\w-]+)/);
      if (m && subsSets.ids.has(m[1])) return true;
    }
    return !!info.name && subsSets.names.has(info.name.toLowerCase());
  }

  function filterHome() {
    if (!S.hideLowViews || !isHome()) return;
    ensureSubs();
    if (!subs) return;
    for (const item of document.querySelectorAll('ytd-browse[page-subtype="home"] ytd-rich-item-renderer')) {
      const info = itemInfo(item);
      // Only hide when we know enough: a view count, and a channel we can check (or the user is
      // logged out, in which case nothing is subscribed).
      const known = !!(info.channel || info.name) || !subs.loggedIn;
      const hide = info.views !== null && !info.live && info.views < S.minViews && known && !isSubscribed(info);
      if (item.hasAttribute('tt-low-views') !== hide) item.toggleAttribute('tt-low-views', hide);
    }
  }

  // ---------- Comments: "Most popular" sort and default sort ----------
  // The option is a copy of YouTube's own "Top" item, so it gets YouTube's typography and
  // hover/focus/selected styles. It is appended last (YouTube maps menu positions to its own
  // sort options) and shown first with CSS order.
  const POPULAR_TITLE = 'Most popular';
  const POPULAR_DESC = 'Show comments with the most likes';
  let commentsVid = null, popularActive = false, strippedSelection = null;

  const nativeItems = listbox => [...listbox.children].filter(e => !e.classList.contains('tt-sort-item') && e.matches('a, tp-yt-paper-item, [role="option"]'));
  const isSelected = el => el.classList.contains('iron-selected') || el.getAttribute('aria-selected') === 'true' || !!el.querySelector('.iron-selected, [aria-selected="true"]');
  const clickItem = el => (el.querySelector('tp-yt-paper-item') || el).click();

  function markSelected(el, on) {
    for (const n of [el, ...el.querySelectorAll('tp-yt-paper-item, [role="option"]')]) {
      n.classList.toggle('iron-selected', on);
      if (n.hasAttribute('aria-selected') || n === el) n.setAttribute('aria-selected', String(on));
    }
  }

  // `clicked` is the YouTube option the user picked, when that is what turned this off.
  function setPopular(on, clicked) {
    popularActive = on;
    root.toggleAttribute('tt-popular-active', on);
    const mine = document.querySelector('ytd-comments #sort-menu .tt-sort-item');
    if (mine) markSelected(mine, on);
    if (on && mine && !strippedSelection) {
      const sel = nativeItems(mine.parentElement).find(isSelected);
      if (sel) { markSelected(sel, false); strippedSelection = sel; }
    }
    if (!on) {
      // Give the highlight back to "Top" unless the user just picked a different option.
      if (strippedSelection && (!clicked || clicked === strippedSelection)) markSelected(strippedSelection, true);
      strippedSelection = null;
      for (const t of document.querySelectorAll('ytd-comments ytd-item-section-renderer #contents > *')) t.style.order = '';
    }
  }

  function closeDropdown(menu) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    setTimeout(() => {
      const listbox = menu.querySelector('tp-yt-paper-listbox');
      if (listbox && listbox.offsetParent) menu.querySelector('#trigger, tp-yt-paper-button, #label')?.click();
    }, 60);
  }

  function activatePopular(listbox) {
    if (!popularActive) {
      const items = nativeItems(listbox);
      if (items[0] && !isSelected(items[0])) clickItem(items[0]); // most popular ranks the "Top" set
      setPopular(true);
    }
    sortComments();
  }

  // Text-bearing leaves of a menu item: [title, description].
  const textLeaves = el => [...el.querySelectorAll('*')].filter(n => !n.children.length && n.textContent.trim());

  function setItemText(el) {
    const [title, desc] = textLeaves(el);
    if (title && title.textContent !== POPULAR_TITLE) title.textContent = POPULAR_TITLE;
    if (desc && desc.textContent !== POPULAR_DESC) desc.textContent = POPULAR_DESC;
  }

  function makeSortItem(menu, listbox) {
    const template = nativeItems(listbox)[0];
    let el;
    if (template && textLeaves(template).length) {
      el = template.cloneNode(true);
      el.removeAttribute('href');
      el.removeAttribute('tt-bound');
      markSelected(el, false);
    } else {
      el = document.createElement('div');
      el.className = 'tt-sort-fallback';
      el.setAttribute('role', 'option');
      el.innerHTML = '<span class="tt-sort-title"></span><span class="tt-sort-desc"></span>';
      el.firstChild.textContent = POPULAR_TITLE;
      el.lastChild.textContent = POPULAR_DESC;
    }
    el.classList.add('tt-sort-item');
    el.setAttribute('tabindex', '0');
    const choose = e => {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      activatePopular(listbox);
      closeDropdown(menu);
    };
    el.addEventListener('click', choose, true);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') choose(e); }, true);
    return el;
  }

  let renderedMenuFor = null;
  function setupComments() {
    if (!isWatch()) return;
    const header = document.querySelector('ytd-comments ytd-comments-header-renderer');
    const menu = header && header.querySelector('#sort-menu');
    if (!menu) return;
    const listbox = menu.querySelector('tp-yt-paper-listbox');
    const vid = videoId();
    if (!listbox || nativeItems(listbox).length < 2) {
      // Some layouts only render the options once the menu has been opened.
      if (renderedMenuFor !== vid) {
        renderedMenuFor = vid;
        const trigger = menu.querySelector('#trigger, tp-yt-paper-button, #label');
        if (trigger) { trigger.click(); setTimeout(() => closeDropdown(menu), 50); }
      }
      return;
    }

    let mine = listbox.querySelector('.tt-sort-item');
    if (S.popularSort && !mine) {
      mine = makeSortItem(menu, listbox);
      listbox.appendChild(mine);
      if (popularActive) setPopular(true);
    }
    if (!S.popularSort && mine) { mine.remove(); setPopular(false); mine = null; }
    if (mine && !mine.classList.contains('tt-sort-fallback')) setItemText(mine); // YouTube may re-render copied text

    for (const n of nativeItems(listbox)) {
      if (!n.hasAttribute('tt-bound')) {
        n.setAttribute('tt-bound', '');
        n.addEventListener('click', () => { if (popularActive) setPopular(false, n); }, true);
      }
    }

    if (commentsVid !== vid) {
      commentsVid = vid;
      setPopular(false);
      const items = nativeItems(listbox);
      if (S.defaultSort === 'newest' && !isSelected(items[1])) clickItem(items[1]);
      else if (S.defaultSort === 'popular' && S.popularSort) activatePopular(listbox);
    }
  }

  function likeCount(thread) {
    const el = thread.querySelector('#vote-count-middle');
    if (!el) return 0;
    const fromAria = parseCount(el.getAttribute('aria-label'));
    return fromAria ?? parseCount(el.textContent) ?? 0;
  }

  function sortComments() {
    if (!popularActive || !isWatch()) return;
    const contents = document.querySelector('ytd-comments ytd-item-section-renderer #contents');
    if (!contents) return;
    const threads = [];
    [...contents.children].forEach((el, i) => {
      if (el.tagName === 'YTD-COMMENT-THREAD-RENDERER') {
        const pinned = !!el.querySelector('#pinned-comment-badge ytd-pinned-comment-badge-renderer');
        threads.push({ el, i, likes: pinned ? Infinity : likeCount(el) });
      } else {
        el.style.order = '100000'; // the "load more" spinner stays last
      }
    });
    threads.sort((a, b) => b.likes - a.likes || a.i - b.i);
    threads.forEach((t, rank) => { const o = String(rank); if (t.el.style.order !== o) t.el.style.order = o; });
  }

  // ---------- Mini player while reading comments ----------
  let miniOn = false, miniDismissed = false;

  function closeButton() {
    let b = document.getElementById('tt-mini-close');
    if (!b && document.body) {
      b = document.createElement('button');
      b.id = 'tt-mini-close';
      b.type = 'button';
      b.title = 'Close mini player';
      b.setAttribute('aria-label', 'Close mini player');
      b.textContent = '×';
      b.addEventListener('click', () => { miniDismissed = true; updateMini(); });
      document.body.appendChild(b);
    }
  }

  function setMini(on) {
    if (miniOn === on) return;
    miniOn = on;
    root.toggleAttribute('tt-mini', on);
    // Let the player re-layout its controls for the new size.
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
  }

  function updateMini() {
    const p = document.getElementById('movie_player');
    if (!S.miniPlayer || !isWatch() || !p || document.fullscreenElement) { setMini(false); return; }
    const anchor = p.closest('#full-bleed-container, #player-container-outer, #player-container, ytd-player');
    if (!anchor) { setMini(false); return; }
    const out = anchor.getBoundingClientRect().bottom < 120;
    if (!out) miniDismissed = false;
    if (out && !miniDismissed) closeButton();
    setMini(out && !miniDismissed);
  }

  let scrollQueued = false;
  window.addEventListener('scroll', () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => { scrollQueued = false; updateMini(); });
  }, { passive: true });

  // ---------- 2K label in the player's quality menu ----------
  function rewriteMenuBadges() {
    const menu = document.querySelector('#movie_player .ytp-settings-menu');
    if (!menu) return;
    for (const sup of menu.querySelectorAll('sup')) {
      if (sup.textContent.trim() === 'HD' && /^\s*1440p/.test(sup.parentElement?.textContent || '')) sup.textContent = '2K';
    }
  }

  // ---------- Scheduling ----------
  let timer = null;
  function tick() {
    timer = null;
    if (!ready) return;
    enforceCinema();
    filterHome();
    setupComments();
    sortComments();
    updateMini();
    rewriteMenuBadges();
  }
  function schedule() { if (!timer) timer = setTimeout(tick, 200); }

  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });

  document.addEventListener('yt-navigate-start', () => {
    if (S.cinemaMode) setWideCookie();
    setMini(false);
    setPopular(false);
  });
  document.addEventListener('yt-navigate-finish', schedule);
  document.addEventListener('fullscreenchange', schedule);

  // ---------- Settings ----------
  function apply(settings) {
    const sortChanged = settings.defaultSort !== S.defaultSort || settings.popularSort !== S.popularSort;
    S = settings;
    ready = true;
    try { localStorage.setItem('tt-cinema', S.cinemaMode ? '1' : '0'); } catch {}
    if (S.cinemaMode) setWideCookie();
    root.toggleAttribute('tt-hide-shorts', S.hideShorts);
    root.toggleAttribute('tt-hide-low-views', S.hideLowViews);
    root.setAttribute('tt-settings', JSON.stringify(S));
    document.dispatchEvent(new CustomEvent('tt-settings'));
    if (!S.popularSort) setPopular(false);
    if (sortChanged) commentsVid = null; // re-apply the default sort on the open video
    schedule();
  }

  window.TTSettings.load().then(apply);
  window.TTSettings.onChange(apply);
})();
