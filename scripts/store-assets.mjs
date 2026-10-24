// Renders the toolbar icons and the Chrome Web Store images from store/src.
// Usage: npm run store-assets   (needs Playwright; set CHROME to a full Chromium/Chrome binary,
// since the headless shell can't load extensions). Writes icons/*.png and store/images/*.png.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'store/src');
const out = path.join(root, 'store/images');
fs.mkdirSync(out, { recursive: true });

// Popups are captured at device scale 2 so they stay sharp inside the composed images.
const ext = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'tt-store-')), {
  headless: true,
  executablePath: process.env.CHROME || undefined,
  deviceScaleFactor: 2,
  args: ['--headless=new', `--disable-extensions-except=${root}`, `--load-extension=${root}`],
});
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage();
const dataUrl = (buf, type = 'image/png') => `data:${type};base64,${buf.toString('base64')}`;
const svg = name => fs.readFileSync(path.join(src, name));

// ---------- Icons ----------
// 16 and 32 use the full-bleed two-slider variant; 48 and 128 the padded store artwork.
for (const [size, file] of [[16, 'icon-small.svg'], [32, 'icon-small.svg'], [48, 'icon.svg'], [128, 'icon.svg']]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${dataUrl(svg(file), 'image/svg+xml')}" width="${size}" height="${size}" style="display:block">`);
  await page.screenshot({ path: path.join(root, `icons/icon${size}.png`), omitBackground: true });
}
const iconUrl = dataUrl(svg('icon.svg'), 'image/svg+xml');

// ---------- Popup captures ----------
const opts = await ext.newPage();
await opts.goto('chrome://extensions');
const id = await opts.evaluate(async () => (await chrome.management.getAll()).find(e => e.name === 'Tube Tweaks').id);
await opts.close();

const SECTIONS = ['h-playback', 'h-comments', 'h-home', 'h-channels'];
// keep: section ids to show (all when omitted), shown without Chrome's 600px popup height limit.
async function popup({ scheme = 'dark', keep, openQuality = false } = {}) {
  const p = await ext.newPage();
  await p.emulateMedia({ colorScheme: scheme });
  await p.setViewportSize({ width: 360, height: 1600 });
  await p.goto(`chrome-extension://${id}/popup/popup.html`);
  await p.waitForSelector('.select-trigger');
  let css = '';
  if (keep) css += 'body{max-height:none!important}';
  if (keep) {
    css += SECTIONS.filter(s => !keep.includes(s)).map(s => `section[aria-labelledby="${s}"]`).join(',') + '{display:none!important}';
    css += 'hr.divider{display:none!important}';
    css += keep.slice(1).map(s => `section[aria-labelledby="${s}"]`).join(',') + (keep.length > 1 ? '{border-top:1px solid var(--border-divider)}' : '');
  }
  if (openQuality) css += '.body{overflow:visible!important}';
  if (css) await p.addStyleTag({ content: css });
  await p.evaluate(() => document.fonts.ready);
  if (openQuality) await p.click('.select[data-setting="quality"] .select-trigger');
  await p.mouse.move(0, 0);
  await p.waitForTimeout(300);
  const box = await p.evaluate(() => { const r = document.body.getBoundingClientRect(); return { x: 0, y: 0, width: 360, height: Math.ceil(r.height) }; });
  const buf = await p.screenshot({ clip: box, scale: 'device' });
  await p.close();
  return { url: dataUrl(buf), height: box.height };
}

const shots = {
  dark: await popup({ scheme: 'dark' }),
  light: await popup({ scheme: 'light' }),
  playback: await popup({ scheme: 'dark', keep: ['h-playback'], openQuality: true }),
  comments: await popup({ scheme: 'light', keep: ['h-comments'] }),
  home: await popup({ scheme: 'dark', keep: ['h-home', 'h-channels'] }),
};
shots.hero = shots.dark;
await ext.close();

// ---------- Composition ----------
const font = f => dataUrl(fs.readFileSync(path.join(root, 'popup/fonts', f)), 'font/woff2');
const BASE_CSS = `
@font-face{font-family:Roboto;font-weight:400;src:url(${font('roboto-400.woff2')})}
@font-face{font-family:Roboto;font-weight:500;src:url(${font('roboto-500.woff2')})}
@font-face{font-family:Roboto;font-weight:700;src:url(${font('roboto-700.woff2')})}
*{box-sizing:border-box}
html,body{margin:0;overflow:hidden}
body{font-family:Roboto,sans-serif;color:#f1f1f1;-webkit-font-smoothing:antialiased;
  background:radial-gradient(900px 600px at 85% 40%,rgba(255,0,51,.22),transparent 70%),#0f0f0f}
.brand{display:flex;align-items:center;gap:14px;font-weight:700;font-size:24px}
.brand img{width:44px;height:44px;margin:-4px}
h1{font-size:52px;line-height:60px;font-weight:700;margin:28px 0 18px;letter-spacing:-.5px}
p.lead{font-size:21px;line-height:30px;color:#aaa;margin:0 0 26px}
ul{list-style:none;margin:0;padding:0}
li{position:relative;padding-left:32px;font-size:20px;line-height:28px;margin:0 0 16px;color:#e6e6e6}
li::before{content:"";position:absolute;left:0;top:7px;width:14px;height:14px;border-radius:50%;background:#ff0033}
.shot{border-radius:12px;box-shadow:0 24px 64px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08);display:block}
`;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function compose(file, width, height, body) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html><style>${BASE_CSS}</style>${body}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(out, file) });
}

