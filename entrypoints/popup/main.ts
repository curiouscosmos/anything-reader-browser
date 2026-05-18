import { READ_CURRENT_PAGE_MESSAGE, type ReadResult } from '@/lib/native-messaging.ts';
import config from '../../config/config.ts';
import { isFirefoxRuntime } from '@/lib/browser-flavor.ts';
import './style.css';

type VoiceOption = {
  id: string;
  name: string;
  key: string;
  description: string;
};

type ReaderSettingsResponse = {
  success?: boolean;
  model?: TtsModel;
  voiceId?: string;
  speed?: number;
  pluginEnabled?: boolean;
  floatingBarVisible?: boolean;
  autoScrollEnabled?: boolean;
  highlightEnabled?: boolean;
  highlightColorIndex?: number;
};

type TtsModel = 'kitten' | 'supertonic';

const SUPERTONIC_VOICES: VoiceOption[] = [
  { name: 'Jenifer', id: 'F1', key: '1', description: 'Calm female voice' },
  { name: 'May', id: 'F2', key: '2', description: 'Bright female voice' },
  { name: 'Lisa', id: 'F3', key: '3', description: 'Professional female voice' },
  { name: 'Mira', id: 'F4', key: '4', description: 'Confident female voice' },
  { name: 'Megan', id: 'F5', key: '5', description: 'Gentle female voice' },
  { name: 'Sam', id: 'M1', key: '6', description: 'Lively male voice' },
  { name: 'Harry', id: 'M2', key: '7', description: 'Deep male voice' },
  { name: 'James', id: 'M3', key: '8', description: 'Authoritative male voice' },
  { name: 'Kirk', id: 'M4', key: '9', description: 'Soft male voice' },
  { name: 'Matthew', id: 'M5', key: '0', description: 'Warm male voice' },
];

const KITTEN_VOICES: VoiceOption[] = [
  { name: 'Bella', id: 'expr-voice-2-f', key: '1', description: 'Expressive female KittenTTS voice' },
  { name: 'Jasper', id: 'expr-voice-2-m', key: '2', description: 'Expressive male KittenTTS voice' },
  { name: 'Luna', id: 'expr-voice-3-f', key: '3', description: 'Clear female KittenTTS voice' },
  { name: 'Bruno', id: 'expr-voice-3-m', key: '4', description: 'Clear male KittenTTS voice' },
  { name: 'Rosie', id: 'expr-voice-4-f', key: '5', description: 'Warm female KittenTTS voice' },
  { name: 'Hugo', id: 'expr-voice-4-m', key: '6', description: 'Warm male KittenTTS voice' },
  { name: 'Kiki', id: 'expr-voice-5-f', key: '7', description: 'Lively female KittenTTS voice' },
  { name: 'Leo', id: 'expr-voice-5-m', key: '8', description: 'Lively male KittenTTS voice' },
];

const VOICES_BY_MODEL: Record<TtsModel, VoiceOption[]> = {
  kitten: KITTEN_VOICES,
  supertonic: SUPERTONIC_VOICES,
};

const DEFAULT_SPEED = 1.0;
const SPEED_OPTION_VALUES = ['1.4', '1.2', '1.0', '0.9'] as const;
const DEFAULT_MODEL: TtsModel = 'supertonic';
const HIGHLIGHT_COLOR_BASE = ['#d8ccad', '#6789ca', '#594743', '#504e49', '#a4a199', '#e5b560', '#941e34', '#bc6f25', '#455f54'];
const DEFAULT_HIGHLIGHT_COLOR_INDEX = 0;
const DEBUG_PREFIX = '[Anything Reader][Popup]';

const enabledToggle = getInput('enabled-toggle');
const barToggle = getInput('bar-toggle');
const autoScrollToggle = getInput('auto-scroll-toggle');
const highlightToggle = getInput('highlight-toggle');
const voiceSelect = getSelect('voice-select');
const speedSelect = getSelect('speed-select');
const highlightColorPicker = getElement('highlight-color-picker');
const statusText = getElement('status-text');
const readerControlsSection = getElement('model-section');
const nativeActionsSection = getElement('native-actions-section');
const readWithMacAppButton = getButton('read-with-mac-app');
const summarizeWithMacAppButton = getButton('summarize-with-mac-app');

let currentModel: TtsModel = DEFAULT_MODEL;
const firefoxOnlyKitten = isFirefoxRuntime();

initializePopup().catch((error) => {
  setStatus(error instanceof Error ? error.message : String(error), true);
});

