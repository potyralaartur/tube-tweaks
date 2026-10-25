# Tube Tweaks privacy policy

_Last updated: 24 October 2026_

Tube Tweaks is a Chrome extension that changes how the YouTube website looks and behaves, using the settings you choose in its popup. This policy explains what information the extension touches and what happens to it.

**In short:** Tube Tweaks has no server, account or analytics. Nothing it reads is ever sent to the developer or to anyone else. Everything stays in your browser, apart from requests the extension makes to YouTube itself on your behalf, which go only to youtube.com.

## What the extension reads and stores

### Your settings
The choices you make in the popup (preferred quality, which items to hide, the minimum view count and so on) are saved with Chrome's `chrome.storage.sync`. If Chrome sync is turned on, Chrome copies them to your other computers through your Google account, the same way it syncs your other extension settings. The developer never receives them.

A few of these settings are also copied into youtube.com's local storage (`tt-cinema`, `tt-channel-videos`, `tt-hide`) so the extension can apply them before the page finishes loading. When "Always use cinema mode" is on, the extension sets YouTube's own `wide=1` cookie on youtube.com, which is how YouTube remembers theater view, and it clears that cookie when you turn the setting off.

### YouTube pages you open
To do its job the extension reads parts of the YouTube pages you visit, inside your browser:

- video tiles on Home (their channel and view count) to hide Shorts and low-view videos;
- comments under a video (their text, like counts and the time shown) to sort them by likes and to spot copied spam comments;
- the player's quality menu and settings menu, and links to channel pages.

This is processed on the spot and is not stored or sent anywhere.

### Your YouTube subscriptions
When "Hide low-view videos" is on and you are signed in to YouTube, the extension asks YouTube for the list of channels you subscribe to, so it never hides videos from those channels. It keeps that list in youtube.com's local storage (`tt-subs-v1`) for up to 6 hours, then asks again. The saved list is tagged with which signed-in YouTube account or channel it belongs to, so it isn't reused after you switch accounts.

### Comment order
When "Hide copied comments" finds two identical comments that show the same posting time, it may ask YouTube for the video's "Newest" comment list (at most 15 pages) to see which one was posted first.

### Your YouTube sign-in
The two requests above are made to YouTube's own web API from the YouTube page, the same way youtube.com makes them. To make them as you, the extension reads YouTube's sign-in cookie in the page and computes the same authorization header youtube.com sends. The cookie and header go only to youtube.com and are never stored or sent anywhere else.

## What the extension does not do

- It does not send any data to the developer or to any third party.
- It does not use analytics, tracking, advertising or crash reporting.
- It does not read your browsing outside www.youtube.com.
- It does not sell, rent or share data, use it for purposes unrelated to the extension's features, or use it to determine creditworthiness or for lending.
- It does not load or run code from outside the extension package.

## Removing your data

Uninstalling the extension removes the settings Chrome stored for it. The small items it kept on youtube.com (`tt-cinema`, `tt-channel-videos`, `tt-hide`, `tt-subs-v1`) stay until you delete youtube.com's site data in Chrome's settings (Privacy and security, under site data). The `wide` cookie belongs to YouTube and only controls theater view.

## Changes

If the extension starts handling information differently, this page will be updated before that version is published, and the date at the top will change.

## Contact

Questions about this policy: open an issue at https://github.com/potyralaartur/tube-tweaks/issues.

Tube Tweaks is an independent project and is not affiliated with, endorsed by or sponsored by YouTube or Google.
