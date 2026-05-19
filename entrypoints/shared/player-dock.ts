// @ts-nocheck
import { devLog } from '@/lib/devlog.ts';

type PlayerDockManager = {
  currentTheme: 'light' | 'dark';
  VOICES: Array<{ name: string; id: string; description?: string }>;
  SPEED_OPTIONS: Array<{ speed: number; text: string }>;
  selectedVoice: { id: string; name: string } | null;
  playbackSpeed: number;
  isPlaying: boolean;
  isPaused: boolean;
  isPageReadError: boolean;
  lastPageReadError: string | null;
  isMiddleFloating: boolean;
  bottomFloatingUI: HTMLDivElement | null;
  bottomFloatingButton: HTMLButtonElement | null;
  voiceSelect: HTMLSelectElement | null;
  speedSelect: HTMLSelectElement | null;
  floatingLogo: HTMLButtonElement | null;
  tinyUIEnabled: boolean;
  updateStatus: (message: string, color?: string) => void;
  handleBottomFloatingButtonClick: (event: MouseEvent) => void | Promise<void>;
  selectVoice: (voice: { id: string; name: string; description?: string }) => Promise<void>;
  saveSpeedSetting: (speed: number) => Promise<void>;
  handleVoiceOrSpeedChange: (context?: string) => void | Promise<void>;
  getDefaultVoiceForModel: () => { id: string; name: string };
  saveFloatingBarState: () => Promise<void>;
  loadFloatingBarState: () => Promise<{
    position?: { left: number; top: number };
    width?: number;
    height?: number;
  } | null>;
  restoreFloatingBarState: (state: {
    position?: { left: number; top: number };
    width?: number;
    height?: number;
  } | null) => void;
  updatePageReadError: () => void;
  updateLowPowerError: (powerStatus: unknown) => void;
};

