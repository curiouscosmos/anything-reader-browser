import { createKittenTtsEngine, type KittenTtsAction } from '@/lib/kitten-tts-engine.ts';
import {
  FIREFOX_TTS_HOST_PORT_NAME,
  FIREFOX_TTS_REQUEST_KEY_PREFIX,
  FIREFOX_TTS_RESPONSE_KEY_PREFIX,
  type FirefoxTtsHostRequest,
  type FirefoxTtsHostResponse,
} from '@/lib/firefox-tts-host.ts';
import { getKittenOrtWasmPaths } from '@/lib/ort-runtime.ts';
import {
  clampText,
  describeTabMessageError,
  EXTRACT_READABLE_TEXT_MESSAGE,
  formatError,
  isReadCurrentPageRequest,
  normalizeText,
  sendTextToNativeApp,
  type NativePayload,
  type ReadResult,
} from '@/lib/native-messaging.ts';

type TtsMessage = {
  action: KittenTtsAction;
  data?: unknown;
};

type DemoMessage = {
  action: 'getSelectedText' | 'speak' | 'updateIcon' | 'openReaderPage';
  enabled?: boolean;
  texts?: string[];
};

const CONTEXT_MENU_ID = 'read-with-anything-reader';
const READER_CONTENT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const kittenTtsEngine = createKittenTtsEngine({
  kittenRoot: browser.runtime.getURL('kittenTTS' as never),
  ortWasmRoot: getKittenOrtWasmPaths(
    browser.runtime.getURL('supertonic/ort/' as never),
    {
      mjs: browser.runtime.getURL('supertonic/ort/ort-wasm-simd-threaded.mjs' as never),
      wasm: browser.runtime.getURL('supertonic/ort/ort-wasm-simd-threaded.wasm' as never),
    },
  ),
  primaryExecutionProviders: ['wasm'],
  fallbackExecutionProviders: ['wasm'],
});

declare global {
  interface Window {
    __anythingReaderFirefoxTtsHandle?: (action: KittenTtsAction, data?: unknown) => Promise<unknown>;
  }
}

window.__anythingReaderFirefoxTtsHandle = async (action, data) => kittenTtsEngine.handle(action, data ?? {});

