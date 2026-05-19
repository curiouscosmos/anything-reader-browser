import type { KittenTtsAction } from '@/lib/kitten-tts-engine.ts';
import { devLog } from "@/lib/devlog.ts";

export async function sendFirefoxTtsMessage(action: KittenTtsAction, data: unknown = {}) {
  devLog('[Anything Reader][FirefoxTTS] send', action, summarizeFirefoxPayload(data));
  const response = await browser.runtime.sendMessage({
    action,
    data,
  });

  if (!response) {
    throw new Error('Firefox TTS host did not respond.');
  }

  devLog('[Anything Reader][FirefoxTTS] response', action, summarizeFirefoxResponse(response));
  return response;
}

function summarizeFirefoxPayload(data: unknown) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const payload = data as { text?: unknown; voiceId?: unknown; model?: unknown; speechLength?: unknown; totalStep?: unknown; language?: unknown };
  return {
    model: payload.model,
    voiceId: payload.voiceId,
    speechLength: payload.speechLength,
    totalStep: payload.totalStep,
    language: payload.language,
    textLength: typeof payload.text === 'string' ? payload.text.length : undefined,
  };
}

function summarizeFirefoxResponse(response: unknown) {
  if (!response || typeof response !== 'object') {
    return response;
  }

  const payload = response as { success?: unknown; initialized?: unknown; model?: unknown; sampleRate?: unknown; audioBase64?: unknown; error?: unknown };
  return {
    success: payload.success,
    initialized: payload.initialized,
    model: payload.model,
    sampleRate: payload.sampleRate,
    audioBase64Length: typeof payload.audioBase64 === 'string' ? payload.audioBase64.length : undefined,
    error: payload.error,
  };
}
