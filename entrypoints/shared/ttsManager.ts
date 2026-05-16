// @ts-nocheck
import {
  createPlayerDock,
  getPlayerDockState,
  loadPlayerDockState,
  populatePlayerDockSpeedSelect,
  populatePlayerDockVoiceSelect,
  restorePlayerDockState,
  savePlayerDockState,
  updatePlayerDockState,
  updatePlayerDockTheme,
} from './player-dock';
import {
  handleSpeedMenuOutsideClick,
  hideSpeedMenu,
  selectSpeed,
  showSpeedMenu,
  getSpeedText,
  getSpeedTextForTinyUI,
} from './speed-menu';
import {
  addToAudioCache,
  clearAllAudio,
  getFromAudioCache,
  getTakeAudioCacheKey,
  pausePlayback,
  prefetchNextTakes,
  prepareNextTake,
  resumePlayback,
  stopAll,
} from './playback';
import {
  handleVoiceMenuOutsideClick,
  hideVoiceMenu,
  selectVoice,
  showVoiceMenu,
  updateVoiceMenuSelection,
} from './voice-menu';
import {
  initializeSupertonic,
  unloadSupertonic,
  warmupTTSModel,
} from './tts-session';

class TTSManager {
  constructor() {
    this.DEBUG_MODE = false;

    this.SUPERTONIC_VOICES = [
      { name: 'Jenifer', id: 'F1', key: '1', description: `is a calm female voice with a slightly low tone; steady and composed.` },
      { name: 'May', id: 'F2', key: '2', description: `is a bright, cheerful female voice; lively, playful, and youthful with spirited energy.` },
      { name: 'Lisa', id: 'F3', key: '3', description: `is a clear, professional announcer-style female voice; articulate and broadcast-ready.` },
      { name: 'Mira', id: 'F4', key: '4', description: `is a crisp, confident female voice; distinct and expressive with strong delivery.` },
      { name: 'Megan', id: 'F5', key: '5', description: `is a kind, gentle female voice; soft-spoken, calm, and naturally soothing.` },
      { name: 'Sam', id: 'M1', key: '6', description: `is a lively, upbeat male voice with confident energy and a standard, clear tone.` },
      { name: 'Harry', id: 'M2', key: '7', description: `is a deep, robust male voice; calm, composed, and serious with a grounded presence.` },
      { name: 'James', id: 'M3', key: '8', description: `is a polished, authoritative male voice; confident and trustworthy with strong presentation quality.` },
      { name: 'Kirk', id: 'M4', key: '9', description: `is a soft, neutral-toned male voice; gentle and approachable with a youthful, friendly quality.` },
      { name: 'Matthew', id: 'M5', key: '0', description: `is a warm, soft-spoken male voice; calm and soothing with a natural storytelling quality.` },
    ];
    this.KITTEN_VOICES = [
      { name: 'Bella', id: 'expr-voice-2-f', key: '1', description: 'is an expressive female KittenTTS voice.' },
      { name: 'Jasper', id: 'expr-voice-2-m', key: '2', description: 'is an expressive male KittenTTS voice.' },
      { name: 'Luna', id: 'expr-voice-3-f', key: '3', description: 'is a clear female KittenTTS voice.' },
      { name: 'Bruno', id: 'expr-voice-3-m', key: '4', description: 'is a clear male KittenTTS voice.' },
      { name: 'Rosie', id: 'expr-voice-4-f', key: '5', description: 'is a warm female KittenTTS voice.' },
      { name: 'Hugo', id: 'expr-voice-4-m', key: '6', description: 'is a warm male KittenTTS voice.' },
      { name: 'Kiki', id: 'expr-voice-5-f', key: '7', description: 'is a lively female KittenTTS voice.' },
      { name: 'Leo', id: 'expr-voice-5-m', key: '8', description: 'is a lively male KittenTTS voice.' },
    ];
    this.ttsModel = 'kitten';
    this.VOICES = this.KITTEN_VOICES;

    this.preTakes = [];
    this.currentAudio = null;
    this.audioCache = new Map();
    this.audioPrefetchPromises = new Map();
    this.audioPrefetchQueue = Promise.resolve();
    this.maxAudioCacheSize = 24;

    this.takes = [];
    this.currentTakeIndex = 0;
    this.currentPlayingTakeId = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.isGenerating = false;
    this.currentGeneratingTakeId = null;
    this.abortController = null;
    this.shouldStopSequentialPlayback = false;
    this.isPageReadError = false;
    this.lastPageReadError = null;


    this.selectedVoice = this.VOICES[2];
    this.playbackSpeed = 1.0;
    this.quality = 'Balanced';

    this.loadSettingsAsync().then(() => {
      this.updateAllUIWithSettings();
    });

    this.minSpeed = 0.9;
    this.maxSpeed = 1.4;
    this.speedStep = 0.2;

    this.SPEED_OPTIONS = [
      { speed: 1.4, text: '1.4x' },
      { speed: 1.2, text: '1.2x' },
      { speed: 1.0, text: '1.0x' },
      { speed: 0.9, text: '0.9x' }
    ];

    this.UI_FONT_SIZE = '16px';

    this.isPluginEnabled = true;
    this.takeListVisible = false;
    this.floatingBarVisible = true;
    this.autoScrollEnabled = true;
    this.highlightEnabled = true;
    this.tinyUIEnabled = false;
    this.isMiddleFloating = true;

    this.highlightColorBase = [
      '#d8ccad', '#6789ca',
      '#594743', '#504e49', '#a4a199', '#e5b560',
      '#941e34', '#bc6f25', '#455f54',
    ];
    this.highlightColorIndex = 0;

    this.ttsInitialized = false;
    this.initializedTtsModel = null;
    this.supertonicInitPromise = null;

    this.floatingUI = null;
    this.statusLabel = null;
    this.takeInfoLabel = null;
    this.wordInfoLabel = null;
    this.htmlViewer = null;

    this.currentTakeWordElements = [];
    this.currentTakeWords = [];
    this.elementCache = new WeakMap();
    this.elementMetadata = new WeakSet();

    this.initializeWhenReady();

    this.currentUrl = window.location.href;
    this.setupSPANavigationListener();

    this.currentTheme = 'light';

    createPlayerDock(this);

    this.detectAndApplyTheme();

    this.setupMessageListener();

    this.setupStorageListener();

    this.setupKeyboardShortcuts();

    this.cspRestrictedSites = ['spacex.com', 'www.spacex.com'];

    this.spacebarReservedSites = [
      'youtube.com', 'www.youtube.com', 'm.youtube.com',
      'vimeo.com', 'www.vimeo.com',
      'twitch.tv', 'www.twitch.tv',
      'netflix.com', 'www.netflix.com',
      'dailymotion.com', 'www.dailymotion.com',
      'soundcloud.com', 'www.soundcloud.com'
    ];
    this.useWebAudio = this.isCSPRestrictedSite();
    this.audioContext = null;
    this.currentAudioSource = null;
    this.currentAudioBuffer = null;

    // Warm the offscreen Supertonic runtime as soon as the content script loads.
    this.warmupTTSModel();
  }

  log(...args) {
    if (this.DEBUG_MODE) console.log(...args);
  }

  warn(...args) {
    if (this.DEBUG_MODE) console.warn(...args);
  }

  error(...args) {
    if (this.DEBUG_MODE) console.error(...args);
  }

  isSpacebarReservedSite() {
    const hostname = window.location.hostname.toLowerCase();
    return this.spacebarReservedSites.some(site => hostname.includes(site));
  }

  isCSPRestrictedSite() {
    const hostname = window.location.hostname.toLowerCase();
    return this.cspRestrictedSites.some(site => hostname.includes(site));
  }

  createWebAudioPlayer(audioBuffer) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();

    source.buffer = audioBuffer;
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    const player = {
      _source: source,
      _gainNode: gainNode,
      _audioContext: this.audioContext,
      _startTime: null,
      _pausedTime: 0,
      _isPlaying: false,
      _isPaused: false,
      _duration: audioBuffer.duration,
      _currentTime: 0,
      _playbackRate: 1.0,
      _onloadedmetadata: null,
      _ontimeupdate: null,
      _onended: null,
      _onerror: null,
      _timeUpdateInterval: null,

      get duration() { return this._duration; },
      get currentTime() { return this._currentTime; },
      set currentTime(value) {
        this._pausedTime = Math.max(0, Math.min(value, this._duration));
        if (this._isPlaying && this._startTime !== null) {
          this._startTime = this._audioContext.currentTime - this._pausedTime;
        }
        this._currentTime = this._pausedTime;
      },
      get playbackRate() { return this._playbackRate; },
      set playbackRate(value) {
        this._playbackRate = value;
        if (this._source) {
          this._source.playbackRate.value = value;
        }
      },
      set onloadedmetadata(callback) { this._onloadedmetadata = callback; },
      set ontimeupdate(callback) { this._ontimeupdate = callback; },
      set onended(callback) { this._onended = callback; },
      set onerror(callback) { this._onerror = callback; },

      play() {
        if (this._isPlaying && !this._isPaused) return Promise.resolve();

        if (this._isPaused) {
          this._source = this._audioContext.createBufferSource();
          this._source.buffer = audioBuffer;
          this._source.playbackRate.value = this._playbackRate;
          this._source.connect(this._gainNode);

          this._startTime = this._audioContext.currentTime - this._pausedTime;
          this._source.start(0, this._pausedTime);
        } else {
          this._startTime = this._audioContext.currentTime;
          this._source.start(0);
        }

        this._isPlaying = true;
        this._isPaused = false;

        if (this._onloadedmetadata) {
          setTimeout(() => this._onloadedmetadata(), 0);
        }

        this._timeUpdateInterval = setInterval(() => {
          if (this._isPlaying && !this._isPaused && this._startTime !== null) {
            this._currentTime = this._audioContext.currentTime - this._startTime;
            if (this._currentTime >= this._duration) {
              this._currentTime = this._duration;
              this.pause();
              if (this._onended && !this._isPaused) {
                this._onended();
              }
            } else if (this._ontimeupdate) {
              this._ontimeupdate();
            }
          }
        }, 100);

        this._source.onended = () => {
          if (this._isPaused) {
            return;
          }

          this._isPlaying = false;
          this._isPaused = false;
          this._currentTime = this._duration;
          if (this._timeUpdateInterval) {
            clearInterval(this._timeUpdateInterval);
            this._timeUpdateInterval = null;
          }
          if (this._onended) {
            this._onended();
          }
        };

        return Promise.resolve();
      },

      pause() {
        if (!this._isPlaying || this._isPaused) return;

        if (this._source) {
          this._source.onended = null;
          this._source.stop();
          this._pausedTime = this._currentTime;
        }

        if (this._timeUpdateInterval) {
          clearInterval(this._timeUpdateInterval);
          this._timeUpdateInterval = null;
        }

        this._isPlaying = true;
        this._isPaused = true;
      }
    };

