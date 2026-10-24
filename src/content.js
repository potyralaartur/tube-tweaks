// Isolated-world content script: owns settings, page attributes and all DOM-level features.
// Player API work (quality, Premium, 2K badge state, subscriptions) lives in page.js.
(() => {
  'use strict';

  const root = document.documentElement;
  const { parseCount, parseAge, VIEW_WORDS, LIVE_WORDS } = window.TTNumbers;
  let S = window.TTSettings.normalize(null);
  let ready = false;

  const isWatch = () => location.pathname === '/watch';
  const isHome = () => location.pathname === '/';
  const videoId = () => new URLSearchParams(location.search).get('v');

  // Page attributes the CSS hides things by. The last applied set is remembered so it is on the
  // page at document_start, before chrome.storage answers (no flash of hidden items).
  const hideAttrs = s => ({
    'tt-hide-ambient': s.hideAmbient, 'tt-hide-sleep-timer': s.hideSleepTimer, 'tt-hide-paid-promo': s.hidePaidPromo,
    'tt-hide-copies': s.hideCopies, 'tt-hide-shorts': s.hideShorts, 'tt-hide-low-views': s.hideLowViews,
  });
  try {
    const cached = JSON.parse(localStorage.getItem('tt-hide') || 'null') || hideAttrs(S);
    for (const [attr, on] of Object.entries(cached)) if (attr in hideAttrs(S)) root.toggleAttribute(attr, !!on);
  } catch {}

  // ---------- Channels open on Videos ----------
  // Links inside YouTube are rewritten in page.js as they're followed. A full page load of a
  // channel's root (typed, bookmarked, from another site) is sent to its Videos tab right away.
  // The channel's own Home tab is /featured, so it stays reachable.
  const CHANNEL_ROOT = /^\/(@[^/]+|channel\/UC[\w-]+|c\/[^/]+|user\/[^/]+)\/?$/;
  let channelFlag = true;
  try { channelFlag = localStorage.getItem('tt-channel-videos') !== '0'; } catch {}
  if (channelFlag && CHANNEL_ROOT.test(location.pathname)) {
    location.replace(location.pathname.replace(/\/$/, '') + '/videos' + location.search + location.hash);
  }

  // ---------- Cinema mode ----------
  // YouTube now keeps theater view only for the browser session (its "wide" cookie is a session
  // cookie and the server ignores it on load: START_IN_THEATER_MODE is always false),
  // so the size button is clicked the moment the watch layout exists (straight from the
  // MutationObserver, not the throttled tick). Until theater is on, the not-yet-theater layout is
  // kept invisible (tt-cinema-pending) so the switch doesn't show as a jump. A remembered flag
  // lets this start at document_start, before chrome.storage answers.
  const setWideCookie = () => { document.cookie = 'wide=1; domain=.youtube.com; path=/; max-age=31536000; secure; samesite=lax'; };
  let cinemaFlag = false;
  try { cinemaFlag = localStorage.getItem('tt-cinema') === '1'; } catch {}
  if (cinemaFlag) setWideCookie();

  let pendingTimer = null;
  function setCinemaPending(on) {
    clearTimeout(pendingTimer);
    root.toggleAttribute('tt-cinema-pending', on);
    if (on) pendingTimer = setTimeout(() => root.removeAttribute('tt-cinema-pending'), 2500); // never hide for long
  }
  if (cinemaFlag && isWatch()) setCinemaPending(true);

  // Once a video has reached theater view, the user is free to leave it (button or "t").
  let cinemaVid = null, cinemaDone = null, cinemaTries = 0, cinemaLastClick = 0;
  function enforceCinema() {
    if (!(ready ? S.cinemaMode : cinemaFlag) || !isWatch()) return;
    const vid = videoId();
    if (cinemaVid !== vid) { cinemaVid = vid; cinemaTries = 0; }
    if (cinemaDone === vid) return;
    const flexy = document.querySelector('ytd-watch-flexy');
    if (!flexy || flexy.hasAttribute('hidden')) return;
    if (flexy.hasAttribute('theater') || flexy.hasAttribute('fullscreen') || document.fullscreenElement) {
      cinemaDone = vid;
      setCinemaPending(false);
      return;
    }
    if (cinemaTries >= 8 || Date.now() - cinemaLastClick < 300) return;
    const btn = document.querySelector('#movie_player .ytp-size-button');
    if (!btn) return;
    cinemaTries++; cinemaLastClick = Date.now();
    btn.click();
    setTimeout(enforceCinema, 320); // retry if the click didn't take (player still wiring up)
  }
  // YouTube announces its own starting state on load (enabled:false, since it no longer keeps
  // theater across sessions). A click made just before that is lost, so go again right after.
  document.addEventListener('yt-set-theater-mode-enabled', e => {
    if (e.detail && e.detail.enabled === false && cinemaDone !== videoId()) { cinemaLastClick = 0; setTimeout(enforceCinema, 0); }
  });

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
    const nameEl = item.querySelector('ytd-channel-name #text, ytd-channel-name a, .yt-content-metadata-view-model-wiz__metadata-row a, .yt-content-metadata-view-model__metadata-row a, .ytContentMetadataViewModelMetadataRow a');
    const name = nameEl ? nameEl.textContent.trim() : null;

    let views = null, live = false;
    const texts = item.querySelectorAll('#metadata-line span, .inline-metadata-item, .yt-content-metadata-view-model-wiz__metadata-text, .yt-content-metadata-view-model__metadata-text, .ytContentMetadataViewModelMetadataText, span.yt-core-attributed-string');
    for (const el of texts) {
      // Newer tiles show a play icon and a bare number ("▷ 569"); the words are in aria-label.
      for (const part of (el.getAttribute('aria-label') || el.textContent).split('•')) {
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

  // The page script closes YouTube's dropdown through its own API (a synthetic Escape made the page jump).
  function closeDropdown() { document.dispatchEvent(new CustomEvent('tt-close-sort-menu')); }

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
    return el;
  }

  // Picking one of YouTube's options turns ours off. Listening on the document (capture) sees every
  // click even if YouTube re-renders its items.
  const nativeOption = target => {
    const item = target instanceof Element && target.closest('ytd-comments #sort-menu tp-yt-paper-listbox > *');
    return item && !item.classList.contains('tt-sort-item') ? item : null;
  };
  // Our listeners on the document are registered at document_start, before YouTube's, so a click on
  // our item can be kept away from YouTube's own link and menu handlers entirely.
  function onActivate(e) {
    if (!(e.target instanceof Element)) return;
    const mine = e.target.closest('ytd-comments #sort-menu .tt-sort-item');
    if (mine) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      activatePopular(mine.parentElement);
      closeDropdown();
      return;
    }
    const n = nativeOption(e.target);
    if (n && popularActive) setPopular(false, n);
  }
  document.addEventListener('click', onActivate, true);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') onActivate(e); }, true);
  // When the menu opens, YouTube focuses its own selected option ("Top"), which greys it out.
  // While ours is the active sort, move that focus to ours.
  document.addEventListener('focusin', e => {
    if (!popularActive || !nativeOption(e.target)) return;
    const listbox = e.target.closest('tp-yt-paper-listbox');
    // Arrow-key navigation moves focus between items; opening the menu comes from the listbox itself.
    const from = e.relatedTarget instanceof Element && e.relatedTarget.closest('tp-yt-paper-listbox > *');
    if (from && from !== nativeOption(e.target) && listbox.contains(from)) return;
    const mine = listbox.querySelector(':scope > .tt-sort-item');
    const target = mine && (mine.querySelector('tp-yt-paper-item') || mine);
    if (target) { target.focus({ preventScroll: true }); setTimeout(() => { if (popularActive && listbox.contains(document.activeElement) && !mine.contains(document.activeElement)) target.focus({ preventScroll: true }); }, 0); }
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
        if (trigger) { trigger.click(); setTimeout(closeDropdown, 50); }
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

  // ---------- Copied comments (spam bots reposting popular comments) ----------
  // Top-level comments with the same text, ignoring case, punctuation, emoji and spacing, are one
  // group. The oldest is the original, and every newer copy is hidden, however many likes it has
  // (bots often get them boosted). YouTube's times are coarse ("2 weeks ago"); when copies show
  // the same time, YouTube's exact Newest order decides (below), and if it can't, both stay. Short
  // texts are skipped: real people repeat short phrases. The same comment rendered twice (YouTube
  // sometimes re-inserts a block) is hidden as well.
  const MIN_COPY_LENGTH = 25;
  // Exact order from YouTube's "Newest" list (read by page.js) settles copies that show the same
  // time: newestIds is a newest-first prefix, so a comment missing from it is older than all in it.
  let newest = { vid: null, index: new Map() }, orderAsked = new Set();
  document.addEventListener('tt-comment-order-result', e => {
    try {
      const { vid, ids } = JSON.parse(e.detail);
      if (vid !== videoId()) return;
      newest = { vid, index: new Map(ids.map((id, i) => [id, i])) };
      schedule();
    } catch {}
  });
  function askOrder(ids) {
    const vid = videoId();
    if (newest.vid !== vid) { newest = { vid, index: new Map() }; orderAsked = new Set(); }
    const fresh = ids.filter(id => !orderAsked.has(id));
    if (!fresh.length) return;
    fresh.forEach(id => orderAsked.add(id));
    document.dispatchEvent(new CustomEvent('tt-comment-order', { detail: JSON.stringify({ vid, ids: [...orderAsked] }) }));
  }
  // The first posted among comments that show the same time, or null if the order isn't known.
  function firstPosted(items) {
    if (newest.vid !== videoId() || !newest.index.size) return null;
    const unseen = items.filter(i => !newest.index.has(i.id));
    if (unseen.length === 1) return unseen[0];
    if (unseen.length > 1) return null;
    return items.reduce((a, b) => (newest.index.get(b.id) > newest.index.get(a.id) ? b : a));
  }
  const commentId = el => (el.querySelector('#comment #published-time-text a, #published-time-text a')?.getAttribute('href') || '').match(/[?&]lc=([^&]+)/)?.[1] || null;
  const normalizeComment = text => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  // Normalizing every loaded comment on each pass adds up on big comment sections; redo it only
  // when a comment's text changes.
  const normalized = new WeakMap();
  function commentKey(textEl) {
    const raw = textEl.textContent;
    const hit = normalized.get(textEl);
    if (hit && hit.raw === raw) return hit.key;
    const key = normalizeComment(raw);
    normalized.set(textEl, { raw, key });
    return key;
  }

  function markCopies() {
    const threads = isWatch() && S.hideCopies ? [...document.querySelectorAll('ytd-comments ytd-item-section-renderer #contents > ytd-comment-thread-renderer')] : [];
    const groups = new Map();
    const copies = new Set();
    const seenIds = new Set();
    for (const el of threads) {
      const id = commentId(el);
      if (id) { if (seenIds.has(id)) { copies.add(el); continue; } seenIds.add(id); }
      const textEl = el.querySelector('#comment #content-text, #content-text');
      const key = textEl ? commentKey(textEl) : '';
      if (key.length < MIN_COPY_LENGTH) continue;
      const pinned = !!el.querySelector('#pinned-comment-badge ytd-pinned-comment-badge-renderer');
      const age = parseAge(el.querySelector('#comment #published-time-text, #published-time-text')?.textContent);
      const item = { el, id, pinned, age: age ?? -1 };
      if (groups.has(key)) groups.get(key).push(item); else groups.set(key, [item]);
    }
    for (const items of groups.values()) {
      if (items.length < 2) continue;
      // Stable sort keeps DOM order as the last tie-break.
      items.sort((a, b) => (b.pinned - a.pinned) || (b.age - a.age));
      const top = items[0];
      // Copies posted later than the oldest shown time are hidden right away.
      for (const i of items) if (i !== top && i.age >= 0 && top.age > i.age && !i.pinned) copies.add(i.el);
      const tied = items.filter(i => i.age === top.age && i.pinned === top.pinned);
      if (tied.length < 2 || top.pinned) continue;
      const first = tied.every(i => i.id) ? firstPosted(tied) : null;
      if (first) tied.forEach(i => { if (i !== first) copies.add(i.el); });
      else if (tied.every(i => i.id)) askOrder(tied.map(i => i.id));
    }
    for (const el of document.querySelectorAll('ytd-comment-thread-renderer[tt-copy]')) if (!copies.has(el)) el.removeAttribute('tt-copy');
    for (const el of copies) if (!el.hasAttribute('tt-copy')) el.setAttribute('tt-copy', '');
  }

  // ---------- Mini player while reading comments ----------
  let miniOn = false, miniDismissed = false;

  // A player-style icon button inside the player, shown and hidden with YouTube's own controls.
  // Drawn like YouTube's player icons: a white path over a faint dark outline (ytp-svg-shadow).
  const CLOSE_ICON = '<svg height="100%" viewBox="0 0 24 24" width="100%" aria-hidden="true">' +
    '<path class="tt-svg-shadow" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>' +
    '<path class="tt-svg-fill" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  function closeButton(player) {
    let b = document.getElementById('tt-mini-close');
    if (!b) {
      b = document.createElement('button');
      b.id = 'tt-mini-close';
      b.type = 'button';
      b.className = 'ytp-button';
      b.title = 'Close mini player';
      b.setAttribute('aria-label', 'Close mini player');
      b.innerHTML = CLOSE_ICON;
      // Keep the player from treating these as clicks on the video (play/pause, fullscreen).
      for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick']) b.addEventListener(type, e => e.stopPropagation());
      b.addEventListener('click', e => { e.stopPropagation(); miniDismissed = true; updateMini(); });
    }
    if (b.parentElement !== player) player.appendChild(b);
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
    if (out && !miniDismissed) closeButton(p);
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
    markCopies();
    updateMini();
    rewriteMenuBadges();
    markSleepTimer();
  }
  function schedule() { if (!timer) timer = setTimeout(tick, 200); }

  new MutationObserver(() => {
    if (cinemaDone !== cinemaVid || cinemaVid !== videoId()) enforceCinema(); // cheap until theater is reached
    schedule();
  }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['theater'] });

  document.addEventListener('yt-navigate-start', () => {
    // Coming from a non-watch page the watch layout is hidden anyway; from a video the user left
    // theater on purpose, keep showing it while the next one loads.
    if (S.cinemaMode) { setWideCookie(); if (!isWatch()) setCinemaPending(true); }
    setMini(false);
    setPopular(false);
  });
  document.addEventListener('yt-navigate-finish', () => {
    if (!isWatch()) setCinemaPending(false);
    enforceCinema();
    schedule();
  });
  document.addEventListener('fullscreenchange', schedule);

  // ---------- Settings ----------
  function apply(settings) {
    const sortChanged = settings.defaultSort !== S.defaultSort || settings.popularSort !== S.popularSort;
    S = settings;
    ready = true;
    try { localStorage.setItem('tt-cinema', S.cinemaMode ? '1' : '0'); } catch {}
    try { localStorage.setItem('tt-channel-videos', S.channelVideos ? '1' : '0'); } catch {}
    if (S.cinemaMode) setWideCookie(); else setCinemaPending(false);
    const hide = hideAttrs(S);
    for (const [attr, on] of Object.entries(hide)) root.toggleAttribute(attr, on);
    try { localStorage.setItem('tt-hide', JSON.stringify(hide)); } catch {}
    root.setAttribute('tt-settings', JSON.stringify(S));
    document.dispatchEvent(new CustomEvent('tt-settings'));
    if (!S.popularSort) setPopular(false);
    if (sortChanged) commentsVid = null; // re-apply the default sort on the open video
    schedule();
  }

  window.TTSettings.load().then(apply);
  window.TTSettings.onChange(apply);
})();
