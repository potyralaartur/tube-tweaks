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

  // YouTube marks only the listbox child (the <a>); marking the inner paper-item too doubles the grey.
  function markSelected(el, on) {
    el.classList.toggle('iron-selected', on);
    el.setAttribute('aria-selected', String(on));
    for (const n of el.querySelectorAll('.iron-selected')) n.classList.remove('iron-selected');
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

  // Sets an element's own text without touching its child elements (YouTube's title holds a badge span).
  function setOwnText(node, text) {
    const t = [...node.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.data.trim());
    if (t) { if (t.data !== text) t.data = text; }
    else if (!node.children.length) { if (node.textContent !== text) node.textContent = text; }
    else node.prepend(text);
  }
  function setItemText(el) {
    let title = el.querySelector('#item-with-badge .item, .item');
    let desc = el.querySelector('#subtitle, [secondary]');
    if (!title || !desc) [title, desc] = textLeaves(el);
    if (title) setOwnText(title, POPULAR_TITLE);
    if (desc && desc !== title) setOwnText(desc, POPULAR_DESC);
  }

  function makeSortItem(menu, listbox) {
    const template = nativeItems(listbox)[0];
    let el;
    if (template && textLeaves(template).length) {
      el = template.cloneNode(true);
      el.removeAttribute('href');
      el.removeAttribute('tt-bound');
      el.removeAttribute('id');
      for (const n of el.querySelectorAll('[focused]')) n.removeAttribute('focused');
      for (const n of el.querySelectorAll('ytd-badge-supported-renderer, .notification')) n.hidden = true;
      markSelected(el, false);
      setItemText(el);
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

  // Picking one of YouTube's options turns ours off. Listening on the document (capture) sees every
  // click even if YouTube re-renders its items.
  const nativeOption = target => {
    const item = target instanceof Element && target.closest('ytd-comments #sort-menu tp-yt-paper-listbox > *');
    return item && !item.classList.contains('tt-sort-item') ? item : null;
  };
  document.addEventListener('click', e => { const n = nativeOption(e.target); if (n && popularActive) setPopular(false, n); }, true);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const n = nativeOption(e.target); if (n && popularActive) setPopular(false, n);
  }, true);
  // When the menu opens, YouTube focuses its own selected option ("Top"), which greys it out.
  // While ours is the active sort, move that focus to ours.
  document.addEventListener('focusin', e => {
    if (!popularActive || !nativeOption(e.target)) return;
    const listbox = e.target.closest('tp-yt-paper-listbox');
    if (e.relatedTarget instanceof Node && listbox.contains(e.relatedTarget)) return; // arrow-key navigation
    const mine = listbox.querySelector(':scope > .tt-sort-item');
    const target = mine && (mine.querySelector('tp-yt-paper-item') || mine);
    if (target) setTimeout(() => target.focus({ preventScroll: true }), 0);
  }, true);

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

  // The mini player sits over the secondary column and takes its width (16:9 box).
  function miniGeometry() {
    const sec = document.querySelector('ytd-watch-flexy #secondary-inner') || document.querySelector('ytd-watch-flexy #secondary');
    let left, width;
    const r = sec && sec.getBoundingClientRect();
    if (r && r.width >= 240 && r.left > 0) {
      const cs = getComputedStyle(sec);
      left = r.left + parseFloat(cs.paddingLeft);
      width = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    } else {
      // No column beside the video (narrow window): fall back to the bottom-right corner.
      width = Math.min(400, window.innerWidth - 32);
      left = window.innerWidth - 16 - width;
    }
    root.style.setProperty('--tt-mini-left', `${Math.round(left)}px`);
    root.style.setProperty('--tt-mini-w', `${Math.round(width)}px`);
  }

  // A fixed element can't paint above its ancestors' stacking contexts, so those ancestors are
  // raised (still below the masthead) while the mini player is shown.
  function createsStackingContext(cs) {
    return cs.zIndex !== 'auto' || cs.position === 'fixed' || cs.position === 'sticky' || cs.opacity !== '1' ||
      cs.transform !== 'none' || cs.filter !== 'none' || cs.isolation === 'isolate' ||
      (cs.viewTransitionName && cs.viewTransitionName !== 'none') || (cs.backdropFilter && cs.backdropFilter !== 'none') ||
      /transform|opacity|filter/.test(cs.willChange) || /paint|layout|strict|content/.test(cs.contain);
  }
  function liftAncestors(p, on) {
    for (const el of document.querySelectorAll('[tt-mini-lift]')) el.removeAttribute('tt-mini-lift');
    if (!on || !p) return;
    const masthead = document.getElementById('masthead-container');
    const top = (masthead && parseInt(getComputedStyle(masthead).zIndex, 10)) || 2020;
    root.style.setProperty('--tt-mini-lift', String(top - 1));
    for (let el = p.parentElement; el && el !== document.body && el !== root; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (createsStackingContext(cs)) el.setAttribute('tt-mini-lift', cs.position === 'static' ? 'static' : '');
    }
  }

  function setMini(on) {
    if (on) miniGeometry();
    if (miniOn === on) return;
    miniOn = on;
    liftAncestors(document.getElementById('movie_player'), on);
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

  window.addEventListener('resize', e => { if (miniOn && e.isTrusted) miniGeometry(); });

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

  // Sleep timer has no icon when YouTube's menu icons are off, and no aria-label: match its label.
  const SLEEP_LABELS = new Set(['sleep timer', 'wyłącznik czasowy']);
  function markSleepTimer() {
    for (const item of document.querySelectorAll('#movie_player .ytp-settings-menu .ytp-menuitem[aria-haspopup="true"]:not([tt-sleep-timer])')) {
      const label = item.querySelector('.ytp-menuitem-label');
      if (label && SLEEP_LABELS.has(label.textContent.trim().toLowerCase())) item.setAttribute('tt-sleep-timer', '');
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
    markSleepTimer();
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
    root.toggleAttribute('tt-hide-ambient', S.hideAmbient);
    root.toggleAttribute('tt-hide-sleep-timer', S.hideSleepTimer);
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