export function createPlayerDock(manager: PlayerDockManager) {
  if (manager.bottomFloatingUI) {
    manager.bottomFloatingUI.remove();
  }

  const existingScrollSpacer = document.getElementById('tts-bottom-scroll-spacer');
  if (existingScrollSpacer) {
    existingScrollSpacer.remove();
  }

  const isDark = manager.currentTheme === 'dark';
  const bgColor = '#000000';
  const textColor = '#ffffff';
  const borderColor = '#ddd';

  const root = document.createElement('div');
  root.id = 'tts-bottom-floating-ui';
  root.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    right: 20px !important;
    left: auto !important;
    bottom: auto !important;
    transform: translateY(-50%) !important;
    width: 50px !important;
    min-width: 50px !important;
    max-width: 50px !important;
    z-index: 2147483637 !important;
    padding: 8px 6px !important;
    margin: 0 !important;
    background: ${bgColor} !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    color: ${textColor} !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    display: none !important;
    border: 1px solid ${borderColor} !important;
    border-radius: 8px !important;
    cursor: default !important;
    user-select: none !important;
    transition: all 0.3s ease !important;
    box-sizing: border-box !important;
  `;

  const dock = document.createElement('div');
  dock.style.cssText = `
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
    padding: 0 !important;
    box-sizing: border-box !important;
  `;

  const headerRow = document.createElement('div');
  headerRow.style.cssText = `
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
  `;

  const logoWrap = document.createElement('button');
  logoWrap.type = 'button';
  logoWrap.title = 'Anything Reader';
  logoWrap.setAttribute('aria-label', 'Anything Reader');
  logoWrap.style.cssText = `
    appearance: none !important;
    background: transparent !important;
    border: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: default !important;
    flex-shrink: 0 !important;
    align-self: center !important;
  `;

  const logo = document.createElement('img');
  logo.src = chrome.runtime.getURL('icon128_on.png');
  logo.alt = 'Anything Reader';
  logo.style.cssText = `
    pointer-events: auto !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 24px !important;
    height: 24px !important;
    object-fit: contain !important;
    border-radius: 8px !important;
  `;
  logoWrap.appendChild(logo);

  const voiceSelect = document.createElement('select');
  voiceSelect.style.cssText = `
    width: 100% !important;
    height: 32px !important;
    min-height: 32px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    background: #000000 !important;
    color: ${textColor} !important;
    border: 1px solid ${borderColor} !important;
    border-radius: 10px !important;
    font-size: 12px !important;
    font-family: inherit !important;
    cursor: pointer !important;
    outline: none !important;
    padding: 0 4px !important;
    box-sizing: border-box !important;
  `;
  voiceSelect.dataset.playerDockControl = 'true';

  const speedSelect = document.createElement('select');
  speedSelect.style.cssText = `
    width: 100% !important;
    height: 32px !important;
    min-height: 32px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    background: #000000 !important;
    color: ${textColor} !important;
    border: 1px solid ${borderColor} !important;
    border-radius: 10px !important;
    font-size: 12px !important;
    font-family: inherit !important;
    cursor: pointer !important;
    outline: none !important;
    padding: 0 4px !important;
    box-sizing: border-box !important;
  `;
  speedSelect.dataset.playerDockControl = 'true';

  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.setAttribute('data-action', 'toggle-playback');
  playButton.style.cssText = `
    width: 100% !important;
    height: 40px !important;
    min-height: 40px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    background: #000000 !important;
    color: ${textColor} !important;
    border: 1px solid ${borderColor} !important;
    box-shadow: none !important;
    font-size: 14px !important;
    font-weight: normal !important;
    text-transform: none !important;
    cursor: pointer !important;
    transition: all 0.3s !important;
    font-family: inherit !important;
    outline: none !important;
    padding: 0 !important;
    margin: 0 !important;
    text-align: center !important;
    white-space: nowrap !important;
    z-index: 1 !important;
    text-decoration: none !important;
    border-radius: 10px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  `;

  const playerRow = document.createElement('div');
  playerRow.style.cssText = `
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    width: 100% !important;
    justify-content: space-between !important;
  `;

  playerRow.appendChild(playButton);
  dock.appendChild(headerRow);
  dock.appendChild(voiceSelect);
  dock.appendChild(speedSelect);
  dock.appendChild(playerRow);
  headerRow.appendChild(logoWrap);
  root.appendChild(dock);
  document.body.appendChild(root);

  manager.bottomFloatingUI = root;
  manager.bottomFloatingButton = playButton;
  manager.voiceSelect = voiceSelect;
  manager.speedSelect = speedSelect;
  manager.floatingLogo = logoWrap;

  populatePlayerDockVoiceSelect(manager);
  populatePlayerDockSpeedSelect(manager);
  updatePlayerDockTheme(manager);
  updatePlayerDockState(manager);
  updatePlayerDockVisibility(manager);
  setupPlayerDockDrag(manager);

  manager.bottomFloatingUI.style.left = '';
  manager.bottomFloatingUI.style.top = '';
  manager.bottomFloatingUI.style.right = '20px';
  manager.bottomFloatingUI.style.bottom = 'auto';
  manager.bottomFloatingUI.style.transform = 'translateY(-50%)';

  logoWrap.addEventListener('click', (event) => {
    event.stopPropagation();
    manager.updateStatus('Anything Reader', '#4CAF50');
  });

  playButton.addEventListener('click', async (event) => {
    await manager.unlockAudioPlayback?.();
    manager.handleBottomFloatingButtonClick(event as unknown as MouseEvent);
  });

  voiceSelect.addEventListener('change', async (event) => {
    event.stopPropagation();
    const voice = manager.VOICES.find((candidate) => candidate.id === voiceSelect.value) || manager.getDefaultVoiceForModel();
    if (!voice) {
      devLog('Skipping voice change because no voice was available for the current model.');
      return;
    }
    await manager.selectVoice(voice);
  });

  speedSelect.addEventListener('change', async (event) => {
    event.stopPropagation();
    const speed = Number(speedSelect.value) || manager.playbackSpeed;
    const previousSpeed = manager.playbackSpeed;
    manager.playbackSpeed = speed;
    await manager.saveSpeedSetting(speed);
    updatePlayerDockState(manager);
    if (previousSpeed !== manager.playbackSpeed) {
      await manager.handleVoiceOrSpeedChange('speed_change');
    }
  });

  manager.loadFloatingBarState().then((state) => {
    if (state) {
      restorePlayerDockState(manager, state);
    }
  });
}

export function updatePlayerDockTheme(manager: PlayerDockManager) {
  if (!manager.bottomFloatingUI) return;

  const isDark = manager.currentTheme === 'dark';
  const bgColor = '#000000';
  const textColor = '#ffffff';
  const borderColor = '#ddd';

  manager.bottomFloatingUI.style.background = bgColor;
  manager.bottomFloatingUI.style.backdropFilter = 'blur(10px)';
  manager.bottomFloatingUI.style.webkitBackdropFilter = 'blur(10px)';
  manager.bottomFloatingUI.style.color = textColor;
  manager.bottomFloatingUI.style.borderColor = borderColor;

  if (manager.bottomFloatingButton) {
    manager.bottomFloatingButton.style.background = '#000000';
    manager.bottomFloatingButton.style.color = textColor;
    manager.bottomFloatingButton.style.borderColor = borderColor;
  }

  if (manager.voiceSelect) {
    manager.voiceSelect.style.background = '#000000';
    manager.voiceSelect.style.color = textColor;
    manager.voiceSelect.style.borderColor = borderColor;
  }

  if (manager.speedSelect) {
    manager.speedSelect.style.background = '#000000';
    manager.speedSelect.style.color = textColor;
    manager.speedSelect.style.borderColor = borderColor;
  }

  updatePlayerDockVisibility(manager);
}

export function populatePlayerDockVoiceSelect(manager: PlayerDockManager) {
  if (!manager.voiceSelect) return;

  const currentVoiceId = manager.selectedVoice?.id;
  manager.voiceSelect.replaceChildren();

  manager.VOICES.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.id;
    option.textContent = truncateVoiceLabel(voice.name);
    option.title = voice.description ? `${voice.name} - ${voice.description}` : voice.name;
    manager.voiceSelect?.appendChild(option);
  });

  manager.voiceSelect.value = manager.VOICES.some((voice) => voice.id === currentVoiceId)
    ? String(currentVoiceId)
    : manager.getDefaultVoiceForModel().id;
}

export function populatePlayerDockSpeedSelect(manager: PlayerDockManager) {
  if (!manager.speedSelect) return;

  manager.speedSelect.replaceChildren();
  manager.SPEED_OPTIONS.forEach((speedOption) => {
    const option = document.createElement('option');
    option.value = speedOption.speed.toFixed(1);
    option.textContent = speedOption.text.endsWith('x') ? speedOption.text : `${speedOption.text}x`;
    manager.speedSelect?.appendChild(option);
  });
  const selectedSpeed = getSpeedSelectValue(manager.playbackSpeed);
  const hasMatchingOption = Array.from(manager.speedSelect.options).some((option) => option.value === selectedSpeed);
  manager.speedSelect.value = hasMatchingOption ? selectedSpeed : '1.0';
}

function getSpeedSelectValue(speed: number) {
  const candidate = Math.round(speed * 10) / 10;
  return candidate.toFixed(1);
}

function truncateVoiceLabel(label: string, maxLength = 7) {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, maxLength)}...`;
}

