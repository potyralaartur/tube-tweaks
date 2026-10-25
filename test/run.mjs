// Loads the unpacked extension in Chromium and runs it against fake YouTube pages.
// Usage: node test/run.mjs   (needs Playwright; set CHROME to a Chromium binary if needed)
import { chromium } from 'playwright';
import { home, watch, guide, channels, newestPages } from './fixtures.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-'));
const ctx = await chromium.launchPersistentContext(profile, {
  headless: true,
  executablePath: process.env.CHROME || undefined,
  args: ['--headless=new', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const nextCalls = [];
await ctx.route('https://www.youtube.com/**', route => {
  const url = new URL(route.request().url());
  const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname === '/youtubei/v1/guide') return json(guide);
  if (url.pathname === '/youtubei/v1/browse') return json(JSON.parse(route.request().postData()).browseId === 'FEchannels' ? channels : {});
  if (url.pathname === '/youtubei/v1/next') {
    const token = JSON.parse(route.request().postData()).continuation;
    nextCalls.push(token);
    return json(newestPages[token] || {});
  }
  if (url.pathname === '/watch') return route.fulfill({ contentType: 'text/html', body: watch });
  return route.fulfill({ contentType: 'text/html', body: home });
});

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failures++; };

// Number parsing across YouTube languages
await import('../src/numbers.js');
const { parseCount, parseAge, VIEW_WORDS, LIVE_WORDS } = globalThis.TTNumbers;
const counts = ['1.2K views', '1,2 tys. wyświetleń', '12 345 Aufrufe', '1.2万 回視聴', '1.2万次观看', '조회수 1.2만회', '1,2 N lượt xem'].map(parseCount);
check('Localized view counts parsed', JSON.stringify(counts) === '[1200,1200,12345,12000,12000,12000,1200]', JSON.stringify(counts));
check('Russian views are not mistaken for a live stream', VIEW_WORDS.test('120 просмотров') && !LIVE_WORDS.test('120 просмотров') && LIVE_WORDS.test('53 смотрят'));
check('"review" is not a view count word', !VIEW_WORDS.test('iPhone 17 Pro review'));
check('Russian "год" is a year', parseAge('1 год назад') === 31536000 && parseAge('2 години тому') === 7200);
const more = ['5.2 lakh views', '1,2 εκ. προβολές', '1,2 mil. zhlédnutí', '1,2 mil visualizações', '1,2 B görüntüleme', '1.2B views', 'Нет просмотров', '5.2 unknownunit'].map(parseCount);
check('More localized counts (lakh, εκ., mil./mil, Turkish B, Нет), unknown units give no answer', JSON.stringify(more) === '[520000,1200000,1200000,1200,1200,1200000000,0,null]', JSON.stringify(more));
const ages = ['3日前', '3天前', '3일 전', 'před 2 dny', '2 napja', '2 ngày trước', '2 minggu lalu', '30 saat lalu', '3 saat önce'].map(parseAge);
check('Comment times in more languages', JSON.stringify(ages) === '[259200,259200,259200,172800,172800,172800,1209600,30,10800]', JSON.stringify(ages));
const errors = [];

// Home feed
const h = await ctx.newPage();
h.on('pageerror', e => errors.push(e.message));
await h.goto('https://www.youtube.com/');
await h.waitForTimeout(1500);
const shown = await h.evaluate(() => [...document.querySelectorAll('ytd-rich-item-renderer, ytd-rich-section-renderer')]
  .filter(e => getComputedStyle(e).display !== 'none').map(e => e.id));
check('Shorts shelf and tiles hidden', !shown.includes('shorts-shelf') && !shown.includes('short-tile'), JSON.stringify(shown));
check('Low-view video from unsubscribed channel hidden', !shown.includes('random-low'));
check('A number in the title is not taken for the view count', shown.includes('review-title'));
check('Spelled-out counts ("284 thousand views") are not taken for 284', shown.includes('spelled-out') && shown.includes('spelled-out-m'));
// Like YouTube: in-app navigation starts with yt-navigate-start. Going to a video keeps the page hidden until theater.
const pendingOnNav = await h.evaluate(() => { document.dispatchEvent(new CustomEvent('yt-navigate-start')); return document.documentElement.hasAttribute('tt-cinema-pending'); });
check('Navigating from Home keeps the next page hidden until theater view', pendingOnNav);
await h.evaluate(() => document.documentElement.removeAttribute('tt-cinema-pending'));
check('Low-view tile with an icon count hidden (count read from aria-label)', !shown.includes('icon-low') && shown.includes('icon-high') && shown.includes('icon-live'));
check('Low-view video from subscribed channel kept (handle)', shown.includes('subbed-low'));
check('Low-view video from subscribed channel kept (channel id)', shown.includes('subbed-by-id'));
check('High-view video from unsubscribed channel kept', shown.includes('random-high'));

// Watch page
const w = await ctx.newPage();
w.on('pageerror', e => errors.push(e.message));
await w.goto('https://www.youtube.com/watch?v=abc');
await w.waitForTimeout(2000);
check('Cinema mode switched on', await w.evaluate(() => document.querySelector('ytd-watch-flexy').hasAttribute('theater')));
check('Page starts in theater view itself (no switch)', await w.evaluate(() => window.sizeClicks === 0), String(await w.evaluate(() => window.sizeClicks)));
const loading = await w.evaluate(() => {
  const vis = sel => getComputedStyle(document.querySelector(sel)).visibility;
  const before = [vis('#watch-page-skeleton'), vis('body > #player')];
  document.documentElement.setAttribute('tt-cinema-pending', '');
  const box = getComputedStyle(document.body, '::before');
  const during = [vis('#watch-page-skeleton'), vis('body > #player'), box.top, Math.round(parseFloat(box.height)), box.width === `${innerWidth}px` || box.left === '0px'];
  document.documentElement.removeAttribute('tt-cinema-pending');
  return { before, during, h: Math.round(Math.min(innerWidth * 0.5625, Math.max(480, innerHeight - 169))) };
});
check('While loading, the default-size early player is hidden behind a theater-shaped box', loading.before.join() === 'visible,visible' &&
  loading.during[0] === 'hidden' && loading.during[1] === 'hidden' && loading.during[2] === '56px' && loading.during[3] === loading.h, JSON.stringify(loading));
check('Watch page is visible once theater is on', await w.evaluate(() => !document.documentElement.hasAttribute('tt-cinema-pending') && getComputedStyle(document.querySelector('ytd-watch-flexy')).visibility === 'visible'));
await w.evaluate(() => document.querySelector('.ytp-size-button').click()); // the user leaves theater view
await w.waitForTimeout(1500);
check('Leaving theater view by hand sticks', await w.evaluate(() => !document.querySelector('ytd-watch-flexy').hasAttribute('theater')));
await w.evaluate(() => document.querySelector('.ytp-size-button').click());
const calls = await w.evaluate(() => window.qualityCalls);
check('Default preferred quality is 4K', JSON.stringify(calls[0]?.slice(0, 2)) === '["hd2160","hd2160"]', JSON.stringify(calls));
const opts = await ctx.newPage();
const id = await (async () => { await opts.goto('chrome://extensions'); return opts.evaluate(async () => (await chrome.management.getAll()).find(e => e.name === 'Tube Tweaks').id); })();
await opts.goto(`chrome-extension://${id}/popup/popup.html`);
const setSettings = patch => opts.evaluate(async p => { const s = await TTSettings.load(); await TTSettings.save({ ...s, ...p }); }, patch);
await setSettings({ quality: 'hd1080' });
await w.waitForTimeout(1500);
const calls1080 = await w.evaluate(() => window.qualityCalls);
check('Preferred 1080p picks 1080p Premium', JSON.stringify(calls1080.at(-1)) === JSON.stringify(['hd1080', 'hd1080', 'premium-fmt']), JSON.stringify(calls1080));
const sortState = () => w.evaluate(() => {
  const items = [...document.querySelectorAll('#sort-menu tp-yt-paper-listbox > a')]
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  return items.map(a => ({
    text: [a.querySelector('.item'), a.querySelector('#subtitle')].map(n => n.textContent.trim()).join(' / '),
    selected: a.classList.contains('iron-selected') && a.getAttribute('aria-selected') === 'true',
  }));
});
const selectedText = s => s.filter(i => i.selected).map(i => i.text.split(' / ')[0]).join(',');
let sorts = await sortState();
check('"Most popular" is first, with a description', sorts[0]?.text === 'Most popular / Show comments with the most likes' && sorts.length === 3, JSON.stringify(sorts.map(i => i.text)));
check('Only "Most popular" is highlighted when it is the active sort', selectedText(sorts) === 'Most popular', selectedText(sorts));
check('Selected state is only on the menu item, not doubled inside it', await w.evaluate(() => !document.querySelector('#sort-menu .tt-sort-item .iron-selected')));
// Like YouTube opening the menu: listbox, then the selected item's anchor, then its paper-item.
await w.evaluate(() => { document.querySelector('#sort-menu tp-yt-paper-listbox').focus(); document.querySelector('#sort-top').focus(); document.querySelector('#sort-top tp-yt-paper-item').focus(); });
await w.waitForTimeout(100);
check('Opening the menu focuses "Most popular", not "Top"', await w.evaluate(() => !!document.activeElement?.closest('.tt-sort-item')));
check('Newer copy hidden even with more likes; original and short repeats kept', await w.evaluate(() => {
  const shown = id => getComputedStyle(document.getElementById(id)).display !== 'none';
  return !shown('copy') && shown('c1200') && shown('short1') && shown('short2');
}));
check('Same-time copies: the one posted first (per Newest order) stays', await w.evaluate(() =>
  getComputedStyle(document.getElementById('tieA')).display !== 'none' && getComputedStyle(document.getElementById('tieB')).display === 'none'));
check('Newest order is read only as far as needed', nextCalls.join() === 'NEWEST,P2', JSON.stringify(nextCalls));
check('Same-time copies missing from the Newest order both stay', await w.evaluate(() => ['real1', 'real2'].every(id => getComputedStyle(document.getElementById(id)).display !== 'none')));
// Comments loaded later are checked too (YouTube appends them before its spinner).
await w.evaluate(() => {
  const first = document.getElementById('c1200');
  const late = first.cloneNode(true);
  late.id = 'late-copy';
  late.querySelector('#published-time-text a').setAttribute('href', '/watch?v=abc&lc=late');
  late.querySelector('#published-time-text a').textContent = '2 minutes ago';
  document.getElementById('cont').before(late);
});
await w.waitForTimeout(800);
check('A copy loaded later is hidden too', await w.evaluate(() => getComputedStyle(document.getElementById('late-copy')).display === 'none'));
check('The same comment shown twice is hidden once', await w.evaluate(() => getComputedStyle(document.getElementById('again')).display === 'none' && getComputedStyle(document.getElementById('c30')).display !== 'none'));
const order = await w.evaluate(() => [...document.querySelectorAll('ytd-comments #contents > *')].filter(e => getComputedStyle(e).display !== 'none' && !/^(short|real|tie)/.test(e.id))
  .sort((a, b) => (+getComputedStyle(a).order) - (+getComputedStyle(b).order)).map(e => e.id));
check('Comments ordered by likes (default sort)', JSON.stringify(order) === JSON.stringify(['c1200', 'c30', 'c5', 'c0', 'cont']), JSON.stringify(order));
await w.click('#sort-new');
await w.waitForTimeout(400);
const after = await w.evaluate(() => [...document.querySelectorAll('ytd-comments #contents > *')].map(e => e.style.order).join(','));
check('Choosing a YouTube sort turns Most popular off', after.replace(/,/g, '') === '', after);
check('Picking Newest highlights only Newest', selectedText(await sortState()) === 'Newest', selectedText(await sortState()));
await w.evaluate(() => window.scrollTo(0, 300));
await w.click('#sort-menu .tt-sort-item');
await w.waitForTimeout(400);
check('Choosing Most popular keeps the scroll position', await w.evaluate(() => window.scrollY) > 0, String(await w.evaluate(() => window.scrollY)));
sorts = await sortState();
check('Picking Most popular again highlights only it', selectedText(sorts) === 'Most popular', selectedText(sorts));
await w.click('#sort-top');
await w.waitForTimeout(400);
check('Picking Top highlights only Top', selectedText(await sortState()) === 'Top', selectedText(await sortState()));
await w.evaluate(() => window.scrollTo(0, 1500));
await w.waitForTimeout(400);
check('Mini player shown when scrolled to comments', await w.evaluate(() => document.documentElement.hasAttribute('tt-mini') && getComputedStyle(document.getElementById('movie_player')).position === 'fixed'));
const mini = await w.evaluate(() => {
  const p = document.getElementById('movie_player').getBoundingClientRect();
  const col = document.getElementById('secondary-inner').getBoundingClientRect();
  const hit = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
  return { p: [p.left, p.width, p.height].map(Math.round), col: [col.left, col.width].map(Math.round), onTop: !!hit?.closest('#movie_player') };
});
check('Mini player matches the secondary column width, 16:9', mini.p[0] === mini.col[0] && mini.p[1] === mini.col[1] && Math.abs(mini.p[2] - mini.col[1] * 9 / 16) < 1, JSON.stringify(mini));
check('Mini player is drawn above the secondary column', mini.onTop);
await w.setViewportSize({ width: 1600, height: 900 });
await w.waitForTimeout(400);
const wide = await w.evaluate(() => [document.getElementById('movie_player').getBoundingClientRect().width, document.getElementById('secondary-inner').getBoundingClientRect().left, document.getElementById('movie_player').getBoundingClientRect().left].map(Math.round));
check('Mini player follows the column after a resize', wide[1] === wide[2], JSON.stringify(wide));
await w.setViewportSize({ width: 1280, height: 720 });
await w.waitForTimeout(300);
const close = await w.evaluate(() => {
  const b = document.getElementById('tt-mini-close');
  return { inPlayer: !!b?.closest('#movie_player'), icon: !!b?.querySelector('svg path'), text: b?.textContent.trim() };
});
check('Close button is a player icon inside the mini player', close.inPlayer && close.icon && close.text === '', JSON.stringify(close));
await w.bringToFront(); // transitions don't run in background tabs
await w.mouse.move(5, 5);
await w.waitForTimeout(200);
check('Close button is hidden while the mouse is away', await w.evaluate(() => getComputedStyle(document.getElementById('tt-mini-close')).opacity === '0'));
const pb = await w.evaluate(() => { const r = document.getElementById('movie_player').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await w.mouse.move(pb.x, pb.y);
await w.waitForTimeout(200);
check('Close button shows when hovering the player', await w.evaluate(() => getComputedStyle(document.getElementById('tt-mini-close')).opacity !== '0'));
await w.evaluate(() => { window.playerClicks = 0; document.getElementById('movie_player').addEventListener('click', () => window.playerClicks++); });
await w.click('#tt-mini-close');
await w.waitForTimeout(300);
check('Close button closes the mini player without clicking the video', await w.evaluate(() => !document.documentElement.hasAttribute('tt-mini') && window.playerClicks === 0));
await w.evaluate(() => window.scrollTo(0, 0));
await w.waitForTimeout(400);
check('Mini player removed when back at the top', await w.evaluate(() => !document.documentElement.hasAttribute('tt-mini')));

// Switch preferred quality to 1440p through storage, like the popup does
await setSettings({ quality: 'hd1440' });
await w.waitForTimeout(1500);
const calls2 = await w.evaluate(() => window.qualityCalls);
check('Changing preferred quality applies to the open video', JSON.stringify(calls2.at(-1)) === JSON.stringify(['hd1440', 'hd1440', null]) || JSON.stringify(calls2.at(-1)) === JSON.stringify(['hd1440', 'hd1440']), JSON.stringify(calls2));
check('Gear badge switches to 2K at 1440p', await w.evaluate(() => document.getElementById('movie_player').hasAttribute('tt-2k')));
const badge = await w.evaluate(() => getComputedStyle(document.querySelector('.ytp-settings-button'), '::after').backgroundImage.slice(0, 30));
check('2K badge artwork applied', badge.startsWith('url("data:image/svg+xml'), badge);
await w.evaluate(() => window.setQualityFromMenu('hd1080'));
await w.waitForTimeout(100);
check('2K badge goes away right after switching from 1440p', await w.evaluate(() => !document.getElementById('movie_player').hasAttribute('tt-2k')));
await w.evaluate(() => window.setQualityFromMenu('hd1440'));
await w.waitForTimeout(100);
check('2K badge appears right after switching to 1440p', await w.evaluate(() => document.getElementById('movie_player').hasAttribute('tt-2k')));
const sups = await w.evaluate(() => [...document.querySelectorAll('.ytp-settings-menu sup')].map(s => s.textContent));
check('Quality menu shows 2K for 1440p, HD for 1080p', JSON.stringify(sups) === '["2K","HD"]', JSON.stringify(sups));
// A quality picked by hand survives saving an unrelated setting.
await w.evaluate(() => window.setQualityFromMenu('hd720'));
const callsBeforeSave = (await w.evaluate(() => window.qualityCalls)).length;
await setSettings({ hideShorts: false });
await w.waitForTimeout(800);
check('Saving another setting leaves a hand-picked quality alone', (await w.evaluate(() => window.qualityCalls)).length === callsBeforeSave);
await setSettings({ hideShorts: true });
// Switching to Auto hands quality back to YouTube on the open video.
await setSettings({ quality: 'auto' });
await w.waitForTimeout(800);
const autoCalls = await w.evaluate(() => window.qualityCalls);
check('Switching to Auto releases the fixed quality', JSON.stringify(autoCalls.at(-1)?.slice(0, 2)) === '["auto","auto"]', JSON.stringify(autoCalls.at(-1)));
await setSettings({ quality: 'hd1440' });
await w.waitForTimeout(800);

const menuShown = () => w.evaluate(() => [...document.querySelectorAll('.ytp-settings-menu .ytp-menuitem[id]')]
  .filter(e => getComputedStyle(e).display !== 'none').map(e => e.id));
let shownItems = await menuShown();
check('Ambient mode and Sleep timer hidden from the player menu', JSON.stringify(shownItems) === '["mi-stable","mi-annotations","mi-speed"]', JSON.stringify(shownItems));
await opts.evaluate(async () => { const s = await TTSettings.load(); await TTSettings.save({ ...s, hideAmbient: false, hideSleepTimer: false }); });
await w.waitForTimeout(600);
shownItems = await menuShown();
check('Turning the options off brings them back', shownItems.length === 7, JSON.stringify(shownItems));
const paidShown = () => w.evaluate(() => getComputedStyle(document.querySelector('.ytp-paid-content-overlay')).display !== 'none');
check('"Includes paid promotion" hidden on the player', !(await paidShown()));
await setSettings({ hidePaidPromo: false });
await w.waitForTimeout(600);
check('Turning it off shows the label again', await paidShown());
await setSettings({ hidePaidPromo: true });

// Channels open on Videos
const c = await ctx.newPage();
c.on('pageerror', e => errors.push(e.message));
const landOn = async url => { await c.goto(url); await c.waitForTimeout(400); return new URL(c.url()).pathname; };
check('Typed channel URL lands on Videos', await landOn('https://www.youtube.com/@Formula1') === '/@Formula1/videos');
check('Old /channel/ and /c/ URLs land on Videos', await landOn('https://www.youtube.com/channel/UCB_qr75-ydFVKSF9Dmo6izg') === '/channel/UCB_qr75-ydFVKSF9Dmo6izg/videos' && await landOn('https://www.youtube.com/c/Formula1/') === '/c/Formula1/videos');
check("A channel's Home tab URL is left alone", await landOn('https://www.youtube.com/@Formula1/featured') === '/@Formula1/featured');
// Like YouTube: links fire 'yt-navigate' with the endpoint to open; the extension edits it in place.
const navigate = () => c.evaluate(() => {
  const ep = (url, params) => ({ commandMetadata: { webCommandMetadata: { url, webPageType: 'WEB_PAGE_TYPE_CHANNEL' } }, browseEndpoint: { browseId: 'UCB_qr75', canonicalBaseUrl: '/@Formula1', ...(params ? { params } : {}) } });
  const sent = [ep('/@Formula1'), ep('/@Formula1/featured', 'EghmZWF0dXJlZPIGBAoCMgA%3D'), { commandMetadata: { webCommandMetadata: { url: '/watch?v=abc' } }, watchEndpoint: { videoId: 'abc' } }];
  for (const endpoint of sent) document.body.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, detail: { endpoint } }));
  return sent.map(e => [e.commandMetadata.webCommandMetadata.url, e.browseEndpoint?.params || null]);
});
let navs = await navigate();
check('Channel links open the Videos tab', JSON.stringify(navs[0]) === '["/@Formula1/videos","EgZ2aWRlb3PyBgQKAjoA"]', JSON.stringify(navs));
check('Channel tab and video links are left alone', JSON.stringify(navs.slice(1)) === '[["/@Formula1/featured","EghmZWF0dXJlZPIGBAoCMgA%3D"],["/watch?v=abc",null]]', JSON.stringify(navs));
// The same link clicked again after the setting is turned off opens Home again.
await c.evaluate(() => {
  window.reused = { commandMetadata: { webCommandMetadata: { url: '/@Formula1' } }, browseEndpoint: { browseId: 'UCB_qr75' } };
  document.body.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, detail: { endpoint: window.reused } }));
});
await setSettings({ channelVideos: false });
await c.waitForTimeout(400);
const reused = await c.evaluate(() => {
  document.body.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, detail: { endpoint: window.reused } }));
  return [window.reused.commandMetadata.webCommandMetadata.url, window.reused.browseEndpoint.params || null];
});
check('A link opened on Videos opens Home again once the setting is off', JSON.stringify(reused) === '["/@Formula1",null]', JSON.stringify(reused));
navs = await navigate();
check('Turned off: channel links and URLs open Home as usual', JSON.stringify(navs[0]) === '["/@Formula1",null]' && await landOn('https://www.youtube.com/@Formula1') === '/@Formula1', JSON.stringify(navs));

// With copied comments off, nothing is marked and YouTube's Newest list isn't read.
await setSettings({ hideCopies: false });
const callsBefore = nextCalls.length;
await w.reload();
await w.waitForTimeout(1500);
check('Copied comments off: nothing marked, no Newest-order requests', await w.evaluate(() => !document.querySelector('[tt-copy]')) && nextCalls.length === callsBefore, String(nextCalls.length - callsBefore));

// Narrow window: no theater button, so the page must not stay hidden waiting for theater.
const n = await ctx.newPage();
n.on('pageerror', e => errors.push(e.message));
await n.goto('https://www.youtube.com/watch?v=abc&narrow=1');
await n.waitForTimeout(700);
check('Narrow window without a theater button: page shown right away, no clicks', await n.evaluate(() =>
  !document.documentElement.hasAttribute('tt-cinema-pending') && window.sizeClicks === 0 && getComputedStyle(document.querySelector('ytd-watch-flexy')).visibility === 'visible'));

check('No page errors', errors.length === 0, errors.join(' | '));
await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
