// @ts-nocheck

export function showVoiceMenu(manager) {
  if (manager.voiceMenuPopup) {
    manager.voiceMenuPopup.remove();
  }
  if (manager.voiceMenuBackdrop) {
    manager.voiceMenuBackdrop.remove();
  }

  const isDark = manager.currentTheme === 'dark';
  const bgColor = isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d';
  const borderColor = isDark ? 'rgba(255, 255, 255, 1.0)' : 'rgba(29, 29, 29, 0.3)';

  manager.voiceMenuPopup = document.createElement('div');
  manager.voiceMenuPopup.id = 'tts-voice-menu-popup';
  manager.voiceMenuPopup.style.cssText = `
    position: fixed !important;
    bottom: 0 !important;
    left: 50% !important;
    transform: translate(-50%, 0) !important;
    width: 40% !important;
    min-height: 40vh !important;
    max-height: 60vh !important;
    background: ${bgColor} !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: 0px 0px 60px rgba(125,125,125,.5) !important;
    z-index: 2147483647 !important;
    line-height: 1.5rem !important;
    padding: 0 !important;
    overflow-y: auto !important;
    -ms-overflow-style: none !important;
    scrollbar-width: none !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    animation: slideIn 0.7s ease forwards !important;
  `;

  if (!document.getElementById('tts-voice-menu-keyframes')) {
    const style = document.createElement('style');
    style.id = 'tts-voice-menu-keyframes';
    style.textContent = `
      @keyframes slideIn {
        0% { transform: translate(-50%, calc(100% + 80px)) rotate(0deg); opacity: 1; }
        100% { transform: translate(-50%, 0) rotate(0deg); opacity: 1; }
      }
      @keyframes slideOut {
        0% { transform: translate(-50%, 0) rotate(0deg); visibility: visible; opacity: 1; }
        99.9% { transform: translate(-50%, calc(100% + 80px)) rotate(0deg); visibility: visible; opacity: 1; }
        100% { transform: translate(-50%, calc(100% + 80px)) rotate(0deg); visibility: hidden; opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  manager.voiceMenuPopup.style.setProperty('-webkit-scrollbar', 'none', 'important');

  const title = document.createElement('div');
  title.style.cssText = `
    margin-bottom: 24px !important;
    font-weight: 400 !important;
    -webkit-text-stroke: 0.03em !important;
    paint-order: stroke fill !important;
    color: ${textColor} !important;
    padding: 24px 24px 0 24px !important;
    text-align: left !important;
    text-transform: none !important;
            font-size: ${manager.UI_FONT_SIZE} !important;
  `;
  title.textContent = 'Voice';
  manager.voiceMenuPopup.appendChild(title);

  manager.VOICES.forEach((voice) => {
    const voiceOption = document.createElement('div');
    voiceOption.setAttribute('data-voice-id', voice.id);
    voiceOption.style.cssText = `
      padding: 5px 24px 10px 24px !important;
      cursor: pointer !important;
      border-radius: 8px !important;
      -webkit-tap-highlight-color: rgba(139, 69, 19, 0.1) !important;
      transition: background-color 0.2s !important;
    `;

    const typography = document.createElement('div');
    typography.style.cssText = `
      text-align: left !important;
      text-transform: none !important;
    `;

    const voiceName = document.createElement('span');
    voiceName.style.cssText = `
      color: ${textColor} !important;
      text-decoration: underline !important;
      text-underline-offset: 5px !important;
      text-decoration-color: ${manager.currentTheme === 'dark' ? 'rgba(170, 170, 170, 0.4)' : 'rgba(29, 29, 29, 0.4)'} !important;
      cursor: inherit !important;
      display: inline !important;
      font-size: ${manager.UI_FONT_SIZE} !important;
    `;
    voiceName.textContent = voice.name;

    const voiceDescription = document.createElement('span');
    voiceDescription.style.cssText = `
      color: ${manager.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : textColor} !important;
      white-space: pre-line !important;
      cursor: default !important;
      font-size: ${manager.UI_FONT_SIZE} !important;
      font-weight: 300 !important;
    `;
    voiceDescription.textContent = ' ' + (voice.description || '');

    typography.appendChild(voiceName);
    typography.appendChild(voiceDescription);
    voiceOption.appendChild(typography);

    voiceOption.addEventListener('mousedown', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (voiceOption.dataset.processing === 'true') {
        return;
      }

      voiceOption.dataset.processing = 'true';

      try {
        await manager.handleVoiceSelectGlobal(voice);
      } finally {
        setTimeout(() => {
          voiceOption.dataset.processing = 'false';
        }, 100);
      }
    });

    voiceOption.addEventListener('mouseenter', () => {
      voiceOption.style.backgroundColor = 'rgba(139, 69, 19, 0.1) !important';
    });

    voiceOption.addEventListener('mouseleave', () => {
      voiceOption.style.backgroundColor = 'transparent !important';
    });

    manager.voiceMenuPopup.appendChild(voiceOption);
  });

  const bottomSpacer = document.createElement('div');
  bottomSpacer.style.cssText = 'height: 30px !important;';
  manager.voiceMenuPopup.appendChild(bottomSpacer);

  manager.voiceMenuBackdrop = document.createElement('div');
  manager.voiceMenuBackdrop.id = 'tts-voice-menu-backdrop';
  manager.voiceMenuBackdrop.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: transparent !important;
    z-index: 99999 !important;
  `;

  manager.voiceMenuBackdrop.addEventListener('click', () => {
    hideVoiceMenu(manager);
  });

  document.body.appendChild(manager.voiceMenuBackdrop);
  document.body.appendChild(manager.voiceMenuPopup);

  setTimeout(() => {
    document.addEventListener('click', manager.handleVoiceMenuOutsideClick.bind(manager));
  }, 0);
}

export function handleVoiceMenuOutsideClick(manager, event) {
  if (!manager.voiceMenuPopup || !manager.voiceMenuBackdrop) return;
  if (manager.voiceMenuPopup.contains(event.target) || manager.voiceMenuBackdrop.contains(event.target)) {
    return;
  }
  hideVoiceMenu(manager);
  document.removeEventListener('click', manager.handleVoiceMenuOutsideClick.bind(manager));
}

export function hideVoiceMenu(manager) {
  if (manager.voiceMenuPopup) {
    manager.voiceMenuPopup.style.animation = 'slideOut 0.2s ease forwards !important';

    setTimeout(() => {
      if (manager.voiceMenuPopup) {
        manager.voiceMenuPopup.remove();
        manager.voiceMenuPopup = null;
      }
      if (manager.voiceMenuBackdrop) {
        manager.voiceMenuBackdrop.remove();
        manager.voiceMenuBackdrop = null;
      }
    }, 200);
  }

  try {
    document.removeEventListener('click', manager.handleVoiceMenuOutsideClick.bind(manager));
  } catch (e) {
    // Silently ignore if binding fails
  }
}

export async function selectVoice(manager, voice) {
  const previousVoiceId = manager.selectedVoice.id;
  manager.selectedVoice = voice;

  await manager.saveVoiceSetting(voice);

  if (previousVoiceId !== voice.id) {
    manager.handleVoiceOrSpeedChange();
  }

  manager.updateBottomFloatingUIState();

  if (manager.voiceMenuPopup) {
    updateVoiceMenuSelection(manager, voice.id);
  }

  manager.updateStatus(`Voice changed: ${voice.name}`, '#4CAF50');
}

export function updateVoiceMenuSelection(manager, selectedVoiceId) {
  if (!manager.voiceMenuPopup) return;

  const voiceOptions = manager.voiceMenuPopup.querySelectorAll('div[data-voice-id]');
  voiceOptions.forEach((option) => {
    const voiceId = option.dataset.voiceId;
    const voiceName = option.querySelector('span');

    if (voiceId === selectedVoiceId) {
      option.style.background = 'rgba(255, 255, 255, 0.1) !important';
      if (voiceName) {
        voiceName.style.color = '#4CAF50 !important';
      }
    } else {
      option.style.background = 'transparent !important';
      if (voiceName) {
        voiceName.style.color = 'white !important';
      }
    }
  });
}
