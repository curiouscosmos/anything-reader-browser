const READ_CURRENT_PAGE_MESSAGE = 'anything-reader:read-current-page';
const EXTRACT_READABLE_TEXT_MESSAGE = 'anything-reader:extract-readable-text';
const NATIVE_HOST_NAME = 'com.anythingreader.mac';
const MAX_TEXT_LENGTH = 500_000;
const DEBUG_PREFIX = '[Anything Reader][Background]';

type ExtractResult =
  | {
      ok: true;
      title: string;
      url: string;
      text: string;
      textLength: number;
    }
  | {
      ok: false;
      error: string;
    };

type ReadResult =
  | {
      ok: true;
      textLength: number;
    }
  | {
      ok: false;
      error: string;
    };

export default defineBackground(() => {
  const manifest = browser.runtime.getManifest() as {
    key?: string;
    name?: string;
    version?: string;
    browser_specific_settings?: unknown;
    allowed_origins?: unknown;
    allowed_extensions?: unknown;
  };

  console.log(DEBUG_PREFIX, 'Runtime info', {
    id: browser.runtime.id,
    origin: browser.runtime.getURL(''),
    browser: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  });

  console.log(DEBUG_PREFIX, 'Manifest info', {
    name: manifest.name,
    version: manifest.version,
    key: manifest.key ?? '<not present>',
    browser_specific_settings: manifest.browser_specific_settings ?? '<not present>',
    allowed_origins: manifest.allowed_origins ?? '<not present>',
    allowed_extensions: manifest.allowed_extensions ?? '<not present>',
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isReadCurrentPageRequest(message)) {
      return;
    }

    console.log(DEBUG_PREFIX, 'Received read request from popup', message);
    void readCurrentPageAndSendToMac()
      .then((result) => {
        console.log(DEBUG_PREFIX, 'Sending read result back to popup', result);
        sendResponse(result);
      })
      .catch((error) => {
        const result = {
          ok: false as const,
          error: formatError(error),
        };
        console.error(DEBUG_PREFIX, 'Failed before response could be sent', error);
        sendResponse(result);
      });

    // Keep the message channel open while the async work completes.
    return true;
  });
});

function isReadCurrentPageRequest(message: unknown): message is { type: string } {
  return typeof message === 'object' && message !== null && 'type' in message && (message as { type?: unknown }).type === READ_CURRENT_PAGE_MESSAGE;
}

async function readCurrentPageAndSendToMac(): Promise<ReadResult> {
  try {
    const tab = await getActiveTab();
    console.log(DEBUG_PREFIX, 'Active tab lookup result', tab);

    if (!tab?.id) {
      console.error(DEBUG_PREFIX, 'No active tab was found');
      return {
        ok: false,
        error: 'No active tab was found.',
      };
    }

    let extracted: ExtractResult | undefined;

    try {
      console.log(DEBUG_PREFIX, 'Requesting readable text from content script', {
        tabId: tab.id,
        messageType: EXTRACT_READABLE_TEXT_MESSAGE,
      });
      extracted = (await browser.tabs.sendMessage(tab.id, {
        type: EXTRACT_READABLE_TEXT_MESSAGE,
      })) as ExtractResult | undefined;
      console.log(DEBUG_PREFIX, 'Content script response', extracted);
    } catch (error) {
      console.error(DEBUG_PREFIX, 'Content script request failed', error);
      return {
        ok: false,
        error: describeTabMessageError(error),
      };
    }

    if (!extracted || !extracted.ok) {
      console.error(DEBUG_PREFIX, 'Readable text extraction failed', extracted);
      return {
        ok: false,
        error: extracted?.error ?? 'Could not extract readable text from the active page.',
      };
    }

    const text = clampText(normalizeText(extracted.text));
    console.log(DEBUG_PREFIX, 'Normalized extracted text', {
      title: extracted.title,
      url: extracted.url,
      textLength: text.length,
      preview: text.slice(0, 500),
    });

    if (!text) {
      console.error(DEBUG_PREFIX, 'Normalized text was empty after cleanup');
      return {
        ok: false,
        error: 'No readable text was found on the active page.',
      };
    }

    console.log(DEBUG_PREFIX, 'Sending payload to native host', {
      host: NATIVE_HOST_NAME,
      title: extracted.title,
      url: extracted.url,
      textLength: text.length,
      preview: text.slice(0, 500),
    });
    await sendTextToNativeApp({
      title: extracted.title,
      url: extracted.url,
      text,
      textLength: text.length,
    });
    console.log(DEBUG_PREFIX, 'Native host accepted payload');

    return {
      ok: true,
      textLength: text.length,
    };
  } catch (error) {
    console.error(DEBUG_PREFIX, 'Unexpected read flow failure', error);
    return {
      ok: false,
      error: formatError(error),
    };
  }
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  return tab;
}

async function sendTextToNativeApp(payload: {
  title: string;
  url: string;
  text: string;
  textLength: number;
}) {
  try {
    const response = await browser.runtime.sendNativeMessage(NATIVE_HOST_NAME, {
      type: 'anything-reader:page-text',
      payload,
    });
    console.log(DEBUG_PREFIX, 'Native host response', response);

    if (response && typeof response === 'object' && 'ok' in response && (response as { ok?: unknown }).ok === false) {
      const error = (response as { error?: unknown }).error;
      throw new Error(typeof error === 'string' && error.length > 0 ? error : 'The local Mac app rejected the text.');
    }
  } catch (error) {
    console.error(DEBUG_PREFIX, 'Native host request failed', error);
    throw new Error(resolveNativeHostError(error));
  }
}

function clampText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }

  return text.slice(0, MAX_TEXT_LENGTH);
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function formatError(error: unknown): string {
  console.error(DEBUG_PREFIX, 'Formatting error', error);
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message || error.name;
  }

  if (typeof error === 'object' && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;

    if (typeof maybeMessage === 'string' && maybeMessage.length > 0) {
      return maybeMessage;
    }
  }

  return 'An unexpected error occurred.';
}

function resolveNativeHostError(error: unknown): string {
  const message = formatError(error);
  console.log(DEBUG_PREFIX, 'Resolving native host error message', message);

  if (
    message.includes('Native host has exited') ||
    message.includes('Could not establish connection') ||
    message.includes('native application host could not be found') ||
    message.includes('native host could not be found') ||
    message.includes('native application host was not found') ||
    message.includes('No such native application') ||
    message.includes('No such native host') ||
    message.includes('The native messaging host') ||
    message.includes('Receiving end does not exist')
  ) {
    return 'Anything Reader Mac app was not reachable. Make sure the macOS app is installed and its native messaging host is registered.';
  }

  return message;
}

function describeTabMessageError(error: unknown): string {
  const message = formatError(error);
  console.log(DEBUG_PREFIX, 'Resolving tab message error message', message);

  if (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection') ||
    message.includes('No matching message handler')
  ) {
    return 'The active tab did not expose readable content to the extension. Refresh the page and try again.';
  }

  return message;
}

export {};