    return player;
  }

  async initializeSupertonic(showErrors = true) {
    return initializeSupertonic(this, showErrors);
  }

  async warmupTTSModel() {
    return warmupTTSModel(this);
  }

  async unloadSupertonic() {
    return unloadSupertonic(this);
  }


  setupKeyboardShortcuts() {
    this.handleSpaceKey = (event) => {
      if (this.isSpacebarReservedSite()) {
        return;
      }

      if (this.isPageReadError) {
        return;
      }

      if (this.isGenerating) {
        return;
      }

      const target = event.target;
      const isTextInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        (target.closest && target.closest('input, textarea, [contenteditable="true"]'));

      if (isTextInput) {
        return;
      }

      if (event.code === 'Space' || event.key === ' ' || event.keyCode === 32) {
        event.preventDefault();
        event.stopPropagation();

        if (this.isPlaying && !this.isPaused) {
          this.pausePlayback();
        }
        else if (this.isPaused) {
          this.resumePlayback();
        }
        else if (this.preTakes && this.preTakes.length > 0) {
          this.startReadingFromFirst();
        }
      }
    };

    document.addEventListener('keydown', this.handleSpaceKey, true);

  }

  // 📨 Send a TTS message to background → offscreen
  sendTTSMessage(action, data = {}) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome?.runtime?.id) {
          reject(new Error('Extension context invalidated'));
          return;
        }
        chrome.runtime.sendMessage({ action, data }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response || { success: false, error: 'no response' });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 🌐 Detect page language from the DOM (for offscreen document which has no DOM access)
  detectPageLanguageForOffscreen() {
    const AVAILABLE_LANGS = ['en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi'];
    try {
      const htmlLang = document.documentElement.lang || document.documentElement.getAttribute('lang');
      if (htmlLang) {
        const langCode = htmlLang.toLowerCase().split('-')[0];
        if (AVAILABLE_LANGS.includes(langCode)) return langCode;
      }
      const metaContentLang = document.querySelector('meta[http-equiv="content-language"]');
      if (metaContentLang) {
        const langCode = metaContentLang.getAttribute('content')?.toLowerCase().split('-')[0];
        if (langCode && AVAILABLE_LANGS.includes(langCode)) return langCode;
      }
      const metaOgLocale = document.querySelector('meta[property="og:locale"]');
      if (metaOgLocale) {
        const langCode = metaOgLocale.getAttribute('content')?.toLowerCase().split('-')[0];
        if (langCode && AVAILABLE_LANGS.includes(langCode)) return langCode;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'toggle') {
        this.togglePlugin(request.iconPosition);
        sendResponse({ success: true, enabled: this.isPluginEnabled });
      } else if (request.action === 'getReaderSettings') {
        sendResponse({
          success: true,
          model: this.ttsModel,
          voiceId: this.selectedVoice?.id,
          speed: this.playbackSpeed,
          pluginEnabled: this.isPluginEnabled,
          floatingBarVisible: this.floatingBarVisible,
          takeListVisible: this.takeListVisible,
          autoScrollEnabled: this.autoScrollEnabled,
          highlightEnabled: this.highlightEnabled,
          highlightColorIndex: this.highlightColorIndex,
        });
      } else if (request.action === 'playSelectedText' && request.text) {
        this.playSelectedText(request.text).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          this.error('Failed to play selected text:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true;
      }
      return true;
    });
  }

  setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync') {
        if (changes['ar-plugin-enabled']) {
          const newEnabled = changes['ar-plugin-enabled'].newValue;
          if (newEnabled !== undefined && newEnabled !== this.isPluginEnabled) {
            this.isPluginEnabled = newEnabled;

            if (newEnabled) {
              this.showUI();
            } else {
              this.applyPluginDisabledEffects();
            }
            this.notifyPluginEnabledStateChanged(newEnabled);
          }
        }

        if (changes['ar-tts-model']) {
          const newModel = this.normalizeTtsModel(changes['ar-tts-model'].newValue);
          if (newModel !== this.ttsModel) {
            this.ttsModel = newModel;
            this.ttsInitialized = false;
            this.initializedTtsModel = null;
            this.applyVoiceCatalogForModel();
            this.loadVoiceSetting().then((voice) => {
              if (voice) {
                this.selectedVoice = voice;
              }
              this.updateVoiceUI();
              this.updateBottomFloatingUIState();
              this.handleExternalVoiceOrSpeedChange('model_change');
            });
          }
        }

        if (changes['ar-voice']) {
          const newVoiceData = changes['ar-voice'].newValue;
          if (newVoiceData) {
            const voice = this.VOICES.find(v => v.id === newVoiceData.id);
            if (voice && voice.id !== this.selectedVoice.id) {
              this.selectedVoice = voice;
              this.updateVoiceUI();
              this.updateBottomFloatingUIState();
              this.handleExternalVoiceOrSpeedChange('voice_change');
            }
          }
        }

        if (changes['ar-speed']) {
          const newSpeed = parseFloat(changes['ar-speed'].newValue);
          if (Number.isFinite(newSpeed) && newSpeed >= this.minSpeed && newSpeed <= this.maxSpeed && newSpeed !== this.playbackSpeed) {
            this.playbackSpeed = newSpeed;
            this.updateSpeedUI();
            this.updateBottomFloatingUIState();
            this.handleExternalVoiceOrSpeedChange('speed_change');
          }
        }

        if (changes['ar-take-list-visible']) {
          const newVisible = changes['ar-take-list-visible'].newValue;
          if (newVisible !== undefined && newVisible !== this.takeListVisible) {
            this.takeListVisible = newVisible;
            if (this.floatingUI && this.isPluginEnabled) {
              this.floatingUI.style.display = newVisible ? 'block' : 'none';
            }
          }
        }

        if (changes['ar-floating-bar-visible']) {
          const newVisible = changes['ar-floating-bar-visible'].newValue;
          if (newVisible !== undefined && newVisible !== this.floatingBarVisible) {
            this.floatingBarVisible = newVisible;
            if (this.bottomFloatingUI && this.isPluginEnabled) {
              this.bottomFloatingUI.style.display = newVisible ? 'block' : 'none';
            }
          }
        }

        if (changes['ar-auto-scroll']) {
          const newEnabled = changes['ar-auto-scroll'].newValue;
          if (newEnabled !== undefined && newEnabled !== this.autoScrollEnabled) {
            this.autoScrollEnabled = newEnabled;
          }
        }

        if (changes['ar-highlight-enabled']) {
          const newEnabled = changes['ar-highlight-enabled'].newValue;
          if (newEnabled !== undefined && newEnabled !== this.highlightEnabled) {
            this.highlightEnabled = newEnabled;
            if (newEnabled) {
              this.applyHighlightColor();
            } else {
              this.removeAllHighlights();
            }
          }
        }

        if (changes['ar-console-log-enabled']) {
          const newEnabled = changes['ar-console-log-enabled'].newValue;
          if (newEnabled !== undefined && newEnabled !== this.DEBUG_MODE) {
            this.DEBUG_MODE = newEnabled;
            this.updateConsoleLogStatus();
          }
        }

        if (changes['ar-highlight-color']) {
          const newIndex = changes['ar-highlight-color'].newValue;
          if (newIndex !== undefined && newIndex !== this.highlightColorIndex) {
            this.highlightColorIndex = newIndex;
            this.applyHighlightColor();
            if (this.floatingOptionsMenu && document.body.contains(this.floatingOptionsMenu)) {
              const highlightOption = this.floatingOptionsMenu.querySelector('[data-highlight-option]');
              if (highlightOption) {
                highlightOption.querySelectorAll('div').forEach((btn, idx) => {
                  const isSelected = idx === newIndex;
                  const existingLabel = btn.querySelector('span');
                  if (existingLabel) {
                    existingLabel.remove();
                  }
                  if (isSelected) {
                    const label = document.createElement('span');
                    label.textContent = 'A';
                    btn.appendChild(label);
      }
    });
  }
            }
          }
        }

        if (changes['ar-tiny-ui']) {
          const newEnabled = changes['ar-tiny-ui'].newValue;
          if (newEnabled !== undefined && newEnabled !== this.tinyUIEnabled) {
            this.tinyUIEnabled = newEnabled;
            this.updateTinyUI();
          }
        }

        if (changes['readerTypographySettings'] && this.isReaderPage()) {
          const newSettings = changes['readerTypographySettings'].newValue;
          if (newSettings && newSettings.darkMode !== undefined) {
            const newTheme = newSettings.darkMode ? 'dark' : 'light';
            if (newTheme !== this.currentTheme) {
              this.currentTheme = newTheme;
              if (this.bottomFloatingUI) {
                this.updateBottomFloatingUITheme();
      }
    }
          }
        }
      }
    });
  }


  togglePlugin(iconPosition = 'top-right') {
    if (this.floatingOptionsMenu && document.body.contains(this.floatingOptionsMenu)) {
      this.removeFloatingOptionsMenu();
    } else {
      this.showFloatingOptionsMenu(iconPosition);
    }
  }

  showFloatingOptionsMenu(iconPosition = 'top-right') {
    this.removeFloatingOptionsMenu();


    const isDark = this.currentTheme === 'dark';
    const bgColor = isDark ? 'rgba(0, 0, 0, 0.9)' : 'rgba(255, 255, 255, 0.95)';
    const textColor = isDark ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d';
    const borderColor = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)';

    const iconOffset = 25;
    const menuPosition = iconPosition === 'top-right' ? {
      top: `${iconOffset}px`,
      right: '20px',
      left: 'auto'
    } : {
      top: `${iconOffset}px`,
      left: '20px',
      right: 'auto'
    };

    this.floatingOptionsMenu = document.createElement('div');
    this.floatingOptionsMenu.id = 'tts-floating-options-menu';
    this.floatingOptionsMenu.style.cssText = `
      position: fixed !important;
      top: ${menuPosition.top} !important;
      left: ${menuPosition.left} !important;
      right: ${menuPosition.right} !important;
      background: ${bgColor} !important;
      color: ${textColor} !important;
      border: 1px solid ${borderColor} !important;
      border-radius: 12px !important;
      padding: 20px !important;
      min-width: 240px !important;
      z-index: 100001 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      font-size: 14px !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
      backdrop-filter: blur(10px) !important;
    `;

    const title = document.createElement('div');
    title.textContent = 'Anything Reader';
    title.style.cssText = `
      font-weight: 600 !important;
      font-size: 16px !important;
      margin-bottom: 16px !important;
      text-align: left !important;
      color: ${textColor} !important;
    `;

    const enableOption = this.createToggleOption(
      'Enable the extension',
      this.isPluginEnabled,
      (enabled) => this.toggleExtensionEnabled(enabled),
      'enable-extension'
    );

    const showFloatingToolbarOption = this.createToggleOption(
      'Floating bar',
      this.isPluginEnabled && this.floatingBarVisible,
      (enabled) => {
        if (this.isPluginEnabled) {
          this.toggleBottomFloatingToolbar(enabled);
        }
      },
      'show-floating-toolbar'
    );

    if (!this.isPluginEnabled) {
      showFloatingToolbarOption.style.opacity = '0.5';
      showFloatingToolbarOption.style.pointerEvents = 'none';
    }

    const autoScrollOption = this.createToggleOption(
      'Auto scroll',
      this.autoScrollEnabled,
      (enabled) => {
        this.autoScrollEnabled = enabled;
        this.saveAutoScrollSetting(enabled);
      },
      'auto-scroll'
    );

    const qualityOption = this.createQualityOption();

    const highlightOption = this.createHighlightOption();
    const highlightEnabledOption = this.createToggleOption(
      'Highlight text',
      this.highlightEnabled,
      (enabled) => {
        this.highlightEnabled = enabled;
        this.saveHighlightEnabledSetting(enabled);
        if (enabled) {
          this.applyHighlightColor();
        } else {
          this.removeAllHighlights();
        }
      },
      'highlight-text'
    );

    const rateOption = document.createElement('div');
    rateOption.style.cssText = `
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      padding: 6px 0 !important;
    `;
    const rateText = document.createElement('span');
    rateText.innerHTML = 'Enjoying Anything Reader? <a href="https://chromewebstore.google.com/detail/mdbiaajonlkomihpcaffhkagodbcgbme?utm_source=item-share-cb" target="_blank" style="color: #227cff; text-decoration: none; cursor: pointer;">Rate us.</a>';
    rateText.style.cssText = `
      color: ${this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d'} !important;
      font-size: 14px !important;
      text-align: left !important;
    `;
    const versionText = document.createElement('span');
    versionText.textContent = 'v3.0.0';
    versionText.style.cssText = `
      color: ${this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d'} !important;
      font-size: 14px !important;
      text-align: right !important;
    `;
    rateOption.appendChild(rateText);
    rateOption.appendChild(versionText);

    const divider = document.createElement('div');
    divider.style.cssText = `
      width: 100% !important;
      height: 1px !important;
      background: ${this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'} !important;
      margin: 4px 0 !important;
    `;

    this.floatingOptionsMenu.appendChild(title);
    this.floatingOptionsMenu.appendChild(enableOption);
    this.floatingOptionsMenu.appendChild(showFloatingToolbarOption);
    this.floatingOptionsMenu.appendChild(autoScrollOption);
    this.floatingOptionsMenu.appendChild(qualityOption);
    this.floatingOptionsMenu.appendChild(highlightEnabledOption);
    this.floatingOptionsMenu.appendChild(highlightOption);

    const tinyUIOption = this.createToggleOption(
      'Tiny interface',
      this.tinyUIEnabled,
      (enabled) => {
        this.tinyUIEnabled = enabled;
        this.saveTinyUISetting(enabled);
        this.updateTinyUI();
      },
      'tiny-ui'
    );

    this.floatingOptionsMenu.appendChild(tinyUIOption);
    this.floatingOptionsMenu.appendChild(divider);
    this.floatingOptionsMenu.appendChild(rateOption);

    // this.floatingOptionsMenu.addEventListener('click', (e) => {
    //   if (e.target === this.floatingOptionsMenu) {
    //     this.removeFloatingOptionsMenu();
    //   }
    // });

    this.handleOutsideClick = (e) => {
      if (this.floatingOptionsMenu && !this.floatingOptionsMenu.contains(e.target)) {
        this.removeFloatingOptionsMenu();
      }
    };

    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick);
    }, 100);


    document.body.appendChild(this.floatingOptionsMenu);


  }

  createToggleOption(label, isEnabled, onChange, optionType = '') {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 6px 0 !important;
    `;

    if (optionType) {
      container.setAttribute('data-option', optionType);
    }

    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    labelElement.style.cssText = `
      color: ${this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d'} !important;
      font-size: 14px !important;
      margin-right: 20px !important;
    `;

    const toggle = document.createElement('div');
    toggle.style.cssText = `
      width: 44px !important;
      height: 24px !important;
      background: ${isEnabled ? '#227cff' : 'rgba(125, 125, 125, 0.3)'} !important;
      border-radius: 12px !important;
      position: relative !important;
      cursor: pointer !important;
      transition: background 0.2s ease !important;
    `;

    const handle = document.createElement('div');
    handle.style.cssText = `
      width: 20px !important;
      height: 20px !important;
      background: white !important;
      border-radius: 50% !important;
      position: absolute !important;
      top: 2px !important;
      left: ${isEnabled ? '22px' : '2px'} !important;
      transition: left 0.2s ease !important;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2) !important;
    `;

    toggle.appendChild(handle);

    let currentState = isEnabled;

    toggle.addEventListener('click', () => {
      const newState = !currentState;
      currentState = newState;
      onChange(newState);

      toggle.style.background = newState ? '#227cff' : 'rgba(125, 125, 125, 0.3)';
      handle.style.left = newState ? '22px' : '2px';
    });

    container.appendChild(labelElement);
    container.appendChild(toggle);

    return container;
  }

  createHighlightOption() {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 6px 0 !important;
    `;

    const labelElement = document.createElement('span');
    labelElement.textContent = 'Highlight';
    labelElement.style.cssText = `
      color: ${this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d'} !important;
      font-size: 14px !important;
      margin-right: 20px !important;
    `;

    const colorContainer = document.createElement('div');
    colorContainer.setAttribute('data-highlight-option', 'true');
    colorContainer.style.cssText = `
      display: flex !important;
      gap: 0 !important;
    `;

    this.highlightColorBase.forEach((baseColor, index) => {
      const colorButton = document.createElement('div');
      const saturationPercent = index === 4 ? 45 : 30;
      const enhancedColor = this.increaseSaturation(baseColor, saturationPercent);
      const rgb = this.hexToRgb(enhancedColor);
      const isSelected = index === this.highlightColorIndex;

      colorButton.style.cssText = `
        width: 16.8px !important;
        height: 24px !important;
        background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1) !important;
        border-bottom: 3px solid ${enhancedColor} !important;
        cursor: pointer !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        position: relative !important;
        box-sizing: border-box !important;
      `;

      if (isSelected) {
        const label = document.createElement('span');
        label.textContent = 'A';
        colorButton.appendChild(label);
      }

      colorButton.addEventListener('click', () => {
        this.saveHighlightColorSetting(index);
        colorContainer.querySelectorAll('div').forEach((btn, idx) => {
          const isSelected = idx === index;
          const existingLabel = btn.querySelector('span');
          if (existingLabel) {
            existingLabel.remove();
          }
          if (isSelected) {
            const label = document.createElement('span');
            label.textContent = 'A';
            btn.appendChild(label);
          }
        });
      });

      colorContainer.appendChild(colorButton);
    });

    container.appendChild(labelElement);
    container.appendChild(colorContainer);
    return container;
  }

  createQualityOption() {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
      padding: 6px 0 !important;
    `;

    const labelElement = document.createElement('span');
    labelElement.textContent = 'Gen mode';
    labelElement.style.cssText = `
      color: ${this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d'} !important;
      font-size: 14px !important;
      margin-right: 20px !important;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex !important;
      gap: 0 !important;
    `;

    const options = [
      { value: 'Fast', step: 5 },
      { value: 'Balanced', step: 8 },
      { value: 'Quality', step: 15 }
    ];

    const borderColor = this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';

    const buttons = [];
    const updateButtonStyles = () => {
      options.forEach((opt, index) => {
        const btn = buttons[index];
        if (btn) {
          btn.style.background = this.quality === opt.value ? '#227cff' : 'transparent';
          btn.style.color = this.quality === opt.value ? 'white' : (this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d');
          btn.style.fontWeight = this.quality === opt.value ? '600' : 'normal';
        }
      });
    };

    options.forEach((option, index) => {
      const button = document.createElement('button');
      button.textContent = option.value;

      const isFirst = index === 0;
      const isLast = index === options.length - 1;
      const borderRadius = isFirst ? '4px 0 0 4px' : (isLast ? '0 4px 4px 0' : '0');
      const borderLeft = isFirst ? `1px solid ${borderColor}` : 'none';
      const borderRight = `1px solid ${borderColor}`;
      const borderTop = `1px solid ${borderColor}`;
      const borderBottom = `1px solid ${borderColor}`;

      button.style.cssText = `
        padding: 4px 8px !important;
        font-size: 12px !important;
        border-left: ${borderLeft} !important;
        border-right: ${borderRight} !important;
        border-top: ${borderTop} !important;
        border-bottom: ${borderBottom} !important;
        border-radius: ${borderRadius} !important;
        background: ${this.quality === option.value ? '#227cff' : 'transparent'} !important;
        color: ${this.quality === option.value ? 'white' : (this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d')} !important;
        cursor: pointer !important;
        transition: all 0.2s ease !important;
        margin-left: ${isFirst ? '0' : '-1px'} !important;
      `;

      if (this.quality === option.value) {
        button.style.fontWeight = '600';
      }

      button.addEventListener('click', async () => {
        const oldQuality = this.quality;
        this.quality = option.value;
        updateButtonStyles();

        this.saveQualitySetting(option.value);

        if (oldQuality !== option.value && (this.isPlaying || this.currentPlayingTakeId)) {
          const savedTakeIndex = this.currentTakeIndex;
          const savedPlayList = this.currentPlayList ? [...this.currentPlayList] : null;

          this.stopAll();

          if (savedPlayList && savedTakeIndex >= 0 && savedTakeIndex < savedPlayList.length) {

            this.currentPlayList = savedPlayList;

            setTimeout(async () => {
              try {
                await this.playTakeAtIndex(savedTakeIndex);
              } catch (error) {
                this.error('Playback failed after quality change:', error);
              }
            }, 100);
          }
        }
      });

      button.setAttribute('data-value', option.value);
      buttons.push(button);
      buttonContainer.appendChild(button);
    });

    container.appendChild(labelElement);
    container.appendChild(buttonContainer);

    return container;
  }

  /**
   */
  applyPluginDisabledEffects() {
    this.stopAll();
    if (this.ttsInitialized) {
      this.unloadSupertonic();
    }
    this.hideUI();
    if (this.bottomFloatingUI) {
      this.bottomFloatingUI.style.display = 'none';
    }
    this.hideTakeHoverIcon();
    this.removeAllHighlights();
    if (this.floatingUI) {
      this.floatingUI.style.display = 'none';
    }
  }

  /**
   */
  notifyPluginEnabledStateChanged(enabled) {
    chrome.runtime.sendMessage({
      action: 'updateIcon',
      enabled: this.isPluginEnabled
    });

    if (this.floatingOptionsMenu) {
      const showFloatingToolbarOption = this.floatingOptionsMenu.querySelector('[data-option="show-floating-toolbar"]');
      if (showFloatingToolbarOption) {
        if (!enabled) {
          showFloatingToolbarOption.style.opacity = '0.5';
          showFloatingToolbarOption.style.pointerEvents = 'none';
        } else {
          showFloatingToolbarOption.style.opacity = '1';
          showFloatingToolbarOption.style.pointerEvents = 'auto';

          const toggle = showFloatingToolbarOption.children[1];
          if (toggle && toggle.children.length > 0) {
            const handle = toggle.children[0];
            const isVisible = this.floatingBarVisible;
            toggle.style.background = isVisible ? '#227cff' : 'rgba(125, 125, 125, 0.3)';
            handle.style.left = isVisible ? '22px' : '2px';
          }
        }
      }
    }
  }

  toggleExtensionEnabled(enabled) {
    this.isPluginEnabled = enabled;

    this.savePluginEnabledSetting(enabled);

    if (enabled) {
      if (!this.floatingBarVisible) {
        this.floatingBarVisible = true;
        this.saveFloatingBarVisibilitySetting(true);
      }

      this.showUI();
      if (this.bottomFloatingUI) {
        this.bottomFloatingUI.style.display = 'block';
      }

      if (!this.ttsInitialized) {
        this.initializeSupertonic();
      }
    } else {
      this.applyPluginDisabledEffects();
    }

    this.notifyPluginEnabledStateChanged(enabled);
  }

  toggleTakeListVisibility(enabled) {
    this.takeListVisible = enabled;

    if (this.floatingUI) {
      this.floatingUI.style.display = enabled ? 'block' : 'none';
    }

    this.saveTakeListVisibilitySetting(enabled);
  }

  toggleBottomFloatingToolbar(enabled) {
    this.floatingBarVisible = enabled;

    if (this.bottomFloatingUI) {
      this.bottomFloatingUI.style.display = enabled ? 'block' : 'none';
    }

    this.saveFloatingBarVisibilitySetting(enabled);
  }

  toggleConsoleLog(enabled) {
    this.DEBUG_MODE = enabled;

    if (window.htmlAnalyzerCommon) {
      window.htmlAnalyzerCommon.DEBUG_MODE = enabled;
    }
    if (window.htmlAnalyzerSites) {
      window.htmlAnalyzerSites.DEBUG_MODE = enabled;
    }

    this.updateConsoleLogStatus();

    this.saveConsoleLogSetting(enabled);

  }

  removeFloatingOptionsMenu() {
        if (this.floatingOptionsMenu) {
          this.floatingOptionsMenu.remove();
          this.floatingOptionsMenu = null;
    }

    document.removeEventListener('click', this.handleOutsideClick);
  }

  removeAllHighlights() {
    const existingHighlights = document.querySelectorAll('.tts-current-word-appjs');
    existingHighlights.forEach(highlight => {
      if (highlight && highlight.classList) {
        highlight.classList.remove('tts-current-word-appjs');
      }
    });

    const overlayHighlight = document.getElementById('tts-overlay-highlight');
    if (overlayHighlight) {
      overlayHighlight.remove();
    }

    this.hideTakeHoverIcon();

    // this.removeFloatingOptionsMenu();
  }


  async savePluginEnabledSetting(enabled) {
    try {
      await chrome.storage.sync.set({ 'ar-plugin-enabled': enabled });

              localStorage.setItem('ar-plugin-enabled', JSON.stringify(enabled));
    } catch (error) {
      this.warn('Failed to save extension enabled setting:', error);
      try {
        localStorage.setItem('ar-plugin-enabled', JSON.stringify(enabled));
      } catch (localError) {
        this.error('localStorage backup also failed:', localError);
      }
    }
  }

  async saveTakeListVisibilitySetting(enabled) {
    try {
      await chrome.storage.sync.set({ 'ar-take-list-visible': enabled });

              localStorage.setItem('ar-take-list-visible', JSON.stringify(enabled));
    } catch (error) {
      this.warn('Failed to save take list visibility setting:', error);
      try {
        localStorage.setItem('ar-take-list-visible', JSON.stringify(enabled));
      } catch (localError) {
        this.error('localStorage backup also failed:', localError);
      }
    }
  }

  rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s * 100, l * 100];
  }

  hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  increaseSaturation(hex, percent = 30) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const [h, s, l] = this.rgbToHsl(r, g, b);
    const newS = Math.min(100, s + percent);
    const [nr, ng, nb] = this.hslToRgb(h, newS, l);
    return `#${[nr, ng, nb].map(x => x.toString(16).padStart(2, '0')).join('')}`;
  }

  getHighlightColor() {
    const saturationPercent = this.highlightColorIndex === 4 ? 45 : 30;
    return this.increaseSaturation(this.highlightColorBase[this.highlightColorIndex], saturationPercent);
  }

  async saveAutoScrollSetting(enabled) {
    try {
      await chrome.storage.sync.set({ 'ar-auto-scroll': enabled });
      localStorage.setItem('ar-auto-scroll', JSON.stringify(enabled));
    } catch (error) {
      this.warn('Failed to save auto scroll setting:', error);
      try {
        localStorage.setItem('ar-auto-scroll', JSON.stringify(enabled));
      } catch (localError) {
        this.error('localStorage backup also failed:', localError);
      }
    }
  }

  async saveHighlightEnabledSetting(enabled) {
    try {
      await chrome.storage.sync.set({ 'ar-highlight-enabled': enabled });
      localStorage.setItem('ar-highlight-enabled', JSON.stringify(enabled));
    } catch (error) {
      this.warn('Failed to save highlight enabled setting:', error);
      try {
        localStorage.setItem('ar-highlight-enabled', JSON.stringify(enabled));
      } catch (localError) {
        this.error('localStorage backup also failed:', localError);
      }
    }
  }

  async saveHighlightColorSetting(index) {
    try {
      await chrome.storage.sync.set({ 'ar-highlight-color': index });
      localStorage.setItem('ar-highlight-color', JSON.stringify(index));
      this.highlightColorIndex = index;
      this.applyHighlightColor();
    } catch (error) {
      this.warn('Failed to save highlight color setting:', error);
      try {
        localStorage.setItem('ar-highlight-color', JSON.stringify(index));
        this.highlightColorIndex = index;
        this.applyHighlightColor();
      } catch (localError) {
        this.error('localStorage backup also failed:', localError);
      }
    }
  }

  async loadHighlightEnabledSetting() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        return new Promise((resolve) => {
          chrome.storage.sync.get(['ar-highlight-enabled'], (result) => {
            if (result['ar-highlight-enabled'] !== undefined) {
              resolve(result['ar-highlight-enabled']);
            } else {
              try {
                const localEnabled = localStorage.getItem('ar-highlight-enabled');
                resolve(localEnabled !== null ? JSON.parse(localEnabled) : true);
              } catch (error) {
                resolve(true);
              }
            }
          });
        });
      }
    } catch (error) {
      this.warn('Failed to load highlight enabled setting:', error);
      try {
        const localEnabled = localStorage.getItem('ar-highlight-enabled');
        if (localEnabled !== null) {
          return JSON.parse(localEnabled);
        }
      } catch (localError) {
        this.warn('Failed to load highlight enabled from localStorage:', localError);
      }
    }

    return true;
  }

  async loadHighlightColorSetting() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        return new Promise((resolve) => {
          chrome.storage.sync.get(['ar-highlight-color'], (result) => {
            if (result['ar-highlight-color'] !== undefined) {
              const index = result['ar-highlight-color'];
              resolve(index);
            } else {
              try {
                const localIndex = localStorage.getItem('ar-highlight-color');
                if (localIndex !== null) {
                  resolve(JSON.parse(localIndex));
                } else {
                  resolve(0);
                }
              } catch (error) {
                resolve(0);
              }
            }
          });
        });
      }
    } catch (error) {
      this.warn('Failed to load from Chrome storage, falling back to localStorage:', error);
      try {
        const localIndex = localStorage.getItem('ar-highlight-color');
        if (localIndex !== null) {
          return JSON.parse(localIndex);
        }
      } catch (localError) {
        this.warn('Failed to load from localStorage as well:', localError);
      }
      return 0;
    }
  }

  applyHighlightColor() {
    if (!this.highlightEnabled) {
      this.removeAllHighlights();
      return;
    }

    const color = this.getHighlightColor();
    const rgb = this.hexToRgb(color);

    let style = document.getElementById('tts-highlight-color-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tts-highlight-color-style';
      document.head.appendChild(style);
    }

    style.textContent = `
      .tts-current-word-appjs {
        text-decoration-color: ${color} !important;
      }
      #tts-overlay-highlight {
        background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1) !important;
        border-bottom-color: ${color} !important;
      }
      .tts-icon-white {
        fill: #fff !important;
      }
      .tts-icon-blue {
        fill: ${color} !important;
      }
    `;

    if (this.overlayHighlight) {
      const rgb = this.hexToRgb(color);
      this.overlayHighlight.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
      this.overlayHighlight.style.borderBottomColor = color;
    }
  }

  hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  async loadAutoScrollSetting() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        return new Promise((resolve) => {
          chrome.storage.sync.get(['ar-auto-scroll'], (result) => {
            if (result['ar-auto-scroll'] !== undefined) {
              const enabled = result['ar-auto-scroll'];
              resolve(enabled);
            } else {
              try {
                const localEnabled = localStorage.getItem('ar-auto-scroll');
                if (localEnabled !== null) {
                  resolve(JSON.parse(localEnabled));
                } else {
                  resolve(true);
                }
              } catch (e) {
                resolve(true);
              }
            }
          });
        });
      } else {
        try {
          const localEnabled = localStorage.getItem('ar-auto-scroll');
          if (localEnabled !== null) {
            return JSON.parse(localEnabled);
          }
        } catch (e) {
        }
        return true;
      }
    } catch (error) {
      this.warn('Failed to load auto scroll setting:', error);
      try {
        const localEnabled = localStorage.getItem('ar-auto-scroll');
        if (localEnabled !== null) {
          return JSON.parse(localEnabled);
        }
      } catch (e) {
      }
      return true;
    }
  }

  async saveTinyUISetting(enabled) {
    try {
      await chrome.storage.sync.set({ 'ar-tiny-ui': enabled });
      localStorage.setItem('ar-tiny-ui', JSON.stringify(enabled));
    } catch (error) {
      this.warn('Failed to save Tiny UI setting:', error);
      try {
        localStorage.setItem('ar-tiny-ui', JSON.stringify(enabled));
      } catch (localError) {
        this.error('localStorage backup also failed:', localError);
      }
    }
  }

  async loadTinyUISetting() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        return new Promise((resolve) => {
          chrome.storage.sync.get(['ar-tiny-ui'], (result) => {
            if (result['ar-tiny-ui'] !== undefined) {
              resolve(result['ar-tiny-ui']);
            } else {
              try {
                const localEnabled = localStorage.getItem('ar-tiny-ui');
                resolve(localEnabled !== null ? JSON.parse(localEnabled) : false);
              } catch (error) {
                resolve(false);
              }
            }
          });
        });
      }
    } catch (error) {
      this.warn('Failed to load from Chrome storage, falling back to localStorage:', error);
      try {
        const localEnabled = localStorage.getItem('ar-tiny-ui');
        return localEnabled !== null ? JSON.parse(localEnabled) : false;
      } catch (localError) {
        this.warn('Failed to load from localStorage as well:', localError);
      }
      return false;
    }
  }

  restoreInfoElementsForSnap() {
    if (this.isPageReadError) {
      this.updatePageReadError();
    } else {
      this.updateBottomFloatingUIState();
    }
  }

  applyTinyUI() {
    if (this.isPageReadError) {
      this.updatePageReadError();
    } else {
      this.updateBottomFloatingUIState();
    }
  }

  restoreTinyUI() {
    if (this.isPageReadError) {
      this.updatePageReadError();
    } else {
      this.updateBottomFloatingUIState();
    }
  }

  updateTinyUI() {
    if (!this.bottomFloatingUI) return;
    this.isMiddleFloating = true;
    this.updateBottomFloatingUIState();
  }

  async saveFloatingBarVisibilitySetting(enabled) {
    try {
      await chrome.storage.sync.set({ 'ar-floating-bar-visible': enabled });

              localStorage.setItem('ar-floating-bar-visible', JSON.stringify(enabled));
    } catch (error) {
      this.warn('Failed to save floating bar visibility setting:', error);
      try {
        localStorage.setItem('ar-floating-bar-visible', JSON.stringify(enabled));
      } catch (localError) {
        this.error('localStorage backup also failed:', localError);
      }
    }
  }

  getFloatingBarState() {
    return getPlayerDockState(this);
  }

  async saveFloatingBarState() {
    return savePlayerDockState(this);
  }

  async loadFloatingBarState() {
    return loadPlayerDockState(this);
  }

  restoreFloatingBarState(state) {
    return restorePlayerDockState(this, state);
  }

  async saveConsoleLogSetting(enabled) {
    try {
      await chrome.storage.sync.set({ 'ar-console-log-enabled': enabled });

              localStorage.setItem('ar-console-log-enabled', JSON.stringify(enabled));
    } catch (error) {
      this.warn('Failed to save console logging setting:', error);
      try {
        localStorage.setItem('ar-console-log-enabled', JSON.stringify(enabled));
      } catch (localError) {
        this.error('localStorage backup also failed:', localError);
      }
    }
  }

  async saveVoiceSetting(voice) {
    try {
      const voiceData = {
        id: voice.id,
        name: voice.name,
        key: voice.key || null,
        isCustom: voice.isCustom || false,
        isTemp: voice.isTemp || false
      };

      await chrome.storage.sync.set({ 'ar-voice': voiceData });

      localStorage.setItem('ar-voice', JSON.stringify(voiceData));
    } catch (error) {
      this.warn('Failed to save voice setting:', error);
      try {
        localStorage.setItem('ar-voice', JSON.stringify({
          id: voice.id,
          name: voice.name,
          key: voice.key || null,
          isCustom: voice.isCustom || false,
          isTemp: voice.isTemp || false
        }));
      } catch (localError) {
        this.error('localStorage backup also failed:', localError);
      }
    }
  }

  async saveTtsModelSetting(model) {
    try {
      await chrome.storage.sync.set({ 'ar-tts-model': model });
      localStorage.setItem('ar-tts-model', JSON.stringify(model));
    } catch (error) {
      this.warn('Failed to save TTS model setting:', error);
      try {
        localStorage.setItem('ar-tts-model', JSON.stringify(model));
      } catch (localError) {
        this.error('localStorage backup also failed:', localError);
      }
    }
  }

  async loadPluginEnabledSetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(['ar-plugin-enabled'], (result) => {
          if (result['ar-plugin-enabled'] !== undefined) {
            const enabled = result['ar-plugin-enabled'];
            resolve(enabled);
            return;
          }

          try {
            const localEnabled = localStorage.getItem('ar-plugin-enabled');
            if (localEnabled !== null) {
              const enabled = JSON.parse(localEnabled);
              resolve(enabled);
              return;
            }
          } catch (error) {
            this.warn('Failed to load from localStorage as well:', error);
          }

          resolve(true);
        });
      } catch (error) {
        this.warn('Failed to load from Chrome storage, falling back to localStorage:', error);

        try {
          const localEnabled = localStorage.getItem('ar-plugin-enabled');
          if (localEnabled !== null) {
            const enabled = JSON.parse(localEnabled);
            resolve(enabled);
            return;
          }
        } catch (localError) {
          this.warn('Failed to load from localStorage as well:', localError);
        }

        resolve(true);
      }
    });
  }

  async loadTakeListVisibilitySetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(['ar-take-list-visible'], (result) => {
          if (result['ar-take-list-visible'] !== undefined) {
            const enabled = result['ar-take-list-visible'];
            resolve(enabled);
            return;
          }

          try {
            const localEnabled = localStorage.getItem('ar-take-list-visible');
            if (localEnabled !== null) {
              const enabled = JSON.parse(localEnabled);
              resolve(enabled);
              return;
            }
          } catch (error) {
            this.warn('Failed to load from localStorage as well:', error);
          }

          resolve(false);
        });
      } catch (error) {
        this.warn('Failed to load from Chrome storage, falling back to localStorage:', error);

        try {
          const localEnabled = localStorage.getItem('ar-take-list-visible');
          if (localEnabled !== null) {
            const enabled = JSON.parse(localEnabled);
            resolve(enabled);
            return;
          }
        } catch (localError) {
          this.warn('Failed to load from localStorage as well:', localError);
        }

        resolve(false);
      }
    });
  }

  async loadFloatingBarVisibilitySetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(['ar-floating-bar-visible'], (result) => {
          if (result['ar-floating-bar-visible'] !== undefined) {
            const enabled = result['ar-floating-bar-visible'];
            resolve(enabled);
            return;
          }

          try {
            const localEnabled = localStorage.getItem('ar-floating-bar-visible');
            if (localEnabled !== null) {
              const enabled = JSON.parse(localEnabled);
              resolve(enabled);
              return;
            }
          } catch (error) {
            this.warn('Failed to load from localStorage as well:', error);
          }

          resolve(true);
        });
      } catch (error) {
        this.warn('Failed to load from Chrome storage, falling back to localStorage:', error);

        try {
          const localEnabled = localStorage.getItem('ar-floating-bar-visible');
          if (localEnabled !== null) {
            const enabled = JSON.parse(localEnabled);
            resolve(enabled);
            return;
          }
        } catch (localError) {
          this.warn('Failed to load from localStorage as well:', localError);
        }

        resolve(true);
      }
    });
  }

  async loadConsoleLogSetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(['ar-console-log-enabled'], (result) => {
          if (result['ar-console-log-enabled'] !== undefined) {
            const enabled = result['ar-console-log-enabled'];
            resolve(enabled);
            return;
          }

          try {
            const localEnabled = localStorage.getItem('ar-console-log-enabled');
            if (localEnabled !== null) {
              const enabled = JSON.parse(localEnabled);
              resolve(enabled);
              return;
            }
          } catch (error) {
            this.warn('Failed to load from localStorage as well:', error);
          }

          resolve(false);
        });
      } catch (error) {
        this.warn('Failed to load from Chrome storage, falling back to localStorage:', error);

        try {
          const localEnabled = localStorage.getItem('ar-console-log-enabled');
          if (localEnabled !== null) {
            const enabled = JSON.parse(localEnabled);
            resolve(enabled);
            return;
          }
        } catch (localError) {
          this.warn('Failed to load from localStorage as well:', localError);
        }

        resolve(false);
      }
    });
  }

  async loadVoiceSetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(['ar-voice'], (result) => {
          if (result['ar-voice']) {
            const voiceData = result['ar-voice'];

            const voice = this.VOICES.find(v => v.id === voiceData.id);

            if (voice) {
              resolve(voice);
              return;
            }
          }

          try {
            const saved = localStorage.getItem('ar-voice');
            if (saved) {
              const voiceData = JSON.parse(saved);

              const voice = this.VOICES.find(v => v.id === voiceData.id);

              if (voice) {
                chrome.storage.sync.set({ 'ar-voice': voiceData }).catch(() => {});
                resolve(voice);
                return;
              }
            }
          } catch (error) {
            this.warn('Failed to load from localStorage as well:', error);
          }

          resolve(this.getDefaultVoiceForModel());
        });
      } catch (error) {
        this.warn('Failed to load from Chrome storage, falling back to localStorage:', error);
        resolve(this.getDefaultVoiceForModel());
      }
    });
  }

  async loadTtsModelSetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(['ar-tts-model'], (result) => {
          if (result['ar-tts-model']) {
            resolve(this.normalizeTtsModel(result['ar-tts-model']));
            return;
          }

          try {
            const saved = localStorage.getItem('ar-tts-model');
            if (saved) {
              resolve(this.normalizeTtsModel(JSON.parse(saved)));
              return;
            }
          } catch (error) {
            this.warn('Failed to load TTS model from localStorage:', error);
          }

          resolve('kitten');
        });
      } catch (error) {
        this.warn('Failed to load TTS model setting:', error);
        resolve('kitten');
      }
    });
  }

  normalizeTtsModel(model) {
    return model === 'supertonic' ? 'supertonic' : 'kitten';
  }

  applyVoiceCatalogForModel() {
    this.VOICES = this.ttsModel === 'supertonic' ? this.SUPERTONIC_VOICES : this.KITTEN_VOICES;
  }

  getDefaultVoiceForModel() {
    return this.ttsModel === 'supertonic' ? this.SUPERTONIC_VOICES[2] : this.KITTEN_VOICES[2];
  }

  async saveSpeedSetting(speed) {
    try {
      await chrome.storage.sync.set({ 'ar-speed': speed });

              localStorage.setItem('ar-speed', speed.toString());
    } catch (error) {
      this.warn('Failed to save speed setting:', error);
      try {
        localStorage.setItem('ar-speed', speed.toString());
      } catch (localError) {
        this.error('Failed to save speed to localStorage as well:', localError);
      }
    }
  }

  async loadSpeedSetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(['ar-speed'], (result) => {
          if (result['ar-speed']) {
            const speed = parseFloat(result['ar-speed']);
            if (speed >= this.minSpeed && speed <= this.maxSpeed) {
              resolve(speed);
              return;
            }
          }

          try {
            const saved = localStorage.getItem('ar-speed');
            if (saved) {
              const speed = parseFloat(saved);
              if (speed >= this.minSpeed && speed <= this.maxSpeed) {
                chrome.storage.sync.set({ 'ar-speed': speed }).catch(() => {});
                resolve(speed);
                return;
              }
            }
          } catch (error) {
            this.warn('Failed to load speed from localStorage as well:', error);
          }

          resolve(1.2);
        });
      } catch (error) {
        this.warn('Failed to load speed from Chrome storage, falling back to localStorage:', error);
        resolve(1.2);
      }
    });
  }

  async saveQualitySetting(quality) {
    try {
      await chrome.storage.sync.set({ 'ar-quality': quality });

      localStorage.setItem('ar-quality', quality);
    } catch (error) {
      this.warn('Failed to save quality setting:', error);
      try {
        localStorage.setItem('ar-quality', quality);
      } catch (localError) {
        this.error('Failed to save quality to localStorage as well:', localError);
      }
    }
  }

  async loadQualitySetting() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(['ar-quality'], (result) => {
          if (result['ar-quality']) {
            let quality = result['ar-quality'];
            if (quality === 'Normal') {
              quality = 'Balanced';
              chrome.storage.sync.set({ 'ar-quality': 'Balanced' }).catch(() => {});
            }
            if (['Fast', 'Balanced', 'Quality'].includes(quality)) {
              resolve(quality);
              return;
            }
          }

          try {
            let saved = localStorage.getItem('ar-quality');
            if (saved === 'Normal') {
              saved = 'Balanced';
              localStorage.setItem('ar-quality', 'Balanced');
              chrome.storage.sync.set({ 'ar-quality': 'Balanced' }).catch(() => {});
            }
            if (saved && ['Fast', 'Balanced', 'Quality'].includes(saved)) {
              chrome.storage.sync.set({ 'ar-quality': saved }).catch(() => {});
              resolve(saved);
              return;
            }
          } catch (error) {
            this.warn('Failed to load quality from localStorage as well:', error);
          }

          resolve('Balanced');
        });
      } catch (error) {
        this.warn('Failed to load quality from Chrome storage, falling back to localStorage:', error);
        resolve('Balanced');
      }
    });
  }

  async loadSettingsAsync() {
    try {
      let settingsChanged = false;

      const pluginEnabled = await this.loadPluginEnabledSetting();
      if (pluginEnabled !== this.isPluginEnabled) {
        this.isPluginEnabled = pluginEnabled;
        settingsChanged = true;
      }

      const model = await this.loadTtsModelSetting();
      if (model !== this.ttsModel) {
        this.ttsModel = model;
        this.ttsInitialized = false;
        this.initializedTtsModel = null;
        this.applyVoiceCatalogForModel();
        settingsChanged = true;
      }

      const voice = await this.loadVoiceSetting();
      if (voice && voice.id !== this.selectedVoice.id) {
        this.selectedVoice = voice;
        settingsChanged = true;
      }

      const speed = await this.loadSpeedSetting();
      if (speed !== this.playbackSpeed) {
        this.playbackSpeed = speed;
        settingsChanged = true;
      }

      this.takeListVisible = await this.loadTakeListVisibilitySetting();

      this.floatingBarVisible = await this.loadFloatingBarVisibilitySetting();

      this.autoScrollEnabled = await this.loadAutoScrollSetting();

      this.highlightEnabled = await this.loadHighlightEnabledSetting();

      const tinyUIEnabled = await this.loadTinyUISetting();
      if (tinyUIEnabled !== undefined) {
        this.tinyUIEnabled = tinyUIEnabled;
        if (this.bottomFloatingUI) {
          this.updateTinyUI();
        }
      }

      const highlightColorIndex = await this.loadHighlightColorSetting();
      if (highlightColorIndex !== undefined) {
        this.highlightColorIndex = highlightColorIndex;
        this.applyHighlightColor();
      } else {
        this.applyHighlightColor();
      }

      const consoleLogEnabled = await this.loadConsoleLogSetting();
      if (consoleLogEnabled !== this.DEBUG_MODE) {
        this.DEBUG_MODE = consoleLogEnabled;
        settingsChanged = true;
      }

      const quality = await this.loadQualitySetting();
      if (quality !== this.quality) {
        this.quality = quality;
        settingsChanged = true;
      }

      return settingsChanged;
    } catch (error) {
      this.warn('Error while loading settings:', error);
      return false;
    }
  }

  updateVoiceUI() {
    if (this.voiceLabel) {
      this.voiceLabel.textContent = `🎵 Voice: ${this.selectedVoice.name}`;
    }
    this.updateBottomFloatingUIState();
  }

  updateSpeedUI() {
    this.updateBottomFloatingUIState();
  }

  handleExternalVoiceOrSpeedChange(context = 'voice_change') {
    if (!this.isPlaying && !this.isPaused) {
      return;
    }

    this.clearAllAudio();
    this.handleVoiceOrSpeedChange(context).catch((error) => {
      this.warn('Failed to apply voice or speed change:', error);
    });
  }

  updateAllUIWithSettings() {

    if (this.isPluginEnabled) {
      this.showUI();

      if (!this.ttsInitialized) {
        this.initializeSupertonic();
      }

      this.updateConsoleLogStatus();
    } else {
      this.applyPluginDisabledEffects();
    }

    chrome.runtime.sendMessage({
      action: 'updateIcon',
      enabled: this.isPluginEnabled
    });

    this.updateBottomFloatingUIState();

    this.updateVoiceUI();
    this.updateSpeedUI();

    this.updateConsoleLogStatus();

  }

  setupSPANavigationListener() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    const self = this;

    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      self.handleURLChange();
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      self.handleURLChange();
    };

    window.addEventListener('popstate', () => {
      this.handleURLChange();
    });

    this.urlCheckInterval = setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== this.currentUrl) {
        this.handleURLChange();
      }
    }, 1000);
  }

  handleURLChange() {
    const newUrl = window.location.href;

    if (newUrl === this.currentUrl) {
      return;
    }

    this.log('🔄 URL change detected:', this.currentUrl, '->', newUrl);

    this.currentUrl = newUrl;

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }

    this.stopWordTracking();
    this.unwrapWords();

    this.isPlaying = false;
    this.isPaused = false;
    this.isGenerating = false;
    this.currentGeneratingTakeId = null;
    this.currentTakeIndex = 0;
    this.currentTakeWordElements = [];
    this.currentTakeWords = [];

    this.lastTakeEndPosition = undefined;
    this.cachedContainer = null;

    this.takes = [];
    this.preTakes = [];

    this.updateBottomFloatingUIState();
    this.updateProgress(0);

    setTimeout(() => {
      this.initializeWhenReady();
    }, 300);
  }

  async initializeWhenReady() {
    this.suppressSiteSpecificConsoleWarnings();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.tryInitializeAtOptimalTiming());
    } else if (document.readyState === 'interactive') {
      setTimeout(() => this.tryInitializeAtOptimalTiming(), 200);
    } else {
      setTimeout(() => this.tryInitializeAtOptimalTiming(), 100);
    }
  }

  safeGetComputedStyle(element) {
    if (!element) return null;
    try {
      const style = window.getComputedStyle(element);
      return style || null;
    } catch (error) {
      return null;
    }
  }

  safeGetBoundingClientRect(element) {
    try {
      return element.getBoundingClientRect();
    } catch (error) {
      return null;
    }
  }

  safeElementFromPoint(x, y) {
    try {
      return document.elementFromPoint(x, y);
    } catch (error) {
      return null;
    }
  }

  suppressSiteSpecificConsoleWarnings() {
    const originalWarn = console.warn;
    const originalError = console.error;

    const suppressedPatterns = [
      /preload.*is found, but is not used because the request credentials mode does not match/i,
      /Consider taking a look at crossorigin attribute/i,
      /A preload for.*is found, but is not used/i,
      /credentials mode does not match/i,
      /preload.*credentials mode/i,
      /preload.*crossorigin/i,
      /A preload for.*\.woff2.*is found, but is not used/i,
      /A preload for.*\.woff.*is found, but is not used/i,
      /A preload for.*\.woff2/i,
      /A preload for.*\.woff/i,
      /\.woff2.*credentials mode does not match/i,
      /\.woff.*credentials mode does not match/i,
      /^A preload for/i,
      /is found, but is not used.*credentials/i,
      /is found, but is not used.*crossorigin/i,
      /request credentials mode/i,

      /Access to.*has been blocked by CORS policy/i,
      /CORS policy/i,
      /Cross-Origin Request Blocked/i,

      /Failed to load resource:.*404/i,
      /Failed to load resource:.*403/i,
      /Failed to load resource:.*the server responded with a status of/i,
      /net::ERR_FAILED/i,
      /net::ERR_BLOCKED_BY_CLIENT/i,
      /net::ERR_ABORTED/i,

      /Content Security Policy/i,
      /CSP.*violation/i,
      /Refused to.*because it violates.*Content Security Policy/i,

      /Mixed Content/i,
      /HTTPS.*HTTP/i,

      /deprecated/i,
      /is deprecated/i,
      /will be removed/i,

      /third.*party.*cookie/i,
      /SameSite.*cookie/i,
      /cookie.*SameSite/i,

      /source map/i,
      /SourceMap/i,
      /\.map.*404/i,

      /Extension context invalidated/i,
      /message port closed/i,

      /Network request failed/i,
      /NetworkError/i,
      /Load failed/i,

      /React DevTools/i,
      /Download the React DevTools/i,

      /Lighthouse/i,

      /ServiceWorker.*registration failed/i,
      /Service worker registration/i,

      /Manifest.*property/i,

      /cookie.*was rejected/i,
      /cookie.*domain/i,
      /Set-Cookie.*was blocked/i,

      /tracking/i,
      /analytics/i,
      /gtag/i,
      /ga\(/i,

      /ad.*block/i,
      /adblock/i,

      /Non-Error promise rejection/i,
      /Uncaught.*in promise/i,
      /Unhandled promise rejection/i,
      /ResizeObserver loop/i,
      /ResizeObserver.*limit exceeded/i
    ];

    const shouldSuppress = (message) => {
      if (!message) return false;
      const messageStr = typeof message === 'string' ? message : String(message);
      return suppressedPatterns.some(pattern => pattern.test(messageStr));
    };

    console.warn = function(...args) {
      const message = args.map(arg => typeof arg === 'string' ? arg : String(arg)).join(' ');
      if (shouldSuppress(message)) {
        return;
      }
      originalWarn.apply(console, args);
    };

    console.error = function(...args) {
      const message = args.map(arg => typeof arg === 'string' ? arg : String(arg)).join(' ');
      if (shouldSuppress(message)) {
        return;
      }
      originalError.apply(console, args);
    };

    const originalErrorHandler = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
      const errorMessage = message || (error && error.message) || String(message || '');
      if (shouldSuppress(errorMessage)) {
        return true;
      }
      if (originalErrorHandler) {
        return originalErrorHandler.apply(this, arguments);
      }
      return false;
    };

    window.addEventListener('unhandledrejection', function(event) {
      const message = event.reason?.message || String(event.reason || '');
      if (shouldSuppress(message)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  async tryInitializeAtOptimalTiming() {

    await this.loadSettingsAsync();

    this.createFloatingUI();

    if (this.isPluginEnabled) {
      this.showUI();
      this.updateStatus('Analyzing page...', '#FF9800');
    } else {
      this.applyPluginDisabledEffects();
    }

    const attemptDelays = [0, 1000, 3000, 5000];
    const startTime = Date.now();
    let isCompleted = false;
    const attemptPromises = [];

    for (let i = 0; i < attemptDelays.length; i++) {
      const delay = attemptDelays[i];

      const attemptPromise = new Promise(async (resolve) => {
        const elapsed = Date.now() - startTime;
        const waitTime = Math.max(0, delay - elapsed);

        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        if (isCompleted) {
          resolve();
          return;
      }

      try {
        await this.analyzePageAndCreateTakes();
        let takeCount = this.preTakes.length;
        let totalCharacters = this.preTakes.reduce((sum, take) => sum + take.text.length, 0);

        if (i === 0 && takeCount > 0 && this.preTakes[0].text.length < 200) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          await this.analyzePageAndCreateTakes();
          takeCount = this.preTakes.length;
          totalCharacters = this.preTakes.reduce((sum, take) => sum + take.text.length, 0);
        }

          if (totalCharacters > 0 && totalCharacters < 100) {
            if (!isCompleted) {
              isCompleted = true;
              this.showPageReadError();
            }
            resolve();
          return;
        }

          if (totalCharacters >= 300) {
            if (!isCompleted) {
              isCompleted = true;
          this.updateTakeCount();
          if (this.isPluginEnabled) this.showUI();
            }
            resolve();
          return;
        }

          if (takeCount >= 10) {
            if (!isCompleted) {
              isCompleted = true;
          this.updateTakeCount();
          if (this.isPluginEnabled) this.showUI();
            }
            resolve();
          return;
        }

          if (i === attemptDelays.length - 1) {
            if (!isCompleted) {
              isCompleted = true;
              if (takeCount === 0) {
            this.updateStatus('Failed to create takes - Please refresh the page', '#F44336');
              }
              if (totalCharacters < 100) {
                this.showPageReadError();
              }
          }
        }

      } catch (error) {
        if (i === attemptDelays.length - 1) {
            if (!isCompleted) {
              isCompleted = true;
          this.updateStatus('Failed to create takes - please refresh the page', '#F44336');
              // Check if total characters collected is less than 100
              const errorTotalCharacters = this.preTakes ? this.preTakes.reduce((sum, take) => sum + (take.text ? take.text.length : 0), 0) : 0;
              if (errorTotalCharacters < 100) {
                this.showPageReadError();
        }
      }
    }
        }

        resolve();
      });

      attemptPromises.push(attemptPromise);
    }

    await Promise.all(attemptPromises);

    if (!isCompleted) {
      const finalTotalCharacters = this.preTakes ? this.preTakes.reduce((sum, take) => sum + (take.text ? take.text.length : 0), 0) : 0;
      if (finalTotalCharacters < 100) {
        this.showPageReadError();
      }
    }
  }

  async analyzePageAndCreateTakes() {
    if (!this.isPluginEnabled) {
      return;
    }




    const bodyContent = this.extractMainContent();

    const contentElements = this.findContentElements(bodyContent);

    const arUISelectors = [
      '#tts-floating-ui',
      '#tts-bottom-floating-ui',
      '#tts-options-menu',
      '#tts-voice-menu-popup',
      '#tts-speed-menu-popup',
      '#tts-quality-menu-popup',
      '#tts-bottom-scroll-spacer',
      '.tts-take-hover-icon',
      '#typography-floating-ui'
    ];

    const filteredElements = contentElements.filter(element => {
      for (const selector of arUISelectors) {
        if (element.matches && element.matches(selector)) {
          return false;
        }
        if (element.closest && element.closest(selector)) {
          return false;
        }
      }
      return true;
    });

    this.preTakes = [];
    for (let i = 0; i < filteredElements.length; i++) {
      const element = filteredElements[i];
      const text = this.extractTextFromElement(element);

      if (text && text.length > 1) {
        if (text.length > 5000) {
          continue;
        }

        const arUIPatterns = [
          /\.ar-logo\s*{[^}]*}/i,  // .ar-logo { fill: ... }
          /^\d+\.?\d*x$/,
          /^Anything Reader$/i,
          /^Ready to read$/i,
          /^Analyzing page/i,
          /^takes? (collected|detected)$/i
        ];

        let isAnythingReaderUI = false;
        for (const pattern of arUIPatterns) {
          if (pattern.test(text.trim())) {
            isAnythingReaderUI = true;
            break;
          }
        }

        if (isAnythingReaderUI) {
          continue;
        }

        const previousTake = this.preTakes[this.preTakes.length - 1];
        const normalizedText = text.trim().replace(/\s+/g, ' ');
        const previousNormalizedText = previousTake ? previousTake.text.trim().replace(/\s+/g, ' ') : '';

        if (previousTake && normalizedText === previousNormalizedText) {
          continue;
        }

        const takeId = `take-${this.preTakes.length + 1}`;
        const language = 'en';

        const preTake = {
          id: takeId,
          index: this.preTakes.length,
          text: normalizedText,
          language: language,
          element: element,
          selector: this.generateElementSelector(element),
          audioUrl: null
        };

        this.preTakes.push(preTake);
      }
    }


    this.sortTakesByDOMOrder();

    this.updateTakeListUI();
    this.updateTakeCount();

    this.setupTakeHoverIcons();
  }

  sortTakesByDOMOrder() {
    if (!this.preTakes || this.preTakes.length === 0) {
      return;
    }


    this.preTakes.sort((a, b) => {
      if (!a.element || !b.element) {
        return 0;
      }

      const position = a.element.compareDocumentPosition(b.element);

      if (position && Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      } else if (position && Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      } else {
        return 0;
      }
    });

    this.preTakes.forEach((take) => {
      const elementInfo = take.element ?
        `${take.element.tagName}.${take.element.className || 'no-class'}` :
        'no-element';
    });
  }

  setupTakeHoverIcons() {
    if (!this.preTakes || this.preTakes.length === 0) return;

    this.preTakes.forEach((take, index) => {
      if (take.element) {
        const smallestElement = this.findSmallestTextContainer(take.element, take.text);

        smallestElement.addEventListener('mouseenter', (event) => {
          this.currentHoverTake = take;
          this.showTakeHoverIcon(take, smallestElement);
        });

        smallestElement.addEventListener('mouseleave', (event) => {
          setTimeout(() => {
            try {
              const hoveredElement = this.safeElementFromPoint(event.clientX, event.clientY);
              if (hoveredElement) {
            const newTake = this.findTakeFromElement(hoveredElement);

            if (newTake && newTake !== this.currentHoverTake) {
              this.currentHoverTake = newTake;
              const newSmallestElement = this.findSmallestTextContainer(newTake.element, newTake.text);
              this.showTakeHoverIcon(newTake, newSmallestElement);
                }
            }
            } catch (e) {
            }
          }, 10);
        });
      }
    });
  }

  showTakeHoverIcon(take, element) {
    if (this.isPageReadError) {
      return;
    }

    if (!this.isPluginEnabled) {
      return;
    }

    this.hideTakeHoverIcon();

    this.currentIconTake = take;
    this.currentIconElement = element;

    const isDark = this.currentTheme === 'dark';
    const iconSize = 19;

    this.takeHoverIcon = this.createTakeIcon(iconSize, isDark);

    if (!this.takeHoverIcon || !(this.takeHoverIcon instanceof Node)) {
      return;
    }

    if (!document.body) {
      return;
    }

    this.setupIconPositionAndStyle(iconSize);

    this.setupIconEventListeners(take);

    try {
    document.body.appendChild(this.takeHoverIcon);
    } catch (error) {
      this.takeHoverIcon = null;
      return;
    }


    this.triggerIconAnimation();

    this.setupIconScrollListener();

    this.setupCurrentTakeHoverTracking();

    this.setupIconAutoHideTimer();
  }

  createTakeIcon(iconSize, isDark) {
    try {
      if (!document || typeof document.createElement !== 'function') {
        return null;
      }

    const icon = document.createElement('div');
      if (!icon) {
        return null;
      }

    icon.id = 'tts-take-hover-icon';
    const highlightColor = this.getHighlightColor();
    icon.innerHTML = `
      <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 152 152" xmlns="http://www.w3.org/2000/svg">
        <style>
          .tts-icon-blue { fill: ${highlightColor}; }
          .tts-icon-white { fill: #fff; }
          
          .tts-icon-element {
            opacity: 0;
          }
          
          .tts-icon-animate .tts-icon-element-1 { 
            animation: ttsIconShow 0.1s ease 0.1s forwards; 
          }
          .tts-icon-animate .tts-icon-element-2 { 
            animation: ttsIconShow 0.1s ease 0.15s forwards; 
          }
          .tts-icon-animate .tts-icon-element-3 { 
            animation: ttsIconShow 0.1s ease 0.20s forwards; 
          }
          .tts-icon-animate .tts-icon-element-4 { 
            animation: ttsIconShow 0.1s ease 0.25s forwards; 
          }
          
          @keyframes ttsIconShow {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        </style>
        <g>
          <circle class="tts-icon-white" cx="76" cy="76" r="72"/>
          <path class="tts-icon-blue" d="M76,152C34.1,152,0,117.9,0,76S34.1,0,76,0s76,34.1,76,76-34.1,76-76,76ZM76,8C38.5,8,8,38.5,8,76s30.5,68,68,68,68-30.5,68-68S113.5,8,76,8Z"/>
        </g>
        <!-- 1. Left small circle -->
        <circle class="tts-icon-blue tts-icon-element tts-icon-element-1" cx="51.3" cy="76" r="10.8"/>
        <!-- 2-1. Upper diagonal line -->
        <rect class="tts-icon-blue tts-icon-element tts-icon-element-2" x="77" y="41.2" width="23.3" height="8" transform="translate(-8.5 66.6) rotate(-39.4)"/>
        <!-- 2-2. Center horizontal line -->
        <rect class="tts-icon-blue tts-icon-element tts-icon-element-3" x="83" y="72" width="22.8" height="8"/>
        <!-- 2-3. Lower diagonal line -->
        <rect class="tts-icon-blue tts-icon-element tts-icon-element-4" x="84.7" y="95.1" width="8" height="23.3" transform="translate(-50.1 107.5) rotate(-50.6)"/>
      </svg>
    `;
    return icon;
    } catch (error) {
      return null;
    }
  }

  setupIconPositionAndStyle(iconSize) {
    this.takeHoverIcon.style.cssText = `
      position: fixed !important;
      z-index: 100001 !important;
      pointer-events: auto !important;
      cursor: pointer !important;
      background: rgba(255, 255, 255, 0.9) !important;
      border-radius: 50% !important;
      padding: 0 !important;
      box-shadow: 0 2px 8px #227cff40 !important;
      transition: transform 0.2s ease, opacity 0.5s ease !important;
      width: ${iconSize}px !important;
      height: ${iconSize}px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      opacity: 1 !important;
    `;

    this.updateIconPosition();
  }

  setupIconEventListeners(take) {
    if (!this.takeHoverIcon) return;

    this.takeHoverIcon.addEventListener('click', async (event) => {
      event.stopPropagation();
      await this.startPlaybackFromTake(take);
    });

    this.takeHoverIcon.addEventListener('mouseenter', () => {
      this.takeHoverIcon.style.transform = 'scale(1.1)';
    });

    this.takeHoverIcon.addEventListener('mouseleave', () => {
      this.takeHoverIcon.style.transform = 'scale(1.0)';
    });
  }

  hideTakeHoverIcon() {
    if (this.takeHoverIcon) {
      this.takeHoverIcon.remove();
      this.takeHoverIcon = null;
    }

    this.removeIconScrollListener();

    this.clearIconAutoHideTimer();

    this.cleanupCurrentTakeHoverTracking();

    this.currentIconTake = null;
    this.currentIconElement = null;
  }


  setupIconAutoHideTimer() {
    this.clearIconAutoHideTimer();

    this.iconAutoHideTimer = setTimeout(() => {
      this.checkAndFadeOutIcon();
    }, 3000);
  }

  checkAndFadeOutIcon() {
    if (this.isCurrentTakeHovered()) {
      this.setupIconAutoHideTimer();
      return;
    }

    this.fadeOutIcon();
  }

  isCurrentTakeHovered() {
    if (!this.currentIconElement) return false;

    return this.isMouseOverCurrentTake;
  }

  setupCurrentTakeHoverTracking() {
    if (!this.currentIconElement) return;

    this.isMouseOverCurrentTake = false;

    const handleMouseEnter = () => {
      this.isMouseOverCurrentTake = true;
    };

    const handleMouseLeave = () => {
      this.isMouseOverCurrentTake = false;
    };

    if (this.currentIconElement) {
      this.currentIconElement.addEventListener('mouseenter', handleMouseEnter);
      this.currentIconElement.addEventListener('mouseleave', handleMouseLeave);
    }

    this.currentTakeHoverListeners = {
      element: this.currentIconElement,
      enter: handleMouseEnter,
      leave: handleMouseLeave
    };
  }

  cleanupCurrentTakeHoverTracking() {
    if (this.currentTakeHoverListeners) {
      const { element, enter, leave } = this.currentTakeHoverListeners;
      element.removeEventListener('mouseenter', enter);
      element.removeEventListener('mouseleave', leave);
      this.currentTakeHoverListeners = null;
    }
    this.isMouseOverCurrentTake = false;
  }

  clearIconAutoHideTimer() {
    if (this.iconAutoHideTimer) {
      clearTimeout(this.iconAutoHideTimer);
      this.iconAutoHideTimer = null;
    }
  }

  fadeOutIcon() {
    if (!this.takeHoverIcon) return;

    this.takeHoverIcon.style.opacity = '0';

    setTimeout(() => {
      this.hideTakeHoverIcon();
    }, 500);
  }

  resetIconAutoHideTimer() {
    if (this.takeHoverIcon) {
      this.takeHoverIcon.style.opacity = '1';

      this.setupIconAutoHideTimer();
    }
  }

  triggerIconAnimation() {
    if (!this.takeHoverIcon) return;

    requestAnimationFrame(() => {
      if (this.takeHoverIcon && this.takeHoverIcon.classList) {
        this.takeHoverIcon.classList.add('tts-icon-animate');
      }
    });
  }

  updateIconPosition() {
    if (!this.takeHoverIcon || !this.currentIconElement) return;

    try {
      const rect = this.safeGetBoundingClientRect(this.currentIconElement);
      if (!rect) {
        return;
      }

    if (this.isElementOutOfView(rect)) {
      this.hideTakeHoverIcon();
      return;
    }

    const iconPosition = this.calculateIconViewportPosition(rect);
      if (!iconPosition) {
        return;
      }

    this.takeHoverIcon.style.top = `${iconPosition.top}px`;
    this.takeHoverIcon.style.left = `${iconPosition.left}px`;
    } catch (error) {
    }
  }

  isElementOutOfView(rect) {
    return rect.bottom < -50 || rect.top > window.innerHeight + 50;
  }

  calculateIconViewportPosition(rect) {
    try {
      if (!rect || !this.currentIconElement) {
        return { top: 0, left: 0 };
      }

      const computedStyle = this.safeGetComputedStyle(this.currentIconElement);
      if (!computedStyle) {
        return {
          top: rect.top - 2,
          left: rect.left - 30
        };
      }

      const tagName = this.currentIconElement.tagName?.toLowerCase() || '';
    let topOffset = rect.top;

      try {
    if (tagName === 'p') {
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      const lineHeight = parseFloat(computedStyle.lineHeight) || parseFloat(computedStyle.fontSize) * 1.2;
      const fontSize = parseFloat(computedStyle.fontSize) || 16;
      topOffset += paddingTop + (lineHeight - fontSize) / 2;
    } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      topOffset += paddingTop + 2;
    } else if (tagName === 'div') {
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      topOffset += paddingTop;
        }
      } catch (e) {
    }

    return {
      top: topOffset - 2,
      left: rect.left - 30
    };
    } catch (error) {
      return {
        top: rect ? rect.top - 2 : 0,
        left: rect ? rect.left - 30 : 0
      };
    }
  }

  setupIconScrollListener() {
    this.removeIconScrollListener();

    this.iconScrollHandler = this.throttle(() => {
      this.updateIconPosition();
    }, 16); // 60fps

    window.addEventListener('scroll', this.iconScrollHandler, { passive: true });
    window.addEventListener('resize', this.iconScrollHandler, { passive: true });
  }

  removeIconScrollListener() {
    if (this.iconScrollHandler) {
      window.removeEventListener('scroll', this.iconScrollHandler);
      window.removeEventListener('resize', this.iconScrollHandler);
      this.iconScrollHandler = null;
    }
  }

  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }
  }

  findSmallestTextContainer(element, text) {
    if (!element) return element;

    try {
    const tagName = element.tagName?.toLowerCase();

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      return element;
    }

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const nodeText = node.textContent?.trim();
          if (nodeText && text && nodeText.includes(text.substring(0, 50))) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let smallestElement = element;
      const elementRect = this.safeGetBoundingClientRect(element);
      let smallestSize = elementRect ? (elementRect.width * elementRect.height) : Infinity;

    let currentNode;
    while (currentNode = walker.nextNode()) {
        try {
          const rect = this.safeGetBoundingClientRect(currentNode);
          if (rect) {
      const size = rect.width * rect.height;

      if (size > 0 && size < smallestSize) {
        smallestElement = currentNode;
        smallestSize = size;
            }
          }
        } catch (e) {
      }
    }

    return smallestElement;
    } catch (error) {
      return element;
    }
  }

  findTakeFromElement(element) {
    if (!element || !this.preTakes) return null;

    for (const take of this.preTakes) {
      if (take.element && (take.element.contains(element) || take.element === element)) {
        return take;
      }
    }

    return null;
  }



  extractMainContent() {
    const body = document.body;
    if (!body) return null;

    const hostname = window.location.hostname.toLowerCase();

    let mainContent = window.htmlAnalyzerSites.getSiteSpecificMainContent(hostname, body);

    if (!mainContent) {
      mainContent = window.htmlAnalyzerCommon.extractMainContent();
    }

    return mainContent;
  }



  findContentElements(container) {
    return window.htmlAnalyzerCommon.findContentElements(container);
  }

  shouldExcludeElement(element) {
    return window.htmlAnalyzerCommon.shouldExcludeElement(element);
  }

  isVisibleElement(element) {
    return window.htmlAnalyzerCommon.isVisibleElement(element);
  }

  getDirectTextContent(element) {
    return window.htmlAnalyzerCommon.getDirectTextContent(element);
  }

  extractTextFromElement(element) {
    return window.htmlAnalyzerCommon.extractTextFromElement(element);
  }

  generateElementSelector(element) {
    return window.htmlAnalyzerCommon.generateElementSelector(element);
  }

  updateTakeListUI() {
    if (this.takeListContainer) {
      const isDark = this.currentTheme === 'dark';
      const textColor = isDark ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d';
      const itemBgColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

      let html = '';

      this.preTakes.forEach((take, index) => {
        const flagEmoji = take.language === 'ko' ? '🇰🇷' :
                         take.language === 'en' ? '🇺🇸' :
                         take.language === 'ja' ? '🇯🇵' : '🌐';

        html += `<div style="
          margin-bottom: 6px; 
          font-size: 8px; 
          line-height: 1.6em;
          color: ${textColor};
        ">
          <span>${flagEmoji}</span>
          <span>${take.text.substring(0, 100)}${take.text.length > 100 ? '...' : ''} / ${take.text.length}</span>
        </div>`;
      });

      this.takeListContainer.innerHTML = html;
    }
  }

  createFloatingUI() {
    if (!this.takeListVisible) {
      return;
    }

    const existingUI = document.getElementById('tts-floating-ui');
    if (existingUI) {
      existingUI.remove();
    }

    const isDark = this.currentTheme === 'dark';
    const bgColor = isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
    const textColor = isDark ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d';
    const borderColor = isDark ? 'rgba(125, 125, 125, 0.25)' : 'rgba(125, 125, 125, 0.5)';

    this.floatingUI = document.createElement('div');
    this.floatingUI.id = 'tts-floating-ui';
    this.floatingUI.style.cssText = `
      position: fixed !important;
      top: 15px !important;
      right: -485px !important;
      background: ${bgColor} !important;
      backdrop-filter: blur(10px) !important;
      -webkit-backdrop-filter: blur(10px) !important;
      color: ${textColor} !important;
      padding: 12px !important;
      border-radius: 8px !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important;
      font-size: ${this.UI_FONT_SIZE} !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      z-index: 99998 !important;
      max-width: 100px !important;
      max-height: 85vh !important;
      display: none !important;
      overflow-y: auto !important;
      border: 1px solid ${borderColor} !important;
    `;

    this.consoleLogStatusLabel = document.createElement('div');
    this.consoleLogStatusLabel.id = 'tts-console-log-status';
    this.consoleLogStatusLabel.style.cssText = `
      color: ${textColor} !important;
      font-size: 8px !important;
      font-weight: normal !important;
      margin-bottom: 4px !important;
      text-align: left !important;
      white-space: pre-line !important;
      line-height: 1rem !important;
    `;

    this.consoleLogDivider = document.createElement('div');
    this.consoleLogDivider.style.cssText = `
      height: 1px !important;
      background: ${borderColor} !important;
      margin: 4px 0 8px 0 !important;
    `;

    this.takeCountLabel = document.createElement('div');
    this.takeCountLabel.id = 'tts-take-count';
    this.takeCountLabel.style.cssText = `
      color: ${textColor} !important;
      font-size: 8px !important;
      font-weight: normal !important;
      margin-bottom: 8px !important;
      text-align: left !important;
    `;
    this.takeCountLabel.textContent = '0 takes detected';

    this.takeListContainer = document.createElement('div');
    this.takeListContainer.id = 'tts-take-list';
    this.takeListContainer.style.cssText = `
      overflow-y: auto !important;
      scrollbar-width: thin !important;
      color: ${textColor} !important;
    `;

    this.floatingUI.appendChild(this.consoleLogStatusLabel);
    this.floatingUI.appendChild(this.consoleLogDivider);
    this.floatingUI.appendChild(this.takeCountLabel);
    this.floatingUI.appendChild(this.takeListContainer);

    document.body.appendChild(this.floatingUI);

    this.updateConsoleLogStatus();

    if (!this.isPluginEnabled) {
      this.floatingUI.style.display = 'none';
    }

  }

  updateConsoleLogStatus() {
    if (this.consoleLogStatusLabel) {
      if (this.DEBUG_MODE) {
        this.consoleLogStatusLabel.textContent = 'Console log: ON\n⚠️ Performance impact ⚠️';
        this.consoleLogStatusLabel.style.color = this.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d';
        this.consoleLogStatusLabel.style.display = 'block';
        if (this.consoleLogDivider) {
          this.consoleLogDivider.style.display = 'block';
        }
      } else {
        this.consoleLogStatusLabel.style.display = 'none';
        if (this.consoleLogDivider) {
          this.consoleLogDivider.style.display = 'none';
        }
      }
    }
  }

  formatNumberWithK(num) {
    if (num >= 1000) {
      return Math.floor(num / 1000) + 'k';
    }
    return num.toString();
  }

  updateTakeCount() {
    const count = this.preTakes ? this.preTakes.length : 0;

    let totalCharacters = 0;
    if (this.preTakes && this.preTakes.length > 0) {
      totalCharacters = this.preTakes.reduce((sum, take) => sum + (take.text ? take.text.length : 0), 0);
    }

    if (this.takeCountLabel) {
      this.takeCountLabel.textContent = `${count} takes collected`;
    }

    if (this.bottomTakeCountLabel) {
      const formattedChars = this.formatNumberWithK(totalCharacters);
      this.bottomTakeCountLabel.textContent = `${count} ¶ / ${formattedChars} chars`;
    }
  }




  async playSelectedText(text) {
    if (this.isPageReadError) {
      this.warn('This page cannot be read. Audio generation is disabled.');
      return;
    }

    if (!text || !text.trim()) {
      this.warn('There is no text to play.');
      return;
    }


    if (!this.isPluginEnabled) {
      this.isPluginEnabled = true;
      this.showUI();
    }

    const detectLanguage = (text) => {
      const koreanRegex = /[\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163]/;
      const japaneseRegex = /[\u3040-\u30ff]/;
      if (koreanRegex.test(text)) return 'ko';
      if (japaneseRegex.test(text)) return 'ja';
      return 'en';
    };

    const language = detectLanguage(text);

    const take = {
      id: `selected-text-${Date.now()}`,
      text: text.trim(),
      language: language,
      element: null
    };

    this.preTakes = [take];
    this.currentPlayList = [take];
    this.currentTakeIndex = 0;

    await this.startPlaybackFromTake(take);
  }

  async startPlaybackFromTake(startTake) {
    if (this.isPageReadError) {
      this.warn('This page cannot be read. Audio generation is disabled.');
      return;
    }

    const wasGenerating = this.isGenerating;
    const previousGeneratingTakeId = this.currentGeneratingTakeId;

    if (wasGenerating) {
    }

    this.stopAll();

    if (wasGenerating) {
      this.isGenerating = false;
      this.currentGeneratingTakeId = null;

      this.shouldStopSequentialPlayback = true;

    }

    await new Promise(resolve => setTimeout(resolve, 100));

    this.shouldStopSequentialPlayback = false;

    let startIndex = this.preTakes.findIndex(take => take.id === startTake.id);
    if (startIndex === -1) {
      await this.analyzePageAndCreateTakes();
      startIndex = this.preTakes.findIndex(take => take.id === startTake.id);
      if (startIndex === -1) {
        this.error(`Take not found: ${startTake.id}`);
        return;
      }
    }

    this.currentPlayList = this.preTakes.slice(startIndex);
    this.currentTakeIndex = 0;
    this.currentPlayingTakeId = startTake.id;
    this.prefetchNextTakes(0, 4);


    this.updateStatus(`Preparing playback... (${startIndex + 1}/${this.preTakes.length})`, '#FF9800');
    this.updatePlaybackUI(startTake);

    const pauseCommand = this.extractPauseCommand(startTake.text);
    if (pauseCommand) {
      this.pausePlayback();

      return;
    }

    await this.playTakeAtIndex(0);
  }

  async playSingleTake(take) {

    this.shouldStopSequentialPlayback = false;

    try {
      const audioUrl = await this.generateTTSAudio(take, {
        showAnimation: true,
        updateStatus: true,
        scrollToElement: true,
        playAfterGenerate: true,
        context: 'single_play'
      });

      if (audioUrl) {
      } else {
        this.error(`Single take playback failed: ${take.id}`);
      }

      return audioUrl;
    } catch (error) {
      this.error(`Single take playback error: ${take.id}`, error);
      return null;
    }
  }

  async playTakeAtIndex(playListIndex) {
    if (this.shouldStopSequentialPlayback) {
      return;
    }


    if (!this.currentPlayList || playListIndex >= this.currentPlayList.length) {
      this.updateStatus('Playback complete', '#4CAF50');
      return;
    }

    const take = this.currentPlayList[playListIndex];

    if (!take) {
      this.error(`❌ Take not found: index ${playListIndex}`);
      return;
    }

    this.currentTakeIndex = playListIndex;
    this.currentPlayingTakeId = take.id;


    const pauseCommand = this.extractPauseCommand(take.text);
    if (pauseCommand) {
      this.pausePlayback();

      return;
    }

    this.updatePlaybackUI(take);
    this.updateStatus(`Playing... (${playListIndex + 1}/${this.currentPlayList.length})`, '#4CAF50');
    this.prefetchNextTakes(playListIndex + 1, 4);


    try {
      let audioUrl;

      const cacheKey = this.getTakeAudioCacheKey(take);
      const cachedAudio = this.getFromAudioCache(cacheKey);

      if (cachedAudio) {
        audioUrl = cachedAudio;
      } else if (this.audioPrefetchPromises && this.audioPrefetchPromises.has(cacheKey)) {
        audioUrl = await this.audioPrefetchPromises.get(cacheKey);
      } else {
        audioUrl = await this.generateTTSAudio(take, {
          showAnimation: true,
          updateStatus: true,
          scrollToElement: true,
          playAfterGenerate: false,
          context: 'selection'
        });
        if (audioUrl) {
          this.addToAudioCache(cacheKey, audioUrl);
        }
      }

      if (audioUrl) {
        this.prefetchNextTakes(playListIndex + 1, 4);
        await this.playAudioWithTracking(audioUrl, take);
      } else {
        this.error(`❌ Take playback failed: ${take.id}`);
        await this.playTakeAtIndex(playListIndex + 1);
      }

    } catch (error) {
      this.error(`❌ Take playback error: ${take.id}`, error);
      await this.playTakeAtIndex(playListIndex + 1);
    }
  }

  getTakeAudioCacheKey(take) {
    return getTakeAudioCacheKey(this, take);
  }

  getFromAudioCache(cacheKey) {
    return getFromAudioCache(this, cacheKey);
  }

  addToAudioCache(cacheKey, audioUrl) {
    return addToAudioCache(this, cacheKey, audioUrl);
  }

  prefetchNextTakes(startIndex, count = 4) {
    return prefetchNextTakes(this, startIndex, count);
  }

  prepareNextTake(playListIndex) {
    return prepareNextTake(this, playListIndex);
  }

  async waitForGenerationSlot() {
    let attempts = 0;
    while (this.isGenerating && attempts < 200) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts += 1;
    }
  }

  applyGeneratingAnimation(element) {
    if (!element) {
      this.warn('Failed to apply animation: element is missing');
      return;
    }


    element.style.animation = '';

    if (!document.querySelector('#tts-generating-animation')) {
      const style = document.createElement('style');
      style.id = 'tts-generating-animation';
      style.textContent = `
        @keyframes tts-generating {
          0% { opacity: 1; }
          50% { opacity: 0.3; }
          100% { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    element.style.animation = 'tts-generating 1.2s infinite';

    setTimeout(() => {
      const computedStyle = window.getComputedStyle(element);
      const appliedAnimation = computedStyle.animation;
    }, 100);
  }

  removeGeneratingAnimation(element) {
    if (!element) {
      this.warn('⚠️ Failed to remove animation: element is missing');
      return;
    }


    element.style.animation = '';
    element.style.opacity = '';

  }

  async playAudioWithTracking(audioUrl, take) {
    return new Promise((resolve, reject) => {
      const hostname = window.location.hostname.toLowerCase();
      const isCSPRestricted = this.cspRestrictedSites.some(site => hostname.includes(site));

      if (isCSPRestricted && audioUrl && typeof audioUrl === 'object' && audioUrl.audioBuffer) {
        this.currentAudio = this.createWebAudioPlayer(audioUrl.audioBuffer, audioUrl.sampleRate);
                  } else {
      this.currentAudio = new Audio(audioUrl);
      }

      this.isPlaying = true;
      this.isPaused = false;

      this.updateBottomFloatingUIState();


      this.prepareWordTracking(take);

      this.currentAudio.onloadedmetadata = () => {
        this.startAppJsStyleWordTracking(take);

      };

      this.currentAudio.ontimeupdate = () => {
        if (this.currentAudio && this.currentAudio.duration) {
          this.updateAppJsStyleWordTracking(take);

          const progress = (this.currentAudio.currentTime / this.currentAudio.duration) * 100;
          this.updateProgress(progress);
        }
      };

      this.currentAudio.onended = () => {

        if (this.isPaused) {
          return;
        }

        this.cleanupWordTracking();

        setTimeout(async () => {
          if (this.isPaused) {
            return;
          }

          if (this.shouldStopSequentialPlayback) {
            this.isPlaying = false;
            this.isPaused = false;
            this.updateBottomFloatingUIState();
            resolve();
            return;
          }

          const nextIndex = this.currentTakeIndex + 1;
          if (nextIndex < this.currentPlayList.length) {
            const nextTake = this.currentPlayList[nextIndex];
            const silenceTime = this.extractSilenceTime(nextTake.text);

            if (silenceTime > 0) {
              await this.playSilenceBetweenTakes(silenceTime, nextIndex);
            } else {
            this.playTakeAtIndex(nextIndex);
            }
          } else {
            this.isPlaying = false;
            this.isPaused = false;
            this.updateBottomFloatingUIState();
            this.updateStatus('Playback complete', '#4CAF50');
          }
          resolve();
        }, 500);
      };

      this.currentAudio.onerror = (error) => {
        this.error(`❌ Audio playback error: ${take.id}`, error);
        this.isPlaying = false;
        this.isPaused = false;
        this.updateStatus('Playback error', '#F44336');
        this.stopWordTracking();

        this.updateBottomFloatingUIState();

        reject(error);
      };

      this.currentAudio.play().catch(reject);
    });
  }

  prepareWordTracking(take) {

    this.cleanupWordTracking();

    this.currentTakeWords = this.splitIntoWords(take.text);
    this.currentTakeWordElements = [];

    this.setupOverlayWordTracking(take);

  }

  isSafeForDOMManipulation() {
    const hostname = window.location.hostname.toLowerCase();

    const isBBC = hostname.includes('bbc.com') || hostname.includes('bbc.co.uk');
    if (isBBC) {
      return this.isSafeForBBCManipulation();
    }

    const hasVeryComplexLayout = this.detectComplexLayout();
    if (hasVeryComplexLayout) {
      return false;
    }

    return true;
  }

  isSafeForBBCManipulation() {
    try {
      const articleContent = document.querySelector('article, [data-component="text-block"], .story-body, .gel-body-copy');

      if (!articleContent) {
        return false;
      }

      return false;

    } catch (error) {
      this.warn('🔵 BBC: safety check failed:', error);
      return false;
    }
  }

  detectComplexLayout() {
    try {

      const complexGridElements = document.querySelectorAll('[style*="grid-template"], [class*="grid-container"], [class*="grid-system"]');
      if (complexGridElements.length > 15) {
        return true;
      }

      const complexFlexElements = document.querySelectorAll('[style*="flex-direction"], [style*="flex-wrap"], [class*="flex-container"]');
      if (complexFlexElements.length > 25) {
        return true;
      }


      const hasProblematicFramework = this.detectProblematicFrameworks();
      if (hasProblematicFramework) {
        return true;
      }

      return false;
    } catch (error) {
      this.warn('Layout detection failed:', error);
      return false;
    }
  }

  detectProblematicFrameworks() {
    try {
      const hasComplexBootstrap = document.querySelectorAll('.container-fluid, .row-cols-, .g-').length > 20;

      const hasComplexTailwind = document.querySelectorAll('[class*="grid-cols-"], [class*="grid-rows-"]').length > 15;

      const hasCSSinJS = document.querySelectorAll('[data-styled], [class^="sc-"]').length > 10;

      return hasComplexBootstrap || hasComplexTailwind || hasCSSinJS;
    } catch (error) {
      return false;
    }
  }

  splitIntoWords(text) {
    const cleanedText = text.replace(/::[^:]+::/g, '');

    const words = cleanedText.split(/\s+/).filter(word => word.length > 0);

    return words.map(word => ({
      text: word,
      weight: this.calculateWordWeight(word)
    }));
  }

  calculateWordWeight(word) {
    let weight = this.estimateSyllables(word) * 0.2;

    if (/[.!?]/.test(word)) {
      weight += 0.5;
    }

    return Math.max(0.1, weight);
  }

  estimateSyllables(word) {
    const koreanRegex = /[\uAC00-\uD7A3\u3131-\u314E\u314F-\u3163]/;
    if (koreanRegex.test(word)) {
      const koreanChars = word.match(/[\uAC00-\uD7A3]/g);
      return koreanChars ? koreanChars.length : word.length || 1;
    }

    const vowels = word.match(/[aeiouy]+/gi);
    return vowels ? vowels.length : 1;
  }

  scrollElementToTop10Percent(element) {
    if (!element) return;

    try {
      const rect = element.getBoundingClientRect();
      const elementTop = rect.top + window.scrollY;
      const viewportHeight = window.innerHeight;
      const targetOffset = viewportHeight * 0.1;

      const targetScrollY = elementTop - targetOffset;
      window.scrollTo({
        top: targetScrollY,
        behavior: 'smooth'
      });
    } catch (error) {
      try {
        element.scrollIntoView({
        behavior: 'smooth',
          block: 'start',
        inline: 'nearest'
      });
      } catch (e) {
      }
    }
  }

  startAppJsStyleWordTracking(take) {

    if (take.element && this.autoScrollEnabled) {
      this.scrollElementToTop10Percent(take.element);
    }
  }

  updateAppJsStyleWordTracking(take) {
    if (!this.currentAudio || !this.currentTakeWords || this.currentTakeWords.length === 0) {
      return;
    }

    const currentTime = this.currentAudio.currentTime;
    const duration = this.currentAudio.duration;

    const currentWordIndex = this.calculateCurrentWordIndex(currentTime, duration, this.currentTakeWords);

    if (this.overlayHighlight) {
      this.updateOverlayWordHighlight(currentWordIndex);
    }

    if (currentWordIndex >= 0 && currentWordIndex < this.currentTakeWords.length) {
      const currentWord = this.currentTakeWords[currentWordIndex]?.text || '';
      this.updateWordInfo(currentWordIndex + 1, this.currentTakeWords.length, currentWord);
    }
  }

  updateDOMWordHighlight(currentWordIndex) {
    if (!this.highlightEnabled) {
      this.removeAllHighlights();
      return;
    }

    this.currentTakeWordElements.forEach(element => {
      if (element && element.classList) {
        element.classList.remove('tts-current-word-appjs');
      }
    });

    if (currentWordIndex >= 0 && currentWordIndex < this.currentTakeWordElements.length) {
      const currentWordElement = this.currentTakeWordElements[currentWordIndex];
      if (currentWordElement && currentWordElement.classList) {
        currentWordElement.classList.add('tts-current-word-appjs');
      }
    }
  }

  calculateCurrentWordIndex(currentTime, duration, words) {
    if (!duration || !words || words.length === 0) return 0;

    const totalDuration = duration;
    const totalWeight = words.reduce((sum, word) => sum + word.weight, 0);
    const timePerWeight = totalWeight > 0 ? totalDuration / totalWeight : 0;

    let accumulatedTime = 0;
    for (let i = 0; i < words.length; i++) {
      const wordDuration = words[i].weight * timePerWeight;
      accumulatedTime += wordDuration;
      if (currentTime < accumulatedTime) {
        return i;
      }
    }

    return Math.max(0, words.length - 1);
  }

  wrapWordsInElement(element, targetText) {
    if (!element || !targetText) return;


    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim().length > 0) {
        textNodes.push(node);
      }
    }

    for (const textNode of textNodes) {
      this.wrapWordsInTextNode(textNode);
    }

  }

  wrapWordsInTextNode(textNode) {
    const text = textNode.textContent;
    const words = text.split(/(\s+)/);

    if (words.length <= 1) return;

    const fragment = document.createDocumentFragment();

    for (const word of words) {
      if (word.trim().length > 0) {
        const span = document.createElement('span');
        span.textContent = word;
        span.className = 'tts-word-appjs';
        this.currentTakeWordElements.push(span);
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(word));
      }
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  wrapWordsInElementSafely(element, targetText) {
    if (!element || !targetText) return;


    try {
      const safeTextNodes = this.findSafeBBCTextNodes(element, targetText);

      for (const textNode of safeTextNodes) {
        this.wrapSingleTextNodeSafely(textNode);
      }


    } catch (error) {
      this.error('🔵 BBC safe wrapping failed:', error);
      this.currentTakeWordElements = [];
    }
  }

  findSafeBBCTextNodes(element, targetText) {
    const safeNodes = [];

    const bbcSafeSelectors = [
      'p',
      '[data-component="text-block"] p',
      '.story-body p',
      '.gel-body-copy p',
      'article p',
      '.qa-story-body p'
    ];

    for (const selector of bbcSafeSelectors) {
      try {
        const safeParagraphs = element.querySelectorAll ?
          element.querySelectorAll(selector) :
          [element].filter(el => el.matches && el.matches(selector));

        for (const paragraph of safeParagraphs) {
          const walker = document.createTreeWalker(
            paragraph,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: (node) => {
                if (node.textContent.trim().length === 0) return NodeFilter.FILTER_REJECT;

                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;

                const parentTag = parent.tagName.toLowerCase();
                if (['button', 'a', 'nav', 'header', 'footer'].includes(parentTag)) {
                  return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );

          let textNode;
          while (textNode = walker.nextNode()) {
            safeNodes.push(textNode);
          }
        }
      } catch (error) {
        this.warn(`🔵 BBC selector "${selector}" failed:`, error);
      }
    }

    return safeNodes;
  }

  wrapSingleTextNodeSafely(textNode) {
    try {
      const text = textNode.textContent;
      const words = text.split(/(\s+)/);

      if (words.length <= 1) return;

      const fragment = document.createDocumentFragment();

      for (const word of words) {
        if (word.trim().length > 0) {
          const span = document.createElement('span');
          span.textContent = word;
          span.className = 'tts-word-appjs tts-word-bbc-safe';
          this.currentTakeWordElements.push(span);
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(word));
        }
      }

      if (textNode.parentNode) {
        textNode.parentNode.replaceChild(fragment, textNode);
      }

    } catch (error) {
      this.warn('🔵 BBC text node wrapping failed:', error);
    }
  }

  cleanupWordTracking() {

    this.safeCleanupTTSElements();

    this.removeOverlayHighlight();

    this.currentTakeWords = [];
    this.currentTakeWordElements = [];

  }

  safeCleanupTTSElements() {
    try {
      const ttsElements = document.querySelectorAll('[class*="tts-"]');

      let cleanedCount = 0;

      ttsElements.forEach((element, index) => {
        try {
          if (this.isSafeTTSElement(element)) {
            const parent = element.parentNode;
            const textContent = element.textContent;

            if (parent && textContent) {
              const textNode = document.createTextNode(textContent);
              parent.replaceChild(textNode, element);
              cleanedCount++;

            }
          } else {
            this.warn(`⚠️ Unsafe element found, skipping: ${String(element.className || '')}`);
          }

        } catch (elementError) {
          this.warn(`⚠️ Element ${index + 1} cleanup error (safely skipping):`, elementError);
        }
      });


    } catch (error) {
      this.error('🚨 Fatal DOM cleanup error (safely ignored):', error);
    }
  }

  isSafeTTSElement(element) {
    if (!element || !element.className) {
      return false;
    }

    const safeTTSClasses = [
      'tts-word-appjs',
      'tts-current-word-appjs',
      'tts-word-bbc-safe'
    ];

    const elementClasses = String(element.className).split(/\s+/);
    const hasSafeTTSClass = elementClasses.some(cls => safeTTSClasses.includes(cls));

    if (!hasSafeTTSClass) {
      return false;
    }

    const tagName = element.tagName.toLowerCase();
    if (tagName !== 'span') {
      this.warn(`⚠️ Unexpected tag: ${tagName}, expected TTS span`);
      return false;
    }

    const parent = element.parentNode;
    if (!parent || parent === document) {
      this.warn(`⚠️ Invalid parent element structure`);
      return false;
    }

    const textContent = element.textContent;
    if (!textContent || textContent.length === 0) {
      this.warn(`⚠️ Empty text content`);
      return false;
    }

    return true;
  }

  setupOverlayWordTracking(take) {

    this.currentOverlayTake = take;
    this.overlayWordIndex = 0;

    if (this.highlightEnabled) {
      this.createOverlayHighlight();
    }

  }

  createOverlayHighlight() {
    this.removeOverlayHighlight();

    if (!this.highlightEnabled) {
      return;
    }

    const color = this.getHighlightColor();
    const rgb = this.hexToRgb(color);

    this.overlayHighlight = document.createElement('div');
    this.overlayHighlight.id = 'tts-overlay-highlight';
    this.overlayHighlight.style.cssText = `
      position: absolute !important;
      pointer-events: none !important;
      z-index: 99996 !important;
      background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1) !important;
      border-bottom: 2px solid ${color} !important;
      border-radius: 0px !important;
      transition: all 0.2s ease !important;
      display: none !important;
    `;

    document.body.appendChild(this.overlayHighlight);
  }

  removeOverlayHighlight() {
    if (this.overlayHighlight) {
      this.overlayHighlight.remove();
      this.overlayHighlight = null;
    }
  }

  updateOverlayWordHighlight(wordIndex) {
    if (!this.overlayHighlight || !this.currentOverlayTake || !this.currentTakeWords) {
      return;
    }

    if (!this.highlightEnabled) {
      this.overlayHighlight.style.display = 'none';
      return;
    }

    if (!this.isPlaying || this.isPaused) {
      this.overlayHighlight.style.display = 'none';
      return;
    }

    if (wordIndex < 0 || wordIndex >= this.currentTakeWords.length) {
      this.overlayHighlight.style.display = 'none';
      return;
    }

    try {
      const wordPosition = this.findWordPositionInText(wordIndex);

      if (wordPosition) {
        const fontSizeExpansion = wordPosition.fontSize * 0.25;
        const topExpansion = wordPosition.fontSize * 0.15;
        const bottomExpansion = wordPosition.fontSize * 0.1;

        this.overlayHighlight.style.left = (wordPosition.left - fontSizeExpansion) + 'px';
        this.overlayHighlight.style.top = (wordPosition.top - topExpansion) + 'px';
        this.overlayHighlight.style.width = (wordPosition.width + fontSizeExpansion * 2) + 'px';
        this.overlayHighlight.style.height = (wordPosition.height + topExpansion + bottomExpansion) + 'px';
        this.overlayHighlight.style.display = 'block';

      } else {
        this.overlayHighlight.style.display = 'none';
      }

    } catch (error) {
      this.warn('🎨 Overlay highlight update failed:', error);
      this.overlayHighlight.style.display = 'none';
    }
  }

  findWordPositionInText(wordIndex) {
    if (!this.currentOverlayTake || !this.currentTakeWords) {
      return null;
    }

    try {
      const wordsUpToIndex = this.currentTakeWords.slice(0, wordIndex + 1);
      const textUpToWord = wordsUpToIndex.map(w => w.text).join(' ');
      const currentWord = this.currentTakeWords[wordIndex]?.text || '';

      const takeElement = this.currentOverlayTake.element;

      if (!takeElement) {
        return null;
      }

      const range = this.findTextRangeInElement(takeElement, textUpToWord, currentWord);

      if (range) {
        const rect = range.getBoundingClientRect();

        let fontSize = 16;
        try {
          const computedStyle = window.getComputedStyle(range.commonAncestorContainer.parentElement || takeElement);
          fontSize = parseFloat(computedStyle.fontSize) || 16;
        } catch (e) {
        }

        return {
          left: rect.left + window.scrollX,
          top: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
          fontSize: fontSize
        };
      }

      return this.findWordPositionByTextFallback(wordIndex);

    } catch (error) {
      this.warn('🔍 Failed to find word position:', error);
      return this.findWordPositionByTextFallback(wordIndex);
    }
  }

  findWordPositionByTextFallback(wordIndex) {
    try {
      const takeElement = this.currentOverlayTake.element;
      const currentWord = this.currentTakeWords[wordIndex]?.text || '';

      if (!takeElement || !currentWord) {
    return null;
  }

      return this.findWordPositionByExactIndex(takeElement, wordIndex);
    } catch (error) {
      this.warn('🔍 Failed to find fallback position:', error);
      return null;
    }
  }

  findWordPositionByExactIndex(element, targetWordIndex) {
    try {
      const textNodes = this.collectTextNodesInOrder(element);

      let currentWordIndex = 0;
      let currentTextPos = 0;

      for (const textNodeInfo of textNodes) {
        const textNode = textNodeInfo.node;
        const nodeText = textNode.textContent;

        const words = this.splitTextIntoWords(nodeText);

        for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
          const word = words[wordIndex];

          if (currentWordIndex === targetWordIndex) {
            const wordStartInNode = this.findWordStartInTextNode(nodeText, word, wordIndex);
            const wordEndInNode = wordStartInNode + word.length;

            const range = document.createRange();
            range.setStart(textNode, wordStartInNode);
            range.setEnd(textNode, wordEndInNode);

            const rect = range.getBoundingClientRect();

            const computedStyle = window.getComputedStyle(textNode.parentElement || element);
            const fontSize = parseFloat(computedStyle.fontSize) || 16;

            return {
              left: rect.left + window.scrollX,
              top: rect.top + window.scrollY,
              width: rect.width,
              height: rect.height,
              fontSize: fontSize
            };
          }

          currentWordIndex++;
        }
      }

    } catch (error) {
      this.warn('🔍 Failed to find exact index-based position:', error);
    }

    return null;
  }

  collectTextNodesInOrder(element) {
    const textNodes = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let textNode;
    while (textNode = walker.nextNode()) {
      if (textNode.textContent.trim().length > 0) {
        textNodes.push({
          node: textNode,
          text: textNode.textContent
        });
      }
    }

    return textNodes;
  }

  splitTextIntoWords(text) {
    const cleanedText = text.replace(/::[^:]+::/g, '');
    return cleanedText.split(/\s+/).filter(word => word.length > 0);
  }

  findWordStartInTextNode(nodeText, targetWord, wordIndex) {
    const words = this.splitTextIntoWords(nodeText);

    if (wordIndex >= words.length) {
      return 0;
    }

    let currentPos = 0;

    for (let i = 0; i <= wordIndex; i++) {
      const word = words[i];
      const wordStart = nodeText.indexOf(word, currentPos);

      if (wordStart === -1) {
        currentPos += word.length + 1;
        continue;
      }

      if (i === wordIndex) {
        return wordStart;
      }

      currentPos = wordStart + word.length;
    }

    return 0;
  }

  analyzeAndConvertText(text) {
    if (!text) return { displayText: '', apiText: '', hasSpecialCommands: false };

    let displayText = text;
    let apiText = text;
    let hasSpecialCommands = false;

    const silencePattern = /::(\d+)(?:\uCD08|sec)?::/g;
    if (silencePattern.test(text)) {
      hasSpecialCommands = true;
      apiText = apiText.replace(silencePattern, '');
    }

    const pausePattern = /::(\uC815\uC9C0|\uBA48\uCDA4|stop|pause)::/gi;
    if (pausePattern.test(text)) {
      hasSpecialCommands = true;
      apiText = apiText.replace(pausePattern, '');
    }

    const voicePattern = /::([^:]+)::/g;
    const voiceMatches = text.match(voicePattern);
    if (voiceMatches) {
      hasSpecialCommands = true;
      apiText = apiText.replace(voicePattern, '');
    }

    if (hasSpecialCommands) {
    }

    return {
      displayText: displayText,
      apiText: apiText,
      hasSpecialCommands: hasSpecialCommands
    };
  }

  extractSilenceTime(text) {
    const silencePattern = /::(\d+)(?:\uCD08|sec)?::/g;
    const matches = text.match(silencePattern);

    if (!matches) return 0;

    let totalSilenceTime = 0;
    matches.forEach(match => {
      const seconds = parseInt(match.replace(/::|\uCD08|sec/g, ''));
      if (!isNaN(seconds)) {
        totalSilenceTime += seconds;
      }
    });

    return totalSilenceTime;
  }

  extractVoiceCommand(text) {
    const voicePattern = /::([^:]+)::/g;
    const match = text.match(voicePattern);

    if (!match) return null;

    const voiceName = match[0].replace(/::/g, '');
    return voiceName;
  }

  extractPauseCommand(text) {
    const pausePattern = /::(\uC815\uC9C0|\uBA48\uCDA4|stop|pause)::/gi;
    const match = text.match(pausePattern);

    if (!match) return null;

    const pauseCommand = match[0].replace(/::/g, '');
    return pauseCommand;
  }

  extractDisplayAndSpeechText(text) {
    const pattern = /([^:]+)::([^:]+)::/g;
    const matches = text.match(pattern);

    if (!matches) return { displayText: text, speechText: text };

    let displayText = text;
    let speechText = text;

    matches.forEach(match => {
      const parts = match.match(/([^:]+)::([^:]+)::/);
      if (parts) {
        const displayWord = parts[1];
        const speechWord = parts[2];

        displayText = displayText.replace(match, displayWord);
        speechText = speechText.replace(match, speechWord);
      }
    });

    return { displayText, speechText };
  }

  parseSpecialFormat(text) {
    const specialFormatRegex = /([^::\s]*::[^::\s]*::)/g;
    const matches = [];
    let match;


    while ((match = specialFormatRegex.exec(text)) !== null) {
      const fullMatch = match[1];
      const parts = fullMatch.split('::');

      if (parts.length === 3) {
        matches.push({
          full: fullMatch,
          aaa: parts[0] || '',
          bbb: parts[1] || '',
          ccc: parts[2] || '',
          startIndex: match.index,
          endIndex: match.index + fullMatch.length
        });
      }
    }

    return matches;
  }

  convertTextForAPI(text) {
    const matches = this.parseSpecialFormat(text);

    let result = text;

    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const replacement = match.bbb + match.ccc;
      result = result.slice(0, match.startIndex) + replacement + result.slice(match.endIndex);
    }

    return result;
  }

  convertTextForDisplay(text) {
    let result = text.replace(/^::[^:]+::/, '');
    const matches = this.parseSpecialFormat(result);

    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      const replacement = match.aaa + match.ccc;
      result = result.slice(0, match.startIndex) + replacement + result.slice(match.endIndex);
    }

    return result;
  }

  calculateSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.length === 0) return str2.length === 0 ? 1.0 : 0.0;
    if (str2.length === 0) return 0.0;

    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1.0 : (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }



  audioBufferToWav(buffer) {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numberOfChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numberOfChannels * 2, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  async playSilenceBetweenTakes(silenceTime, nextTakeIndex) {
    try {
      if (this.shouldStopSequentialPlayback) {
        return;
      }

      this.updateStatus(`Silence ${silenceTime}s...`, '#9E9E9E');

      const silenceAudioUrl = await this.createSilenceAudio(silenceTime);

      if (!silenceAudioUrl) {
        this.playTakeAtIndex(nextTakeIndex);
        return;
      }

      await this.playSilenceAudio(silenceAudioUrl, silenceTime);

      if (this.shouldStopSequentialPlayback) {
        return;
      }

      this.playTakeAtIndex(nextTakeIndex);

    } catch (error) {
      this.error('Error while playing silence:', error);
      this.playTakeAtIndex(nextTakeIndex);
    }
  }

  async createSilenceAudio(duration) {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();

      const sampleRate = 44100;
      const silenceSamples = Math.floor(duration * sampleRate);
      const silenceBuffer = audioContext.createBuffer(1, silenceSamples, sampleRate);

      const silenceChannelData = silenceBuffer.getChannelData(0);
      for (let i = 0; i < silenceSamples; i++) {
        silenceChannelData[i] = 0;
      }

      const wavBlob = this.audioBufferToWav(silenceBuffer);
      const silenceAudioUrl = URL.createObjectURL(wavBlob);

      return silenceAudioUrl;

    } catch (error) {
      this.error('Failed to create silence audio:', error);
      return null;
    }
  }

  async playSilenceAudio(silenceAudioUrl, duration) {
    return new Promise((resolve, reject) => {
      const hostname = window.location.hostname.toLowerCase();
      const isCSPRestricted = this.cspRestrictedSites.some(site => hostname.includes(site));

      if (isCSPRestricted) {
        if (!this.audioContext) {
          this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        const sampleRate = this.audioContext.sampleRate;
        const audioBuffer = this.audioContext.createBuffer(1, sampleRate * duration, sampleRate);
        const player = this.createWebAudioPlayer(audioBuffer, sampleRate);

        player.onended = () => resolve();
        player.onerror = (error) => {
          this.error('Silence playback error:', error);
          reject(error);
        };
        player.play().catch(reject);
        return;
      }

      const silenceAudio = new Audio(silenceAudioUrl);

      silenceAudio.onended = () => {
        resolve();
      };

      silenceAudio.onerror = (error) => {
        this.error('Silence playback error:', error);
        reject(error);
      };

      silenceAudio.play().catch(reject);
    });
  }

  getPureTextContent(element) {
    if (!element) return '';

    let text = '';
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let textNode;
    while (textNode = walker.nextNode()) {
      text += textNode.textContent;
    }

    return text.replace(/\s+/g, ' ').trim();
  }

  convertTextPositionToScreenPosition(element, startPos, endPos) {
    try {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let currentPos = 0;
      let textNode;

      while (textNode = walker.nextNode()) {
        const nodeText = textNode.textContent;
        const nodeLength = nodeText.length;

        if (currentPos <= startPos && startPos < currentPos + nodeLength) {
          const nodeStart = startPos - currentPos;
          const nodeEnd = Math.min(endPos - currentPos, nodeLength);

          const range = document.createRange();
          range.setStart(textNode, nodeStart);
          range.setEnd(textNode, nodeEnd);

          const rect = range.getBoundingClientRect();

          const computedStyle = window.getComputedStyle(textNode.parentElement || element);
          const fontSize = parseFloat(computedStyle.fontSize) || 16;

          return {
            left: rect.left + window.scrollX,
            top: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
            fontSize: fontSize
          };
        }

        currentPos += nodeLength;
      }

    } catch (error) {
      this.warn('Coordinate conversion failed:', error);
    }

    return null;
  }

  findTextRangeInElement(element, textUpToWord, currentWord) {
    try {
      const getPureText = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          let text = '';
          for (const child of node.childNodes) {
            text += getPureText(child);
          }
          return text;
        }
        return '';
      };

      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let textNode;
      let accumulatedPureText = '';
      let accumulatedTextNodes = [];

      while (textNode = walker.nextNode()) {
        const nodeText = textNode.textContent;
        const pureText = nodeText.replace(/\s+/g, ' ').trim();

        if (pureText.length > 0) {
          accumulatedTextNodes.push({
            node: textNode,
            text: nodeText,
            pureText: pureText,
            startIndex: accumulatedPureText.length
          });
          accumulatedPureText += pureText + ' ';
        }
      }

      const targetPureText = textUpToWord.replace(/\s+/g, ' ').trim();
      const currentPureWord = currentWord.replace(/\s+/g, ' ').trim();

      const targetIndex = accumulatedPureText.indexOf(targetPureText);
      if (targetIndex === -1) {
        this.warn('Could not find target text in plain text:', targetPureText);
        return null;
      }

      const wordStartInPureText = targetIndex + targetPureText.length - currentPureWord.length;
      const wordEndInPureText = wordStartInPureText + currentPureWord.length;

      let currentPureIndex = 0;
      let targetTextNode = null;
      let targetNodeStart = 0;
      let targetNodeEnd = 0;

      for (const textNodeInfo of accumulatedTextNodes) {
        const nodePureLength = textNodeInfo.pureText.length;
        const nodeStart = currentPureIndex;
        const nodeEnd = currentPureIndex + nodePureLength;

        if (wordStartInPureText < nodeEnd && wordEndInPureText > nodeStart) {
          targetTextNode = textNodeInfo.node;

          const overlapStart = Math.max(0, wordStartInPureText - nodeStart);
          const overlapEnd = Math.min(nodePureLength, wordEndInPureText - nodeStart);

          targetNodeStart = this.findActualPositionInTextNode(textNodeInfo.node, textNodeInfo.pureText, overlapStart);
          targetNodeEnd = this.findActualPositionInTextNode(textNodeInfo.node, textNodeInfo.pureText, overlapEnd);

          break;
        }

        currentPureIndex += nodePureLength + 1;
      }

      if (targetTextNode && targetNodeStart !== -1 && targetNodeEnd !== -1) {
        const range = document.createRange();
        range.setStart(targetTextNode, targetNodeStart);
        range.setEnd(targetTextNode, targetNodeEnd);
        return range;
      }

    } catch (error) {
      this.warn('🔍 Failed to find text range:', error);
    }

    return null;
  }

  findActualPositionInTextNode(textNode, pureText, pureIndex) {
    try {
      const actualText = textNode.textContent;

      let purePos = 0;
      let actualPos = 0;

      while (purePos < pureIndex && actualPos < actualText.length) {
        const pureChar = pureText[purePos];
        const actualChar = actualText[actualPos];

        if (pureChar === actualChar ||
            (pureChar === ' ' && /\s/.test(actualChar)) ||
            (actualChar === ' ' && pureChar === ' ')) {
          purePos++;
          actualPos++;
        } else {
          actualPos++;
        }
      }

      return actualPos;

    } catch (error) {
      this.warn('🔍 Failed to find actual position:', error);
      return -1;
    }
  }

  updatePlaybackUI(take) {
    if (!take) return;

    if (this.takeInfoLabel) {
      const totalTakes = this.currentPlayList ? this.currentPlayList.length : this.preTakes.length;
      const currentIndex = this.currentTakeIndex + 1;
      const elementType = take.element?.tagName.toLowerCase() || 'unknown';
      const elementDesc = elementType === 'p' ? '📝 Paragraph' : '📦 Section';
      const language = take.language === 'ko' ? '🇰🇷' : '🇺🇸';

      this.takeInfoLabel.textContent = `${elementDesc} ${currentIndex}/${totalTakes} | <${elementType}> ${language}`;
    }

    if (this.htmlViewer && take.element) {
      const htmlCode = this.generateHighlightedHtml(take.element, take.text);
      this.htmlViewer.innerHTML = htmlCode;
    }

    if (this.voiceLabel) {
      this.voiceLabel.textContent = `🎵 Voice: ${this.selectedVoice.name}`;
    }
  }

  stopAll() {
    return stopAll(this);
  }

  selectVoice(index) {
    if (index >= 0 && index < this.VOICES.length) {
      this.selectedVoice = this.VOICES[index];
      this.updateUI();

      this.updateStatus(`Voice selected: ${this.selectedVoice.name}`, '#4CAF50');
    }
  }

  updateUI() {
    if (this.floatingUI) {
      const voiceLabel = this.floatingUI.querySelector('#tts-voice');
      if (voiceLabel) {
        voiceLabel.textContent = `Voice: ${this.selectedVoice.name}`;
      }

    }
  }

  updateStatus(status, color = '#4CAF50') {
    if (this.statusLabel) {
      this.statusLabel.textContent = status;
      this.statusLabel.style.color = color;
    }
  }

  updateProgress(percentage) {
    if (this.progressBar) {
      this.progressBar.style.width = `${percentage}%`;
    }
  }

  updateTakeInfo(takeIndex, totalTakes) {
    if (this.takeInfoLabel) {
      const take = this.takes[takeIndex];
      const elementType = take?.elementInfo?.metadata?.tagName || 'unknown';
      const elementDesc = elementType === 'p' ? '📝 Paragraph' : '📦 Section';
      const language = take?.language || 'unknown';
      const languageFlag = language === 'ko' ? '🇰🇷' : language === 'en' ? '🇺🇸' : '🌐';

      this.takeInfoLabel.textContent = `${elementDesc} ${takeIndex + 1}/${totalTakes} | <${elementType}> ${languageFlag} ${language}`;
    }
  }

  updateWordInfo(currentWord, totalWords, wordText) {
    if (this.wordInfoLabel) {
      this.wordInfoLabel.textContent = `Word ${currentWord}/${totalWords}: "${wordText}"`;
    }
  }

  updateHtmlViewer(element, currentTakeText) {
    if (!this.htmlViewer || !element) return;

    try {
      const htmlCode = this.generateHighlightedHtml(element, currentTakeText);
      this.htmlViewer.innerHTML = htmlCode;
    } catch (error) {
      this.error('Failed to update HTML viewer:', error);
      this.htmlViewer.innerHTML = '<div style="color: #ff6b6b;">HTML display error</div>';
    }
  }

  generateHighlightedHtml(element, currentText) {
    const tagName = element.tagName.toLowerCase();
    const attributes = this.getElementAttributes(element);
    const textContent = element.textContent.substring(0, 100);

    let highlightedContent = textContent;
    if (currentText) {
      const currentTextShort = currentText.substring(0, 30);
      highlightedContent = textContent.replace(
        currentTextShort,
        `<span class="html-current">${currentTextShort}</span>`
      );
    }

    return `
      <div>
        <span class="html-tag">&lt;${tagName}</span>
        ${attributes}
        <span class="html-tag">&gt;</span>
      </div>
      <div style="margin-left: 10px; margin-top: 5px;">
        <span class="html-text">${highlightedContent}${textContent.length > 100 ? '...' : ''}</span>
      </div>
      <div>
        <span class="html-tag">&lt;/${tagName}&gt;</span>
      </div>
    `;
  }

  getElementAttributes(element) {
    const attrs = [];

    if (element.id) {
      attrs.push(`<span class="html-attr"> id="${element.id}"</span>`);
    }

    if (element.className) {
      const classes = String(element.className).trim().split(/\s+/).slice(0, 3);
      attrs.push(`<span class="html-attr"> class="${classes.join(' ')}"</span>`);
    }

    const importantAttrs = ['role', 'data-*', 'aria-*'];
    for (const attr of element.attributes) {
      if (importantAttrs.some(pattern =>
        pattern.includes('*') ? attr.name.startsWith(pattern.replace('*', '')) : attr.name === pattern
      )) {
        attrs.push(`<span class="html-attr"> ${attr.name}="${attr.value}"</span>`);
      }
    }

    return attrs.join('');
  }

  showUI() {
    if (this.floatingUI) {
      this.floatingUI.style.display = this.takeListVisible ? 'block' : 'none';
    }

    if (!this.bottomFloatingUI) {
      this.createBottomFloatingUI();
    }
    this.bottomFloatingUI.style.display = this.floatingBarVisible ? 'block' : 'none';
  }

  hideUI() {
    if (this.floatingUI) {
      this.floatingUI.style.display = 'none';
    }

    const scrollSpacer = document.getElementById('tts-bottom-scroll-spacer');
    if (scrollSpacer) {
      scrollSpacer.remove();
    }

  }

  isReaderPage() {
    try {
      const href = window.location.href;
      return href.includes('reader.html');
    } catch (error) {
      return false;
    }
  }

  async loadReaderDarkMode() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['readerTypographySettings'], (result) => {
        if (result.readerTypographySettings && result.readerTypographySettings.darkMode !== undefined) {
          resolve(result.readerTypographySettings.darkMode);
        } else {
          resolve(null);
        }
      });
    });
  }

  async detectAndApplyTheme() {
    try {
      if (this.isReaderPage()) {
        const readerDarkMode = await this.loadReaderDarkMode();
        if (readerDarkMode !== null) {
          this.currentTheme = readerDarkMode ? 'dark' : 'light';
          if (this.bottomFloatingUI) {
            this.updateBottomFloatingUITheme();
          }
          return;
        }
      }

      const siteTheme = this.detectSiteTheme();
      if (siteTheme !== null) {
        this.currentTheme = siteTheme;
        if (this.bottomFloatingUI) {
          this.updateBottomFloatingUITheme();
        }
        this.setupSiteThemeChangeListener();
        this.setupOSThemeChangeListener();
        return;
      }

      const isOSDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

      const siteFollowsOS = this.checkIfSiteFollowsOS();

      if (siteFollowsOS) {
        this.currentTheme = isOSDarkMode ? 'dark' : 'light';
      } else {
        const backgroundColor = await this.analyzePageBackgroundColor();
        const isDark = this.isColorDark(backgroundColor);

        this.currentTheme = isDark ? 'dark' : 'light';
      }

      if (this.bottomFloatingUI) {
        this.updateBottomFloatingUITheme();
      }

      this.setupOSThemeChangeListener();

    } catch (error) {
      this.currentTheme = 'light';
    }
  }

  detectSiteTheme() {
    try {
      const bodyClasses = document.body.classList;
      if (bodyClasses.contains('theme-dark') || bodyClasses.contains('dark') ||
          bodyClasses.contains('dark-mode') || bodyClasses.contains('darkMode')) {
        return 'dark';
      }
      if (bodyClasses.contains('theme-light') || bodyClasses.contains('light') ||
          bodyClasses.contains('light-mode') || bodyClasses.contains('lightMode')) {
        return 'light';
      }

      const htmlClasses = document.documentElement.classList;
      if (htmlClasses.contains('theme-dark') || htmlClasses.contains('dark') ||
          htmlClasses.contains('dark-mode') || htmlClasses.contains('darkMode')) {
        return 'dark';
      }
      if (htmlClasses.contains('theme-light') || htmlClasses.contains('light') ||
          htmlClasses.contains('light-mode') || htmlClasses.contains('lightMode')) {
        return 'light';
      }

      const bodyTheme = document.body.getAttribute('data-theme');
      if (bodyTheme === 'dark') return 'dark';
      if (bodyTheme === 'light') return 'light';

      const htmlTheme = document.documentElement.getAttribute('data-theme');
      if (htmlTheme === 'dark') return 'dark';
      if (htmlTheme === 'light') return 'light';

      const bodyColorScheme = document.body.getAttribute('data-color-scheme');
      if (bodyColorScheme === 'dark') return 'dark';
      if (bodyColorScheme === 'light') return 'light';

      const htmlColorScheme = document.documentElement.getAttribute('data-color-scheme');
      if (htmlColorScheme === 'dark') return 'dark';
      if (htmlColorScheme === 'light') return 'light';

      const rootStyle = getComputedStyle(document.documentElement);
      const colorScheme = rootStyle.getPropertyValue('--color-scheme')?.trim() ||
                         rootStyle.getPropertyValue('--theme')?.trim();
      if (colorScheme === 'dark') return 'dark';
      if (colorScheme === 'light') return 'light';

      const computedColorScheme = rootStyle.colorScheme;
      if (computedColorScheme === 'dark') return 'dark';
      if (computedColorScheme === 'light') return 'light';

      return null;
    } catch (error) {
      return null;
    }
  }

  setupSiteThemeChangeListener() {
    try {
      if (this.siteThemeObserver) {
        return;
      }

      this.siteThemeObserver = new MutationObserver((mutations) => {
        let themeChanged = false;

        for (const mutation of mutations) {
          if (mutation.type === 'attributes' &&
              (mutation.attributeName === 'class' ||
               mutation.attributeName === 'data-theme' ||
               mutation.attributeName === 'data-color-scheme')) {
            themeChanged = true;
            break;
          }
        }

        if (themeChanged) {
          const newTheme = this.detectSiteTheme();
          if (newTheme !== null && newTheme !== this.currentTheme) {
            this.currentTheme = newTheme;

            if (this.bottomFloatingUI) {
              this.updateBottomFloatingUITheme();
            }
          }
        }
      });

      this.siteThemeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'data-color-scheme']
      });

      this.siteThemeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'data-color-scheme']
      });

    } catch (error) {
    }
  }

  setupOSThemeChangeListener() {
    try {
      if (this.osThemeChangeListener) {
        return;
      }

      this.osThemeChangeListener = window.matchMedia('(prefers-color-scheme: dark)');

      const handleThemeChange = (e) => {
        const isOSDarkMode = e.matches;

        if (this.checkIfSiteFollowsOS()) {
          this.currentTheme = isOSDarkMode ? 'dark' : 'light';

          if (this.bottomFloatingUI) {
            this.updateBottomFloatingUITheme();
          }

        }
      };

      this.osThemeChangeListener.addEventListener('change', handleThemeChange);
    } catch (error) {
    }
  }

  checkIfSiteFollowsOS() {
    try {
      const hostname = window.location.hostname;

      const osFollowingSites = [
        'bard.google.com',
        'claude.ai',
        'github.com',
        'stackoverflow.com',
        'reddit.com',
        'twitter.com',
        'x.com',
        'discord.com',
        'slack.com',
        'notion.so',
        'figma.com',
        'linear.app',
        'vercel.com',
        'netlify.com'
      ];

      const followsOS = osFollowingSites.some(site => hostname.includes(site));

      return followsOS;
    } catch (error) {
      return false;
    }
  }

  async analyzePageBackgroundColor() {
    return 'rgb(255, 255, 255)';

    try {
      let bodyBgColor = null;
      try {
        const bodyStyle = this.safeGetComputedStyle(document.body);
        if (bodyStyle) {
          try {
            bodyBgColor = bodyStyle.backgroundColor;
          } catch (e) {
          }
        }
      } catch (e) {
      }

      let htmlBgColor = null;
      try {
        const htmlStyle = this.safeGetComputedStyle(document.documentElement);
        if (htmlStyle) {
          try {
            htmlBgColor = htmlStyle.backgroundColor;
          } catch (e) {
          }
        }
      } catch (e) {
      }

    const dominantBgColor = this.findDominantBackgroundColor();


    if (bodyBgColor && bodyBgColor !== 'rgba(0, 0, 0, 0)' && bodyBgColor !== 'transparent') {
      finalColor = bodyBgColor;
    } else if (htmlBgColor && htmlBgColor !== 'rgba(0, 0, 0, 0)' && htmlBgColor !== 'transparent') {
      finalColor = htmlBgColor;
    } else if (dominantBgColor) {
      finalColor = dominantBgColor;
    }

    return finalColor;
    } catch (error) {
    }
  }

  findDominantBackgroundColor() {
    try {
      const samplePoints = [
        { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 },
        { x: window.innerWidth * 0.1, y: window.innerHeight * 0.1 },
        { x: window.innerWidth * 0.9, y: window.innerHeight * 0.1 },
        { x: window.innerWidth * 0.1, y: window.innerHeight * 0.9 },
        { x: window.innerWidth * 0.9, y: window.innerHeight * 0.9 },
        { x: window.innerWidth * 0.5, y: window.innerHeight * 0.1 },
        { x: window.innerWidth * 0.5, y: window.innerHeight * 0.9 },
      ];

      const colorCounts = {};

      for (const point of samplePoints) {
        try {
          const element = this.safeElementFromPoint(point.x, point.y);
        if (element) {
          const color = this.getEffectiveBackgroundColor(element);
          if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') {
            colorCounts[color] = (colorCounts[color] || 0) + 1;
          }
          }
        } catch (e) {
        }
      }

      const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
      return sortedColors.length > 0 ? sortedColors[0][0] : null;

    } catch (error) {
      return null;
    }
  }

  getEffectiveBackgroundColor(element) {
    try {
    let currentElement = element;

    while (currentElement && currentElement !== document.body) {
        try {
          const style = this.safeGetComputedStyle(currentElement);
          if (style) {
            try {
      const bgColor = style.backgroundColor;

      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
        return bgColor;
              }
            } catch (e) {
            }
          }
        } catch (e) {
      }

      currentElement = currentElement.parentElement;
    }

    if (currentElement === document.body) {
        try {
          const bodyStyle = this.safeGetComputedStyle(document.body);
          if (bodyStyle) {
            try {
      const bodyBgColor = bodyStyle.backgroundColor;
      if (bodyBgColor && bodyBgColor !== 'rgba(0, 0, 0, 0)' && bodyBgColor !== 'transparent') {
        return bodyBgColor;
              }
            } catch (e) {
            }
          }
        } catch (e) {
      }
    }

    return 'rgb(255, 255, 255)';
    } catch (error) {
      return 'rgb(255, 255, 255)';
    }
  }

  isColorDark(colorString) {
    try {
      const rgb = this.parseColorToRGB(colorString);
      if (!rgb) return false;

      const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;

      const isDark = luminance < 0.5;

      return isDark;
    } catch (error) {
      return false;
    }
  }

  parseColorToRGB(colorString) {
    if (!colorString) return null;

    const rgbMatch = colorString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3])
      };
    }

    const rgbaMatch = colorString.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/);
    if (rgbaMatch) {
      return {
        r: parseInt(rgbaMatch[1]),
        g: parseInt(rgbaMatch[2]),
        b: parseInt(rgbaMatch[3])
      };
    }

    const hexMatch = colorString.match(/^#([a-fA-F0-9]{6})$/);
    if (hexMatch) {
      const hex = hexMatch[1];
      return {
        r: parseInt(hex.substr(0, 2), 16),
        g: parseInt(hex.substr(2, 2), 16),
        b: parseInt(hex.substr(4, 2), 16)
      };
    }

    const shortHexMatch = colorString.match(/^#([a-fA-F0-9]{3})$/);
    if (shortHexMatch) {
      const hex = shortHexMatch[1];
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16)
      };
    }

    return null;
  }


  updatearText() {
    const arText = document.getElementById('tts-ar-text');
    if (arText) {
      const computedStyle = window.getComputedStyle(arText);
      const textColor = arText.style.color || computedStyle.color || '#ffffff';
      arText.textContent = 'Anything Reader';
      arText.style.color = textColor;
    }
  }

  updateBottomFloatingUITheme() {
    return updatePlayerDockTheme(this);
  }

  createBottomFloatingUI() {
    return createPlayerDock(this);
  }

  getSpeedText(speed) {
    return getSpeedText(speed);
  }

  getSpeedTextForTinyUI(speed) {
    return getSpeedTextForTinyUI(speed);
  }

  showSpeedMenu() {
    return showSpeedMenu(this);
  }

  hideSpeedMenu() {
    return hideSpeedMenu(this);
  }

  handleSpeedMenuOutsideClick(event) {
    return handleSpeedMenuOutsideClick(this, event);
  }

  async selectSpeed(speedOption) {
    return selectSpeed(this, speedOption);
  }

  updateFloatingBarBorder(mode) {
    if (!this.bottomFloatingUI) return;

    const isDark = this.currentTheme === 'dark';
    const borderColor = isDark ? 'rgba(125, 125, 125, 0.25)' : 'rgba(100, 100, 100, 0.4)';

    this.bottomFloatingUI.style.borderTop = 'none';
    this.bottomFloatingUI.style.borderBottom = 'none';
    this.bottomFloatingUI.style.borderLeft = 'none';
    this.bottomFloatingUI.style.borderRight = 'none';

    switch (mode) {
      case 'top':
        this.bottomFloatingUI.style.borderBottom = `1px solid ${borderColor}`;
        break;
      case 'bottom':
        this.bottomFloatingUI.style.borderTop = `1px solid ${borderColor}`;
        break;
      case 'left':
        this.bottomFloatingUI.style.borderTop = `1px solid ${borderColor}`;
        break;
      case 'right':
        this.bottomFloatingUI.style.borderTop = `1px solid ${borderColor}`;
        break;
      case 'middle':
        this.bottomFloatingUI.style.border = `1px solid ${borderColor}`;
        break;
      default:
        this.bottomFloatingUI.style.borderTop = `1px solid ${borderColor}`;
        break;
    }
  }

  showPageReadError(errorMessage = null) {
    if (!this.bottomFloatingButton) return;

    this.isPageReadError = true;
    this.lastPageReadError = errorMessage || null;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isGenerating = false;
    this.currentGeneratingTakeId = null;

    this.shouldStopSequentialPlayback = true;

    this.stopAll();

    this.hideTakeHoverIcon();

    this.updatePageReadError();
  }

  showLowPowerError(powerStatus) {
    if (!this.bottomFloatingButton) return;

    this.isPageReadError = true;
    this.isLowPowerMode = true;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isGenerating = false;
    this.currentGeneratingTakeId = null;
    this.shouldStopSequentialPlayback = true;
    this.stopAll();
    this.hideTakeHoverIcon();

    this.updateLowPowerError(powerStatus);
  }

  updatePageReadError() {
    if (!this.bottomFloatingButton || !this.isPageReadError) return;
    this.bottomFloatingButton.style.display = 'flex';
    this.bottomFloatingButton.style.pointerEvents = 'auto';
    this.bottomFloatingButton.style.cursor = 'pointer';
    this.bottomFloatingButton.title = this.lastPageReadError ? `TTS error: ${this.lastPageReadError}` : 'TTS error';
    this.updateBottomFloatingUIState();
  }

  updateLowPowerError(powerStatus) {
    if (!this.bottomFloatingButton || !this.isPageReadError) return;
    this.bottomFloatingButton.style.display = 'flex';
    this.bottomFloatingButton.style.pointerEvents = 'auto';
    this.bottomFloatingButton.style.cursor = 'pointer';
    this.bottomFloatingButton.title = 'TTS low power';
    this.updateBottomFloatingUIState();
  }

  updateBottomFloatingUIState() {
    return updatePlayerDockState(this);
  }

  populateDockVoiceSelect() {
    return populatePlayerDockVoiceSelect(this);
  }

  populateDockSpeedSelect() {
    return populatePlayerDockSpeedSelect(this);
  }

  async handleBottomFloatingButtonClick(event) {
    if (!event) return;

    if (this.isGenerating) {
      return;
    }

    const targetElement = event.target.closest('[data-action]') || event.target;
    const action = targetElement?.dataset?.action;

    if (!action) return;

    if (action === 'voice-menu') {
      event.stopPropagation();
      this.showVoiceMenu();
      return;
    }

    if (action === 'toggle-playback') {
      event.stopPropagation();
      if (this.isPlaying) {
        if (this.isPaused) {
          this.resumePlayback();
        } else {
          this.pausePlayback();
        }
      } else {
        await this.startReadingFromFirst();
      }
      return;
    }

    if (action === 'start-reading') {
      event.stopPropagation();
      await this.startReadingFromFirst();
      return;
    }

    if (event && event.target.dataset.action === 'speed-menu') {
      event.stopPropagation();
      this.showSpeedMenu();
      return;
    }

    if (this.isPlaying) {
      if (this.isPaused) {
        this.resumePlayback();
      } else {
        this.pausePlayback();
      }
    } else {
      await this.requestRefresh();
    }
  }


  async requestRefresh() {

    if (this.refreshButton) {
      const refreshIcon = this.refreshButton.querySelector('.refresh-icon');
      if (refreshIcon) {
        refreshIcon.style.transform = 'rotate(-360deg)';
        refreshIcon.style.transition = 'transform 0.5s ease-in-out';
      }
    }

    this.updateStatus('Re-collecting content...', '#FF9800');

    try {
      this.preTakes = [];
      this.currentPlayList = [];
      this.currentTakeIndex = 0;
      this.currentPlayingTakeId = null;

      await this.analyzePageAndCreateTakes();

      if (this.preTakes && this.preTakes.length > 0) {
        this.updateStatus(`Re-collection complete (${this.preTakes.length} takes)`, '#4CAF50');
        this.updateTakeCount();

        this.showUI();
      } else {
        this.updateStatus('No content re-collected', '#F44336');
      }

    } catch (error) {
      this.error('Failed to recollect takes:', error);
      this.updateStatus('Re-collection failed', '#F44336');
    } finally {
      setTimeout(() => {
        if (this.refreshButton) {
          const refreshIcon = this.refreshButton.querySelector('.refresh-icon');
          if (refreshIcon) {
            refreshIcon.style.transition = 'none';
            refreshIcon.style.transform = 'rotate(0deg)';
            setTimeout(() => {
              if (refreshIcon) {
                refreshIcon.style.transition = 'transform 0.5s ease-in-out';
              }
            }, 10);
          }
        }
      }, 500);
    }
  }

  async handleRefreshButtonClick() {
    await this.requestRefresh();
  }

  async openReaderPage() {
    if (!this.preTakes || this.preTakes.length === 0) {
      try {
        await this.analyzePageAndCreateTakes();
      } catch (error) {
        this.error('Page analysis failed:', error);
        return;
      }
    }

    if (!this.preTakes || this.preTakes.length === 0) {
      this.warn('No content found to display');
      return;
    }

    const texts = this.preTakes.map(take => take.text).filter(text => text && text.trim());

    if (texts.length === 0) {
      this.warn('No content found to display');
      return;
    }

    chrome.runtime.sendMessage({
      action: 'openReaderPage',
      texts: texts
    }, (response) => {
      if (chrome.runtime.lastError) {
        this.error('Failed to open reader page:', chrome.runtime.lastError);
        this.warn('Failed to open reader page');
      }
    });
  }

  async startReadingFromFirst() {
    if (this.isPageReadError) {
      this.warn('This page cannot be read. Audio generation is disabled.');
      return;
    }

    if (this.preTakes && this.preTakes.length > 0) {
      await this.startPlaybackFromTake(this.preTakes[0]);
    } else {
      this.updateStatus('Analyzing page...', '#FF9800');
      try {
        await this.analyzePageAndCreateTakes();
        if (this.preTakes && this.preTakes.length > 0) {
          await this.startPlaybackFromTake(this.preTakes[0]);
        } else {
          this.updateStatus('No content found to read', '#F44336');
        }
      } catch (error) {
        this.error('Page analysis failed:', error);
        this.updateStatus('Page analysis failed', '#F44336');
      }
    }
  }

  showVoiceMenu() {
    return showVoiceMenu(this);
  }

  handleVoiceMenuOutsideClick(event) {
    return handleVoiceMenuOutsideClick(this, event);
  }

  hideVoiceMenu() {
    return hideVoiceMenu(this);
  }

  async selectVoice(voice) {
    return selectVoice(this, voice);
  }

  async handleVoiceOrSpeedChange(context = 'voice_change') {

    if (this.currentPlayList && this.currentPlayList.length > 0 && this.currentTakeIndex >= 0) {
      const currentTake = this.currentPlayList[this.currentTakeIndex];
      if (currentTake) {
        await this.startPlaybackFromTake(currentTake);
      }
    } else {
    }
  }



  clearAllAudio() {
    return clearAllAudio(this);
  }

  updateVoiceMenuSelection(selectedVoiceId) {
    return updateVoiceMenuSelection(this, selectedVoiceId);
  }

  pausePlayback() {
    return pausePlayback(this);
  }

  resumePlayback() {
    return resumePlayback(this);
  }

  async startTTS(text, elementMetadata = null) {
    if (!this.isPluginEnabled) {
      return;
    }


    this.updateStatus('Hover over content and press keys 1-0', '#FF9800');

    setTimeout(() => {
      this.updateStatus('TTS ready - Hover and press keys 1-0', '#4CAF50');
    }, 5000);
  }

  async splitTextIntoTakes(text, elementMetadata = null) {
    let preprocessedText = text;
    if (window.textPreprocessor) {
      preprocessedText = window.textPreprocessor.preprocess(text);
    }

    const selectedElement = elementMetadata?.domElement || window.ttsSelector?.currentElement;
    let targetText = preprocessedText;

    if (selectedElement) {
      const fullText = this.extractAllTextFromElement(selectedElement);
      if (fullText && fullText.length > preprocessedText.length * 0.8) {
        targetText = window.textPreprocessor ? window.textPreprocessor.preprocess(fullText) : fullText;
      } else {
      }
    }


    const defaultMaxLength = 250;

    const takes = [];
    let takeNumber = 1;

    const blocks = targetText.split(/(?:[ \t]*\r?\n){2,}/);

    for (let block of blocks) {
      let remainingText = block.trim();

      if (remainingText.length === 0) {
        continue;
      }

      const maxLength = this.getChunkMaxLength();

      while (remainingText.length > 0) {
        const currentLanguage = 'en';

        if (remainingText.length <= maxLength) {
          const takeElementInfo = this.findTakeElementInfo(remainingText, elementMetadata, selectedElement);

          takes.push({
            index: takeNumber - 1,
            text: remainingText,
            name: `Take ${takeNumber}`,
            language: currentLanguage,
            elementInfo: takeElementInfo
          });
          takeNumber++;
          break;
        }

        let cutIndex = this.findBestCutPosition(remainingText, maxLength);

        if (cutIndex <= 0 || cutIndex >= remainingText.length) {
          const takeElementInfo = this.findTakeElementInfo(remainingText, elementMetadata, selectedElement);
          takes.push({
            index: takeNumber - 1,
            text: remainingText,
            name: `Take ${takeNumber}`,
            language: currentLanguage,
            elementInfo: takeElementInfo
          });
          takeNumber++;
          break;
        }

        const takeText = remainingText.slice(0, cutIndex).trim();
        if (takeText.length > 0) {
          const takeElementInfo = this.findTakeElementInfo(takeText, elementMetadata, selectedElement);

          takes.push({
            index: takeNumber - 1,
            text: takeText,
            name: `Take ${takeNumber}`,
            language: currentLanguage,
            elementInfo: takeElementInfo
          });
          takeNumber++;
        }

        remainingText = remainingText.slice(cutIndex).trim();
      }
    }

    takes.forEach((take, index) => {
    });

    return takes;
  }

  findTakeElementInfo(takeText, sourceMetadata, sourceElement) {
    if (!sourceElement) {
      return {
        element: null,
        selector: sourceMetadata?.selector || '',
        metadata: sourceMetadata,
        confidence: 0
      };
    }

    const targetElement = this.findBestContainerForTake(takeText, sourceElement);

    if (targetElement && targetElement !== sourceElement) {
      const elementType = targetElement.tagName.toLowerCase();
      const elementDesc = elementType === 'p' ? '📝 Paragraph' : '📦 Section';

      const takeMetadata = {
        tagName: targetElement.tagName.toLowerCase(),
        className: targetElement.className || '',
        id: targetElement.id || '',
        selector: this.generateTakeSelector(targetElement),
        parentSelector: sourceMetadata?.selector || '',
        domElement: targetElement
      };

      return {
        element: targetElement,
        selector: takeMetadata.selector,
        metadata: takeMetadata,
        confidence: elementType === 'p' ? 0.9 : 0.8
      };
    } else {

      return {
        element: sourceElement,
        selector: sourceMetadata?.selector || '',
        metadata: sourceMetadata,
        confidence: 0.5
      };
    }
  }

  findBestContainerForTake(takeText, parentElement) {
    const cleanedTakeText = takeText.replace(/::[^:]+::/g, '');
    const normalizedTakeText = this.normalizeForMatching(cleanedTakeText);
    const takeWords = normalizedTakeText.split(/\s+/).filter(w => w.length > 2);

    if (takeWords.length < 3) {
      return parentElement;
    }

    const keywordSample = takeWords.slice(0, Math.min(5, takeWords.length)).join(' ');


    const candidates = [];
    const walker = document.createTreeWalker(
      parentElement,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          const meaningfulTags = ['p', 'div', 'article', 'section', 'blockquote', 'aside', 'main', 'header', 'footer'];
          if (!meaningfulTags.includes(node.tagName.toLowerCase())) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let currentNode;
    while (currentNode = walker.nextNode()) {
      const elementText = this.extractTextFromSingleElement(currentNode);
      const normalizedElementText = this.normalizeForMatching(elementText);

      const matchScore = this.calculateKeywordMatch(keywordSample, normalizedElementText);

      if (matchScore > 0.6) {
        candidates.push({
          element: currentNode,
          score: matchScore,
          textLength: elementText.length
        });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => {
        const aIsP = a.element.tagName.toLowerCase() === 'p';
        const bIsP = b.element.tagName.toLowerCase() === 'p';

        if (aIsP && !bIsP) return -1;
        if (!aIsP && bIsP) return 1;

        const aSizeDiff = Math.abs(a.textLength - takeText.length);
        const bSizeDiff = Math.abs(b.textLength - takeText.length);

        const aPenalty = a.textLength > takeText.length * 3 ? 0.3 : 0;
        const bPenalty = b.textLength > takeText.length * 3 ? 0.3 : 0;

        const aFinalScore = a.score - aPenalty - aSizeDiff / 1000;
        const bFinalScore = b.score - bPenalty - bSizeDiff / 1000;

        return bFinalScore - aFinalScore;
      });

      const bestCandidate = candidates[0];
      return bestCandidate.element;
    }

    return parentElement;
  }

  extractTextFromSingleElement(element) {
    const tagName = element.tagName.toLowerCase();

    if (tagName === 'p') {
      return this.extractTextFromParagraph(element);
    }

    let text = '';
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent;
      }
    }

    return text.trim();
  }

  extractTextFromParagraph(pElement) {
    let text = '';

    const walker = document.createTreeWalker(
      pElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (node.textContent.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }

          let parent = node.parentElement;
          while (parent && parent !== pElement) {
            const parentTag = parent.tagName.toLowerCase();
            if (['script', 'style', 'noscript'].includes(parentTag)) {
              return NodeFilter.FILTER_REJECT;
            }
            parent = parent.parentElement;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let textNode;
    while (textNode = walker.nextNode()) {
      text += textNode.textContent;
    }

    return text.trim();
  }

  calculateKeywordMatch(keywords, text) {
    const keywordArray = keywords.split(/\s+/);
    let matchCount = 0;

    for (const keyword of keywordArray) {
      if (text.includes(keyword)) {
        matchCount++;
      }
    }

    return matchCount / keywordArray.length;
  }

  generateTakeSelector(element) {
    let selector = element.tagName.toLowerCase();

    if (element.id) {
      selector += `#${element.id}`;
    } else if (element.className) {
      const classes = String(element.className).trim().split(/\s+/);
      selector += '.' + classes.slice(0, 2).join('.');
    }

    return selector;
  }

  findBestCutPosition(text, maxLength) {
    const lastPeriod = text.lastIndexOf('.', maxLength);
    const lastExclam = text.lastIndexOf('!', maxLength);
    const lastQuestion = text.lastIndexOf('?', maxLength);
    const lastTilde = text.lastIndexOf('~', maxLength);

    const lastJapanesePeriod = text.lastIndexOf('。', maxLength);
    const lastJapaneseComma = text.lastIndexOf('、', maxLength);
    const lastJapaneseExclam = text.lastIndexOf('！', maxLength);
    const lastJapaneseQuestion = text.lastIndexOf('？', maxLength);

    const lastJapaneseQuote1 = text.lastIndexOf('」', maxLength);
    const lastJapaneseQuote2 = text.lastIndexOf('』', maxLength);
    const lastJapaneseQuote3 = text.lastIndexOf('〉', maxLength);
    const lastJapaneseQuote4 = text.lastIndexOf('》', maxLength);

    const lastQuote1 = text.lastIndexOf('"', maxLength);
    const lastQuote2 = text.lastIndexOf('"', maxLength);
    const lastQuote3 = text.lastIndexOf("'", maxLength);
    const lastQuote4 = text.lastIndexOf("'", maxLength);

    const sentenceEndCandidates = [
      lastPeriod, lastExclam, lastQuestion, lastTilde,
      lastJapanesePeriod, lastJapaneseComma, lastJapaneseExclam, lastJapaneseQuestion,
      lastJapaneseQuote1, lastJapaneseQuote2, lastJapaneseQuote3, lastJapaneseQuote4,
      lastQuote1, lastQuote2, lastQuote3, lastQuote4
    ].filter(idx => idx > 0);

    const lastComma = text.lastIndexOf(',', maxLength);
    const lastSemicolon = text.lastIndexOf(';', maxLength);
    const lastColon = text.lastIndexOf(':', maxLength);

    const lastJapaneseMiddleDot = text.lastIndexOf('・', maxLength);
    const lastJapaneseColon = text.lastIndexOf('：', maxLength);
    const lastJapaneseSemicolon = text.lastIndexOf('；', maxLength);

    const clauseEndCandidates = [
      lastComma, lastSemicolon, lastColon,
      lastJapaneseMiddleDot, lastJapaneseColon, lastJapaneseSemicolon
    ].filter(idx => idx > 0);

    const lastSpace = text.lastIndexOf(' ', maxLength);

    if (sentenceEndCandidates.length > 0) {
      const bestSentenceEnd = Math.max(...sentenceEndCandidates);
      const nextChar = text[bestSentenceEnd + 1];
      if (nextChar && nextChar === ' ') {
        return bestSentenceEnd + 2;
      } else {
        return bestSentenceEnd + 1;
      }
    }

    if (clauseEndCandidates.length > 0) {
      const bestClauseEnd = Math.max(...clauseEndCandidates);
      const nextChar = text[bestClauseEnd + 1];
      if (nextChar && nextChar === ' ') {
        return bestClauseEnd + 2;
      } else {
        return bestClauseEnd + 1;
      }
    }

    if (lastSpace > 0) {
      return lastSpace;
    }

    return maxLength;
  }

  extractAllTextFromElement(element) {
    return window.htmlAnalyzerCommon.extractAllTextFromElement(element);
  }

  isMainContentText(element, text) {
    const hostname = window.location.hostname.toLowerCase();

    const siteSpecificResult = window.htmlAnalyzerSites.isSiteSpecificMainContent(hostname, element, text);
    if (siteSpecificResult !== null) {
      return siteSpecificResult;
    }

    return window.htmlAnalyzerCommon.isMainContentText(element, text);
  }

  isImportantContent(element, text) {
    return window.htmlAnalyzerCommon.isImportantContent(element, text);
  }

  isExcludedElement(element) {
    const hostname = window.location.hostname.toLowerCase();
    const className = String(element.className || '').toLowerCase();
    const elementId = (element.id || '').toLowerCase();

    if (window.htmlAnalyzerSites.isSiteSpecificExcludedElement(hostname, element, className, elementId)) {
      return true;
    }

    return window.htmlAnalyzerCommon.isExcludedElement(element);
  }

  extractVisibleText() {
    return window.htmlAnalyzerCommon.extractVisibleText();
  }

  isElementVisible(element) {
    return window.htmlAnalyzerCommon.isElementVisible(element);
  }


  async generateAndPlayTake(takeIndex) {
    if (!this.isPluginEnabled) {
      return;
    }

    if (takeIndex >= this.takes.length) return;

    const take = this.takes[takeIndex];

    try {
      let audioUrl;

      const cacheKey = `take_${takeIndex}_${this.ttsModel}_${this.selectedVoice.id}`;
      const cachedAudio = this.getFromAudioCache(cacheKey);

      if (cachedAudio) {
        audioUrl = cachedAudio;
        this.updateStatus(`Playing... (${takeIndex + 1}/${this.takes.length})`, '#4CAF50');
      } else {
        this.updateStatus(`Generating audio... (${takeIndex + 1}/${this.takes.length})`, '#FF9800');
        audioUrl = await this.convertToSpeech(take);
        this.addToAudioCache(cacheKey, audioUrl);
      }

      await this.playAudio(audioUrl, takeIndex);

    } catch (error) {
      this.error(`Take ${takeIndex + 1} failed:`, error);
      this.updateStatus('Playback failed', '#F44336');
    }
  }

  getChunkMaxLength(language = null) {
    if (language === 'ko' || language === 'ja') {
      return 120;
    }

    const htmlLang = (document.documentElement.lang || '').toLowerCase();
    const bodyText = document.body?.textContent || '';
    const isShortChunkLanguage = htmlLang.startsWith('ko') ||
                                 htmlLang === 'kr' ||
                                 htmlLang.startsWith('ja') ||
                                 bodyText.match(/[\uAC00-\uD7A3]/g)?.length > 50 ||
                                 bodyText.match(/[\u3040-\u30ff]/g)?.length > 50;

    return isShortChunkLanguage ? 120 : 240;
  }

  needsMultiChunk(text, language) {
    const maxLength = this.getChunkMaxLength(language);
    return text.length > maxLength;
  }

  smartChunkSplit(text, language) {
    const maxLength = this.getChunkMaxLength(language);
    const preferredMax = maxLength;
    const hardMax = language === 'ko' || language === 'ja' ? 180 : 320;
    const sentenceParts = text
      .split(/(?<=[.!?。！？])\s+/)
      .map(part => part.trim())
      .filter(Boolean);

    if (sentenceParts.length > 1) {
      const chunks = [];
      let current = '';

      for (const sentence of sentenceParts) {
        const next = current ? `${current} ${sentence}` : sentence;

        if (next.length <= preferredMax || current.length === 0) {
          if (sentence.length > hardMax) {
            if (current) {
              chunks.push(current.trim());
              current = '';
            }
            chunks.push(...this.forceSplitLongSentence(sentence, preferredMax));
          } else {
            current = next;
          }
          continue;
        }

        chunks.push(current.trim());
        current = sentence.length > hardMax ? '' : sentence;

        if (sentence.length > hardMax) {
          chunks.push(...this.forceSplitLongSentence(sentence, preferredMax));
        }
      }

      if (current.trim()) {
        chunks.push(current.trim());
      }

      return chunks;
    }

    const chunks = [];
    let remainingText = text;

    while (remainingText.length > maxLength) {
      const cutIndex = this.findBestCutPosition(remainingText, maxLength);
      if (cutIndex <= 0 || cutIndex >= remainingText.length) {
        chunks.push(remainingText.trim());
        remainingText = '';
        break;
      }
      chunks.push(remainingText.slice(0, cutIndex).trim());
      remainingText = remainingText.slice(cutIndex).trim();
    }

    if (remainingText.length > 0) {
      chunks.push(remainingText);
    }

    return chunks;
  }

  forceSplitLongSentence(text, maxLength) {
    const chunks = [];
    let remainingText = text.trim();

    while (remainingText.length > maxLength) {
      const cutIndex = this.findBestCutPosition(remainingText, maxLength);
      if (cutIndex <= 0 || cutIndex >= remainingText.length) {
        chunks.push(remainingText.slice(0, maxLength).trim());
        remainingText = remainingText.slice(maxLength).trim();
      } else {
        chunks.push(remainingText.slice(0, cutIndex).trim());
        remainingText = remainingText.slice(cutIndex).trim();
      }
    }

    if (remainingText) {
      chunks.push(remainingText);
    }

    return chunks;
  }

  async generateSingleChunkAudio(text, voice, language, chunkIndexOrAbortController = 0) {
    const chunkIndex = typeof chunkIndexOrAbortController === 'number' ? chunkIndexOrAbortController : 0;
    const abortController = chunkIndexOrAbortController instanceof AbortController ? chunkIndexOrAbortController : this.abortController;

    let processedText = text;
    if (window.textPreprocessor) {
      processedText = window.textPreprocessor.preprocess(text);
    }

    try {
      if (!this.ttsInitialized) {
        await this.initializeSupertonic();
      }

      const speechLength = 1.0 / (this.playbackSpeed + 0.05);
      const qualityStepMap = { 'Fast': 5, 'Balanced': 8, 'Quality': 15 };
      const totalStep = qualityStepMap[this.quality] || 8;
      const pageLang = this.detectPageLanguageForOffscreen();

      const result = await this.sendTTSMessage('tts-generate', {
        model: this.ttsModel,
        text: processedText,
        voiceId: voice.id,
        speechLength,
        totalStep,
        language: pageLang
      });

      if (!result.success) {
        throw new Error(result.error || 'TTS generation failed');
      }

      const binaryString = atob(result.audioBase64);
      const wavBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        wavBytes[i] = binaryString.charCodeAt(i);
      }
      const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
      const sampleRate = result.sampleRate;

      const hostname = window.location.hostname.toLowerCase();
      const isCSPRestricted = this.cspRestrictedSites.some(site => hostname.includes(site));

      if (isCSPRestricted) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = wavBytes.buffer.slice(0, wavBytes.byteLength);
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return { audioBuffer, sampleRate };
      }

      return URL.createObjectURL(wavBlob);
    } catch (error) {
      this.error('❌ Supertonic TTS generation failed:', error);
      throw error;
    }
  }

  async mergeAudioUrls(audioUrls) {

    try {
      const hostname = window.location.hostname.toLowerCase();
      const isCSPRestricted = this.cspRestrictedSites.some(site => hostname.includes(site));

      const audioBuffers = await Promise.all(
        audioUrls.map(async (urlOrBuffer, index) => {
          if (isCSPRestricted && urlOrBuffer && typeof urlOrBuffer === 'object' && urlOrBuffer.audioBuffer) {
            return urlOrBuffer.audioBuffer;
          }

          const response = await fetch(urlOrBuffer);
          const arrayBuffer = await response.arrayBuffer();
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          return await audioContext.decodeAudioData(arrayBuffer);
        })
      );


      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const totalLength = audioBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
      const sampleRate = audioBuffers[0].sampleRate;
      const numberOfChannels = audioBuffers[0].numberOfChannels;

      const mergedBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);

      let offset = 0;
      for (const buffer of audioBuffers) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
          mergedBuffer.getChannelData(channel).set(buffer.getChannelData(channel), offset);
        }
        offset += buffer.length;
      }

      if (isCSPRestricted) {
        return { audioBuffer: mergedBuffer, sampleRate };
      }

      const length = mergedBuffer.length;
      const audioData = new Float32Array(length * numberOfChannels);

      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = mergedBuffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          audioData[i * numberOfChannels + channel] = channelData[i];
        }
      }

      const wavBlob = this.encodeWAV(audioData, sampleRate, numberOfChannels);
      const mergedUrl = URL.createObjectURL(wavBlob);

      audioUrls.forEach(url => {
        if (typeof url === 'string' && url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });

      return mergedUrl;

    } catch (error) {
      this.error('🔗 Audio merge failed:', error);
      throw error;
    }
  }

  encodeWAV(audioData, sampleRate, numberOfChannels) {
    const length = audioData.length;
    const buffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      view.setInt16(offset, sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  async generateMultiChunkAudio(take) {
    const chunks = this.smartChunkSplit(take.text, take.language);

    this.updateStatus(`Generating audio... 0/${chunks.length}`, '#FF9800');

    try {
      const audioUrls = [];

      for (let i = 0; i < chunks.length; i++) {
        try {
          const audioUrl = await this.generateSingleChunkAudio(chunks[i], this.selectedVoice, take.language, i);
          audioUrls.push(audioUrl);
          this.updateStatus(`Generating audio... ${i + 1}/${chunks.length}`, '#FF9800');
        } catch (error) {
          this.error(`❌ Chunk ${i + 1} generation failed:`, error);
          throw error;
        }
      }

      this.updateStatus('Merging audio...', '#FF9800');
      const mergedAudioUrl = await this.mergeAudioUrls(audioUrls);

      return mergedAudioUrl;

    } catch (error) {
      this.error(`❌ Multi-chunk TTS failed: ${take.id}`, error);
      throw error;
    }
  }

  async generateTTSAudio(take, options = {}) {
    if (!this.isPluginEnabled) {
      return null;
    }

    const {
      showAnimation = true,
      updateStatus = true,
      scrollToElement = true,
      playAfterGenerate = false,
      context = 'general'
    } = options;

    if (this.isGenerating) {
      return null;
    }

    if (this.isGenerating) {
      this.isGenerating = false;
      this.currentGeneratingTakeId = null;
    }

    if (this.shouldStopSequentialPlayback) {
      return null;
    }

    if (!take || !take.id) {
      this.error(`❌ Invalid take:`, take);
      return null;
    }

    this.isGenerating = true;
    this.currentGeneratingTakeId = take.id;


    const analysis = this.analyzeAndConvertText(take.text);
    let apiText = analysis.apiText;
    let displayText = analysis.displayText;
    let silenceTime = 0;
    let customVoice = null;

    const voiceCommand = this.extractVoiceCommand(take.text);
    if (voiceCommand) {
      const supertonicStyleMatch = voiceCommand.match(/^[MF][1-5]$/i);
      if (supertonicStyleMatch) {
        const styleId = supertonicStyleMatch[0].toUpperCase();
        customVoice = this.VOICES.find(v => v.id === styleId);
        if (customVoice) {
        }
      }
      else if (voiceCommand.match(/^[a-zA-Z0-9]{22}$/)) {
        customVoice = this.VOICES.find(v => v.id === voiceCommand);
        if (customVoice) {
        }
      }
      else {
        customVoice = this.VOICES.find(v => v.name === voiceCommand);
        if (!customVoice) {
          let best = { sim: 0, voice: null };
          for (const voice of this.VOICES) {
            const sim = this.calculateSimilarity(voiceCommand, voice.name);
            if (sim > best.sim) best = { sim, voice };
          }
          if (best.sim >= 0.75) {
            customVoice = best.voice;
          } else {
          }
        } else {
        }
      }
    }

    if (voiceCommand) {
      apiText = apiText.replace(`::${voiceCommand}::`, '');
      displayText = displayText.replace(`::${voiceCommand}::`, '');
    }

    const displayAndSpeech = this.extractDisplayAndSpeechText(apiText);
    if (displayAndSpeech.displayText !== apiText || displayAndSpeech.speechText !== apiText) {
      displayText = displayAndSpeech.displayText;
      apiText = displayAndSpeech.speechText;
    }

    const targetVoice = customVoice || this.selectedVoice;


    if (updateStatus) {
      const statusMessages = {
        'selection': `Generating audio...`,
        'voice_change': `Generating with new voice...`,
        'speed_change': `Generating with new speed...`,
        'general': `Generating audio...`
      };
      this.updateStatus(statusMessages[context] || statusMessages.general, '#FF9800');
    }

    if (scrollToElement && take.element && this.autoScrollEnabled) {
      this.scrollElementToTop10Percent(take.element);
    }

    if (showAnimation && take.element) {
      this.applyGeneratingAnimation(take.element);
    }

    let audioUrl = null;
    try {
      if (this.shouldStopSequentialPlayback) {
        return null;
      }

    const isMultiChunk = this.needsMultiChunk(apiText, take.language);

      const abortController = this.abortController;

    if (isMultiChunk) {
        audioUrl = await this.generateMultiChunkAudio(take, apiText, targetVoice, abortController);
    } else {
        audioUrl = await this.generateSingleChunkAudio(apiText, targetVoice, take.language, abortController);
      }

      if (audioUrl) {
        take.audioUrl = audioUrl;

        if (playAfterGenerate) {
          await this.playAudioWithTracking(audioUrl, take);
        }
      }

    } catch (error) {
      this.error(`❌ TTS audio generation failed: ${take.id}`, error);
      throw error;
    } finally {
      if (showAnimation && take.element) {
        this.removeGeneratingAnimation(take.element);
      }

      this.isGenerating = false;
      this.currentGeneratingTakeId = null;
    }

    return audioUrl;
  }

  async clearCurrentTakeOperations() {

    try {
      const elementsWithAnimation = document.querySelectorAll('[style*="tts-generating"]');

      for (const element of elementsWithAnimation) {
        this.removeGeneratingAnimation(element);
      }
    } catch (error) {
    }

    this.currentPlayingTakeId = null;

    this.shouldStopSequentialPlayback = true;


    await new Promise(resolve => setTimeout(resolve, 100));

  }


  moveToFirstWord(take) {
    if (!take || !take.element) {
      return;
    }


    if (this.autoScrollEnabled) {
      this.scrollElementToTop10Percent(take.element);
    }

    const words = this.splitIntoWords(take.text);
    if (words.length > 0) {
      this.updateWordInfo(1, words.length, words[0]);
    }

    if (this.currentPlayList) {
      const takeIndex = this.currentPlayList.findIndex(t => t.id === take.id);
      if (takeIndex !== -1) {
        this.updateTakeInfo(takeIndex, this.currentPlayList.length);
      }
    }

    this.updateStatus(`Generating... (${take.id})`, '#FF9800');
  }

  async convertToSpeech(take) {

    if (this.isGenerating) {
    }

    await this.clearCurrentTakeOperations();

    this.stopWordTracking();
    this.unwrapWords();

    if (this.isGenerating) {
      this.isGenerating = false;
      this.currentGeneratingTakeId = null;
    }

    this.prepareWordTracking(take);
    this.moveToFirstWord(take);

    return this.generateTTSAudio(take, {
      showAnimation: true,
      updateStatus: true,
      scrollToElement: true,
      playAfterGenerate: false,
      context: 'general'
    });
  }

  async playAudio(audioUrl, takeIndex) {
    return new Promise((resolve, reject) => {
      const hostname = window.location.hostname.toLowerCase();
      const isCSPRestricted = this.cspRestrictedSites.some(site => hostname.includes(site));

      if (isCSPRestricted && audioUrl && typeof audioUrl === 'object' && audioUrl.audioBuffer) {
        this.currentAudio = this.createWebAudioPlayer(audioUrl.audioBuffer, audioUrl.sampleRate);
                } else {
      this.currentAudio = new Audio(audioUrl);
      }

      this.isPlaying = true;
      this.isPaused = false;

      this.updateStatus(`Playing... (${takeIndex + 1}/${this.takes.length})`, '#4CAF50');

      this.currentAudio.onloadedmetadata = () => {
        this.startWordTracking(takeIndex);
      };

      this.currentAudio.onended = () => {
        if (this.isPaused) {
          return;
        }

        this.isPlaying = false;

        this.stopWordTracking();

        setTimeout(() => {
          if (this.isPaused) {
            return;
          }

          if (takeIndex + 1 < this.takes.length) {
            this.currentTakeIndex = takeIndex + 1;

            const nextCacheKey = `take_${this.currentTakeIndex}_${this.ttsModel}_${this.selectedVoice.id}`;
            const nextTakeBuffered = this.getFromAudioCache(nextCacheKey);
            const delay = nextTakeBuffered ? 50 : 200;


            setTimeout(() => {
              this.generateAndPlayTake(this.currentTakeIndex);
            }, delay);

            for (let i = takeIndex + 2; i < Math.min(takeIndex + 5, this.takes.length); i++) {
              if (!this.audioBuffer[i]) {
                this.prepareNextTake(i);
              }
            }
          } else {
            this.updateStatus('Playback complete', '#4CAF50');
            setTimeout(() => this.hideUI(), 3000);
          }

          resolve();
        }, 500);
      };

      this.currentAudio.onerror = (error) => {
        this.error('Audio playback error:', error);
        this.updateStatus('Playback error', '#F44336');
        this.stopWordTracking();
        reject(error);
      };

      this.currentAudio.ontimeupdate = () => {
        if (this.currentAudio &&
            this.currentAudio.duration &&
            !isNaN(this.currentAudio.duration) &&
            this.currentAudio.duration > 0) {

          const currentTime = this.currentAudio.currentTime || 0;
          const progress = (currentTime / this.currentAudio.duration) * 100;
          this.updateProgress(progress);

          this.updateWordTracking();
        }
      };

      this.currentAudio.play().catch(reject);
    });
  }

  startWordTracking(takeIndex) {
    const take = this.takes[takeIndex];
    if (!take) return;


    this.currentTakeIndex = takeIndex;

    const targetElement = take.elementInfo?.element;
    if (!targetElement) {
      this.error('No DOM element is attached to the take');
      return;
    }


    this.wrapTakeWordsInSpecificElement(targetElement, take.text, takeIndex);

    const cleanedText = take.text.replace(/::[^:]+::/g, '');
    this.currentTakeWords = cleanedText.split(/\s+/).filter(word => word.length > 0);
    this.currentTakeWordElements = [];


    this.updateTakeInfo(takeIndex, this.takes.length);
    this.updateWordInfo(0, this.currentTakeWords.length, this.currentTakeWords[0] || '');
    this.updateHtmlViewer(targetElement, take.text);

    this.wrapCurrentTakeWords(selectedElement, take.text);
  }

  findBestContainerElement() {
    if (this.cachedContainer && document.contains(this.cachedContainer)) {
      return this.cachedContainer;
    }

    const originalElement = window.ttsSelector?.currentElement;
    if (!originalElement) return null;


    if (window.location.href.includes('ruliweb')) {

      const ruliwebContainer = document.querySelector('div[class*="news_content"]');
      if (ruliwebContainer) {
        this.cachedContainer = ruliwebContainer;
        return ruliwebContainer;
      } else {
      }
    }

    let candidate = originalElement;
    let bestContainer = originalElement;
    let maxTextLength = 0;

    const allTakesText = this.takes.map(t => t.text.replace(/::[^:]+::/g, '')).join(' ');
    const normalizedAllText = this.normalizeForMatching(allTakesText);
    const allTextWords = normalizedAllText.split(/\s+/).filter(w => w.length > 0);

    const keywordSamples = [
      allTextWords.slice(0, 15).join(' '),
      allTextWords.slice(10, 25).join(' '),
      allTextWords.slice(-15).join(' ')
    ];


    while (candidate && candidate !== document.body) {
      const candidateText = this.normalizeForMatching(candidate.textContent || '');

      const hasKeywords = keywordSamples.some(sample => candidateText.includes(sample));

      if (hasKeywords && candidateText.length > maxTextLength) {
        bestContainer = candidate;
        maxTextLength = candidateText.length;
      }

      candidate = candidate.parentElement;
    }

    const containerText = this.normalizeForMatching(bestContainer.textContent || '');

    if (containerText.length > normalizedAllText.length * 3) {

      const children = Array.from(bestContainer.children);
      for (let child of children) {
        const childText = this.normalizeForMatching(child.textContent || '');
        const childHasKeywords = keywordSamples.some(sample => childText.includes(sample));

        if (childHasKeywords && childText.length < containerText.length) {
          bestContainer = child;
          break;
        }
      }
    }

    this.cachedContainer = bestContainer;
    return bestContainer;
  }

  normalizeForMatching(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  wrapTakeWordsInSpecificElement(targetElement, takeText, takeIndex) {

    this.unwrapWords();

    const elementText = this.extractAllTextFromElement(targetElement);
    const normalizedElementText = this.normalizeForMatching(elementText);
    const normalizedTakeText = this.normalizeForMatching(takeText);


    const takeStartIndex = normalizedElementText.indexOf(normalizedTakeText.substring(0, Math.min(100, normalizedTakeText.length)));

    if (takeStartIndex === -1) {
      this.warn('Could not find take text inside the element');
      return;
    }


    const textNodes = [];
    const walker = document.createTreeWalker(
      targetElement,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (node.textContent.trim().length > 0) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let textNode;
    while (textNode = walker.nextNode()) {
      textNodes.push(textNode);
    }


    let currentIndex = 0;
    const takeEndIndex = takeStartIndex + normalizedTakeText.length;

    for (const textNode of textNodes) {
      const nodeText = textNode.textContent;
      const nodeNormalizedText = this.normalizeForMatching(nodeText);
      const nodeStartIndex = currentIndex;
      const nodeEndIndex = currentIndex + nodeNormalizedText.length;

      const overlapStart = Math.max(takeStartIndex, nodeStartIndex);
      const overlapEnd = Math.min(takeEndIndex, nodeEndIndex);

      if (overlapStart < overlapEnd) {
        this.wrapSingleTextNode(textNode);
      }

      currentIndex = nodeEndIndex + 1;
    }

  }

  wrapCurrentTakeWords(element, takeText) {

    const beforeUnwrap = document.querySelectorAll('.tts-word, .tts-current-take').length;

    this.unwrapWords();

    const afterUnwrap = document.querySelectorAll('.tts-word, .tts-current-take').length;

    let originalFullText = '';
    for (let i = 0; i < this.takes.length; i++) {
      if (i > 0) originalFullText += ' ';
      originalFullText += this.takes[i].text;
    }

    let takeStartOffset = 0;
    for (let i = 0; i < this.currentTakeIndex; i++) {
      takeStartOffset += this.takes[i].text.length;
      if (i > 0) takeStartOffset += 1;
    }

    const takeEndOffset = takeStartOffset + takeText.length;


    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.trim().length > 0) {
        textNodes.push(node);
      }
    }

    let domFullText = '';
    const nodeInfos = [];

    textNodes.forEach(textNode => {
      const nodeText = textNode.textContent;
      nodeInfos.push({
        node: textNode,
        text: nodeText,
        startIndex: domFullText.length,
        endIndex: domFullText.length + nodeText.length
      });
      domFullText += nodeText;
    });

    const normalizedDomText = this.normalizeForMatching(domFullText);
    const normalizedOriginalText = this.normalizeForMatching(originalFullText);
    const normalizedTakeText = this.normalizeForMatching(takeText);



    const currentTakeWords = normalizedTakeText.split(/\s+/).filter(w => w.length > 0);
    const keyWords = currentTakeWords.slice(0, Math.min(5, currentTakeWords.length)).join(' ');


    let searchStartPos = 0;

    if (this.currentTakeIndex > 0 && this.lastTakeEndPosition !== undefined) {
      searchStartPos = this.lastTakeEndPosition;
    } else {
    }

    let takeStartIndex = normalizedDomText.indexOf(keyWords, searchStartPos);

    if (takeStartIndex === -1) {
      this.warn('Keyword match failed. Searching the full range again');

      const allKeywordMatches = [];
      let pos = 0;
      while ((pos = normalizedDomText.indexOf(keyWords, pos)) !== -1) {
        allKeywordMatches.push(pos);
        pos += keyWords.length;
      }


      if (allKeywordMatches.length > this.currentTakeIndex) {
        takeStartIndex = allKeywordMatches[this.currentTakeIndex];
      } else if (allKeywordMatches.length > 0) {
        const lastMatch = allKeywordMatches[allKeywordMatches.length - 1];
        takeStartIndex = lastMatch + (this.currentTakeIndex - allKeywordMatches.length + 1) * 200;
      }
    }

    if (takeStartIndex === -1 || takeStartIndex >= normalizedDomText.length) {
      this.warn('Keyword match fully failed. Trying word-by-word matching');

      const firstWord = currentTakeWords[0];
      if (firstWord && firstWord.length > 2) {
        takeStartIndex = normalizedDomText.indexOf(firstWord, Math.max(0, estimatedStartPos - 100));
      }

      if (takeStartIndex === -1) {
        this.error('All matching methods failed. Skipping take');
        return;
      }
    }

    let takeEndIndex;

    const maxTakeLength = normalizedTakeText.length;

    const remainingDomLength = normalizedDomText.length - takeStartIndex;

    const safeTakeLength = Math.min(maxTakeLength, remainingDomLength);
    takeEndIndex = takeStartIndex + safeTakeLength;


    if (this.currentTakeIndex + 1 < this.takes.length) {
      const nextTakeNormalized = this.normalizeForMatching(this.takes[this.currentTakeIndex + 1].text);
      const nextTakeWords = nextTakeNormalized.split(/\s+/).filter(w => w.length > 0);
      const nextKeyWords = nextTakeWords.slice(0, Math.min(3, nextTakeWords.length)).join(' ');

      const searchEndPos = Math.min(takeEndIndex + 50, normalizedDomText.length);
      const nextTakeStart = normalizedDomText.indexOf(nextKeyWords, takeStartIndex + keyWords.length);

      if (nextTakeStart !== -1 && nextTakeStart < searchEndPos) {
        takeEndIndex = Math.min(takeEndIndex, nextTakeStart);
      }
    }

    const actualMatchedText = normalizedDomText.substring(takeStartIndex, takeEndIndex);

    const keywordMatch = actualMatchedText.includes(keyWords);
    if (!keywordMatch) {
      this.warn('Keyword is not included in the matched area');
    }


    if (Math.abs(actualMatchedText.length - normalizedTakeText.length) > normalizedTakeText.length * 0.5) {
      takeEndIndex = takeStartIndex + normalizedTakeText.length;
      if (takeEndIndex > normalizedDomText.length) {
        takeEndIndex = normalizedDomText.length;
      }
    }

    this.lastTakeEndPosition = takeEndIndex;

    this.wrapTextInRange(nodeInfos, takeStartIndex, takeEndIndex, normalizedDomText);
  }

  calculateTextSimilarity(text1, text2) {
    if (text1 === text2) return 1;

    const minLen = Math.min(text1.length, text2.length);
    const maxLen = Math.max(text1.length, text2.length);

    if (minLen === 0) return 0;

    let matches = 0;
    for (let i = 0; i < minLen; i++) {
      if (text1[i] === text2[i]) {
        matches++;
      }
    }

    const lengthPenalty = minLen / maxLen;
    const charSimilarity = matches / minLen;

    return charSimilarity * lengthPenalty;
  }

  wrapTextInRange(nodeInfos, startIndex, endIndex, normalizedFullText) {
    let currentIndex = 0;

    nodeInfos.forEach(nodeInfo => {
      const nodeText = nodeInfo.text;
      const nodeNormalizedText = nodeText.replace(/\s+/g, ' ').trim();

      const nodeStartInNormalized = currentIndex;
      const nodeEndInNormalized = currentIndex + nodeNormalizedText.length;

      const overlapStart = Math.max(startIndex, nodeStartInNormalized);
      const overlapEnd = Math.min(endIndex, nodeEndInNormalized);

      if (overlapStart < overlapEnd) {
        this.wrapSingleTextNode(nodeInfo.node);
      }

      currentIndex = nodeEndInNormalized + 1;
    });
  }

  wrapSingleTextNode(textNode) {
    const text = textNode.textContent;
    const words = text.split(/(\s+)/);

    if (words.length > 1) {
      const fragment = document.createDocumentFragment();

      words.forEach((word) => {
        if (word.trim().length > 0) {
          const span = document.createElement('span');
          span.textContent = word;
          span.className = `tts-word tts-current-take tts-take-${this.currentTakeIndex}`;
          span.style.cssText = `
            transition: background-color 0.3s ease;
            padding: 1px 2px;
            border-radius: 2px;
          `;
          this.currentTakeWordElements.push(span);
          fragment.appendChild(span);
        } else {
          fragment.appendChild(document.createTextNode(word));
        }
      });

      textNode.parentNode.replaceChild(fragment, textNode);
    }
  }

  updateWordTracking() {
    if (!this.currentAudio ||
        !this.currentTakeWordElements ||
        this.currentTakeWordElements.length === 0 ||
        !this.currentAudio.duration ||
        isNaN(this.currentAudio.duration) ||
        this.currentAudio.duration <= 0) {
      return;
    }

    const currentTime = this.currentAudio.currentTime || 0;
    const duration = this.currentAudio.duration;

    const progress = Math.min(currentTime / duration, 1);
    const wordIndex = Math.floor(progress * this.currentTakeWordElements.length);

    this.currentTakeWordElements.forEach(element => {
      if (element && element.classList) {
        element.classList.remove('tts-current-word');
      }
    });

    if (wordIndex >= 0 && wordIndex < this.currentTakeWordElements.length) {
      const currentWordElement = this.currentTakeWordElements[wordIndex];
      if (currentWordElement && currentWordElement.classList) {
        currentWordElement.classList.add('tts-current-word');

        if (this.autoScrollEnabled) {
          let takeElement = null;
          let parent = currentWordElement.parentElement;
          while (parent && parent !== document.body) {
            if (parent.classList && parent.classList.contains('tts-selected')) {
              takeElement = parent;
              break;
            }
            parent = parent.parentElement;
          }

          if (takeElement && takeElement.isConnected) {
            this.scrollElementToTop10Percent(takeElement);
          } else {
            this.scrollElementToTop10Percent(currentWordElement);
          }
        }

        const currentWord = this.currentTakeWords[wordIndex] || '';
        this.updateWordInfo(wordIndex + 1, this.currentTakeWords.length, currentWord);
      }
    }

    if (wordIndex % 5 === 0) {
    }
  }

  stopWordTracking() {
    if (this.currentTakeWordElements) {
      this.currentTakeWordElements.forEach(element => {
        if (element && element.style) {
          element.style.backgroundColor = '';
          element.style.color = '';
        }
      });
    }
  }

  unwrapWords() {

    const currentTakeSelector = `.tts-take-${this.currentTakeIndex}, .tts-current-take`;
    const wrappedWords = document.querySelectorAll(currentTakeSelector);

    wrappedWords.forEach((span, index) => {
      const parent = span.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(span.textContent), span);
        parent.normalize();
      }
    });

    this.currentTakeWordElements = [];
    this.currentTakeWords = [];

    const remainingCurrentSpans = document.querySelectorAll(currentTakeSelector);

    if (remainingCurrentSpans.length > 0) {
      this.warn(`Warning: ${remainingCurrentSpans.length} spans remain for the current take.`);
      remainingCurrentSpans.forEach(span => {
        const parent = span.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(span.textContent), span);
          parent.normalize();
        }
      });
    }

    const allTTSSpans = document.querySelectorAll('.tts-word');
  }

  stopAll() {
    return stopAll(this);
  }


  async handleVoiceSelectGlobal(voice) {
    const previousVoiceId = this.selectedVoice.id;
    this.selectedVoice = voice;

    await this.saveVoiceSetting(voice);


    this.hideVoiceMenu();

    this.updateBottomFloatingUIState();

    if (previousVoiceId !== this.selectedVoice.id) {
      this.handleVoiceOrSpeedChange();
    }
  }


}

window.ttsManager = new TTSManager();
