// @ts-nocheck
const colorThemes = [
  { name: 'Light 1', background: '#dcdcdc', color: '#000000' },
  { name: 'Light 2', background: '#e5c7b1', color: '#684f3d' },
  { name: 'Light 3', background: '#ebdbca', color: '#1e3225' },
  { name: 'Dark 1', background: '#1d1d1d', color: '#ffffff' },
  { name: 'Dark 2', background: '#894421', color: '#d5c9b7' },
  { name: 'Dark 3', background: '#183425', color: '#f8e3d0' },
  { name: 'Dark 4', background: '#21263f', color: '#e7ded0' }
];

let typographySettings = {
  fontSize: 64,
  containerWidth: 0.9,
  lineHeight: 1.4,
  colorTheme: 0,
  fontFamily: '"Playfair Display", Georgia, "Times New Roman", Times, serif'
};

const fontFamilies = [
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  '"Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  '"Lato", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
  '"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
  '"IBM Plex Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
  '"Merriweather", Georgia, "Times New Roman", Times, serif',
  '"Libre Baskerville", Georgia, "Times New Roman", Times, serif',
  '"Playfair Display", Georgia, "Times New Roman", Times, serif',
  '"Noto Serif KR", Georgia, "Times New Roman", "Batang", "Apple Myungjo", serif',
  '"IBM Plex Mono", "Courier New", Courier, Monaco, Consolas, monospace',
  '"Source Code Pro", "Courier New", Courier, Monaco, Consolas, monospace',
  '"Nanum Pen Script", "Bradley Hand", "Comic Sans MS", cursive',
  '"Song Myung", "Bradley Hand", "Comic Sans MS", cursive',
  '"Gaegu", "Bradley Hand", "Comic Sans MS", cursive'
];

const fontFamilyNames = {
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif': 'Inter',
  '"Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif': 'Open Sans',
  '"Lato", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif': 'Lato',
  '"Noto Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif': 'Noto Sans',
  '"IBM Plex Sans KR", -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif': 'IBM Plex Sans',
  '"Merriweather", Georgia, "Times New Roman", Times, serif': 'Merriweather',
  '"Libre Baskerville", Georgia, "Times New Roman", Times, serif': 'Libre Baskerville',
  '"Playfair Display", Georgia, "Times New Roman", Times, serif': 'Playfair Display',
  '"Noto Serif KR", Georgia, "Times New Roman", "Batang", "Apple Myungjo", serif': 'Noto Serif',
  '"IBM Plex Mono", "Courier New", Courier, Monaco, Consolas, monospace': 'IBM Plex Mono',
  '"Source Code Pro", "Courier New", Courier, Monaco, Consolas, monospace': 'Source Code Pro',
  '"Nanum Pen Script", "Bradley Hand", "Comic Sans MS", cursive': 'Nanum Pen Script',
  '"Song Myung", "Bradley Hand", "Comic Sans MS", cursive': 'Song Myung',
  '"Gaegu", "Bradley Hand", "Comic Sans MS", cursive': 'Gaegu'
};

let showFontName = false;
let fontNameKey = 0;
let fontNameTimeout = null;

function loadTypographySettings() {
  chrome.storage.sync.get(['readerTypographySettings'], function(result) {
    if (result.readerTypographySettings) {
      const loaded = result.readerTypographySettings;

      if (loaded.darkMode !== undefined && loaded.colorTheme === undefined) {
        loaded.colorTheme = loaded.darkMode ? 3 : 0;
        delete loaded.darkMode;
      }

      typographySettings = { ...typographySettings, ...loaded };
      applyTypographySettings();
    }
  });
}

function saveTypographySettings() {
  chrome.storage.sync.set({ readerTypographySettings: typographySettings });
}

function applyTypographySettings() {
  const contentDiv = document.getElementById('content');
  const body = document.body;

  if (contentDiv) {
    contentDiv.style.fontSize = typographySettings.fontSize + 'px';
    contentDiv.style.maxWidth = (typographySettings.containerWidth * 100) + '%';
    contentDiv.style.lineHeight = typographySettings.lineHeight;
    contentDiv.style.fontFamily = typographySettings.fontFamily;
    contentDiv.style.margin = '0 auto';
  }

  if (body) {
    body.style.fontFamily = typographySettings.fontFamily;
  }

  const theme = colorThemes[typographySettings.colorTheme] || colorThemes[0];
  if (body) {
    body.style.backgroundColor = theme.background;
    body.style.color = theme.color;
  }
  if (contentDiv) {
    contentDiv.style.color = theme.color;
  }

  const typographyUI = document.getElementById('typography-floating-ui');
  if (typographyUI) {
    typographyUI.style.color = theme.color;
  }

  if (body) {
    if (typographySettings.colorTheme >= 3) {
      body.classList.add('dark-mode');
    } else {
      body.classList.remove('dark-mode');
    }

    setTimeout(() => {
      if (window.ttsManager && typeof window.ttsManager.detectAndApplyTheme === 'function') {
        window.ttsManager.detectAndApplyTheme();
      }
    }, 100);
  }
}

function handleScrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleScrollToReading() {
  let targetElement = null;

  if (!window.ttsManager) {
    return;
  }

  const overlayHighlight = document.getElementById('tts-overlay-highlight');
  if (overlayHighlight) {
    targetElement = overlayHighlight;
  }

  if (!targetElement && window.ttsManager.currentAudio && window.ttsManager.currentTakeWordElements) {
    const currentTime = window.ttsManager.currentAudio.currentTime;
    const duration = window.ttsManager.currentAudio.duration;
    const words = window.ttsManager.currentTakeWords || [];

    if (words.length > 0) {
      const currentWordIndex = window.ttsManager.calculateCurrentWordIndex(currentTime, duration, words);

      if (currentWordIndex >= 0 && currentWordIndex < window.ttsManager.currentTakeWordElements.length) {
        const wordElement = window.ttsManager.currentTakeWordElements[currentWordIndex];
        if (wordElement) {
          targetElement = wordElement;
        }
      }
    }
  }

  if (!targetElement) {
    const highlightedWord = document.querySelector('.tts-word-highlight');
    if (highlightedWord) {
      targetElement = highlightedWord;
    }
  }

  if (!targetElement) {
    const highlightedParagraph = document.querySelector('.tts-paragraph-highlight');
    if (highlightedParagraph) {
      targetElement = highlightedParagraph;
    }
  }

  if (targetElement) {
    scrollToTop10Percent(targetElement);
  }
}

function handleFontSizeUp() {
  typographySettings.fontSize = Math.min(typographySettings.fontSize + 2, 256);
  applyTypographySettings();
  saveTypographySettings();
}

function handleFontSizeDown() {
  typographySettings.fontSize = Math.max(typographySettings.fontSize - 2, 8);
  applyTypographySettings();
  saveTypographySettings();
}

function handleWidthUp() {
  typographySettings.containerWidth = Math.min(typographySettings.containerWidth + 0.05, 1.0);
  applyTypographySettings();
  saveTypographySettings();
}

function handleWidthDown() {
  typographySettings.containerWidth = Math.max(typographySettings.containerWidth - 0.05, 0.3);
  applyTypographySettings();
  saveTypographySettings();
}

function handleLineHeightUp() {
  typographySettings.lineHeight = Math.max(typographySettings.lineHeight - 0.1, 1.0);
  applyTypographySettings();
  saveTypographySettings();
}

function handleLineHeightDown() {
  typographySettings.lineHeight = Math.min(typographySettings.lineHeight + 0.1, 3.0);
  applyTypographySettings();
  saveTypographySettings();
}

function handleToggleDark() {
  typographySettings.colorTheme = (typographySettings.colorTheme + 1) % colorThemes.length;
  applyTypographySettings();
  saveTypographySettings();
}

function handleFontFamilyToggle() {
  const curIdx = fontFamilies.indexOf(typographySettings.fontFamily);
  const nextIndex = (curIdx + 1) % fontFamilies.length;
  typographySettings.fontFamily = fontFamilies[nextIndex];

  applyTypographySettings();
  saveTypographySettings();

  const fontNamePopup = document.getElementById('font-name-popup');
  if (fontNamePopup) {
    showFontName = false;
    fontNameKey += 1;
    fontNamePopup.style.display = 'none';

    if (fontNameTimeout) clearTimeout(fontNameTimeout);

    setTimeout(() => {
      const fontName = fontFamilyNames[typographySettings.fontFamily] || '';
      fontNamePopup.innerHTML = fontName.split('').map((char, index) =>
        `<span style="line-height: 1.2em;">${char}</span>`
      ).join('');
      fontNamePopup.style.display = 'flex';
      showFontName = true;

      fontNameTimeout = setTimeout(() => {
        fontNamePopup.style.display = 'none';
        showFontName = false;
      }, 3000);
    }, 0);
  }
}

