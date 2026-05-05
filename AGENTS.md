# AGENTS.md

This repository is a WXT + React browser extension for Anything Reader.

## Product Goal

The extension should help a user send the readable text from the active page to the local Anything Reader Mac app.

Core flow:

1. Show a welcome screen that tells the user the Mac app is required.
2. After the user clicks `Next`, show a single action button: `Read with Anything Reader`.
3. When the user presses that button, extract the page's readable text.
4. Ignore non-content UI such as navigation, pagination, menus, sidebars, repeated chrome, and similar noise.
5. Send the extracted full text to the local macOS SwiftUI app.

## Important UI Copy

Use this message on the welcome screen:

`Anything Reader Mac app is required for this browser extension to work`

## Architecture Notes

- `entrypoints/popup/` owns the user-facing extension flow.
- `entrypoints/content.ts` should handle page inspection and text extraction from the active tab.
- `entrypoints/background.ts` should coordinate cross-context messaging and the handoff to the local Mac app bridge.

## Implementation Expectations

- Prefer a readable-text extraction strategy that targets the main article/body content, not the full DOM text.
- Keep extraction conservative: better to miss noisy fragments than to include navigation or repeated UI.
- Preserve the text in a form that is useful for the Mac app, with paragraphs and headings intact where possible.
- The local app transport is not defined yet in this repo; keep the bridge code isolated so it can be swapped between native messaging, localhost, or another macOS integration layer.

## Working Rules

- Make the smallest change that supports the flow.
- Do not rename the product or rework the app structure without a reason.
- If you add new files, keep them close to the relevant entrypoint.
- When implementing the bridge, document the expected message shape and failure states in code.

## Suggested Next Steps

1. Replace the template popup with the welcome screen and `Next` step.
2. Add the `Read with Anything Reader` action and wire it to the content script.
3. Implement readable-text extraction in the content script.
4. Add background-to-Mac-app messaging and error handling.
5. Add test coverage or a reproducible manual verification path for extraction behavior.