// A text column on the left and one popup on the right, scaled to fit 800px.
function slide({ title, lead, points, shot, maxH = 700, scale = 1.15 }) {
  const h = Math.min(shot.height * scale, maxH);
  const w = 360 * (h / shot.height);
  return `<div style="display:flex;align-items:center;height:800px;padding:0 96px;gap:72px">
    <div style="flex:1">
      <div class="brand"><img src="${iconUrl}">Tube Tweaks</div>
      <h1>${esc(title)}</h1>
      ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
      <ul>${points.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>
    <img class="shot" src="${shot.url}" style="width:${w}px;height:${h}px;flex:none">
  </div>`;
}

const SLIDES = [
  ['screenshot-1-overview.png', {
    title: 'YouTube, tuned your way',
    lead: 'One popup of simple switches for the player, comments, Home feed and channel pages.',
    points: ['Every video in your quality, 4K by default', 'Opens straight into theater view', 'A Most popular sort for comments', 'No Shorts on Home'],
    shot: shots.hero,
  }],
  ['screenshot-2-playback.png', {
    title: 'Your quality, every video',
    points: ['Pick 8K, 4K, 2K, HD or lower. If a video doesn’t have it, the next lower one is used', 'Uses 1080p Premium when your account has it', 'Starts every video in theater view', 'Hides Ambient mode, Sleep timer and the “Includes paid promotion” label'],
    shot: shots.playback,
  }],
  ['screenshot-3-comments.png', {
    title: 'Comments worth reading',
    points: ['Most popular sort orders comments by likes, pinned comment first', 'Pick the sort comments open with', 'Hides spam bots that repost someone else’s comment', 'A mini player keeps the video going while you read'],
    shot: shots.comments,
  }],
  ['screenshot-4-home.png', {
    title: 'A calmer Home feed',
    points: ['Hides Shorts shelves and tiles', 'Hides low-view videos, only from channels you don’t subscribe to', 'Set your own view threshold', 'Channel links open on the Videos tab'],
    shot: shots.home,
  }],
];
for (const [file, s] of SLIDES) await compose(file, 1280, 800, slide(s));

// Light and dark side by side.
{
  const h = 560, w = 360 * h / shots.dark.height;
  await compose('screenshot-5-themes.png', 1280, 800, `<div style="display:flex;align-items:center;height:800px;padding:0 80px 0 96px;gap:40px">
    <div style="flex:1">
      <div class="brand"><img src="${iconUrl}">Tube Tweaks</div>
      <h1 style="font-size:46px;line-height:54px">Light or dark, like Chrome</h1>
      <ul><li>Changes apply right away, no Save button</li><li>Settings follow your Chrome profile</li><li>No account, no ads, no tracking</li></ul>
    </div>
    <img class="shot" src="${shots.light.url}" style="width:${w}px;height:${h}px;flex:none">
    <img class="shot" src="${shots.dark.url}" style="width:${w}px;height:${h}px;flex:none;margin-top:120px">
  </div>`);
}

// Small promo tile (440x280) and marquee (1400x560).
await compose('promo-small-440x280.png', 440, 280, `<div style="height:280px;display:flex;flex-direction:column;justify-content:center;padding:0 36px">
  <img src="${iconUrl}" style="width:84px;height:84px;margin:-6px">
  <div style="font-size:38px;font-weight:700;margin:18px 0 8px;letter-spacing:-.3px">Tube Tweaks</div>
  <div style="font-size:19px;line-height:26px;color:#bbb">Simple switches that tune YouTube</div>
</div>`);
{
  const h = 560 - 2 * 56, w = 360 * h / shots.hero.height;
  await compose('promo-marquee-1400x560.png', 1400, 560, `<div style="display:flex;align-items:center;justify-content:space-between;height:560px;padding:0 120px">
    <div>
      <div class="brand" style="font-size:30px"><img src="${iconUrl}" style="width:56px;height:56px">Tube Tweaks</div>
      <h1 style="font-size:60px;line-height:68px">YouTube, tuned your way</h1>
      <p class="lead" style="margin:0">Quality, theater view, comments and a cleaner Home feed.</p>
    </div>
    <img class="shot" src="${shots.hero.url}" style="width:${w}px;height:${h}px;flex:none">
  </div>`);
}

// The 128px store icon is the same file as icons/icon128.png.
fs.copyFileSync(path.join(root, 'icons/icon128.png'), path.join(out, 'store-icon-128.png'));

await browser.close();
console.log(fs.readdirSync(out).map(f => 'store/images/' + f).join('\n'));
