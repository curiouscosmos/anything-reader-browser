import assert from 'node:assert/strict';
import test from 'node:test';

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
} from '../entrypoints/shared/playback.ts';

type ManagerOverrides = Record<string, unknown>;

function createManager(overrides: ManagerOverrides = {}) {
  const currentAudio = {
    pauseCalled: 0,
    playCalled: 0,
    pause: () => {
      currentAudio.pauseCalled += 1;
    },
    play: () => {
      currentAudio.playCalled += 1;
    },
  };

  const manager = {
    abortController: new AbortController(),
    currentAudio,
    audioCache: new Map<string, string>(),
    audioPrefetchPromises: new Map<string, Promise<string | null>>(),
    audioPrefetchQueue: Promise.resolve(),
    pendingSequentialPlaybackTimeout: null as ReturnType<typeof setTimeout> | null,
    pendingNextTakeTimeout: null as ReturnType<typeof setTimeout> | null,
    pendingWarmupTimeout: null as ReturnType<typeof setTimeout> | null,
    currentGeneratingTakeId: null as string | null,
    currentPlayList: [{ id: 'take-1', audioUrl: 'blob:one' }],
    currentTakeIndex: 1,
    currentTakeWords: ['hello'],
    currentTakeWordElements: [1],
    currentPlayingTakeId: 'take-1',
    currentPlayListIndex: 3,
    isGenerating: false,
    isPaused: false,
    isPlaying: true,
    isPluginEnabled: true,
    shouldStopSequentialPlayback: false,
    highlightColorIndex: 2,
    playbackSpeed: 1.2,
    quality: 'Balanced',
    selectedVoice: { id: 'M1' },
    ttsModel: 'kitten',
    maxAudioCacheSize: 2,
    prepareNextTakeCalls: [] as number[],
    updateBottomFloatingUIStateCalls: 0,
    updateBottomFloatingUIState() {
      manager.updateBottomFloatingUIStateCalls += 1;
    },
    updateStatusCalls: [] as string[],
    updateStatus(message: string) {
      manager.updateStatusCalls.push(message);
    },
    updateProgressCalls: [] as number[],
    updateProgress(value: number) {
      manager.updateProgressCalls.push(value);
    },
    stopWordTrackingCalls: 0,
    stopWordTracking() {
      manager.stopWordTrackingCalls += 1;
    },
    cleanupWordTrackingCalls: 0,
    cleanupWordTracking() {
      manager.cleanupWordTrackingCalls += 1;
    },
    unwrapWordsCalls: 0,
    unwrapWords() {
      manager.unwrapWordsCalls += 1;
    },
    hideUICalls: 0,
    hideUI() {
      manager.hideUICalls += 1;
    },
    warn() {},
    waitForGenerationSlot: async () => {},
    generateTTSAudio: async () => 'blob:generated',
    ...overrides,
  };

  return {
    ...manager,
  };
}

test('getTakeAudioCacheKey is stable and model-aware', () => {
  const manager = createManager();
  const key = getTakeAudioCacheKey(manager, { id: 'take-1' });
  assert.equal(key, 'take_take-1_kitten_M1_1.2_Balanced_2');
});

test('audio cache evicts oldest entries and preserves recent ones', () => {
  const revoked: string[] = [];
  const originalRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = (value: string) => {
    revoked.push(value);
  };

  try {
    const manager = createManager({ maxAudioCacheSize: 2 });
    addToAudioCache(manager, 'a', 'blob:a');
    addToAudioCache(manager, 'b', 'blob:b');
    addToAudioCache(manager, 'c', 'blob:c');

    assert.equal(getFromAudioCache(manager, 'a'), null);
    assert.equal(getFromAudioCache(manager, 'b'), 'blob:b');
    assert.equal(getFromAudioCache(manager, 'c'), 'blob:c');
    assert.deepEqual(revoked, ['blob:a']);
  } finally {
    URL.revokeObjectURL = originalRevoke;
  }
});

test('pause, resume, and stop update playback state', () => {
  const manager = createManager();

  pausePlayback(manager);
  assert.equal(manager.isPaused, true);
  assert.equal(manager.isPlaying, true);
  assert.deepEqual(manager.updateStatusCalls.at(-1), 'Paused');

  resumePlayback(manager);
  assert.equal(manager.isPaused, false);
  assert.equal(manager.isPlaying, true);

  stopAll(manager);
  assert.equal(manager.isPlaying, false);
  assert.equal(manager.isPaused, false);
  assert.equal(manager.currentTakeIndex, 0);
  assert.deepEqual(manager.currentPlayList, []);
});

test('pause cancels queued sequential playback and aborts generation', () => {
  const manager = createManager({
    isGenerating: true,
    pendingSequentialPlaybackTimeout: setTimeout(() => {}, 1000),
    pendingNextTakeTimeout: setTimeout(() => {}, 1000),
    pendingWarmupTimeout: setTimeout(() => {}, 1000),
  });

  pausePlayback(manager);

  assert.equal(manager.isPaused, true);
  assert.equal(manager.isPlaying, true);
  assert.equal(manager.isGenerating, false);
  assert.equal(manager.currentGeneratingTakeId, null);
  assert.equal(manager.pendingSequentialPlaybackTimeout, null);
  assert.equal(manager.pendingNextTakeTimeout, null);
  assert.equal(manager.pendingWarmupTimeout, null);
  assert.equal(manager.abortController.signal.aborted, true);
});

test('clearAllAudio resets cached audio URLs', () => {
  const manager = createManager({
    currentPlayList: [{ id: 'take-1', audioUrl: 'blob:one' }, { id: 'take-2', audioUrl: 'blob:two' }],
  });

  clearAllAudio(manager);
  assert.equal(manager.abortController.signal.aborted, false);
  assert.equal(manager.currentPlayList[0].audioUrl, null);
  assert.equal(manager.currentPlayList[1].audioUrl, null);
});

test('prefetchNextTakes calls prepareNextTake for the requested range', async () => {
  const prepareNextTakeCalls: number[] = [];
  const manager = createManager({
    currentPlayList: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }],
    prepareNextTake(index: number) {
      prepareNextTakeCalls.push(index);
      return Promise.resolve(`blob:${index}`);
    },
  });

  prefetchNextTakes(manager, 1, 2);
  await manager.audioPrefetchQueue;
  assert.deepEqual(prepareNextTakeCalls, [1, 2]);
});

test('prepareNextTake generates and caches audio', async () => {
  const manager = createManager({
    currentPlayList: [{ id: 'take-1', text: 'hello' }],
    generateTTSAudio: async () => 'blob:generated',
  });

  const result = await prepareNextTake(manager, 0);
  assert.equal(result, 'blob:generated');
  assert.equal(getFromAudioCache(manager, 'take_take-1_kitten_M1_1.2_Balanced_2'), 'blob:generated');
  assert.equal(manager.audioPrefetchPromises.size, 0);
});
