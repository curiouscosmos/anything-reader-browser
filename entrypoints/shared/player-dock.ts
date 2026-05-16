// @ts-nocheck
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
  moveHandle: HTMLButtonElement | null;
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
  const bgColor = isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.7)';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d';
  const borderColor = isDark ? 'rgba(125, 125, 125, 0.25)' : 'rgba(100, 100, 100, 0.4)';

  const root = document.createElement('div');
  root.id = 'tts-bottom-floating-ui';
  root.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    right: 20px !important;
    left: auto !important;
    bottom: auto !important;
    transform: translateY(-50%) !important;
    width: 124px !important;
    min-width: 124px !important;
    max-width: 124px !important;
    z-index: 2147483637 !important;
    padding: 10px 8px !important;
    margin: 0 !important;
    background: ${bgColor} !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    color: ${textColor} !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    display: none !important;
    border: 1px solid ${borderColor} !important;
    border-radius: 14px !important;
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
    justify-content: space-between !important;
    gap: 10px !important;
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
    border-radius: 6px !important;
  `;
  logoWrap.appendChild(logo);

  const moveHandle = document.createElement('button');
  moveHandle.type = 'button';
  moveHandle.title = 'Move';
  moveHandle.setAttribute('aria-label', 'Move player');
  moveHandle.style.cssText = `
    appearance: none !important;
    background: transparent !important;
    border: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: grab !important;
    flex-shrink: 0 !important;
    width: 18px !important;
    height: 18px !important;
  `;

  const handlerColor = manager.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : '#1d1d1d';
  moveHandle.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 8 14" xmlns="http://www.w3.org/2000/svg" style="display:block; width:14px; height:14px;">
      <circle cx="2" cy="2" r="1" fill="${handlerColor}"/>
      <circle cx="6" cy="2" r="1" fill="${handlerColor}"/>
      <circle cx="2" cy="7" r="1" fill="${handlerColor}"/>
      <circle cx="6" cy="7" r="1" fill="${handlerColor}"/>
      <circle cx="2" cy="12" r="1" fill="${handlerColor}"/>
      <circle cx="6" cy="12" r="1" fill="${handlerColor}"/>
    </svg>
  `;

  const voiceSelect = document.createElement('select');
  voiceSelect.style.cssText = `
    width: 100% !important;
    height: 32px !important;
    min-height: 32px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    color: ${textColor} !important;
    border: 1px solid ${borderColor} !important;
    border-radius: 10px !important;
    font-size: 12px !important;
    font-family: inherit !important;
    cursor: pointer !important;
    outline: none !important;
    padding: 0 8px !important;
    box-sizing: border-box !important;
  `;

  const speedSelect = document.createElement('select');
  speedSelect.style.cssText = `
    width: 100% !important;
    height: 32px !important;
    min-height: 32px !important;
    background: rgba(255, 255, 255, 0.08) !important;
    color: ${textColor} !important;
    border: 1px solid ${borderColor} !important;
    border-radius: 10px !important;
    font-size: 12px !important;
    font-family: inherit !important;
    cursor: pointer !important;
    outline: none !important;
    padding: 0 8px !important;
    box-sizing: border-box !important;
  `;

  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.setAttribute('data-action', 'toggle-playback');
  playButton.style.cssText = `
    width: 100% !important;
    height: 40px !important;
    min-height: 40px !important;
    background: rgba(255, 255, 255, 0.08) !important;
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
  playerRow.appendChild(moveHandle);
  dock.appendChild(headerRow);
  dock.appendChild(voiceSelect);
  dock.appendChild(speedSelect);
  dock.appendChild(playerRow);
  headerRow.appendChild(logoWrap);
  headerRow.appendChild(moveHandle);
  root.appendChild(dock);
  document.body.appendChild(root);

  manager.bottomFloatingUI = root;
  manager.bottomFloatingButton = playButton;
  manager.voiceSelect = voiceSelect;
  manager.speedSelect = speedSelect;
  manager.moveHandle = moveHandle;
  manager.floatingLogo = logoWrap;

  populatePlayerDockVoiceSelect(manager);
  populatePlayerDockSpeedSelect(manager);
  updatePlayerDockTheme(manager);
  updatePlayerDockState(manager);
  setupPlayerDockDrag(manager);

  logoWrap.addEventListener('click', (event) => {
    event.stopPropagation();
    manager.updateStatus('Anything Reader', '#4CAF50');
  });

  playButton.addEventListener('click', (event) => {
    manager.handleBottomFloatingButtonClick(event as unknown as MouseEvent);
  });

  voiceSelect.addEventListener('change', async (event) => {
    event.stopPropagation();
    const voice = manager.VOICES.find((candidate) => candidate.id === voiceSelect.value) || manager.getDefaultVoiceForModel();
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
  const bgColor = isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d';
  const borderColor = isDark ? 'rgba(125, 125, 125, 0.25)' : 'rgba(100, 100, 100, 0.4)';

  manager.bottomFloatingUI.style.background = bgColor;
  manager.bottomFloatingUI.style.backdropFilter = 'blur(10px)';
  manager.bottomFloatingUI.style.webkitBackdropFilter = 'blur(10px)';
  manager.bottomFloatingUI.style.color = textColor;
  manager.bottomFloatingUI.style.borderColor = borderColor;

  if (manager.bottomFloatingButton) {
    manager.bottomFloatingButton.style.background = 'rgba(255, 255, 255, 0.08)';
    manager.bottomFloatingButton.style.color = textColor;
    manager.bottomFloatingButton.style.borderColor = borderColor;
  }

  if (manager.voiceSelect) {
    manager.voiceSelect.style.background = 'rgba(255, 255, 255, 0.08)';
    manager.voiceSelect.style.color = textColor;
    manager.voiceSelect.style.borderColor = borderColor;
  }

  if (manager.speedSelect) {
    manager.speedSelect.style.background = 'rgba(255, 255, 255, 0.08)';
    manager.speedSelect.style.color = textColor;
    manager.speedSelect.style.borderColor = borderColor;
  }

  if (manager.moveHandle) {
    manager.moveHandle.style.cursor = 'grab';
  }
}

export function populatePlayerDockVoiceSelect(manager: PlayerDockManager) {
  if (!manager.voiceSelect) return;

  const currentVoiceId = manager.selectedVoice?.id;
  manager.voiceSelect.replaceChildren();

  manager.VOICES.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.id;
    option.textContent = voice.name;
    option.title = voice.description || '';
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
    option.value = String(speedOption.speed);
    option.textContent = speedOption.text;
    manager.speedSelect?.appendChild(option);
  });
  manager.speedSelect.value = String(manager.playbackSpeed);
}

export function updatePlayerDockState(manager: PlayerDockManager) {
  if (!manager.bottomFloatingButton) return;

  const isPlaying = manager.isPlaying && !manager.isPaused;
  const isPaused = manager.isPlaying && manager.isPaused;
  const fillColor = manager.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.82)' : '#1d1d1d';
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
    console.warn('Failed to save floating bar state:', error);
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
        console.warn('Failed to load floating bar state from localStorage:', error);
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
  manager.bottomFloatingUI.style.left = `${state.position?.left ?? window.innerWidth - 144}px`;
  manager.bottomFloatingUI.style.top = `${state.position?.top ?? Math.max(20, Math.min((window.innerHeight / 2) - 94, window.innerHeight - 220))}px`;
  manager.bottomFloatingUI.style.right = 'auto';
  manager.bottomFloatingUI.style.bottom = 'auto';
  manager.bottomFloatingUI.style.transform = 'none';
  manager.bottomFloatingUI.style.width = `${state.width ?? 124}px`;
  manager.bottomFloatingUI.style.padding = '10px 8px';
  manager.bottomFloatingUI.style.borderRadius = '14px';

  setTimeout(() => {
    if (manager.bottomFloatingUI) {
      manager.bottomFloatingUI.style.transition = originalTransition;
    }
  }, 0);
}

function setupPlayerDockDrag(manager: PlayerDockManager) {
  if (!manager.bottomFloatingUI || !manager.moveHandle) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startTop = 0;
  let startLeft = 0;

  const handleMouseDown = (e: MouseEvent) => {
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
    manager.moveHandle!.style.cursor = 'grabbing';
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
    }
    manager.moveHandle!.style.cursor = 'grab';
    void savePlayerDockState(manager);
  };

  manager.moveHandle.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}
