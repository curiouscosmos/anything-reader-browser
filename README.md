# Anything Reader Browser Extension

Anything Reader is a browser extension that places speaker buttons in front of readable page text and uses the Supertonic model to read the selected text out loud.

## Requirements

- Chrome or Firefox
- Supertonic ONNX assets available under `assets/onnx/`
- Supertonic voice styles available under `assets/voice_styles/`
- ONNX Runtime wasm files available under `assets/ort/`

The `example/anything-reader-extension/` folder is the implementation blueprint the app follows.

## How It Works

The extension is split into three parts:

- `entrypoints/popup/` exposes page-reader controls.
- `entrypoints/content.ts` injects speaker buttons, loads the Supertonic model, and handles playback/highlighting in the page.
- `entrypoints/background.ts` stays empty because the runtime work happens in the page context.

## Repository Structure

```text
entrypoints/
  background.ts      Empty background entrypoint
  content.ts         Supertonic page reader and highlight logic
  popup/
    App.tsx          Popup controls
    App.css          Popup styles
    style.css        Global popup styling

public/
  icon/              Extension icons

wxt.config.ts        WXT manifest configuration
AGENTS.md            Developer guidance for agents
README.md            This file
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

Typecheck the project:

```bash
yarn compile
```

## Current Behavior

- The extension supports Chrome and Firefox.
- Speaker buttons are injected in front of readable text blocks.
- Clicking a speaker button loads Supertonic on demand, reads the block aloud, and highlights the active sentence.
- Playback stops when the text ends or when the user stops it from the popup.
- The example folder is the source of truth for the intended behavior.

## Troubleshooting

If speaker buttons do not appear:

- confirm the Supertonic ONNX files exist under `assets/onnx/`
- confirm the voice style JSON exists under `assets/voice_styles/`
- confirm the ONNX Runtime wasm files exist under `assets/ort/`
- open the content-script console and look for the Supertonic load error
- refresh the page or use the popup's refresh action after changing the DOM

## Developer Notes

- Supertonic model loading is copied from the example folder and kept in `lib/supertonic.ts`.
- Keep the content-script reader conservative: prefer fewer speaker buttons over noisy ones.
- The page reader should keep sentence highlights and playback in sync, and should clean up after stop or completion.
