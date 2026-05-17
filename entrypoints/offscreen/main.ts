import { createSupertonicTtsEngine, type TtsAction, type TtsGenerateData } from '@/lib/tts-engine.ts';
import { getKittenOrtWasmPaths } from '@/lib/ort-runtime.ts';

const ttsEngine = createSupertonicTtsEngine({
  debugPrefix: '[Anything Reader][Offscreen]',
  modelRoot: browser.runtime.getURL('supertonic/onnx' as never),
  voiceStyleRoot: browser.runtime.getURL('supertonic/voice_styles' as never),
  kittenRoot: browser.runtime.getURL('kittenTTS' as never),
  ortWasmRoot: getKittenOrtWasmPaths(
    browser.runtime.getURL('supertonic/ort/' as never),
    {
      mjs: browser.runtime.getURL('supertonic/ort/ort-wasm-simd-threaded.mjs' as never),
      wasm: browser.runtime.getURL('supertonic/ort/ort-wasm-simd-threaded.wasm' as never),
    },
  ),
  primaryExecutionProviders: ['webgpu', 'wasm'],
  fallbackExecutionProviders: ['wasm'],
});

type OffscreenMessage = {
  target: 'offscreen';
  action: TtsAction;
  data?: TtsGenerateData;
};

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isOffscreenMessage(message)) {
    return;
  }

  void ttsEngine
    .handle(message.action, message.data ?? {})
    .then(sendResponse)
    .catch((error) => {
      console.error('[Anything Reader][Offscreen] Request failed', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return true;
});

function isOffscreenMessage(message: unknown): message is OffscreenMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<OffscreenMessage>;
  return candidate.target === 'offscreen' && typeof candidate.action === 'string';
}