async function initializePopup() {
  const settings = await browser.storage.sync.get([
    'ar-plugin-enabled',
    'ar-floating-bar-visible',
    'ar-auto-scroll',
    'ar-highlight-enabled',
    'ar-highlight-color',
    'ar-voice',
    'ar-speed',
  ]);

  enabledToggle.checked = settings['ar-plugin-enabled'] !== false;
  barToggle.checked = settings['ar-floating-bar-visible'] !== false;
  autoScrollToggle.checked = settings['ar-auto-scroll'] !== false;
  highlightToggle.checked = settings['ar-highlight-enabled'] !== false;

  currentModel = firefoxOnlyKitten ? 'kitten' : 'supertonic';
  renderVoices(currentModel);

  const savedVoice = settings['ar-voice'] as Partial<VoiceOption> | undefined;
  const savedVoiceId = savedVoice?.id;
  const voices = getVoicesForModel(currentModel);
  voiceSelect.value = savedVoiceId && voices.some((voice) => voice.id === savedVoiceId) ? savedVoiceId : getDefaultVoiceForModel(currentModel).id;

  const savedSpeed = Number(settings['ar-speed']);
  speedSelect.value = getSpeedSelectValue(savedSpeed);

  const savedHighlightColorIndex = Number(settings['ar-highlight-color']);
  renderHighlightColorPicker(Number.isInteger(savedHighlightColorIndex) ? savedHighlightColorIndex : DEFAULT_HIGHLIGHT_COLOR_INDEX);

  const showNativeSection = shouldShowNativeMessagingSection();
  console.log(DEBUG_PREFIX, 'Native messaging section visibility', {
    showNativeSection,
  });
  readerControlsSection.hidden = false;
  nativeActionsSection.hidden = !showNativeSection;

  await syncLiveReaderSettings();

  enabledToggle.addEventListener('change', () => saveBooleanSetting('ar-plugin-enabled', enabledToggle.checked));
  barToggle.addEventListener('change', () => saveBooleanSetting('ar-floating-bar-visible', barToggle.checked));
  autoScrollToggle.addEventListener('change', () => saveBooleanSetting('ar-auto-scroll', autoScrollToggle.checked));
  highlightToggle.addEventListener('change', () => saveBooleanSetting('ar-highlight-enabled', highlightToggle.checked));
  voiceSelect.addEventListener('change', saveVoiceSetting);
  speedSelect.addEventListener('change', saveSpeedSetting);
  readWithMacAppButton.addEventListener('click', () => void handleNativeActionClick(false));
  summarizeWithMacAppButton.addEventListener('click', () => void handleNativeActionClick(true));
}

async function handleNativeActionClick(summarize: boolean) {
  const actionText = summarize ? 'Summarizing the active page...' : 'Reading the active page...';
  readWithMacAppButton.disabled = true;
  summarizeWithMacAppButton.disabled = true;
  setStatus(actionText);

  try {
    const response = (await browser.runtime.sendMessage({
      type: READ_CURRENT_PAGE_MESSAGE,
      summarize,
    })) as ReadResult | undefined;

    if (!response || !response.ok) {
      throw new Error(response?.error ?? 'Unable to read the current page.');
    }

    setStatus(
      summarize
        ? `Sent ${response.textLength.toLocaleString()} characters to Anything Reader for summarization.`
        : `Sent ${response.textLength.toLocaleString()} characters to Anything Reader.`,
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    readWithMacAppButton.disabled = false;
    summarizeWithMacAppButton.disabled = false;
  }
}

async function syncLiveReaderSettings() {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      return;
    }

    const response = (await browser.tabs.sendMessage(tab.id, { action: 'getReaderSettings' })) as ReaderSettingsResponse | undefined;
    if (!response?.success) {
      return;
    }

    if (typeof response.pluginEnabled === 'boolean') {
      enabledToggle.checked = response.pluginEnabled;
    }
    if (typeof response.floatingBarVisible === 'boolean') {
      barToggle.checked = response.floatingBarVisible;
    }
    if (typeof response.autoScrollEnabled === 'boolean') {
      autoScrollToggle.checked = response.autoScrollEnabled;
    }
    if (typeof response.highlightEnabled === 'boolean') {
      highlightToggle.checked = response.highlightEnabled;
    }
    if (response.model) {
      currentModel = normalizeTtsModel(response.model);
      renderVoices(currentModel);
    }
    const liveHighlightColorIndex = response.highlightColorIndex;
    if (typeof liveHighlightColorIndex === 'number' && Number.isInteger(liveHighlightColorIndex)) {
      selectHighlightColor(liveHighlightColorIndex);
    }
    if (response.voiceId && getVoicesForModel(currentModel).some((voice) => voice.id === response.voiceId)) {
      voiceSelect.value = response.voiceId;
    }
    if (typeof response.speed === 'number' && Number.isFinite(response.speed)) {
      speedSelect.value = getSpeedSelectValue(response.speed);
    }
  } catch {
    // Some pages cannot receive content-script messages; storage values remain the fallback.
  }
}

function renderHighlightColorPicker(selectedIndex: number) {
  highlightColorPicker.replaceChildren(
    ...HIGHLIGHT_COLOR_BASE.map((baseColor, index) => {
      const button = document.createElement('button');
      const color = increaseSaturation(baseColor, index === 4 ? 45 : 30);
      button.type = 'button';
      button.className = 'color-swatch';
      button.dataset.colorIndex = String(index);
      button.style.setProperty('--swatch-color', color);
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', `Highlight color ${index + 1}`);
      button.addEventListener('click', () => saveHighlightColorSetting(index));
      return button;
    }),
  );

  selectHighlightColor(selectedIndex);
}