function setupTypographyControls() {
  const btnScrollTop = document.getElementById('btn-scroll-top');
  const btnScrollToReading = document.getElementById('btn-scroll-to-reading');
  const btnFontSizeUp = document.getElementById('btn-font-size-up');
  const btnFontSizeDown = document.getElementById('btn-font-size-down');
  const btnWidthUp = document.getElementById('btn-width-up');
  const btnWidthDown = document.getElementById('btn-width-down');
  const btnLineHeightUp = document.getElementById('btn-line-height-up');
  const btnLineHeightDown = document.getElementById('btn-line-height-down');
  const btnToggleDark = document.getElementById('btn-toggle-dark');
  const btnFontFamily = document.getElementById('btn-font-family');

  if (btnScrollTop) btnScrollTop.addEventListener('click', handleScrollTop);
  if (btnScrollToReading) btnScrollToReading.addEventListener('click', handleScrollToReading);
  if (btnFontSizeUp) btnFontSizeUp.addEventListener('click', handleFontSizeUp);
  if (btnFontSizeDown) btnFontSizeDown.addEventListener('click', handleFontSizeDown);
  if (btnWidthUp) btnWidthUp.addEventListener('click', handleWidthUp);
  if (btnWidthDown) btnWidthDown.addEventListener('click', handleWidthDown);
  if (btnLineHeightUp) btnLineHeightUp.addEventListener('click', handleLineHeightUp);
  if (btnLineHeightDown) btnLineHeightDown.addEventListener('click', handleLineHeightDown);
  if (btnToggleDark) btnToggleDark.addEventListener('click', handleToggleDark);
  if (btnFontFamily) btnFontFamily.addEventListener('click', handleFontFamilyToggle);
}

function generatePageTitle(firstText) {
  if (!firstText || !firstText.trim()) {
    return 'Anything Reader.html';
  }

  const words = firstText.trim().split(/\s+/).slice(0, 5);

  const cleanWords = words.map(word => {
    return word.replace(/[^\w\u3131-\uD79D]/g, '').substring(0, 30);
  }).filter(word => word.length > 0);

  if (cleanWords.length === 0) {
    return 'Anything Reader.html';
  }

  return `Anything Reader_${cleanWords.join('_')}.html`;
}

let contentReceived = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'displayContent' && request.texts) {
    contentReceived = true;

    const contentDiv = document.getElementById('content');
    contentDiv.innerHTML = '';

    if (request.texts.length > 0) {
      document.title = generatePageTitle(request.texts[0]);
    }

    request.texts.forEach((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      contentDiv.appendChild(p);
    });

    applyTypographySettings();

    sendResponse({ success: true });
  }
});

function loadContentFromStorage() {
  const urlParams = new URLSearchParams(window.location.search);
  const pageId = urlParams.get('id');

  if (!pageId) {
    showErrorMessage('No page ID provided. Please create a new reader page.');
    return;
  }

  const storageKey = `readerContent_${pageId}`;

  chrome.storage.local.get([storageKey], function(result) {
    const pageData = result[storageKey];

    if (pageData && pageData.texts && pageData.texts.length > 0) {
      displayContent(pageData.texts);

      updateLastAccessed(storageKey, pageData);
    } else {
      chrome.storage.local.get(['readerContent'], function(fallbackResult) {
        if (fallbackResult.readerContent && fallbackResult.readerContent.length > 0) {
          displayContent(fallbackResult.readerContent);
          chrome.storage.local.remove(['readerContent']);
        } else {
          showErrorMessage('No content found for this page. It may have been deleted or expired.');
        }
      });
    }
  });
}

function displayContent(texts) {
  contentReceived = true;
  const contentDiv = document.getElementById('content');

  if (texts.length > 0) {
    document.title = generatePageTitle(texts[0]);
  }

  texts.forEach((text) => {
    const p = document.createElement('p');
    p.textContent = text;
    contentDiv.appendChild(p);
  });

  applyTypographySettings();
}

function updateLastAccessed(storageKey, pageData) {
  pageData.lastAccessed = Date.now();

  chrome.storage.local.set({
    [storageKey]: pageData
  });
}

function showErrorMessage(message) {
  const contentDiv = document.getElementById('content');
  const errorMsg = document.createElement('p');
  errorMsg.textContent = message;
  errorMsg.style.color = 'red';
  errorMsg.style.fontSize = '20px';
  errorMsg.style.textAlign = 'center';
  errorMsg.style.marginTop = '50px';
  contentDiv.appendChild(errorMsg);
}

