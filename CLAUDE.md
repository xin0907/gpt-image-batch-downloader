# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A build-free Chrome Manifest V3 extension ("图片批量下载助手 for ChatGPT" / "Image Batch Downloader for ChatGPT") that adds a batch-download button to ChatGPT's multi-image results and full-screen image viewer, lets the user select/preview images, and saves the original bytes into a folder chosen via the File System Access API. No bundler, no npm dependencies, no lint setup — the files in the repo root are what ships.

## Commands

```bash
node --test tests/*.cjs                                   # all tests (node:test, no deps)
node --test tests/panel-flow.cjs                          # one file
node --test --test-name-pattern="shift" tests/panel-flow.cjs   # tests whose name matches
python scripts/package.py                                 # -> release/image-batch-download-<version>.zip
python scripts/generate_artwork.py                        # regenerate icons/ + store promo tile (needs Pillow)
```

Manual testing: `chrome://extensions` → Load unpacked → this folder; after edits click the extension's reload button and refresh the ChatGPT tab. The tests use simulated DOMs, so behaviour that depends on real event order (modifier keys, label→checkbox forwarding, ChatGPT layout) must be checked on a real ChatGPT page.

## Architecture

Content scripts load in order `gallery.js` → `image-io.js` → `content.js` (see `manifest.json`). The first two each install one frozen global (`BatchImageGallery`, `BatchImageIO`) behind an "already defined" guard; `content.js` consumes them. Tests load these files into `vm` contexts with stubbed globals, so keep that global-object shape.

- **`gallery.js` — finding the image group by geometry, never by ChatGPT class names.** The "hero" is the largest visible image that is actually in front (`elementsFromPoint`), long side ≥ 240 and short side ≥ 120 CSS px (portrait images on zoomed pages are narrow). The "rail" is an ancestor of thumbnails (24–165 px) sitting beside the hero: rail to the right → `generation` mode, to the left → `viewer` mode. **A rail needs ≥ 2 thumbnails, so single-image replies get no button** (this caused a Chrome Web Store "Red Potassium" rejection; the store copy now says multi-image only). `scan()` never scrolls or clicks the page; it maps each thumbnail to a full-size URL by matching natural size with the hero, and `entireRailRendered()` decides whether the (possibly virtualised) rail was fully rendered.
- **`content.js` — UI and save flow.** Panel and trigger button live in two shadow roots (`#bgi-extension-root`, `#bgi-trigger-root`) styled by `panel.css`. The trigger is placed into the generation page's action row, or next to the full-screen viewer's zoom button (found by its "NN%" text). A `MutationObserver` throttled to 250 ms (`refreshContext`) re-places the trigger and marks the panel stale when the group changes. UI strings are inline `messages.zh/en`; language = saved `chrome.storage.local.language`, else browser UI language. Saving: `showDirectoryPicker` must be called synchronously inside the click handler (before any `await`), then 3 parallel workers; filenames are `chatgpt-series-<local time>-<uuid8>-NNN.<ext>`, never overwriting. Selection supports Shift+click ranges (`state.selectionAnchor`, `rangePending` set by a capture-phase `mousedown`/`keydown` on the list).
- **`image-io.js`** fetches from the page first, then falls back to the background worker (`FETCH_REMOTE_IMAGE`, base64 reply); sniffs magic bytes to pick the MIME/extension; 24 MiB cap; removes partially written files on failure.
- **`background.js`** only accepts that message from ChatGPT tabs and for an allowlist of ChatGPT image hosts — keep it in sync with `host_permissions`.
- **Toolbar popup** (`popup.*`): language switch, GitHub link, a collapsed optional Alipay/WeChat support section (`assets/*-qr.png`). Extension name/description come from `_locales/` (default `en`, plus `zh_CN`).

## Tests

`tests/panel-flow.cjs` drives `content.js` through a hand-rolled fake DOM (`Element`/`Shadow` classes): events do **not** bubble, and `dispatch()` passes a minimal event object. To simulate modifiers or capture listeners, call the listeners directly (see the `shiftClick` helper). Several tests also assert on file contents (`manifest.json`, `popup.html`, `panel.css`, `scripts/package.py`), so shipping a new runtime file means adding it to `FILES` in `scripts/package.py`.

## Releasing

1. Bump `manifest.json` `version` — the store rejects a re-used version.
2. `node --test tests/*.cjs`, then `python scripts/package.py`; check the ZIP contains the current files.
3. GitHub: `gh release create vX.Y.Z release/image-batch-download-X.Y.Z.zip --title vX.Y.Z --notes-file <notes>` (bilingual notes; tell users to download the ZIP, not "Source code"). The README links to `releases/latest`.
4. Chrome Web Store: upload through the **existing item's Package page** (item ID `jfdonpeohbabalbajghlalbgcliijjmo`); "上传新内容" creates a second item. Listing copy and reviewer test instructions live in `STORE_RELEASE.md`. The listing must only describe features present in the version under review.

## Decisions to keep

- Keep the folder picker (Chrome's "允许此网站修改文件？" prompt is accepted); don't switch to `chrome.downloads`.
- Keep the viewer's "无法确认…请核对列表 / 已核对这 N 张" partial-list warning (removing it was tried and reverted).
- Don't add hash comparison against ChatGPT's own downloads, and don't claim byte-identical output.
- Keep the name in the "… for ChatGPT" form (OpenAI brand rules / store impersonation policy).
- `promo/` (raw screen recordings, Douyin edits) is gitignored and contains unmasked personal info — never commit it. `release/` is gitignored too.
- `PRIVACY.md` keeps the contact email (required for the store privacy policy); the READMEs intentionally don't.
