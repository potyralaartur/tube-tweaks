# Publishing Tube Tweaks to the Chrome Web Store

Everything the store asks for is in this folder: listing copy and privacy answers in [LISTING.md](LISTING.md), images in [images/](images), and the privacy policy in [../PRIVACY.md](../PRIVACY.md). The steps below need the publisher's own Google account, so they're done by hand.

## Before the first upload

1. **Merge to `main`.** The privacy policy link in the listing points at `PRIVACY.md` on `main`, so it has to be there before you submit.
2. **Try the final build on live YouTube.** Load the repo unpacked (`chrome://extensions` → Developer mode → Load unpacked), check the features once, and check the new icon in the toolbar and popup. Reviewers install the extension and try it, so it should work on the day you submit.
3. **Build the zip:** `npm run package` → `dist/tube-tweaks-1.0.1.zip`. It holds only `manifest.json`, `src/`, `popup/`, `icons/` and `assets/`.

## Developer account (one time)

4. Pick the Google account that will own the extension. A separate account just for publishing keeps it apart from personal mail; it can't be moved to another account later without help from Google.
5. Turn on **2-Step Verification** for that account. The store won't let you publish without it.
6. Open the [developer dashboard](https://chrome.google.com/webstore/devconsole), accept the developer agreement and pay the **one-time US$5** registration fee by card.
7. In **Account**:
   - set the **publisher name** shown on the listing (your name or a brand name);
   - add and **verify a contact email**;
   - answer the **trader / non-trader** question (an EU requirement). A free hobby project with no business behind it is normally *non-trader*. Choosing *trader* means your address and phone number are shown on the listing.

## Submit

8. **Add new item** → upload the zip.
9. **Store listing** tab: paste the description, pick the category and language, upload the icon, the five screenshots and both promo tiles, and fill in the homepage and support URLs, all from [LISTING.md](LISTING.md).
10. **Privacy practices** tab: paste the single purpose and permission justifications, choose "no remote code", tick the data types and the three certifications, and paste the privacy policy URL, all from [LISTING.md](LISTING.md).
11. **Distribution** tab: Free, Public (or Unlisted to start), all regions.
12. **Submit for review.** You can choose to publish automatically once approved, or to publish by hand afterwards. Review usually takes a few days. If it's rejected, the email names the policy; most fixes are a listing edit or a new upload.

## Updates later

Bump `version` in `manifest.json` (the store refuses a zip with the same or a lower version), run `npm run package`, and upload it under **Package** for the existing item. Update `PRIVACY.md` and the privacy tab first if the extension starts handling different data, and fill in a justification for any new permission.

## Regenerating the images

`npm run store-assets` redraws `icons/*.png` from `store/src/icon.svg` (one artwork for every size), and renders `store/images/` from the real popup with Playwright. It needs a full Chromium or Chrome, because the headless shell can't load extensions: `CHROME=/path/to/chrome npm run store-assets`. Change the slide text in `scripts/store-assets.mjs`.
