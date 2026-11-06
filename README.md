# Wallpaper for DeepSeek Harness

<p>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="platform: Windows, macOS, Linux (Harness Web UI)" src="https://img.shields.io/badge/platform-Harness%20Web%20UI-3964fe">
</p>

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) UI plugin that turns the whole
interface into your own wallpaper: import an image or a video, tune veil / blur / fill, and let the
Harness surfaces turn to glass. Dialogs, approval prompts and the Settings page automatically keep a
readable body.

**[中文说明 →](README.zh-CN.md)**

## Features

- **Your own media** — import any image (`image/*`) or video (`video/*`, plays muted and looped) with
  the native file picker. Both live in this browser only.
- **Glass surfaces** — the shell (frame, sidebar, title bar) becomes fully transparent, so the media is
  the interface, not a strip behind it.
- **One slider for readability** — "Surface opacity" controls how much body ambient surfaces
  (bubbles, composer, tints) keep; `0%` is pure wallpaper, `100%` is the stock white card look.
- **Interactive surfaces never wash out** — dialogs, question cards, approval prompts, menus, popovers
  and toasts keep at least 88% body; the Settings page is forced fully opaque.
- **Six gradient presets** — beautify with zero files, or use them as a fallback.
- **Veil + blur + fill** — dim the media per colour scheme (white veil in light mode, black in dark),
  blur it 0–24 px, and pick `cover` or `contain`.
- **Persistent** — the media (IndexedDB) and the settings (localStorage) survive reloads and restarts.
- **No upload** — nothing leaves the machine; there is no network call in the plugin.

## Requirements

- DeepSeek Harness with the Web UI. Built and tested on `0.2.2-rc.1` (desktop and `dsh web`).
- Any OS the Harness Web UI runs on. No build step, no dependencies, no install scripts.

## Install

The plugin is a Harness *bundle*: one `cordis.patch.yml` row plus a browser module. Install it from a
checkout of this repository:

```bash
git clone <repository-url>
```

Then pick one:

**A. In the app** — open **Plugins** in the left sidebar, choose install from a local directory, and
point it at the cloned folder.

**B. With an agent session** — ask the Harness agent to install the bundle, or call the plugin manager
tool with the absolute path:

```json
{ "action": "install_bundle", "target": "D:\\path\\to\\dsh-plugin-wallpaper" }
```

**C. With the CLI** — from a Harness checkout:

```bash
dsh plugin --profile <profile> add /absolute/path/to/dsh-plugin-wallpaper
```

The bundle activates through HMR. If the page still shows the previous build, reload the page (or
restart the app) once — the browser keeps client modules per graph revision.

## Usage

1. Open any session and find the **Wallpaper** pill at the right end of the composer dock
   (next to the round/token counters).
2. In the panel:
   - **Image / Video** — pick a file. It applies immediately and is remembered.
   - **Presets** — six gradients, useful before you have media.
   - **Veil** — the dim layer over the media (white in light mode, black in dark).
   - **Blur** — 0–24 px; the media is scaled up slightly so blur never shows edges.
   - **Surface opacity** — body of ambient surfaces; dialogs keep their own readability floor.
   - **Fill** — `Cover` or `Fit`.
   - **Enable wallpaper** — temporary off switch that keeps the media.
   - **Reset all** — clears media and settings.
3. The dot on the pill marks an active wallpaper.

## Where files live

| What | Where |
|---|---|
| Image / video blobs | IndexedDB `dsh-beautify`, object store `media`, keys `image` / `video` |
| Settings | `localStorage["dsh-beautify/settings/v1"]` |

Limit: 200 MB per file. Nothing is uploaded — the plugin makes no network requests.

## How it works

- **Host half** (`index.js`) is intentionally empty; all behaviour is in the browser module
  (`client.js`).
- A fixed `#dsh-beautify-wall` layer is inserted as the first child of `document.body` with
  `z-index: -1`, so it paints above the page canvas and below all interface content.
- `ctx.theme.overrideTokens()` redirects the design-system surface tokens: shell tokens become
  transparent, ambient tokens use the slider value, and interactive tokens get a readability floor.
  The root canvas is painted with the media's fallback colour so the page can never end up
  transparent-and-empty.
- Overrides are re-applied with the same source name when the slider moves (the theme service replaces
  a source's whole layer), and removed on unload.
- Dialogs are detected with `[role="dialog"][aria-modal="true"], [role="alertdialog"]`; the Settings
  frame is recognised by its `navTitle` class and forced fully opaque. A `MutationObserver` plus
  `requestAnimationFrame` coalescing keeps this cheap while the chat streams.
- Media elements are reused per `(source, url)`. The early version rebuilt them on every theme publish
  and could exhaust the renderer's media players; the current build keeps exactly one and guards the
  `theme/change` → `overrideTokens` reentrancy.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Pill is missing | The bundle is not active: enable it in **Plugins**. |
| Nothing changes after an update | Reload the page (or restart the app) so the browser fetches the new client module. |
| Text hard to read over a bright image | Raise **Veil**, or raise **Surface opacity**. |
| Video stutters / high CPU | Lower the blur to 0, or use an image instead of a video. |
| "The file is too large" | The per-file limit is 200 MB. |
| Wallpaper gone after clearing site data | Media lives in this browser; import it again. |

## Uninstall

Disable or remove `Wallpaper` in the **Plugins** page, or drop `dsh-plugin-wallpaper` from the profile's
`dsh.profile.bundles`. The browser data stays behind; use **Reset all** in the panel first if you want
it gone.

## Development

No build step. Files are served as-is.

```bash
node --check client.js   # syntax
node --check index.js
```

CI runs the same two checks plus a manifest JSON parse (`.github/workflows/check.yml`).

## License

[MIT](./LICENSE).
