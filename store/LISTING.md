# Chrome Web Store listing

Copy for each field of the [developer dashboard](https://chrome.google.com/webstore/devconsole). The steps around it are in [README.md](README.md).

## Package

Upload `dist/tube-tweaks-<version>.zip` from `npm run package`. The dashboard reads the name, summary, icon and version from `manifest.json`:

| Field | Value |
| --- | --- |
| Name | Tube Tweaks |
| Summary (manifest `description`, 132 characters max) | Tune YouTube: preferred quality, instant theater view, Most popular comment sort, a mini player and a Home feed without Shorts. |
| Version | 1.0.0 |

## Store listing tab

**Category:** Make Chrome Yours → Functionality & UI (Lifestyle → Entertainment also fits).

**Language:** English.

**Description:**

```
Tube Tweaks tunes YouTube with a handful of simple switches. Open the popup, flip what you like, and every YouTube tab follows right away.

PLAYBACK
• Preferred quality: every video starts in the quality you pick, from 8K down to 360p (4K by default). If a video doesn't offer it, the next lower one is used. 1080p Premium is used automatically when your YouTube Premium account offers it.
• Always use cinema mode: videos open straight in theater view, without the default layout showing first.
• Hide Ambient mode and Sleep timer from the player's settings menu.
• Hide the "Includes paid promotion" label at the top of sponsored videos.
• 2K badge: videos playing at 1440p show "2K" instead of "HD" on the settings icon and in the quality menu.

COMMENTS
• Most popular sort: a new option in the comment sort menu that orders comments by likes, with the pinned comment kept on top.
• Default sort: comments open as Most popular, Top or Newest.
• Hide copied comments: hides spam-bot comments that repost an earlier comment word for word. The original stays.
• Mini player: scroll down to the comments and the video keeps playing in a small player beside them.

HOME AND CHANNELS
• Hide Shorts shelves and tiles on Home.
• Hide low-view videos on Home, only from channels you don't subscribe to, below a view count you choose (1,000 by default).
• Open channels on the Videos tab instead of Home.

PRIVACY
Tube Tweaks has no servers, no account, no ads and no tracking. Your settings are kept by Chrome and follow your Chrome profile. The extension only runs on www.youtube.com.

Tube Tweaks is an independent project and is not affiliated with, endorsed by or sponsored by YouTube or Google.
```

**Graphic assets** (all in `store/images/`, regenerate with `npm run store-assets`):

| Slot | File |
| --- | --- |
| Store icon (128×128) | `store-icon-128.png` |
| Screenshots (1280×800, in this order) | `screenshot-1-overview.png`, `screenshot-2-playback.png`, `screenshot-3-comments.png`, `screenshot-4-home.png`, `screenshot-5-themes.png` |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `promo-marquee-1400x560.png` |

**Additional fields:**

| Field | Value |
| --- | --- |
| Homepage URL | https://github.com/ptrl-design/tube-tweaks |
| Support URL | https://github.com/ptrl-design/tube-tweaks/issues |
| Mature content | Off |

## Privacy practices tab

**Single purpose description:**

```
Tube Tweaks customizes the YouTube website (www.youtube.com) to the user's preferences: video quality and player layout, comment sorting and filtering, and what appears on the Home feed and channel pages. Every feature is a setting for that one site, controlled from the extension's popup.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `storage` | Saves the settings the user picks in the popup with chrome.storage.sync, so they apply on every YouTube tab and survive browser restarts and updates. No other data is stored with it. |
| Host permission `https://www.youtube.com/*` (from the content scripts) | The extension's only job is to change YouTube pages. Its content scripts run on www.youtube.com to set the video quality, open theater view, sort and filter comments, show the mini player, and hide Shorts and low-view videos on Home. It runs on no other site. |

**Remote code:** "No, I am not using remote code." All scripts are in the package; the only network requests are JSON calls to youtube.com's own API from the YouTube page.

**Data usage, what is collected.** Chrome Web Store counts data an extension handles even when it stays on the device, so tick:

- [x] **Authentication information.** To ask YouTube for the user's subscriptions and a video's newest comments, the page script reads YouTube's sign-in cookie and builds the same authorization header youtube.com sends. It goes only to youtube.com.
- [x] **Website content.** Reads view counts, channels and comments on YouTube pages, and the user's subscription list from YouTube, to filter and sort them. Processed in the browser only.

Leave the rest unticked: personally identifiable information, health, financial and payment, personal communications, location, web history, user activity. (The mini player watches the page's scroll position to know when to appear, but that is not recorded or kept.)

**Certifications:** tick all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/ptrl-design/tube-tweaks/blob/main/PRIVACY.md.

## Distribution tab

| Field | Value |
| --- | --- |
| Payments | Free of charge |
| Visibility | Public (or Unlisted for a first round with friends, then switch to Public) |
| Regions | All regions |
