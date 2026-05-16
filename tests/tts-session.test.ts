import assert from 'node:assert/strict';
import test from 'node:test';

import { initializeSupertonic, unloadSupertonic, warmupTTSModel } from '../entrypoints/shared/tts-session.ts';

type SessionManagerOverrides = Record<string, unknown>;

function createManager(overrides: SessionManagerOverrides = {}) {
  return {
    isPluginEnabled: true,
    ttsInitialized: false,
    initializedTtsModel: null as string | null,
    supertonicInitPromise: null as Promise<void> | null,
    ttsModel: 'kitten' as 'kitten' | 'supertonic',
    isPlaying: false,
    sendTTSMessage: async () => ({ success: true }),
    stopAllCalls: 0,
    stopAll() {
      this.stopAllCalls += 1;
    },
    showLowPowerErrorCalls: [] as unknown[],
    showLowPowerError(status: unknown) {
      this.showLowPowerErrorCalls.push(status);
    },
    showPageReadErrorCalls: [] as unknown[],
    showPageReadError(message: unknown) {
      this.showPageReadErrorCalls.push(message);
    },
    error() {},
    warn() {},
    log() {},
    ...overrides,
  };
}

test('initializeSupertonic marks the manager initialized on success', async () => {
  const calls: Array<[string, unknown]> = [];
  const manager = createManager({
    sendTTSMessage: async (action: string, data: unknown) => {
      calls.push([action, data]);
      return { success: true };
    },
  });

  await initializeSupertonic(manager, true);

  assert.deepEqual(calls, [['tts-initialize', { model: 'kitten' }]]);
  assert.equal(manager.ttsInitialized, true);
  assert.equal(manager.initializedTtsModel, 'kitten');
  assert.equal(manager.supertonicInitPromise, null);
});

test('initializeSupertonic surfaces failures and resets state', async () => {
  const manager = createManager({
    sendTTSMessage: async () => ({ success: false, error: 'boom' }),
  });

  await assert.rejects(() => initializeSupertonic(manager, true), /boom/);
  assert.equal(manager.ttsInitialized, false);
  assert.equal(manager.initializedTtsModel, null);
  assert.equal(manager.supertonicInitPromise, null);
  assert.deepEqual(manager.showPageReadErrorCalls, ['boom', 'boom']);
});

test('warmupTTSModel schedules initialization and does not throw', async () => {
  const originalWindow = globalThis.window;
  const calls: Array<[string, unknown]> = [];
  const manager = createManager({
    sendTTSMessage: async (action: string, data: unknown) => {
      calls.push([action, data]);
      return { success: true };
    },
  });

  const globalWindow = globalThis as any;
  globalWindow.window = {
    setTimeout(callback: () => void) {
      callback();
      return 1;
    },
  } as unknown as Window;

  try {
    const result = await warmupTTSModel(manager);
    assert.equal(result, null);
    assert.deepEqual(calls, [['tts-initialize', { model: 'kitten' }]]);
  } finally {
    globalWindow.window = originalWindow;
  }
});

test('unloadSupertonic stops playback and unloads the engine', async () => {
  const calls: string[] = [];
  const manager = createManager({
    isPlaying: true,
    sendTTSMessage: async (action: string) => {
      calls.push(action);
      return { success: true };
    },
  });

  await unloadSupertonic(manager);

  assert.deepEqual(calls, ['tts-unload']);
  assert.equal(manager.stopAllCalls, 1);
  assert.equal(manager.ttsInitialized, false);
});
