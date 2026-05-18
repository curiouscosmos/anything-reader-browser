import type { KittenTtsAction, KittenTtsGenerateData } from '@/lib/kitten-tts-engine.ts';

export const FIREFOX_TTS_HOST_PAGE = 'tts-host.html';
export const FIREFOX_TTS_HOST_PORT_NAME = 'anything-reader-tts-host';
export const FIREFOX_TTS_HOST_READY_MESSAGE = 'anything-reader:tts-host-ready';
export const FIREFOX_TTS_REQUEST_KEY_PREFIX = 'anything-reader:tts-request:';
export const FIREFOX_TTS_RESPONSE_KEY_PREFIX = 'anything-reader:tts-response:';

export type FirefoxTtsHostRequest =
  | {
      id: number;
      action: KittenTtsAction;
      data?: KittenTtsGenerateData;
    };

export type FirefoxTtsHostResponse =
  | {
      id: number;
      success: true;
      result: unknown;
    }
  | {
      id: number;
      success: false;
      error: string;
    };