browser.runtime.onMessage.addListener((message, sender) => {
  if (isReadCurrentPageRequest(message)) {
    console.info('[Anything Reader][FirefoxBackground] read request received');
    return readCurrentPageAndSendToMac(message.summarize === true)
      .catch((error) => {
        console.error('[Anything Reader][FirefoxBackground] Native messaging request failed', error);
        return {
          ok: false,
          error: formatError(error),
        };
      });
  }

  if (isTtsMessage(message)) {
    console.info('[Anything Reader][FirefoxBackground] tts request received', message.action, summarizeTtsMessage(message));
    return sendTtsMessage(message.action, message.data)
      .then((result) => {
        console.info('[Anything Reader][FirefoxBackground] tts response ready', message.action, summarizeTtsResponse(result));
        return result;
      })
      .catch((error) => {
        console.error('[Anything Reader][FirefoxBackground] TTS request failed', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      });
  }

  if (!isDemoMessage(message)) {
    return;
  }

  return handleDemoMessage(message, sender)
    .catch((error) => {
      console.error('[Anything Reader][FirefoxBackground] Demo request failed', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    });
});

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== FIREFOX_TTS_HOST_PORT_NAME) {
    return;
  }

  port.onMessage.addListener((message: FirefoxTtsHostRequest) => {
    void handleFirefoxTtsPortMessage(port, message).catch((error) => {
      console.error('[Anything Reader][FirefoxBackground] TTS port request failed', error);
      postFirefoxTtsResponse(port, {
        id: message.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  for (const [key, change] of Object.entries(changes)) {
    if (!key.startsWith(FIREFOX_TTS_REQUEST_KEY_PREFIX) || !change.newValue) {
      continue;
    }

    const request = change.newValue as FirefoxTtsHostRequest;
    void handleFirefoxStorageRequest(key, request).catch((error) => {
      console.error('[Anything Reader][FirefoxBackground] Storage TTS request failed', error);
    });
  }
});

browser.runtime.onInstalled.addListener(() => {
  void updateExtensionIcon(true);
  void createContextMenu();
  void cleanupOldReaderContent();
  void preloadTtsModel();
});

browser.runtime.onStartup.addListener(() => {
  void updateExtensionIcon(true);
  void cleanupOldReaderContent();
  void preloadTtsModel();
});

const chromeApi = getChromeApi();
chromeApi.action?.onClicked?.addListener((tab) => {
  if (!tab.id) {
    return;
  }

  void browser.tabs
    .sendMessage(tab.id, {
      action: 'toggle',
      iconPosition: 'top-right',
    })
    .then((response) => {
      const enabled = (response as { enabled?: unknown } | undefined)?.enabled;
      if (typeof enabled === 'boolean') {
        void updateExtensionIcon(enabled);
      }
    })
    .catch(() => {});
});

chromeApi.contextMenus?.onClicked?.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText || !tab?.id) {
    return;
  }

  void browser.tabs.sendMessage(tab.id, {
    action: 'playSelectedText',
    text: info.selectionText,
  });
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes['ar-plugin-enabled']?.newValue === true) {
    void preloadTtsModel();
  }
});

async function readCurrentPageAndSendToMac(summarize: boolean): Promise<ReadResult> {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      return {
        ok: false,
        error: 'No active tab was found.',
      };
    }

    let extracted:
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
        }
      | undefined;

    try {
      extracted = (await browser.tabs.sendMessage(tab.id, {
        type: EXTRACT_READABLE_TEXT_MESSAGE,
      })) as typeof extracted;
    } catch (error) {
      return {
        ok: false,
        error: describeTabMessageError(error),
      };
    }

    if (!extracted || !extracted.ok) {
      return {
        ok: false,
        error: extracted?.error ?? 'Could not extract readable text from the active page.',
      };
    }

    const text = clampText(normalizeText(extracted.text));
    if (!text) {
      return {
        ok: false,
        error: 'No readable text was found on the active page.',
      };
    }

    const payload: NativePayload = {
      title: extracted.title,
      site: extracted.site,
      url: extracted.url,
      text,
      textLength: text.length,
      ...(summarize ? { summarize: true as const } : {}),
    };

    await sendTextToNativeApp(payload);
    return {
      ok: true,
      textLength: text.length,
    };
  } catch (error) {
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

function isTtsMessage(message: unknown): message is TtsMessage {
  if (!message || typeof message !== 'object' || !('action' in message)) {
    return false;
  }

  const action = (message as { action?: unknown }).action;
  return action === 'tts-initialize' || action === 'tts-generate' || action === 'tts-unload' || action === 'tts-status';
}

function isDemoMessage(message: unknown): message is DemoMessage {
  if (!message || typeof message !== 'object' || !('action' in message)) {
    return false;
  }

  const action = (message as { action?: unknown }).action;
  return action === 'getSelectedText' || action === 'speak' || action === 'updateIcon' || action === 'openReaderPage';
}

async function handleDemoMessage(message: DemoMessage, sender: { tab?: { id?: number } }) {
  switch (message.action) {
    case 'getSelectedText': {
      if (!sender.tab?.id) {
        return {};
      }

      return browser.tabs.sendMessage(sender.tab.id, { action: 'getSelectedText' });
    }
    case 'speak':
      return { success: true };
    case 'updateIcon':
      await updateExtensionIcon(message.enabled !== false);
      return { success: true };
    case 'openReaderPage':
      return openReaderPage(message.texts ?? []);
  }
}

async function sendTtsMessage(action: KittenTtsAction, data?: unknown) {
  console.info('[Anything Reader][FirefoxBackground] sendTtsMessage', action, summarizeTtsMessage({ action, data }));
  return kittenTtsEngine.handle(action, data ?? {});
}

async function handleFirefoxTtsPortMessage(port: Browser.runtime.Port, message: FirefoxTtsHostRequest) {
  const result = await sendTtsMessage(message.action, message.data);
  postFirefoxTtsResponse(port, {
    id: message.id,
    success: true,
    result,
  });
}

function postFirefoxTtsResponse(port: Browser.runtime.Port, response: FirefoxTtsHostResponse) {
  port.postMessage(response);
}

async function handleFirefoxStorageRequest(requestKey: string, request: FirefoxTtsHostRequest) {
  const result = await sendTtsMessage(request.action, request.data);
  const responseKey = `${FIREFOX_TTS_RESPONSE_KEY_PREFIX}${request.id}`;
  await browser.storage.local.set({
    [responseKey]: {
      id: request.id,
      success: true,
      result,
    } satisfies FirefoxTtsHostResponse,
  });
  await browser.storage.local.remove(requestKey);
}

async function preloadTtsModel() {
  try {
    console.info('[Anything Reader][FirefoxBackground] preloading KittenTTS');
    await sendTtsMessage('tts-initialize', { model: 'kitten' });
  } catch (error) {
    console.warn('[Anything Reader][FirefoxBackground] TTS preload failed', error);
  }
}

async function createContextMenu() {
  const contextMenus = getChromeApi().contextMenus;
  if (!contextMenus?.create) {
    return;
  }

  await new Promise<void>((resolve) => {
    contextMenus.removeAll?.(() => {
      contextMenus.create?.({
        id: CONTEXT_MENU_ID,
        title: 'Read with Anything Reader',
        contexts: ['selection'],
      });
      resolve();
    });

    if (!contextMenus.removeAll) {
      contextMenus.create?.({
        id: CONTEXT_MENU_ID,
        title: 'Read with Anything Reader',
        contexts: ['selection'],
      });
      resolve();
    }
  });
}

async function openReaderPage(texts: string[]) {
  const pageId = Date.now().toString();
  const storageKey = `readerContent_${pageId}`;
  const now = Date.now();

  await browser.storage.local.set({
    [storageKey]: {
      texts,
      created: now,
      lastAccessed: now,
      title: texts[0]?.slice(0, 100) || 'Untitled',
    },
  });

  const tab = await browser.tabs.create({
    url: browser.runtime.getURL(`reader.html?id=${pageId}` as never),
  });

  return {
    success: true,
    tabId: tab.id,
    pageId,
  };
}

async function cleanupOldReaderContent() {
  const now = Date.now();
  const items = await browser.storage.local.get(null);
  const keysToRemove = Object.entries(items)
    .filter(([key, value]) => {
      if (!key.startsWith('readerContent_') || !value || typeof value !== 'object') {
        return false;
      }

      const lastAccessed = (value as { lastAccessed?: unknown }).lastAccessed;
      return typeof lastAccessed === 'number' && now - lastAccessed > READER_CONTENT_MAX_AGE;
    })
    .map(([key]) => key);

  if (keysToRemove.length > 0) {
    await browser.storage.local.remove(keysToRemove);
  }
}

async function updateExtensionIcon(isEnabled: boolean) {
  const actionApi = getChromeApi().action;
  if (!actionApi?.setIcon) {
    return;
  }

  const suffix = isEnabled ? 'on' : 'off';
  await actionApi.setIcon({
    path: {
      16: `icon16_${suffix}.png`,
      32: `icon32_${suffix}.png`,
      48: `icon48_${suffix}.png`,
      128: `icon128_${suffix}.png`,
    },
  });
}

function getChromeApi() {
  const globalChrome = (globalThis as typeof globalThis & { chrome?: ChromeApi; browser?: ChromeApi }).chrome;
  if (globalChrome) {
    return globalChrome;
  }

  const browserAsChrome = browser as typeof browser & ChromeApi;
  return {
    runtime: browserAsChrome.runtime as unknown as ChromeRuntimeApi,
    action: browserAsChrome.action as unknown as ChromeActionApi,
    contextMenus: browserAsChrome.contextMenus as unknown as ChromeContextMenusApi,
  };
}

function summarizeTtsMessage(message: { action?: unknown; data?: unknown }) {
  const data = message.data;
  if (!data || typeof data !== 'object') {
    return { action: message.action, dataType: typeof data };
  }

  const payload = data as { text?: unknown; voiceId?: unknown; model?: unknown; speechLength?: unknown; totalStep?: unknown; language?: unknown };
  return {
    action: message.action,
    model: payload.model,
    voiceId: payload.voiceId,
    speechLength: payload.speechLength,
    totalStep: payload.totalStep,
    language: payload.language,
    textLength: typeof payload.text === 'string' ? payload.text.length : undefined,
  };
}

function summarizeTtsResponse(response: unknown) {
  if (!response || typeof response !== 'object') {
    return response;
  }

  const payload = response as { success?: unknown; initialized?: unknown; model?: unknown; sampleRate?: unknown; audioBase64?: unknown; error?: unknown };
  return {
    success: payload.success,
    initialized: payload.initialized,
    model: payload.model,
    sampleRate: payload.sampleRate,
    audioBase64Length: typeof payload.audioBase64 === 'string' ? payload.audioBase64.length : undefined,
    error: payload.error,
  };
}

type ChromeRuntimeApi = {
  getURL: (path: string) => string;
};

type ChromeActionApi = {
  setIcon?: (details: { path: Record<number, string> }) => Promise<void>;
  onClicked?: {
    addListener: (callback: (tab: { id?: number }) => void) => void;
  };
};

type ChromeContextMenusApi = {
  create?: (details: { id: string; title: string; contexts: string[] }) => void;
  removeAll?: (callback?: () => void) => void;
  onClicked?: {
    addListener: (callback: (info: { menuItemId?: string; selectionText?: string }, tab?: { id?: number }) => void) => void;
  };
};

type ChromeApi = {
  runtime?: ChromeRuntimeApi;
  action?: ChromeActionApi;
  contextMenus?: ChromeContextMenusApi;
};
