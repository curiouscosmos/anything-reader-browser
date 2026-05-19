import { isFirefoxRuntime } from '@/lib/browser-flavor.ts';
import { devLog } from "@/lib/devlog.ts";
import { getKittenOrtWasmPaths } from '@/lib/ort-runtime.ts';
import {
  FIREFOX_TTS_HOST_PAGE,
  FIREFOX_TTS_HOST_PORT_NAME,
  FIREFOX_TTS_HOST_READY_MESSAGE,
  type FirefoxTtsHostRequest,
  type FirefoxTtsHostResponse,
} from '@/lib/firefox-tts-host.ts';
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

type TtsAction = 'tts-initialize' | 'tts-generate' | 'tts-unload' | 'tts-status';

let firefoxTtsHostPort: Browser.runtime.Port | null = null;
let firefoxTtsHostTabId: number | null = null;
let firefoxTtsHostReadyPromise: Promise<void> | null = null;
let resolveFirefoxTtsHostReady: (() => void) | null = null;
let nextFirefoxTtsRequestId = 1;
const pendingFirefoxTtsRequests = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();

function backgroundMain() {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isFirefoxTtsHostReadyMessage(message)) {
      if (_sender.tab?.id) {
        firefoxTtsHostTabId = _sender.tab.id;
        void connectFirefoxTtsHost(_sender.tab.id);
      }
      return;
    }

    if (isReadCurrentPageRequest(message)) {
      void readCurrentPageAndSendToMac(message.summarize === true)
        .then(sendResponse)
        .catch((error) => {
          console.error('[Anything Reader][Background] Native messaging request failed', error);
          sendResponse({
            ok: false,
            error: formatError(error),
          });
        });

      return true;
    }

    if (isTtsMessage(message)) {
      void sendTtsMessage(message.action, message.data)
        .then(sendResponse)
        .catch((error) => {
          console.error('[Anything Reader][Background] TTS request failed', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return true;
    }

    if (!isDemoMessage(message)) {
      return;
    }

    void handleDemoMessage(message, _sender)
      .then(sendResponse)
      .catch((error) => {
        console.error('[Anything Reader][Background] Demo request failed', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
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
}

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

type TtsMessage = {
  action: TtsAction;
  data?: unknown;
};

type DemoMessage = {
  action: 'getSelectedText' | 'speak' | 'updateIcon' | 'openReaderPage';
  enabled?: boolean;
  texts?: string[];
};

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
const CONTEXT_MENU_ID = 'read-with-anything-reader';
const READER_CONTENT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let creatingOffscreenDocument: Promise<void> | null = null;
let backgroundTtsEngine: Promise<BackgroundTtsEngine> | null = null;

type BackgroundTtsEngine = {
  handle: (action: TtsAction, data?: unknown) => Promise<unknown>;
  ensureInitialized: () => Promise<void>;
};

type ChromeOffscreenApi = {
  createDocument: (options: { url: string; reasons: string[]; justification: string }) => Promise<void>;
};

type ChromeRuntimeApi = {
  getURL: (path: string) => string;
  getContexts?: (query: { contextTypes: string[]; documentUrls: string[] }) => Promise<unknown[]>;
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
  offscreen?: ChromeOffscreenApi;
  runtime?: ChromeRuntimeApi;
  action?: ChromeActionApi;
  contextMenus?: ChromeContextMenusApi;
};

function isTtsMessage(message: unknown): message is TtsMessage {
  if (!message || typeof message !== 'object' || !('action' in message)) {
    return false;
  }

  if ((message as { target?: unknown }).target === 'offscreen') {
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

async function sendToOffscreen(action: TtsAction, data?: unknown) {
  await ensureOffscreenDocument();

  return browser.runtime.sendMessage({
    target: 'offscreen',
    action,
    data,
  });
}

async function sendTtsMessage(action: TtsAction, data?: unknown) {
  if (isFirefoxRuntime()) {
    return sendFirefoxTtsMessage(action, data as FirefoxTtsHostRequest['data']);
  }

  if (canUseChromeOffscreen()) {
    return sendToOffscreen(action, data);
  }

  const engine = await getBackgroundTtsEngine();
  return engine.handle(action, data ?? {});
}

async function getBackgroundTtsEngine() {
  if (!backgroundTtsEngine) {
    const ortWasmRoot = getKittenOrtWasmPaths(
      browser.runtime.getURL('supertonic/ort/' as never),
      {
        mjs: browser.runtime.getURL('supertonic/ort/ort-wasm-simd-threaded.mjs' as never),
        wasm: browser.runtime.getURL('supertonic/ort/ort-wasm-simd-threaded.wasm' as never),
      },
    );

    backgroundTtsEngine = import('@/lib/tts-engine.ts').then(({ createSupertonicTtsEngine }) =>
      createSupertonicTtsEngine({
        debugPrefix: '[Anything Reader][BackgroundTTS]',
        modelRoot: browser.runtime.getURL('supertonic/onnx' as never),
        voiceStyleRoot: browser.runtime.getURL('supertonic/voice_styles' as never),
        kittenRoot: browser.runtime.getURL('kittenTTS' as never),
        ortWasmRoot,
        primaryExecutionProviders: ['wasm'],
        fallbackExecutionProviders: ['wasm'],
      }),
    );
  }

  return backgroundTtsEngine;
}

async function sendFirefoxTtsMessage(action: TtsAction, data?: FirefoxTtsHostRequest['data']) {
  await ensureFirefoxTtsHost();
  if (!firefoxTtsHostPort) {
    throw new Error('Firefox TTS host is not available.');
  }

  const id = nextFirefoxTtsRequestId++;
  return new Promise<unknown>((resolve, reject) => {
    pendingFirefoxTtsRequests.set(id, { resolve, reject });
    firefoxTtsHostPort?.postMessage({ id, action, data } satisfies FirefoxTtsHostRequest);
  });
}

async function ensureFirefoxTtsHost() {
  if (firefoxTtsHostPort) {
    return;
  }

  if (!firefoxTtsHostReadyPromise) {
    firefoxTtsHostReadyPromise = (async () => {
      const existingTabs = await browser.tabs.query({
        url: browser.runtime.getURL(FIREFOX_TTS_HOST_PAGE as never),
      });

      const existingTab = existingTabs.find((tab) => typeof tab.id === 'number');
      if (existingTab?.id !== undefined) {
        firefoxTtsHostTabId = existingTab.id;
        await connectFirefoxTtsHost(existingTab.id);
        return;
      }

      const tab = await browser.tabs.create({
        url: browser.runtime.getURL(FIREFOX_TTS_HOST_PAGE as never),
        active: false,
      });

      if (typeof tab.id === 'number') {
        firefoxTtsHostTabId = tab.id;
      }

      await new Promise<void>((resolve) => {
        resolveFirefoxTtsHostReady = resolve;
      });
    })().finally(() => {
      firefoxTtsHostReadyPromise = null;
      resolveFirefoxTtsHostReady = null;
    });
  }

  await firefoxTtsHostReadyPromise;
}

async function connectFirefoxTtsHost(tabId: number) {
  if (firefoxTtsHostPort) {
    return;
  }

  try {
    firefoxTtsHostPort = browser.tabs.connect(tabId, {
      name: FIREFOX_TTS_HOST_PORT_NAME,
    });
  } catch (error) {
    console.error('[Anything Reader][Background] Failed to connect to Firefox TTS host', error);
    throw error;
  }

  firefoxTtsHostPort.onMessage.addListener((message: FirefoxTtsHostResponse) => {
    const pending = pendingFirefoxTtsRequests.get(message.id);
    if (!pending) {
      return;
    }

    pendingFirefoxTtsRequests.delete(message.id);
    if (message.success) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error));
    }
  });

  firefoxTtsHostPort.onDisconnect.addListener(() => {
    firefoxTtsHostPort = null;
    firefoxTtsHostTabId = null;
    for (const pending of pendingFirefoxTtsRequests.values()) {
      pending.reject(new Error('Firefox TTS host disconnected.'));
    }
    pendingFirefoxTtsRequests.clear();
  });

  resolveFirefoxTtsHostReady?.();
}

function isFirefoxTtsHostReadyMessage(message: unknown) {
  return message && typeof message === 'object' && (message as { type?: unknown }).type === FIREFOX_TTS_HOST_READY_MESSAGE;
}

async function preloadTtsModel() {
  try {
    const settings = await browser.storage.sync.get(['ar-tts-model']);
    const model = isFirefoxRuntime() ? 'kitten' : settings['ar-tts-model'] === 'supertonic' ? 'supertonic' : 'kitten';
    await sendTtsMessage('tts-initialize', { model });
  } catch (error) {
    devLog('[Anything Reader][Background] TTS preload failed', error);
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

async function ensureOffscreenDocument() {
  const chromeApi = getChromeApi();
  const offscreenApi = chromeApi.offscreen;
  const runtimeApi = chromeApi.runtime;
  if (!offscreenApi) {
    throw new Error('Chrome offscreen documents are unavailable in this browser.');
  }

  if (!runtimeApi) {
    throw new Error('Chrome runtime APIs are unavailable.');
  }

  const offscreenUrl = runtimeApi.getURL(OFFSCREEN_DOCUMENT_PATH);
  if (runtimeApi.getContexts) {
    const contexts = await runtimeApi.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [offscreenUrl],
    });

    if (contexts.length > 0) {
      return;
    }
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = offscreenApi
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ['WORKERS', 'BLOBS'],
        justification: 'Run local Supertonic ONNX TTS inference in one shared extension context.',
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  await creatingOffscreenDocument;
}

function canUseChromeOffscreen() {
  const chromeApi = getChromeApi();
  return Boolean(chromeApi.offscreen?.createDocument && chromeApi.runtime?.getURL);
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
  const globalChrome = (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
  if (globalChrome) {
    return globalChrome;
  }

  const browserAsChrome = browser as typeof browser & ChromeApi;
  return {
    offscreen: browserAsChrome.offscreen,
    runtime: browserAsChrome.runtime as unknown as ChromeRuntimeApi,
    action: browserAsChrome.action as unknown as ChromeActionApi,
    contextMenus: browserAsChrome.contextMenus as unknown as ChromeContextMenusApi,
  };
}

const background = defineBackground({
  include: ['chrome'],
  main: backgroundMain,
});

export default background;
