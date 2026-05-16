import { createSupertonicTtsEngine, type TtsAction, type TtsGenerateData } from '@/lib/tts-engine.ts';

const ttsEngine = createSupertonicTtsEngine({
  debugPrefix: '[Anything Reader][Offscreen]',
  modelRoot: browser.runtime.getURL('onnx' as never),
  voiceStyleRoot: browser.runtime.getURL('voice_styles' as never),
  kittenRoot: browser.runtime.getURL('kittenTTS' as never),
  ortWasmRoot: browser.runtime.getURL('ort/' as never),
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