export function updatePlayerDockState(manager: PlayerDockManager) {
  if (!manager.bottomFloatingButton) return;

  const isPlaying = manager.isPlaying && !manager.isPaused;
  const isPaused = manager.isPlaying && manager.isPaused;
  const fillColor = '#ffffff';
  const iconPath = isPlaying
    ? '<path d="M596.1,235.5h163.8v529h-163.8z M316,235.5h163.8v529h-163.8z"/>'
    : '<path d="M346.8,785.1c-5,0-10-1.2-14.5-3.7-9.6-5.3-15.5-15.3-15.5-26.3V244.9c0-10.9,5.9-21,15.5-26.3,9.6-5.3,21.3-4.9,30.5.9l404.2,255.1c8.7,5.5,14,15.1,14,25.4s-5.3,19.9-14,25.4l-404.2,255.1c-4.9,3.1-10.4,4.6-16,4.6Z"/>';

  populatePlayerDockVoiceSelect(manager);
  populatePlayerDockSpeedSelect(manager);

  manager.bottomFloatingButton.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg" style="display:block; width:18px; height:18px; fill:${fillColor}; opacity:${manager.isPageReadError ? 0.4 : 1};">
      ${iconPath}
    </svg>
  `;
  manager.bottomFloatingButton.title = manager.isPageReadError
    ? (manager.lastPageReadError ? `TTS error: ${manager.lastPageReadError}` : 'TTS error')
    : (isPlaying ? 'Pause' : isPaused ? 'Resume' : 'Play');
  manager.bottomFloatingButton.disabled = false;
  manager.bottomFloatingButton.style.cursor = 'pointer';
  manager.bottomFloatingButton.style.opacity = manager.isPageReadError ? '0.6' : '1';
  updatePlayerDockVisibility(manager);
}

export function getPlayerDockState(manager: PlayerDockManager) {
  if (!manager.bottomFloatingUI) return null;

  const rect = manager.bottomFloatingUI.getBoundingClientRect();
  return {
    position: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
    },
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export async function savePlayerDockState(manager: PlayerDockManager) {
  try {
    const state = getPlayerDockState(manager);
    if (!state) return;

    await chrome.storage.sync.set({ 'ar-floating-bar-state': state });
    localStorage.setItem('ar-floating-bar-state', JSON.stringify(state));
  } catch (error) {
    devLog('Failed to save floating bar state:', error);
  }
}

export async function loadPlayerDockState(manager: PlayerDockManager) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['ar-floating-bar-state'], (result) => {
      if (result['ar-floating-bar-state']) {
        resolve(result['ar-floating-bar-state']);
        return;
      }

      try {
        const saved = localStorage.getItem('ar-floating-bar-state');
        if (saved) {
          const state = JSON.parse(saved);
          chrome.storage.sync.set({ 'ar-floating-bar-state': state }).catch(() => {});
          resolve(state);
          return;
        }
      } catch (error) {
        devLog('Failed to load floating bar state from localStorage:', error);
      }

      resolve(null);
    });
  });
}

export function restorePlayerDockState(
  manager: PlayerDockManager,
  state: { position?: { left: number; top: number }; width?: number; height?: number } | null,
) {
  if (!manager.bottomFloatingUI || !state) return;

  const originalTransition = manager.bottomFloatingUI.style.transition;
  manager.bottomFloatingUI.style.transition = 'none';
  manager.bottomFloatingUI.style.left = `${state.position?.left ?? window.innerWidth - 70}px`;
  manager.bottomFloatingUI.style.top = `${state.position?.top ?? Math.max(20, Math.min((window.innerHeight / 2) - 94, window.innerHeight - 220))}px`;
  manager.bottomFloatingUI.style.right = 'auto';
  manager.bottomFloatingUI.style.bottom = 'auto';
  manager.bottomFloatingUI.style.transform = 'none';
  manager.bottomFloatingUI.style.width = `${state.width ?? 50}px`;
  manager.bottomFloatingUI.style.minWidth = `${state.width ?? 50}px`;
  manager.bottomFloatingUI.style.maxWidth = `${state.width ?? 50}px`;
  manager.bottomFloatingUI.style.padding = '8px 6px';
  manager.bottomFloatingUI.style.borderRadius = '8px';

  setTimeout(() => {
    if (manager.bottomFloatingUI) {
      manager.bottomFloatingUI.style.transition = originalTransition;
    }
  }, 0);
}

function setupPlayerDockDrag(manager: PlayerDockManager) {
  if (!manager.bottomFloatingUI) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startTop = 0;
  let startLeft = 0;

  const isInteractiveControl = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('select, option'));
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (isInteractiveControl(e.target)) {
      return;
    }

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = manager.bottomFloatingUI?.getBoundingClientRect();
    if (!rect) return;
    startTop = rect.top;
    startLeft = rect.left;
    if (manager.bottomFloatingUI) {
      manager.bottomFloatingUI.style.transition = 'none';
      manager.bottomFloatingUI.style.opacity = '0.9';
    }
    manager.bottomFloatingUI.style.cursor = 'grabbing';
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !manager.bottomFloatingUI) return;
    const rect = manager.bottomFloatingUI.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const left = Math.max(0, Math.min(startLeft + (e.clientX - startX), window.innerWidth - width));
    const top = Math.max(0, Math.min(startTop + (e.clientY - startY), window.innerHeight - height));
    manager.bottomFloatingUI.style.left = `${left}px`;
    manager.bottomFloatingUI.style.top = `${top}px`;
    manager.bottomFloatingUI.style.right = 'auto';
    manager.bottomFloatingUI.style.bottom = 'auto';
    manager.bottomFloatingUI.style.transform = 'none';
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    if (manager.bottomFloatingUI) {
      manager.bottomFloatingUI.style.transition = 'all 0.3s ease';
      manager.bottomFloatingUI.style.opacity = '1';
      manager.bottomFloatingUI.style.cursor = 'grab';
    }
    void savePlayerDockState(manager);
  };

  manager.bottomFloatingUI.style.cursor = 'grab';
  manager.bottomFloatingUI.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

function updatePlayerDockVisibility(manager: PlayerDockManager) {
  if (!manager.bottomFloatingUI || !manager.voiceSelect || !manager.speedSelect) return;

  const shouldShowControls = manager.isPlaying && !manager.isPaused;
  manager.voiceSelect.style.display = shouldShowControls ? 'block' : 'none';
  manager.speedSelect.style.display = shouldShowControls ? 'block' : 'none';
  const dockWidth = shouldShowControls ? '75px' : '50px';
  manager.bottomFloatingUI.style.width = dockWidth;
  manager.bottomFloatingUI.style.minWidth = dockWidth;
  manager.bottomFloatingUI.style.maxWidth = dockWidth;
  manager.bottomFloatingUI.style.right = '20px';
  if (!manager.bottomFloatingUI.style.left) {
    manager.bottomFloatingUI.style.top = `${Math.max(20, window.innerHeight - 220)}px`;
  }
}
