# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-06

First public release.

### Added

- Wallpaper layer behind the Harness Web UI: import your own images and videos
  (muted, looped, `object-fit` cover/fit), persisted in IndexedDB with settings in localStorage.
- Six built-in gradient presets for use without files.
- Veil (scheme-aware), blur (0–24 px) and fill controls.
- Per-surface opacity slider: the shell turns fully transparent while ambient surfaces keep
  the value you choose.
- Readability floor for interactive surfaces: dialogs, question cards, approval prompts, menus,
  popovers and toasts keep at least 88% body; the Settings page is forced fully opaque.
- Reentrancy guard and single-media-element reuse, after an early build could exhaust the
  renderer's media players on repeated theme publications.
- Bundle metadata, icon and localized titles/descriptions for the Plugins page.

### Known limitations

- 200 MB per file.
- Changing the plugin's code needs a page reload (or app restart) to reach the browser:
  client modules are cached per module-graph revision.
