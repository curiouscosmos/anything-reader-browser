// @ts-nocheck

export function stopAll(manager) {
  clearSequentialPlaybackTimeout(manager);
  clearNextTakeTimeout(manager);
  clearWarmupTimeout(manager);

  if (manager.abortController) {
    manager.abortController.abort();
  }
  manager.abortController = new AbortController();

  if (manager.currentAudio) {
    manager.currentAudio.pause();
    if (typeof manager.currentAudio.currentTime === 'number') {
      manager.currentAudio.currentTime = 0;
    }
    manager.currentAudio = null;
  }

  if (typeof manager.stopWordTracking === 'function') {
    manager.stopWordTracking();
  }
  if (typeof manager.cleanupWordTracking === 'function') {
    manager.cleanupWordTracking();
  }
  if (typeof manager.unwrapWords === 'function') {
    manager.unwrapWords();
  }
  if (typeof manager.dispatchBackgroundMusicPlaybackState === 'function') {
    manager.dispatchBackgroundMusicPlaybackState(false);
  }

  manager.isPlaying = false;
  manager.isPaused = false;
  manager.isGenerating = false;
  manager.currentGeneratingTakeId = null;
  manager.currentTakeIndex = 0;
  manager.pauseResumeTargetIndex = null;
  manager.currentTakeWordElements = [];
  manager.currentTakeWords = [];
  manager.currentPlayList = [];
  manager.currentPlayingTakeId = null;
  manager.lastTakeEndPosition = undefined;
  manager.cachedContainer = null;
  manager.takes = [];

  if (typeof manager.updateStatus === 'function') {
    manager.updateStatus('Stopped', '#FF5722');
  }
  if (typeof manager.updateProgress === 'function') {
    manager.updateProgress(0);
  }

  if (typeof manager.hideUI === 'function') {
    setTimeout(() => manager.hideUI(), 2000);
  }
}

export function clearAllAudio(manager) {
  if (manager.abortController) {
    manager.abortController.abort();
  }
  manager.abortController = new AbortController();

  if (manager.currentPlayList) {
    manager.currentPlayList.forEach((take) => {
      take.audioUrl = null;
    });
  }
}

export function pausePlayback(manager) {
  if (manager.isGenerating && manager.abortController) {
    manager.abortController.abort();
    manager.isGenerating = false;
    manager.currentGeneratingTakeId = null;
  }

  clearSequentialPlaybackTimeout(manager);
  clearNextTakeTimeout(manager);
  clearWarmupTimeout(manager);

  if (manager.currentAudio) {
    manager.currentAudio.pause();
  }
  if (typeof manager.dispatchBackgroundMusicPlaybackState === 'function') {
    manager.dispatchBackgroundMusicPlaybackState(false);
  }

  manager.shouldStopSequentialPlayback = true;
  const nextIndex = typeof manager.currentTakeIndex === 'number' ? manager.currentTakeIndex + 1 : null;
  const canResumeNextTake = nextIndex !== null && nextIndex < (manager.currentPlayList?.length || 0);
  manager.pauseResumeTargetIndex = canResumeNextTake ? nextIndex : null;
  manager.isPaused = true;
  manager.isPlaying = true;
  manager.updateBottomFloatingUIState();
  manager.updateStatus('Paused', '#FF9800');
}

export function resumePlayback(manager) {
  if (manager.isGenerating) {
    return;
  }

  if (manager.currentAudio && manager.isPaused) {
    manager.currentAudio.play().then(() => {
      if (typeof manager.dispatchBackgroundMusicPlaybackState === 'function') {
        manager.dispatchBackgroundMusicPlaybackState(true);
      }
    }).catch((error) => {
      manager.warn?.('Failed to resume current audio playback:', error);
    });
    manager.isPaused = false;
    manager.isPlaying = true;
    manager.shouldStopSequentialPlayback = false;
    manager.pauseResumeTargetIndex = null;
    manager.updateBottomFloatingUIState();
    manager.updateStatus(`Playing... (${manager.currentPlayListIndex + 1}/${manager.currentPlayList.length})`, '#4CAF50');
    return;
  }

  if (manager.isPaused && typeof manager.pauseResumeTargetIndex === 'number') {
    const resumeIndex = manager.pauseResumeTargetIndex;
    manager.isPaused = false;
    manager.isPlaying = true;
    manager.shouldStopSequentialPlayback = false;
    manager.pauseResumeTargetIndex = null;
    if (typeof manager.dispatchBackgroundMusicPlaybackState === 'function') {
      manager.dispatchBackgroundMusicPlaybackState(true);
    }
    manager.updateBottomFloatingUIState();
    if (typeof manager.playTakeAtIndex === 'function') {
      void manager.playTakeAtIndex(resumeIndex);
    }
  }
}

