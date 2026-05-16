// @ts-nocheck

export async function initializeSupertonic(manager, showErrors = true) {
  if (!manager.isPluginEnabled) {
    return;
  }

  if (manager.supertonicInitPromise) {
    return manager.supertonicInitPromise;
  }

  if (manager.ttsInitialized && manager.initializedTtsModel === manager.ttsModel) {
    return;
  }

  manager.supertonicInitPromise = (async () => {
    try {
      const result = await manager.sendTTSMessage('tts-initialize', { model: manager.ttsModel });

      if (!result.success) {
        if (result.error === 'low_power') {
          if (showErrors) {
            manager.showLowPowerError(result.powerStatus);
          }
        } else if (showErrors) {
          manager.showPageReadError(result.error);
        }
        throw new Error(result.error || `${manager.ttsModel} TTS initialization failed`);
      }

      manager.ttsInitialized = true;
      manager.initializedTtsModel = manager.ttsModel;
    } catch (error) {
      manager.error('❌ Supertonic TTS engine initialization failed:', error);
      manager.ttsInitialized = false;
      manager.initializedTtsModel = null;
      if (showErrors) {
        manager.showPageReadError(error instanceof Error ? error.message : String(error));
      }
      throw error;
    } finally {
      manager.supertonicInitPromise = null;
    }
  })();

  return manager.supertonicInitPromise;
}

export async function warmupTTSModel(manager) {
  if (manager.ttsInitialized || manager.supertonicInitPromise) {
    return manager.supertonicInitPromise;
  }

  window.setTimeout(() => {
    initializeSupertonic(manager, false).catch((error) => {
      manager.warn('TTS warmup failed:', error);
    });
  }, 250);

  return null;
}

export async function unloadSupertonic(manager) {
  try {
    if (manager.isPlaying) {
      manager.stopAll();
    }
    await manager.sendTTSMessage('tts-unload');
    manager.ttsInitialized = false;
    manager.log('✅ ONNX models unloaded');
  } catch (error) {
    manager.error('❌ Failed to unload Supertonic TTS:', error);
  }
}
