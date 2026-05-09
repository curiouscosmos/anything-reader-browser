import { extractReadableTextFromDocument } from '../lib/readable-text';

const EXTRACT_READABLE_TEXT_MESSAGE = 'anything-reader:extract-readable-text';
const DEBUG_PREFIX = '[Anything Reader][Content]';

type ExtractResult =
  | {
      ok: true;
      title: string;
      site: string;
      url: string;
      text: string;
      textLength: number;
    }
  | {
      ok: false;
      error: string;
    };

export default defineContentScript({
  matches: ['*://*/*'],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isExtractRequest(message)) {
        return;
      }

      console.log(DEBUG_PREFIX, 'Received extraction request', message);
      const result = extractReadableText();
      console.log(DEBUG_PREFIX, 'Sending extraction result back to background', result);
      sendResponse(result);
      return true;
    });
  },
});

function isExtractRequest(message: unknown): message is { type: string } {
  return typeof message === 'object' && message !== null && 'type' in message && (message as { type?: unknown }).type === EXTRACT_READABLE_TEXT_MESSAGE;
}

function extractReadableText(): ExtractResult {
  try {
    const result = extractReadableTextFromDocument(document);
    console.log(DEBUG_PREFIX, 'Extraction result', {
      ok: result.ok,
      title: result.ok ? result.title : document.title.trim(),
      site: result.ok ? result.site : location.hostname,
      url: location.href,
      textLength: result.ok ? result.textLength : 0,
      preview: result.ok ? result.text.slice(0, 500) : undefined,
    });
    return result;
  } catch (error) {
    console.error(DEBUG_PREFIX, 'Readability extraction failed', error);
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : 'No readable text was found on this page.',
    };
  }
}