async function saveHighlightColorSetting(index: number) {
  await browser.storage.sync.set({ 'ar-highlight-color': index });
  selectHighlightColor(index);
  setStatus('Highlight color saved');
}

function selectHighlightColor(index: number) {
  const safeIndex = index >= 0 && index < HIGHLIGHT_COLOR_BASE.length ? index : DEFAULT_HIGHLIGHT_COLOR_INDEX;
  highlightColorPicker.querySelectorAll<HTMLButtonElement>('.color-swatch').forEach((button) => {
    const isSelected = Number(button.dataset.colorIndex) === safeIndex;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-checked', String(isSelected));
  });
}

function renderVoices(model: TtsModel) {
  const voices = getVoicesForModel(model);
  voiceSelect.replaceChildren(
    ...voices.map((voice) => {
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = `${voice.name} (${voice.id})`;
      option.title = voice.description;
      return option;
    }),
  );
}

async function saveBooleanSetting(key: string, enabled: boolean) {
  await browser.storage.sync.set({ [key]: enabled });
  setStatus('Saved');
}

async function saveVoiceSetting() {
  const voice = getVoicesForModel(currentModel).find((candidate) => candidate.id === voiceSelect.value) ?? getDefaultVoiceForModel(currentModel);
  await browser.storage.sync.set({
    'ar-voice': {
      id: voice.id,
      name: voice.name,
      key: voice.key,
      isCustom: false,
      isTemp: false,
    },
  });
  setStatus(`Voice: ${voice.name}`);
}

function normalizeTtsModel(model: unknown): TtsModel {
  if (firefoxOnlyKitten) {
    return 'kitten';
  }

  return 'supertonic';
}

function getVoicesForModel(model: TtsModel) {
  if (firefoxOnlyKitten) {
    return KITTEN_VOICES;
  }

  return VOICES_BY_MODEL[model];
}

function getDefaultVoiceForModel(model: TtsModel) {
  if (firefoxOnlyKitten) {
    return KITTEN_VOICES[2];
  }

  return model === 'supertonic' ? SUPERTONIC_VOICES[0] : KITTEN_VOICES[2];
}

async function saveSpeedSetting() {
  await browser.storage.sync.set({ 'ar-speed': Number(speedSelect.value) });
  setStatus(`Speed: ${speedSelect.value}x`);
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function setStatus(message: string, isError = false) {
  statusText.textContent = message;
  statusText.dataset.state = isError ? 'error' : 'ok';
}

function getSpeedSelectValue(speed: unknown) {
  const numericSpeed = typeof speed === 'number' ? speed : Number(speed);
  if (!Number.isFinite(numericSpeed)) {
    return String(DEFAULT_SPEED);
  }

  const normalized = Math.round(numericSpeed * 10) / 10;
  const candidate = normalized.toFixed(1);
  return (SPEED_OPTION_VALUES as readonly string[]).includes(candidate) ? candidate : String(DEFAULT_SPEED);
}

function getElement(id: string) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing popup element: ${id}`);
  }

  return element;
}

function getInput(id: string) {
  return getElement(id) as HTMLInputElement;
}

function getSelect(id: string) {
  return getElement(id) as HTMLSelectElement;
}

function getButton(id: string) {
  return getElement(id) as HTMLButtonElement;
}

function shouldShowNativeMessagingSection() {
  const isMac = isMacPlatform();
  const browserName = getBrowserName();

  console.log(DEBUG_PREFIX, 'Native messaging visibility checks', {
    isMac,
    browserName,
    showOnChrome: config.nativeHostMessaging.showOnChrome,
    showOnFirefox: config.nativeHostMessaging.showOnFirefox,
  });

  if (!isMac) {
    return false;
  }
  if (browserName === 'chrome') {
    return config.nativeHostMessaging.showOnChrome;
  }

  if (browserName === 'firefox') {
    return config.nativeHostMessaging.showOnFirefox;
  }

  return false;
}

function isMacPlatform() {
  const result = /Mac/i.test(navigator.userAgent) || /Mac/i.test(navigator.platform);
  console.log(DEBUG_PREFIX, 'OS detection result', {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    isMac: result,
  });
  return result;
}

function getBrowserName() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('firefox')) {
    console.log(DEBUG_PREFIX, 'Browser detection result', { browserName: 'firefox', userAgent: navigator.userAgent });
    return 'firefox' as const;
  }

  if (userAgent.includes('chrome') || userAgent.includes('chromium') || userAgent.includes('edg/')) {
    console.log(DEBUG_PREFIX, 'Browser detection result', { browserName: 'chrome', userAgent: navigator.userAgent });
    return 'chrome' as const;
  }

  console.log(DEBUG_PREFIX, 'Browser detection result', { browserName: 'other', userAgent: navigator.userAgent });
  return 'other' as const;
}

function increaseSaturation(hex: string, percent = 30) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newS = Math.min(100, s + percent);
  const [nr, ng, nb] = hslToRgb(h, newS, l);
  return `#${[nr, ng, nb].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r = l;
  let g = l;
  let b = l;

  if (s !== 0) {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
