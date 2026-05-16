export const READ_CURRENT_PAGE_MESSAGE = 'anything-reader:read-current-page';
export const EXTRACT_READABLE_TEXT_MESSAGE = 'anything-reader:extract-readable-text';
export const NATIVE_HOST_NAME = 'com.anythingreader.mac';
export const MAX_TEXT_LENGTH = 500_000;
export const APP_STORE_URL = 'https://apps.apple.com/us/search?term=Anything%20Reader';
export const DEBUG_PREFIX = '[Anything Reader][Background]';

export type ExtractResult =
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

export type ReadResult =
  | {
      ok: true;
      textLength: number;
    }
  | {
      ok: false;
      error: string;
    };

export type NativePayload = {
  title: string;
  site: string;
  url: string;
  text: string;
  textLength: number;
  summarize?: true;
};

export type ReadCurrentPageRequest = {
  type: typeof READ_CURRENT_PAGE_MESSAGE;
  summarize?: boolean;
};

export function isReadCurrentPageRequest(message: unknown): message is ReadCurrentPageRequest {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    (message as { type?: unknown }).type === READ_CURRENT_PAGE_MESSAGE
  );
}

export async function sendTextToNativeApp(payload: NativePayload) {
  try {
    const sendNativeMessage = getSendNativeMessage();
    const response = await sendNativeMessage(NATIVE_HOST_NAME, {
      type: 'anything-reader:page-text',
      payload,
    });

    if (response && typeof response === 'object' && 'ok' in response && (response as { ok?: unknown }).ok === false) {
      const error = (response as { error?: unknown }).error;
      throw new Error(typeof error === 'string' && error.length > 0 ? error : 'The local Mac app rejected the text.');
    }

    return response;
  } catch (error) {
    throw new Error(resolveNativeHostError(error));
  }
}

function getSendNativeMessage() {
  const runtime = browser?.runtime as
    | {
        sendNativeMessage?: (hostName: string, message: unknown) => Promise<unknown>;
      }
    | undefined;

  if (typeof runtime?.sendNativeMessage === 'function') {
    return runtime.sendNativeMessage.bind(runtime);
  }

  const chromeRuntime = getChromeRuntime();

  if (typeof chromeRuntime?.sendNativeMessage === 'function') {
    return (hostName: string, message: unknown) =>
      new Promise<unknown>((resolve, reject) => {
        try {
          chromeRuntime.sendNativeMessage?.(hostName, message, (response) => {
            const lastError = getChromeRuntimeLastError();
            if (lastError) {
              reject(new Error(lastError.message || 'Native messaging failed.'));
              return;
            }

            resolve(response);
          });
        } catch (error) {
          reject(error);
        }
      });
  }

  throw new Error('Native messaging is not available in this browser build.');
}

function getChromeRuntimeLastError() {
  const chromeGlobal = globalThis as typeof globalThis & {
    chrome?: {
      runtime?: {
        lastError?: {
          message?: string;
        };
      };
    };
  };

  return chromeGlobal.chrome?.runtime?.lastError;
}

function getChromeRuntime() {
  const chromeGlobal = globalThis as typeof globalThis & {
    chrome?: {
      runtime?: {
        sendNativeMessage?: (hostName: string, message: unknown, callback?: (response: unknown) => void) => void;
        lastError?: {
          message?: string;
        };
      };
    };
  };

  return chromeGlobal.chrome?.runtime;
}

export function clampText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }

  return text.slice(0, MAX_TEXT_LENGTH);
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function formatError(error: unknown): string {
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

export function resolveNativeHostError(error: unknown): string {
  const message = formatError(error);

  if (
    message.includes('Native host has exited') ||
    message.includes('Could not establish connection') ||
    message.includes('native application host could not be found') ||
    message.includes('native host could not be found') ||
    message.includes('native application host was not found') ||
    message.includes('No such native application') ||
    message.includes('No such native host') ||
    message.includes('The native messaging host') ||
    message.includes('Receiving end does not exist') ||
    message.includes('Native messaging is not available in this browser build.')
  ) {
    return 'Anything Reader Mac app was not reachable. Make sure the macOS app is installed and its native messaging host is registered.';
  }

  return message;
}

export function describeTabMessageError(error: unknown): string {
  const message = formatError(error);

  if (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection') ||
    message.includes('No matching message handler')
  ) {
    return 'The active tab did not expose readable content to the extension. Refresh the page and try again.';
  }

  return message;
}
