// @ts-nocheck

export function getSpeedText(speed) {
  if (speed <= 0.9) return 'slightly slower';
  if (speed <= 1.0) return 'normally';
  if (speed <= 1.2) return 'slightly faster';
  return 'fast';
}

export function getSpeedTextForTinyUI(speed) {
  if (speed <= 0.9) return '0.8x';
  if (speed <= 1.0) return '1.0x';
  if (speed <= 1.2) return '1.2x';
  return '1.4x';
}

export function showSpeedMenu(manager) {
  hideSpeedMenu(manager);

  const isDark = manager.currentTheme === 'dark';
  const bgColor = isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';
  const textColor = isDark ? 'rgba(255, 255, 255, 0.6)' : '#1d1d1d';
  const borderColor = isDark ? 'rgba(255, 255, 255, 1.0)' : 'rgba(29, 29, 29, 0.3)';

  manager.speedMenuPopup = document.createElement('div');
  manager.speedMenuPopup.id = 'tts-speed-menu-popup';
  manager.speedMenuPopup.style.cssText = `
    position: fixed !important;
    bottom: 0 !important;
    left: 50% !important;
    transform: translate(-50%, 0) !important;
    width: 15% !important;
    min-height: auto !important;
    max-height: none !important;
    height: auto !important;
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

  manager.speedMenuPopup.style.setProperty('-webkit-scrollbar', 'none', 'important');

  const title = document.createElement('div');
  title.style.cssText = `
    margin-bottom: 24px !important;
    font-weight: 400 !important;
    -webkit-text-stroke: 0.03em !important;
    paint-order: stroke fill !important;
    color: ${textColor} !important;
    padding: 24px 24px 0 24px !important;
    text-align: center !important;
    text-transform: none !important;
            font-size: ${manager.UI_FONT_SIZE} !important;
  `;
  title.textContent = 'Reading Speed';
  manager.speedMenuPopup.appendChild(title);

  manager.SPEED_OPTIONS.forEach((speedOption) => {
    const speedItem = document.createElement('div');
    speedItem.style.cssText = `
      padding: 5px 24px 10px 24px !important;
      cursor: pointer !important;
      border-radius: 8px !important;
      -webkit-tap-highlight-color: rgba(139, 69, 19, 0.1) !important;
      transition: background-color 0.2s !important;
    `;

    const typography = document.createElement('div');
    typography.style.cssText = `
      text-align: center !important;
      text-transform: none !important;
    `;

    const speedText = document.createElement('span');
    speedText.style.cssText = `
      color: ${textColor} !important;
      text-decoration: underline !important;
      text-underline-offset: 5px !important;
      text-decoration-color: ${manager.currentTheme === 'dark' ? 'rgba(170, 170, 170, 0.4)' : 'rgba(29, 29, 29, 0.4)'} !important;
      cursor: inherit !important;
      display: inline !important;
      font-size: ${manager.UI_FONT_SIZE} !important;
    `;
    speedText.textContent = speedOption.text;

    typography.appendChild(speedText);
    speedItem.appendChild(typography);

    speedItem.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      manager.selectSpeed(speedOption);
      hideSpeedMenu(manager);
    });

    speedItem.addEventListener('mouseenter', () => {
      speedItem.style.backgroundColor = 'rgba(139, 69, 19, 0.1) !important';
    });

    speedItem.addEventListener('mouseleave', () => {
      speedItem.style.backgroundColor = 'transparent !important';
    });

    manager.speedMenuPopup.appendChild(speedItem);
  });

  const bottomSpacer = document.createElement('div');
  bottomSpacer.style.cssText = 'height: 24px !important;';
  manager.speedMenuPopup.appendChild(bottomSpacer);

  manager.speedMenuBackdrop = document.createElement('div');
  manager.speedMenuBackdrop.id = 'tts-speed-menu-backdrop';
  manager.speedMenuBackdrop.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: transparent !important;
    z-index: 99999 !important;
  `;

  manager.speedMenuBackdrop.addEventListener('click', () => {
    hideSpeedMenu(manager);
  });

  document.body.appendChild(manager.speedMenuBackdrop);
  document.body.appendChild(manager.speedMenuPopup);

  setTimeout(() => {
    document.addEventListener('click', manager.handleSpeedMenuOutsideClick.bind(manager));
  }, 100);
}

export function hideSpeedMenu(manager) {
  if (manager.speedMenuPopup) {
    manager.speedMenuPopup.style.animation = 'slideOut 0.2s ease forwards !important';
    setTimeout(() => {
      if (manager.speedMenuPopup && manager.speedMenuPopup.parentNode) {
        manager.speedMenuPopup.parentNode.removeChild(manager.speedMenuPopup);
      }
      manager.speedMenuPopup = null;
      if (manager.speedMenuBackdrop) {
        manager.speedMenuBackdrop.remove();
        manager.speedMenuBackdrop = null;
      }
    }, 200);
  }

  document.removeEventListener('click', manager.handleSpeedMenuOutsideClick.bind(manager));
}

export function handleSpeedMenuOutsideClick(manager, event) {
  if (manager.speedMenuPopup && !manager.speedMenuPopup.contains(event.target)) {
    hideSpeedMenu(manager);
  }
}

export async function selectSpeed(manager, speedOption) {
  const previousSpeed = manager.playbackSpeed;
  manager.playbackSpeed = speedOption.speed;
  await manager.saveSpeedSetting(speedOption.speed);

  hideSpeedMenu(manager);
  manager.updateBottomFloatingUIState();

  if (previousSpeed !== manager.playbackSpeed) {
    manager.handleVoiceOrSpeedChange();
  }
}
