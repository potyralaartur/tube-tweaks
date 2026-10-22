// Loads the unpacked extension in Chromium and runs it against fake YouTube pages.
// Usage: node test/run.mjs   (needs Playwright; set CHROME to a Chromium binary if needed)
import { chromium } from 'playwright';
import { home, watch, guide, channels } from './fixtures.mjs';
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
await ctx.route('https://www.youtube.com/**', route => {
  const url = new URL(route.request().url());
  const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname === '/youtubei/v1/guide') return json(guide);
  if (url.pathname === '/youtubei/v1/browse') return json(JSON.parse(route.request().postData()).browseId === 'FEchannels' ? channels : {});
  if (url.pathname === '/watch') return route.fulfill({ contentType: 'text/html', body: watch });
  return route.fulfill({ contentType: 'text/html', body: home });
});

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failures++; };
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
check('Low-view video from subscribed channel kept (handle)', shown.includes('subbed-low'));
check('Low-view video from subscribed channel kept (channel id)', shown.includes('subbed-by-id'));
check('High-view video from unsubscribed channel kept', shown.includes('random-high'));

// Watch page
const w = await ctx.newPage();
w.on('pageerror', e => errors.push(e.message));
await w.goto('https://www.youtube.com/watch?v=abc');
await w.waitForTimeout(2000);
check('Cinema mode switched on', await w.evaluate(() => document.querySelector('ytd-watch-flexy').hasAttribute('theater')));
const calls = await w.evaluate(() => window.qualityCalls);
check('Preferred 1080p picks 1080p Premium', JSON.stringify(calls[0]) === JSON.stringify(['hd1080', 'hd1080', 'premium-fmt']), JSON.stringify(calls));
check('"Most popular" added to sort menu', await w.evaluate(() => !!document.querySelector('#sort-menu .tt-sort-item')));
const order = await w.evaluate(() => [...document.querySelectorAll('ytd-comments #contents > *')]
  .sort((a, b) => (+getComputedStyle(a).order) - (+getComputedStyle(b).order)).map(e => e.id));
check('Comments ordered by likes (default sort)', JSON.stringify(order) === JSON.stringify(['c1200', 'c30', 'c5', 'c0', 'cont']), JSON.stringify(order));
await w.click('#sort-new');
await w.waitForTimeout(400);
const after = await w.evaluate(() => [...document.querySelectorAll('ytd-comments #contents > *')].map(e => e.style.order).join(','));
check('Choosing a YouTube sort turns Most popular off', after.replace(/,/g, '') === '', after);
await w.evaluate(() => window.scrollTo(0, 1500));
await w.waitForTimeout(400);
check('Mini player shown when scrolled to comments', await w.evaluate(() => document.documentElement.hasAttribute('tt-mini') && getComputedStyle(document.getElementById('movie_player')).position === 'fixed'));
await w.evaluate(() => window.scrollTo(0, 0));
await w.waitForTimeout(400);
check('Mini player removed when back at the top', await w.evaluate(() => !document.documentElement.hasAttribute('tt-mini')));

// Switch preferred quality to 1440p through storage, like the popup does
const opts = await ctx.newPage();
const id = await (async () => { await opts.goto('chrome://extensions'); return opts.evaluate(async () => (await chrome.management.getAll()).find(e => e.name === 'Tube Tweaks').id); })();
await opts.goto(`chrome-extension://${id}/popup/popup.html`);
await opts.evaluate(async () => { const s = await TTSettings.load(); await TTSettings.save({ ...s, quality: 'hd1440' }); });
await w.waitForTimeout(1500);
const calls2 = await w.evaluate(() => window.qualityCalls);
check('Changing preferred quality applies to the open video', JSON.stringify(calls2.at(-1)) === JSON.stringify(['hd1440', 'hd1440', null]) || JSON.stringify(calls2.at(-1)) === JSON.stringify(['hd1440', 'hd1440']), JSON.stringify(calls2));
check('Gear badge switches to 2K at 1440p', await w.evaluate(() => document.getElementById('movie_player').hasAttribute('tt-2k')));
const badge = await w.evaluate(() => getComputedStyle(document.querySelector('.ytp-settings-button'), '::after').backgroundImage.slice(0, 30));
check('2K badge artwork applied', badge.startsWith('url("data:image/svg+xml'), badge);
const sups = await w.evaluate(() => [...document.querySelectorAll('.ytp-settings-menu sup')].map(s => s.textContent));
check('Quality menu shows 2K for 1440p, HD for 1080p', JSON.stringify(sups) === '["2K","HD"]', JSON.stringify(sups));

check('No page errors', errors.length === 0, errors.join(' | '));
await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });
process.exit(failures ? 1 : 0);
