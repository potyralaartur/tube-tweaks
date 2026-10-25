// Runs in YouTube's own JavaScript world so it can use the player API (#movie_player)
// and the logged-in Innertube API. Settings arrive from content.js through the DOM.
(() => {
  'use strict';

  const ORDER = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  const root = document.documentElement;
  let settings = null;
  let appliedKey = null;
  let forcedVid = null; // the video whose quality range this extension last fixed
  let retryTimer = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const player = () => document.getElementById('movie_player');

  // ---------- Cinema mode: start the page in theater view ----------
  // YouTube picks the starting layout from ytcfg START_IN_THEATER_MODE, which its server now sends
  // as false for some accounts even with the theater cookie set. Trapping window.ytcfg before
  // YouTube's inline scripts run makes the page render in theater view from the first frame, with
  // no switch at all. content.js still clicks the size button if this ever stops working.
  let cinemaStart = false;
  try { cinemaStart = localStorage.getItem('tt-cinema') === '1'; } catch {}
  if (cinemaStart && !('ytcfg' in window)) {
    const KEY = 'START_IN_THEATER_MODE';
    // Follows the setting once content.js has published it, so turning cinema mode off applies to
    // the next video without a reload.
    const on = () => {
      try { const s = JSON.parse(root.getAttribute('tt-settings') || 'null'); return s ? !!s.cinemaMode : true; } catch { return true; }
    };
    const wrapped = new WeakSet();
    const wrapCfg = cfg => {
      if (!cfg || typeof cfg !== 'object' || wrapped.has(cfg)) return;
      wrapped.add(cfg);
      let set = cfg.set, get = cfg.get;
      const setW = function (k, v) {
        if (typeof k === 'string') return set.call(this, k, k === KEY && on() ? true : v);
        if (k && typeof k === 'object' && KEY in k && on()) k[KEY] = true;
        return set.apply(this, arguments);
      };
      const getW = function (k) { const r = get.apply(this, arguments); return k === KEY && on() ? true : r; };
      Object.defineProperty(cfg, 'set', { configurable: true, enumerable: true, get: () => set && setW, set: fn => { set = fn; } });
      Object.defineProperty(cfg, 'get', { configurable: true, enumerable: true, get: () => get && getW, set: fn => { get = fn; } });
    };
    let ytcfg;
    Object.defineProperty(window, 'ytcfg', {
      configurable: true, enumerable: true,
      get: () => ytcfg,
      set: v => { ytcfg = v; wrapCfg(v); },
    });
  }

  function readSettings() {
    try { settings = JSON.parse(root.getAttribute('tt-settings') || 'null'); } catch { settings = null; }
  }

  // ---------- Preferred quality + 1080p Premium ----------

  // Highest available quality that is not above the preferred one.
  function pickQuality(levels, preferred) {
    const pref = ORDER.indexOf(preferred);
    const avail = levels.filter(l => ORDER.includes(l)).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    return avail.find(l => ORDER.indexOf(l) >= pref) || avail[avail.length - 1] || null;
  }

  function premiumEntry(p) {
    const data = (typeof p.getAvailableQualityData === 'function' && p.getAvailableQualityData()) || [];
    return data.find(d => d && d.quality === 'hd1080' && /premium/i.test(d.qualityLabel || '') &&
      d.isPlayable !== false) || null;
  }

  function currentLabel(p) {
    try {
      if (typeof p.getPlaybackQualityLabel === 'function') return p.getPlaybackQualityLabel() || '';
      const d = p.getAvailableQualityData?.().find(x => x.quality === p.getPlaybackQuality());
      return (d && d.qualityLabel) || '';
    } catch { return ''; }
  }

  // Returns true when there is nothing left to do for this video.
  function applyQuality() {
    const p = player();
    if (!settings || !p || typeof p.getAvailableQualityLevels !== 'function') return false;
    const vid = p.getVideoData?.()?.video_id;
    if (settings.quality === 'auto') {
      // Release a quality this extension fixed on the open video, so YouTube can adapt again.
      if (forcedVid && forcedVid === vid) {
        try { p.setPlaybackQualityRange('auto', 'auto'); } catch { try { p.setPlaybackQuality('auto'); } catch {} }
      }
      forcedVid = null;
      return true;
    }
    if (p.classList.contains('ad-showing')) return false;
    if (!vid) return false;
    const levels = p.getAvailableQualityLevels() || [];
    if (!levels.length) return false;
    const target = pickQuality(levels, settings.quality);
    if (!target) return false;

    const key = vid + '|' + settings.quality;
    if (appliedKey === key) return true;
    appliedKey = key;

    const prem = target === 'hd1080' ? premiumEntry(p) : null;
    forcedVid = vid;
    try {
      if (prem && prem.formatId) p.setPlaybackQualityRange(target, target, prem.formatId);
      else if (typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange(target, target);
      else p.setPlaybackQuality(target);
    } catch (e) { /* the player rejects calls mid-load; the next attempt retries */ appliedKey = null; return false; }

    // 1080p Premium is always on. If the API did not switch to it, pick it in the menu.
    if (prem) setTimeout(() => {
      if (appliedKey !== key || p.getVideoData?.()?.video_id !== vid) return; // moved on meanwhile
      if (!/premium/i.test(currentLabel(p))) selectInQualityMenu(label => /1080p/.test(label) && /premium/i.test(label));
    }, 1500);
    return true;
  }

  async function selectInQualityMenu(match) {
    const p = player();
    const btn = p && p.querySelector('.ytp-settings-button');
    if (!btn) return;
    root.setAttribute('tt-menu-busy', '');
    try {
      btn.click();
      await sleep(200);
      const items = [...p.querySelectorAll('.ytp-settings-menu .ytp-panel-menu .ytp-menuitem')];
      const qualityItem = items.find(i => /\d{3,4}p/.test(i.querySelector('.ytp-menuitem-content')?.textContent || ''));
      if (!qualityItem) { btn.click(); return; }
      qualityItem.click();
      await sleep(250);
      const options = [...p.querySelectorAll('.ytp-settings-menu .ytp-quality-menu .ytp-menuitem, .ytp-settings-menu .ytp-panel-menu .ytp-menuitem')];
      const opt = options.find(o => match(o.textContent || ''));
      if (opt) opt.click();
      await sleep(100);
      const menu = p.querySelector('.ytp-settings-menu');
      if (menu && menu.style.display !== 'none') btn.click();
    } finally {
      setTimeout(() => root.removeAttribute('tt-menu-busy'), 150);
    }
  }

  function scheduleQuality() {
    clearTimeout(retryTimer);
    let tries = 0;
    const attempt = () => {
      if (applyQuality() || ++tries > 40) return;
      retryTimer = setTimeout(attempt, 250);
    };
    attempt();
  }

  // ---------- 2K badge state ----------

  // YouTube's onPlaybackQualityChange fires ~40ms after a switch (with the quality id); the poll
  // below is only a fallback for players created before the hook.
  let badgePlayer = null;
  function hookBadge(p) {
    if (p === badgePlayer || typeof p.addEventListener !== 'function') return;
    badgePlayer = p;
    p.addEventListener('onPlaybackQualityChange', q => { if (typeof q === 'string') p.toggleAttribute('tt-2k', q === 'hd1440'); });
  }

  function updateBadge() {
    const p = player();
    if (!p || typeof p.getPlaybackQuality !== 'function') return;
    hookBadge(p);
    let q = '';
    try { q = p.getPlaybackQuality(); } catch {}
    p.toggleAttribute('tt-2k', q === 'hd1440');
  }

  // ---------- Subscriptions (for hiding low-view videos) ----------

  const SUBS_CACHE = 'tt-subs-v1';
  const SUBS_TTL = 6 * 60 * 60 * 1000;
  let subsPromise = null;

  async function sapisidHash() {
    const m = document.cookie.match(/(?:^|;\s*)(?:SAPISID|__Secure-3PAPISID)=([^;]+)/);
    if (!m || !crypto.subtle) return null;
    const ts = Math.floor(Date.now() / 1000);
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${m[1]} ${location.origin}`));
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `SAPISIDHASH ${ts}_${hex}`;
  }

  function collectChannels(node, out, inSubs) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) collectChannels(n, out, inSubs); return; }
    const ch = node.channelRenderer || node.gridChannelRenderer;
    if (ch && ch.channelId) {
      out.ids.add(ch.channelId);
      const url = ch.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl;
      if (url) out.urls.add(url.toLowerCase());
      const name = ch.title?.simpleText || ch.title?.runs?.[0]?.text;
      if (name) out.names.add(name.trim().toLowerCase());
    }
    if (inSubs && node.browseEndpoint && /^UC/.test(node.browseEndpoint.browseId || '')) {
      out.ids.add(node.browseEndpoint.browseId);
      if (node.browseEndpoint.canonicalBaseUrl) out.urls.add(node.browseEndpoint.canonicalBaseUrl.toLowerCase());
    }
    if (inSubs && node.formattedTitle?.simpleText) out.names.add(node.formattedTitle.simpleText.trim().toLowerCase());
    for (const k in node) collectChannels(node[k], out, inSubs || k === 'guideSubscriptionsSectionRenderer');
  }

  function findContinuation(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.continuationCommand?.token) return node.continuationCommand.token;
    if (node.nextContinuationData?.continuation) return node.nextContinuationData.continuation;
    for (const k in node) { const t = findContinuation(node[k]); if (t) return t; }
    return null;
  }

  // Calls YouTube's own API the way the page does (signed in when the user is).
  async function innertube(endpoint, body) {
    const cfg = window.ytcfg;
    const context = cfg.get('INNERTUBE_CONTEXT');
    const key = cfg.get('INNERTUBE_API_KEY');
    const headers = {
      'Content-Type': 'application/json',
      'X-Origin': location.origin,
      'X-Goog-AuthUser': String(cfg.get('SESSION_INDEX') ?? 0),
      'X-Youtube-Client-Name': String(cfg.get('INNERTUBE_CONTEXT_CLIENT_NAME') ?? 1),
      'X-Youtube-Client-Version': String(cfg.get('INNERTUBE_CLIENT_VERSION') ?? ''),
    };
    const pageId = cfg.get('DELEGATED_SESSION_ID');
    if (pageId) headers['X-Goog-PageId'] = pageId;
    const auth = await sapisidHash();
    const res = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false${key ? '&key=' + key : ''}`, {
      method: 'POST', credentials: 'include', headers: auth ? { ...headers, Authorization: auth } : headers,
      body: JSON.stringify({ context, ...body }),
    });
    if (!res.ok) throw new Error('innertube ' + res.status);
    return res.json();
  }

  async function fetchSubscriptions() {
    for (let i = 0; i < 40 && !(window.ytcfg && window.ytcfg.get && window.ytcfg.get('INNERTUBE_CONTEXT')); i++) await sleep(250);
    const cfg = window.ytcfg;
    if (!cfg || !cfg.get || !cfg.get('INNERTUBE_CONTEXT')) return null; // not ready: asked again later
    if (!cfg.get('LOGGED_IN')) return { t: Date.now(), loggedIn: false, ids: [], urls: [], names: [] };

    // The cache belongs to the signed-in account (and brand channel) it was read for.
    const account = `${cfg.get('SESSION_INDEX') ?? 0}|${cfg.get('DELEGATED_SESSION_ID') || ''}`;
    try {
      const cached = JSON.parse(localStorage.getItem(SUBS_CACHE) || 'null');
      if (cached && cached.account === account && Date.now() - cached.t < SUBS_TTL) return cached;
    } catch {}

    const out = { ids: new Set(), urls: new Set(), names: new Set() };
    let answered = 0;
    try { collectChannels(await innertube('guide', {}), out, false); answered++; } catch {}
    try {
      let json = await innertube('browse', { browseId: 'FEchannels' });
      answered++;
      for (let page = 0; page < 50 && json; page++) {
        collectChannels(json, out, false);
        const token = findContinuation(json);
        json = token ? await innertube('browse', { continuation: token }) : null;
      }
    } catch {}
    if (!answered) return null; // both failed: don't treat it as "no subscriptions"; asked again later

    const result = { t: Date.now(), account, loggedIn: true, ids: [...out.ids], urls: [...out.urls], names: [...out.names] };
    if (result.ids.length) { try { localStorage.setItem(SUBS_CACHE, JSON.stringify(result)); } catch {} }
    return result;
  }

  // Close the comment sort dropdown the way YouTube does (iron-dropdown.close()).
  document.addEventListener('tt-close-sort-menu', () => {
    const menu = document.querySelector('ytd-comments #sort-menu');
    const dropdown = menu && menu.querySelector('tp-yt-iron-dropdown');
    if (dropdown && typeof dropdown.close === 'function') dropdown.close();
    else if (menu) menu.querySelector('tp-yt-paper-button, #trigger, #label')?.click();
  });

  document.addEventListener('tt-request-subs', () => {
    if (!subsPromise) subsPromise = fetchSubscriptions().finally(() => setTimeout(() => { subsPromise = null; }, 60000));
    subsPromise.then(subs => {
      document.dispatchEvent(new CustomEvent('tt-subs', { detail: JSON.stringify(subs) }));
    });
  });

  // ---------- Exact comment order (to settle copies that show the same time) ----------
  // YouTube's "Newest" list is in exact posting order. It is read page by page from the start
  // (newest first), only when content.js asks about specific comments, and at most MAX_ORDER_PAGES
  // pages per video. A comment not in the part read is older than every comment that is.
  const MAX_ORDER_PAGES = 15;
  let order = null; // { vid, ids: [], wanted: Set, token, pages, done, busy }

  function newestToken() {
    const header = document.querySelector('ytd-comments ytd-comments-header-renderer');
    const data = header && (header.data || header.polymerController?.data || header.__data?.data);
    const items = data?.sortMenu?.sortFilterSubMenuRenderer?.subMenuItems;
    // YouTube's own order is [Top, Newest]; titles are localized.
    return items?.[1]?.serviceEndpoint?.continuationCommand?.token || null;
  }

  function readOrderPage(json) {
    const ids = [];
    let next = null;
    for (const ep of json?.onResponseReceivedEndpoints || []) {
      const items = (ep.reloadContinuationItemsCommand || ep.appendContinuationItemsAction)?.continuationItems || [];
      for (const it of items) {
        const id = it.commentThreadRenderer?.commentViewModel?.commentViewModel?.commentId;
        if (id) ids.push(id);
        const t = it.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
        if (t) next = t;
      }
    }
    return { ids, next };
  }

  async function extendOrder(vid, wanted, refresh) {
    if (!order || order.vid !== vid || (refresh && !order.busy)) order = { vid, ids: [], wanted: new Set(), token: null, pages: 0, done: false, busy: false, readAt: Date.now() };
    const o = order;
    wanted.forEach(id => o.wanted.add(id));
    if (o.busy) { if (refresh) o.restart = true; return; } // the running read picks up the new ids
    o.busy = true;
    try {
      if (!o.token && !o.pages) o.token = newestToken();
      const missing = () => [...o.wanted].some(id => !o.ids.includes(id));
      while (o.token && !o.done && o.pages < MAX_ORDER_PAGES && missing() && order === o) {
        const { ids, next } = readOrderPage(await innertube('next', { continuation: o.token }));
        o.ids.push(...ids);
        o.pages++;
        o.token = next;
        if (!next) o.done = true;
      }
    } catch {} finally { o.busy = false; }
    if (order !== o) return;
    // A fresh read was asked for while this one ran: start again from the newest comments.
    if (o.restart) { order = null; extendOrder(vid, [...o.wanted], false); return; }
    // Nothing read (no token yet, or the request failed): start over next time and say so.
    const failed = !o.pages;
    if (failed) order = null;
    document.dispatchEvent(new CustomEvent('tt-comment-order-result', { detail: JSON.stringify({ vid, ids: o.ids, readAt: o.readAt, failed }) }));
  }
  document.addEventListener('tt-comment-order', e => {
    try { const { vid, ids, refresh } = JSON.parse(e.detail); extendOrder(vid, ids, !!refresh); } catch {}
  });

  // ---------- Channels open on Videos ----------
  // Every in-app navigation goes through a 'yt-navigate' event whose endpoint says where to go.
  // A plain channel link has a browseEndpoint with no params (= the channel's Home tab); giving it
  // the Videos tab's params and URL makes YouTube open Videos instead, with the right URL and
  // history. Tab clicks carry their own params, so Home is still one click away.
  const VIDEOS_PARAMS = 'EgZ2aWRlb3PyBgQKAjoA';
  const channelVideos = () => {
    if (settings) return settings.channelVideos !== false;
    try { return localStorage.getItem('tt-channel-videos') !== '0'; } catch { return true; }
  };
  // The endpoint belongs to the link that was clicked, so it is edited in place; edits are
  // remembered so that link opens Home again once the setting is turned off.
  const rewritten = new WeakMap();
  window.addEventListener('yt-navigate', e => {
    const ep = e.detail && e.detail.endpoint;
    const be = ep && ep.browseEndpoint;
    if (!be) return;
    if (rewritten.has(ep)) {
      if (channelVideos()) return;
      delete be.params;
      ep.commandMetadata.webCommandMetadata.url = rewritten.get(ep);
      rewritten.delete(ep);
      return;
    }
    if (be.params || !/^UC/.test(be.browseId || '') || !channelVideos()) return;
    const meta = ep.commandMetadata && ep.commandMetadata.webCommandMetadata;
    if (!meta || typeof meta.url !== 'string') return;
    const [path, rest = ''] = meta.url.split(/(?=[?#])/);
    if (!/^\/(@[^/]+|channel\/UC[\w-]+|c\/[^/]+|user\/[^/]+)\/?$/.test(path)) return;
    rewritten.set(ep, meta.url);
    be.params = VIDEOS_PARAMS;
    meta.url = path.replace(/\/$/, '') + '/videos' + rest;
  }, true);

  // ---------- Wiring ----------

  document.addEventListener('tt-settings', () => {
    const before = settings && settings.quality;
    readSettings();
    // Only a new preferred quality is re-applied; other settings leave a quality picked by hand alone.
    if (!settings || settings.quality !== before) { appliedKey = null; scheduleQuality(); }
  });

  const onNewVideo = () => { appliedKey = null; scheduleQuality(); updateBadge(); };
  document.addEventListener('yt-navigate-finish', onNewVideo);
  document.addEventListener('yt-player-updated', onNewVideo);
  // Catches autoplay, playlists and ad → video transitions that keep the same page.
  document.addEventListener('loadeddata', e => {
    if (e.target instanceof HTMLVideoElement && e.target.closest('#movie_player')) scheduleQuality();
  }, true);

  setInterval(() => { if (location.pathname === '/watch') updateBadge(); }, 1000);
  readSettings();
  scheduleQuality();
})();
