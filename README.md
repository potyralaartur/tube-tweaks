# Tube Tweaks

A Chrome extension that tunes YouTube to your taste. Design: [Figma – YouTube Extension Settings UI](https://www.figma.com/design/ayNZJJ4YgFVPVNwKfy6ich).

## Features

| Setting | What it does |
| --- | --- |
| Preferred quality | Applies your chosen quality (8K … 360p, or Auto; 2160p (4K) by default) to every video. If a video doesn't offer it, the next lower quality is used. |
| 1080p Premium (always on) | Whenever 1080p is picked and the video offers **1080p Premium**, Premium is used instead. Needs a YouTube Premium account. |
| Always use cinema mode | Opens every video in theater view right away (the default layout is never shown). Leaving theater view by hand sticks for that video. |
| Hide Ambient mode / Hide Sleep timer | Removes these items from the player's settings (gear) menu. They're recognised by their icons, so it works in any YouTube language. |
| Add “Most popular” sort | Adds a **Most popular** option to the comment sort menu that orders comments by likes. The pinned comment stays on top. |
| Default sort | Most popular, Top or Newest, applied whenever comments load. |
| Mini player while reading comments | When you scroll past the player, the video keeps playing over the column of related videos, at that column's width. The close button (shown with the player controls) hides it until you scroll back up. |
| Hide Shorts | Removes Shorts shelves and Shorts tiles from Home. |
| Hide low-view videos | Hides Home videos below a view count (default 1,000), only from channels you're **not** subscribed to. |
| 2K badge | When a video plays at 1440p, YouTube's “HD” badge on the gear icon and in the quality menu becomes **2K**, drawn in YouTube's own badge style. |

Settings are saved instantly in `chrome.storage.sync`, so they survive browser restarts, Chrome updates and extension updates, and follow your Chrome profile.

## Install (developer mode)

1. Download or clone this repo.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and pick the repo folder.
4. Pin Tube Tweaks and click it to change settings. Reload open YouTube tabs once after installing.

To get a zip for sharing: `npm run package` → `dist/tube-tweaks-<version>.zip`.

## How it works

- `src/content.js` (isolated world) reads settings, sets attributes on `<html>` that `src/content.css` keys off, and handles the DOM features (cinema mode, Home filtering, comment sorting, mini player, the 2K label in the quality menu).
- `src/page.js` (page world) talks to YouTube's player API for quality and 1080p Premium, tracks when 1440p is playing for the 2K badge, and loads your subscriptions from YouTube (guide + subscriptions list, cached for 6 hours).
- `popup/` is the settings UI from the Figma design, with dark and light themes following the system.

## Tests

`npm test` loads the unpacked extension in Chromium (Playwright) against stand-in YouTube pages in `test/fixtures.mjs` and checks every feature. Set `CHROME=/path/to/chromium` to use a specific browser. YouTube changes its markup often, so real-site checks are still worth doing after YouTube updates.

## Notes

- “Most popular” sorts the comments YouTube has loaded so far; scrolling loads more and they're re-sorted as they arrive.
- When you're signed out, nothing counts as subscribed, so low-view videos are hidden from every channel.
