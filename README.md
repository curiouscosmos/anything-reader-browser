# Anything Reader Browser Extension

Anything Reader is a WXT + React browser extension that reads readable page text aloud with local TTS models. It runs offline once the extension assets are packaged.

## Current Behavior

- The content script injects speaker icons next to readable text blocks when you hover a paragraph or similar content.
- Clicking the speaker icon, the paragraph, or the dock play button starts playback.
- The active text is highlighted word by word while it is spoken.
- Playback stops when the text ends.
- The player is a compact vertical dock on the right side of the page.
- The popup controls reader state, TTS model, voice, speed, auto-scroll, highlight toggles, and highlight color.

## Supported Models

- `KittenTTS` is the default model.
- `Supertonic` is still supported.
- The active model determines the voice list shown in the popup and the player dock.

## Required Assets

The extension expects the packaged assets to be present under these paths:

- `assets/kittenTTS/`
- `assets/supertonic/onnx/`
- `assets/supertonic/ort/`
- `assets/supertonic/voice_styles/`

The build pipeline copies source-side helpers from `entrypoints/shared/` into the packaged extension output.

## Architecture

The runtime is split across a few focused entrypoints:

- `entrypoints/popup/` owns the popup UI and settings.
- `entrypoints/background.ts` coordinates runtime messages, context menu actions, startup warmup, and the offscreen route.
- `entrypoints/offscreen/main.ts` runs the TTS engine when Chrome supports offscreen documents.
- `entrypoints/shared/ttsManager.ts` is the content-script orchestrator for page scanning, playback flow, and reader UI.
- `entrypoints/shared/player-dock.ts` owns the compact right-side dock.
- `entrypoints/shared/voice-menu.ts` and `entrypoints/shared/speed-menu.ts` own the model option popups.
- `entrypoints/shared/playback.ts` owns playback queueing, pause/resume, stop, and prefetch cache helpers.
- `entrypoints/shared/tts-session.ts` owns TTS initialization, warmup, and unload.
- `entrypoints/shared/html-analyzer-common.ts` and `entrypoints/shared/text-preprocessor.ts` handle page content extraction and text normalization.

## Popup Controls

The popup currently includes:

- Reader icons
- Player bar
- Auto Scroll
- Highlight text
- TTS Model
- Voice
- Speed
- Highlight Color

The old `Take list` popup option was removed.

## Build and Runtime Notes

- `scripts/build-assets.mjs` bundles source helpers from `entrypoints/shared/` into `assets-built/`.
- `wxt.config.ts` publishes `assets-built/` as `publicDir` and maps the packaged assets into the extension.
- Chrome uses an offscreen document for TTS when available.
- Firefox falls back to the background/runtime path and uses the same shared TTS engine contract.
- The extension warms TTS on install/startup and when the content script loads so playback starts faster.
- The TTS engine still supports both WebGPU-first and WASM fallback behavior where the runtime allows it.

## Example Code

The example blueprint lives in `example/anything-reader-extension/`.

Treat it as the behavioral reference for the production app. Keep the production entrypoints aligned with the example when implementing changes, but keep the example directory isolated unless a task explicitly targets it.

## Repository Structure

```text
entrypoints/
  background.ts         Runtime coordination, context menu, warmup, offscreen bridge
  offscreen/main.ts     Chrome offscreen TTS route
  popup/                Popup UI and settings
  shared/               Content-script runtime and extracted helper modules

assets/
  kittenTTS/            Packaged KittenTTS assets
  supertonic/           Packaged Supertonic assets
  icon*.png             Extension icons

scripts/build-assets.mjs  Bundles shared source files into assets-built/
wxt.config.ts             Manifest and packaging configuration
AGENTS.md                 Agent guidance for this repo
README.md                 This file
```

## Local Development

Install dependencies:

```bash
yarn
```

Run the extension in Chrome:

```bash
yarn dev
```

Run the extension in Firefox:

```bash
yarn dev:firefox
```

Typecheck and package assets:

```bash
yarn compile
```

Build Chrome and Firefox bundles:

```bash
yarn build
yarn build:firefox
```

## Troubleshooting

If playback fails:

- confirm the model assets exist under `assets/kittenTTS/` or `assets/supertonic/`
- confirm `assets/supertonic/ort/` is present for ORT runtime files
- confirm `assets/supertonic/voice_styles/` is present for Supertonic voice styles
- reload the extension after changing model files
- check the content-script console for TTS initialization errors

If the popup or dock looks stale:

- rebuild the extension
- verify `scripts/build-assets.mjs` ran successfully
- verify the packaged files under `.output/<browser>/`

## Notes for Contributors

- Keep `ttsManager.ts` as the orchestrator only. New logic should be split into a helper module when it is self-contained.
- Keep DOM-heavy UI in the relevant `entrypoints/shared/*` helper, not inside the manager.
- Keep page extraction conservative. Prefer the main article/body content and avoid navigation, repeated chrome, sidebars, and other noise.
- Preserve sentence and word-level highlighting behavior when changing playback.
- Keep Chrome and Firefox behavior aligned unless a browser-specific branch is required.