let autoScrollCheckInterval = null;
let lastTrackedElement = null;
let lastTrackedText = null;

function startAutoScrollMonitoring() {
  if (autoScrollCheckInterval) {
    return;
  }

  autoScrollCheckInterval = setInterval(() => {
    if (!window.ttsManager) {
      return;
    }

    if (!window.ttsManager.autoScrollEnabled) {
      return;
    }

    if (!window.ttsManager.isPlaying) {
      return;
    }

    let trackingElement = null;
    let trackingText = null;

    const overlayHighlight = document.getElementById('tts-overlay-highlight');
    if (overlayHighlight) {
      trackingElement = overlayHighlight;
      const overlayText = overlayHighlight.textContent?.trim();

      if (overlayText) {
        trackingText = overlayText;
      } else {
        if (window.ttsManager.currentAudio && window.ttsManager.currentTakeWords) {
          const currentTime = window.ttsManager.currentAudio.currentTime;
          const duration = window.ttsManager.currentAudio.duration;
          const words = window.ttsManager.currentTakeWords || [];

          if (words.length > 0) {
            const currentWordIndex = window.ttsManager.calculateCurrentWordIndex(currentTime, duration, words);
            if (currentWordIndex >= 0 && currentWordIndex < words.length) {
              trackingText = words[currentWordIndex]?.text;
            }
          }
        }
      }
    }

    if (!trackingElement) {
      const wordHighlight = document.querySelector('.tts-word-highlight');
      if (wordHighlight) {
        trackingElement = wordHighlight;
        trackingText = wordHighlight.textContent?.trim();
      }
    }

    if (!trackingElement) {
      const paragraphHighlight = document.querySelector('.tts-paragraph-highlight');
      if (paragraphHighlight) {
        trackingElement = paragraphHighlight;

        if (window.ttsManager.currentAudio && window.ttsManager.currentTakeWords) {
          const currentTime = window.ttsManager.currentAudio.currentTime;
          const duration = window.ttsManager.currentAudio.duration;
          const words = window.ttsManager.currentTakeWords || [];

          if (words.length > 0) {
            const currentWordIndex = window.ttsManager.calculateCurrentWordIndex(currentTime, duration, words);
            if (currentWordIndex >= 0 && currentWordIndex < words.length) {
              trackingText = words[currentWordIndex]?.text;
            }
          }
        }
      }
    }

    if (!trackingElement || !trackingText) {
      return;
    }

    const rect = trackingElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    let fontSize = 16;
    let lineHeight = 24;
    try {
      const computedStyle = window.getComputedStyle(trackingElement);
      fontSize = parseFloat(computedStyle.fontSize) || 16;
      const lineHeightValue = computedStyle.lineHeight;
      if (lineHeightValue && lineHeightValue !== 'normal') {
        lineHeight = parseFloat(lineHeightValue);
        if (isNaN(lineHeight)) {
          lineHeight = fontSize * 1.5;
        }
      } else {
        lineHeight = fontSize * 1.5;
      }
    } catch (e) {
      // fallback to default
    }

    const nextLineBottom = rect.bottom + lineHeight;

    const isAboveViewport = rect.top < 0;
    const isBelowViewport = nextLineBottom > viewportHeight;
    const isOutOfView = isAboveViewport || isBelowViewport;

    const wordChanged = trackingText !== lastTrackedText;

    if (wordChanged) {
      lastTrackedElement = trackingElement;
      lastTrackedText = trackingText;
    }

    if (isOutOfView && wordChanged) {
      scrollToTop10Percent(trackingElement);
    }
  }, 100);
}

function stopAutoScrollMonitoring() {
  if (autoScrollCheckInterval) {
    clearInterval(autoScrollCheckInterval);
    autoScrollCheckInterval = null;
    lastTrackedElement = null;
    lastTrackedText = null;
  }
}

function scrollToTop10Percent(element) {
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
    // Silently fail
  }
}

function initializeReader() {
  loadTypographySettings();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTypographyControls);
  } else {
    setupTypographyControls();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadContentFromStorage);
  } else {
    loadContentFromStorage();
  }

  startAutoScrollMonitoring();

  setTimeout(() => {
    if (window.ttsManager && typeof window.ttsManager.detectAndApplyTheme === 'function') {
      window.ttsManager.detectAndApplyTheme();
    }
  }, 500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeReader);
} else {
  initializeReader();
}

setTimeout(() => {
  if (!contentReceived) {
    loadContentFromStorage();
  }
}, 1000);