function clearSequentialPlaybackTimeout(manager) {
  if (manager.pendingSequentialPlaybackTimeout) {
    clearTimeout(manager.pendingSequentialPlaybackTimeout);
    manager.pendingSequentialPlaybackTimeout = null;
  }
}

function clearNextTakeTimeout(manager) {
  if (manager.pendingNextTakeTimeout) {
    clearTimeout(manager.pendingNextTakeTimeout);
    manager.pendingNextTakeTimeout = null;
  }
}

function clearWarmupTimeout(manager) {
  if (manager.pendingWarmupTimeout) {
    clearTimeout(manager.pendingWarmupTimeout);
    manager.pendingWarmupTimeout = null;
  }
}

export function getTakeAudioCacheKey(manager, take) {
  const takeId = take?.id || manager.currentPlayList?.indexOf(take) || 'unknown';
  return [
    'take',
    takeId,
    manager.ttsModel,
    manager.selectedVoice?.id || 'M1',
    manager.playbackSpeed,
    manager.quality,
    manager.highlightColorIndex
  ].join('_');
}

export function getFromAudioCache(manager, cacheKey) {
  if (!manager.audioCache) {
    manager.audioCache = new Map();
  }

  const value = manager.audioCache.get(cacheKey);
  if (value) {
    manager.audioCache.delete(cacheKey);
    manager.audioCache.set(cacheKey, value);
  }
  return value || null;
}

export function addToAudioCache(manager, cacheKey, audioUrl) {
  if (!audioUrl) return;
  if (!manager.audioCache) {
    manager.audioCache = new Map();
  }

  if (manager.audioCache.has(cacheKey)) {
    manager.audioCache.delete(cacheKey);
  }

  manager.audioCache.set(cacheKey, audioUrl);

  const maxSize = manager.maxAudioCacheSize || 24;
  while (manager.audioCache.size > maxSize) {
    const oldestKey = manager.audioCache.keys().next().value;
    const oldestValue = manager.audioCache.get(oldestKey);
    if (typeof oldestValue === 'string' && oldestValue.startsWith('blob:')) {
      URL.revokeObjectURL(oldestValue);
    }
    manager.audioCache.delete(oldestKey);
  }
}

export function prefetchNextTakes(manager, startIndex, count = 4) {
  if (manager.isFirefoxOnlyKitten) {
    return;
  }

  if (!manager.currentPlayList || manager.shouldStopSequentialPlayback || !manager.isPluginEnabled) {
    return;
  }

  const endIndex = Math.min(startIndex + count, manager.currentPlayList.length);
  manager.audioPrefetchQueue = (manager.audioPrefetchQueue || Promise.resolve()).then(async () => {
    for (let index = startIndex; index < endIndex; index++) {
      if (manager.shouldStopSequentialPlayback || !manager.isPluginEnabled) {
        return;
      }
      await manager.prepareNextTake(index);
    }
  }).catch((error) => {
    manager.warn('Prefetch queue failed:', error);
  });
}

export async function prepareNextTake(manager, playListIndex) {
  if (manager.isFirefoxOnlyKitten) {
    return null;
  }

  const take = manager.currentPlayList?.[playListIndex];
  if (!take || manager.shouldStopSequentialPlayback || !manager.isPluginEnabled) {
    return null;
  }

  const cacheKey = getTakeAudioCacheKey(manager, take);
  if (getFromAudioCache(manager, cacheKey)) {
    return Promise.resolve(getFromAudioCache(manager, cacheKey));
  }

  if (!manager.audioPrefetchPromises) {
    manager.audioPrefetchPromises = new Map();
  }

  if (manager.audioPrefetchPromises.has(cacheKey)) {
    return manager.audioPrefetchPromises.get(cacheKey);
  }

  const promise = (async () => {
    await manager.waitForGenerationSlot();
    if (manager.shouldStopSequentialPlayback || !manager.isPluginEnabled) {
      return null;
    }

    const audioUrl = await manager.generateTTSAudio(take, {
      showAnimation: false,
      updateStatus: false,
      scrollToElement: false,
      playAfterGenerate: false,
      context: 'prefetch'
    });

    if (audioUrl) {
      addToAudioCache(manager, cacheKey, audioUrl);
    }

    return audioUrl;
  })().finally(() => {
    manager.audioPrefetchPromises.delete(cacheKey);
  });

  manager.audioPrefetchPromises.set(cacheKey, promise);
  return promise;
}
