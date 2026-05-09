# Anything Reader Browser Extension

Anything Reader is a browser extension that extracts readable text from the active page and sends it to the local Anything Reader Mac app.

## Requirements

- macOS only
- Anything Reader Mac app installed
- Chrome or Firefox

The Mac app is required for the extension to work. The browser extension does not render or store the full reading experience by itself; it hands the cleaned page text to the local Mac app.

## How It Works

The extension is split into three parts:

- `entrypoints/popup/` handles the popup UI.
- `entrypoints/content.ts` runs in the page and extracts readable text.
- `entrypoints/background.ts` coordinates the message flow and forwards the extracted text to the local Mac app through native messaging.

The Mac app side is responsible for:

- installing the native messaging host executable
- installing the browser host manifest
- receiving the text and forwarding it into the app UI or storage flow

## Repository Structure

```text
entrypoints/
  background.ts      Background script, messaging, native host bridge
  content.ts         Readable-text extraction from the active page
  popup/
    App.tsx          Popup UI flow
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

## Installation Notes

### Chrome

Chrome needs two things:

- the extension installed
- a native messaging host manifest installed in Chrome’s NativeMessagingHosts directory

For this project, the Chrome native host manifest must be available at:

```text
/Library/Google/Chrome/NativeMessagingHosts/com.anythingreader.mac.json
```

The manifest must point to the native host executable and whitelist the Chrome extension ID in `allowed_origins`.

### Firefox

Firefox uses its own native host manifest location:

```text
/Library/Application Support/Mozilla/NativeMessagingHosts/com.anythingreader.mac.json
```

Firefox uses `allowed_extensions` instead of Chrome’s `allowed_origins`.

## Native Messaging Contract

The browser extension sends the native host a JSON payload containing:

- page title
- site name
- page URL
- extracted text
- text length
- optional `summarize: true` flag when the user chooses the summarize action

The host is expected to:

- read the browser message from stdin
- process or store the text
- respond with JSON over stdout

## Current Behavior

- The extension supports Chrome and Firefox.
- The extension is configured for macOS only.
- The Mac app must be installed for the browser extension to complete the handoff.
- Readable-text extraction is conservative and intentionally strips common navigation and UI chrome.

## Troubleshooting

If the button fails:

- open the background/service worker console
- confirm the popup logs show a request being sent
- confirm the background logs show the content script response
- confirm the native host manifest is installed in the correct browser directory
- confirm the host executable path exists and is executable
- confirm the Chrome extension ID matches `allowed_origins`

If Chrome says `Specified native messaging host not found`, Chrome is not resolving the native host manifest or cannot launch the host executable.

If the host runs but the app does not update, the problem is in the Mac app handoff after the host receives the payload.

## Developer Notes

- The Chrome extension ID is derived from the manifest key, so keep the Chrome manifest key stable if you need a fixed ID.
- Keep native messaging host names stable. This project uses `com.anythingreader.mac`.
- Do not treat the host manifest as app data. It is an install-time browser integration file.
- The file-based inbox used by the host is an implementation detail of the Mac app side and can be replaced later with a direct IPC bridge.
