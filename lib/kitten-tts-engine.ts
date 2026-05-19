import * as ort from 'onnxruntime-web';
import { devLog } from "@/lib/devlog.ts";
import { phonemize } from 'phonemizer';
import type { OrtWasmPaths } from '@/lib/ort-runtime.ts';

const DEFAULT_KITTEN_VOICE_ID = 'expr-voice-3-f';
const KITTEN_SAMPLE_RATE = 24000;

export type KittenTtsAction = 'tts-initialize' | 'tts-generate' | 'tts-unload' | 'tts-status';

export type KittenTtsGenerateData = {
  text?: string;
  voiceId?: string;
  speechLength?: number;
  totalStep?: number;
  model?: 'kitten';
};

type KittenEngineOptions = {
  kittenRoot: string;
  ortWasmRoot: OrtWasmPaths;
  primaryExecutionProviders: string[];
  fallbackExecutionProviders?: string[];
};

type KittenConfig = {
  model_file: string;
  voices: string;
  speed_priors?: Record<string, number>;
  voice_aliases?: Record<string, string>;
};

type KittenEngineState = {
  loading: Promise<void> | null;
  session: ort.InferenceSession | null;
  voices: Map<string, Float32Array>;
  config: KittenConfig | null;
  ready: boolean;
};

const KITTEN_TOKENIZER_VOCAB = new Map<string, number>([
  ['$', 0],
  [';', 1],
  [':', 2],
  [',', 3],
  ['.', 4],
  ['!', 5],
  ['?', 6],
  ['¡', 7],
  ['¿', 8],
  ['—', 9],
  ['…', 10],
  ['«', 12],
  ['»', 13],
  ['"', 15],
  [' ', 16],
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((char, index) => [char, 17 + index] as const),
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((char, index) => [char, 43 + index] as const),
  ...'ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'.split('').map((char, index) => [char, 69 + index] as const),
  ['̩', 175],
  ["'", 176],
  ['ᵻ', 177],
]);

export function createKittenTtsEngine(options: KittenEngineOptions) {
  const kittenEngine: KittenEngineState = {
    loading: null,
    session: null,
    voices: new Map(),
    config: null,
    ready: false,
  };

  return {
    handle,
    ensureInitialized: () => ensureInitialized(),
  };

  async function handle(action: KittenTtsAction, data: unknown = {}) {
    switch (action) {
      case 'tts-initialize':
        await ensureInitialized();
        return { success: true, initialized: kittenEngine.ready, model: 'kitten' as const };
      case 'tts-generate':
        return generateSpeech(data as KittenTtsGenerateData);
      case 'tts-status':
        return {
          success: true,
          initialized: kittenEngine.ready,
          model: 'kitten' as const,
          voices: [...kittenEngine.voices.keys()],
        };
      case 'tts-unload':
        kittenEngine.loading = null;
        kittenEngine.session = null;
        kittenEngine.voices.clear();
        kittenEngine.config = null;
        kittenEngine.ready = false;
        return { success: true };
      default:
        return { success: false, error: `Unsupported TTS action: ${action}` };
    }
  }

  async function ensureInitialized() {
    if (kittenEngine.ready && kittenEngine.session) {
      return;
    }

    if (!kittenEngine.loading) {
      kittenEngine.loading = (async () => {
        configureOnnxRuntime(options.ortWasmRoot);

        const configResponse = await fetch(`${options.kittenRoot}/config.json`);
        if (!configResponse.ok) {
          throw new Error(`Failed to load KittenTTS config: ${configResponse.status}`);
        }

        const config = (await configResponse.json()) as KittenConfig;
        const voices = await loadKittenVoices(`${options.kittenRoot}/${config.voices}`);
        const session = await loadKittenSessionWithProviderFallback(`${options.kittenRoot}/${config.model_file}`);

        kittenEngine.config = config;
        kittenEngine.voices = voices;
        kittenEngine.session = session;
        kittenEngine.ready = true;
      })().catch((error) => {
        kittenEngine.loading = null;
        kittenEngine.session = null;
        kittenEngine.voices.clear();
        kittenEngine.config = null;
        kittenEngine.ready = false;
        throw error;
      });
    }

    await kittenEngine.loading;

    if (!kittenEngine.session) {
      throw new Error('KittenTTS did not initialize.');
    }
  }

  async function generateSpeech(data: KittenTtsGenerateData) {
    const text = data.text?.trim();
    if (!text) {
      return { success: false, error: 'No text was provided.' };
    }

    await ensureInitialized();
    if (!kittenEngine.session || !kittenEngine.config) {
      throw new Error('KittenTTS was not ready.');
    }

    const voiceId = resolveKittenVoiceId(data.voiceId, kittenEngine.voices);
    const voice = kittenEngine.voices.get(voiceId) ?? kittenEngine.voices.values().next().value;
    if (!voice) {
      throw new Error('KittenTTS voices were not loaded.');
    }
    if (!kittenEngine.voices.has(voiceId)) {
      devLog('[Anything Reader][FirefoxBackground] KittenTTS voice fallback in use', {
        requestedVoiceId: data.voiceId,
        resolvedVoiceId: voiceId,
        loadedVoices: [...kittenEngine.voices.keys()],
      });
    }

    const speedBase = data.speechLength && data.speechLength > 0 ? 1 / data.speechLength : 1.25;
    const speedPrior = kittenEngine.config.speed_priors?.[voiceId] ?? 1;
    const { inputIds, tokenCount } = await createKittenInputIds(text);
    const refId = Math.min(tokenCount, Math.max(0, voice.length / 256 - 1));
    const refOffset = Math.floor(refId) * 256;
    const style = voice.slice(refOffset, refOffset + 256);

    const outputs = await kittenEngine.session.run({
      input_ids: new ort.Tensor('int64', inputIds, [1, inputIds.length]),
      style: new ort.Tensor('float32', style, [1, 256]),
      speed: new ort.Tensor('float32', new Float32Array([speedBase * speedPrior]), [1]),
    });

    const waveform = outputs.waveform ?? outputs[kittenEngine.session.outputNames[0]];
    const rawAudio = Array.from(waveform.data as Iterable<number>);
    const audio = rawAudio.length > 5000 ? rawAudio.slice(0, -5000) : rawAudio;
    const wavBuffer = writeWavFile(audio, KITTEN_SAMPLE_RATE);

    return {
      success: true,
      audioBase64: arrayBufferToBase64(wavBuffer),
      sampleRate: KITTEN_SAMPLE_RATE,
    };
  }

  async function loadKittenVoices(url: string) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load KittenTTS voices: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return parseNpzFloat32Arrays(buffer);
  }

  async function loadKittenSessionWithProviderFallback(modelPath: string) {
    const primaryProviders = options.primaryExecutionProviders.includes('wasm') ? ['wasm'] : options.primaryExecutionProviders;
    try {
      return await ort.InferenceSession.create(modelPath, {
        executionProviders: primaryProviders,
        graphOptimizationLevel: 'all',
      });
    } catch (error) {
      const fallbackProviders = options.fallbackExecutionProviders ?? ['wasm'];
      if (primaryProviders.join(',') === fallbackProviders.join(',')) {
        throw error;
      }

      return ort.InferenceSession.create(modelPath, {
        executionProviders: fallbackProviders,
        graphOptimizationLevel: 'all',
      });
    }
  }
}

function configureOnnxRuntime(wasmPaths: string | { mjs: string; wasm: string }) {
  ort.env.logLevel = 'error';
  (ort.env.wasm as typeof ort.env.wasm & { logLevel?: string }).logLevel = 'error';
  ort.env.wasm.wasmPaths = wasmPaths as never;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
}

function parseNpzFloat32Arrays(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const result = new Map<string, Float32Array>();
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) {
      break;
    }

    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraFieldLength = view.getUint16(offset + 28, true);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const entryName = new TextDecoder().decode(bytes.subarray(fileNameStart, fileNameEnd));
    const dataStart = fileNameEnd + extraFieldLength;

    if (compression !== 0) {
      throw new Error('Compressed KittenTTS voice archives are not supported in this build.');
    }

    const npyBuffer = bytes.slice(dataStart, dataStart + compressedSize).buffer;
    result.set(entryName.replace(/\.npy$/i, ''), parseNpyFloat32Array(npyBuffer));
    offset = dataStart + compressedSize;
  }

  return result;
}

function parseNpyFloat32Array(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(...bytes.slice(0, 6));
  if (magic !== '\x93NUMPY') {
    throw new Error('Invalid NPY file inside KittenTTS voices archive.');
  }

  const headerLength = new DataView(buffer).getUint16(8, true);
  const headerStart = 10;
  const headerEnd = headerStart + headerLength;
  const header = new TextDecoder().decode(bytes.subarray(headerStart, headerEnd));
  const dataStart = headerEnd;

  if (!header.includes("'descr': '<f4'") && !header.includes('"descr": "<f4"')) {
    throw new Error(`Unsupported KittenTTS voice dtype: ${header}`);
  }

  const dataBytes = bytes.subarray(dataStart, dataStart + ((bytes.length - dataStart) - ((bytes.length - dataStart) % 4)));
  return new Float32Array(dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength));
}

async function createKittenInputIds(text: string) {
  const cleanedText = cleanTextForKitten(text);
  let phonemeText = '';

  try {
    const phonemes = await phonemize(cleanedText, 'en-us');
    phonemeText = (Array.isArray(phonemes) ? phonemes : [phonemes]).join(' ').trim();
  } catch (error) {
    throw new Error(`KittenTTS phonemization failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!phonemeText) {
    throw new Error('KittenTTS phonemization returned no phonemes.');
  }

  const tokenIds = Array.from(`$${phonemeText}$`, (char) => KITTEN_TOKENIZER_VOCAB.get(char) ?? 0);

  return {
    inputIds: new BigInt64Array([0, ...tokenIds, 10, 0].map((token) => BigInt(token))),
    tokenCount: tokenIds.length,
  };
}

function cleanTextForKitten(text: string) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const emojiRegex = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]|[\u{FE0F}]|[\u{200D}]/gu;

  return text
    .replace(emojiRegex, '')
    .replace(/\b\/\b/g, ' slash ')
    .replace(/[\/\\()¯]/g, '')
    .replace(/["“”]/g, '')
    .replace(/\s—/g, '.')
    .replace(/\b_\b/g, ' ')
    .replace(/\b-\b/g, ' ')
    .replace(/[^\u0000-\u024F]/g, '')
    .trim();
}

function normalizeKittenVoiceId(voiceId: unknown) {
  return typeof voiceId === 'string' && /^expr-voice-[2-5]-[mf]$/.test(voiceId) ? voiceId : DEFAULT_KITTEN_VOICE_ID;
}

function resolveKittenVoiceId(voiceId: unknown, voices: Map<string, Float32Array>) {
  const normalizedVoiceId = normalizeKittenVoiceId(voiceId);
  if (voices.has(normalizedVoiceId)) {
    return normalizedVoiceId;
  }

  const firstAvailableVoiceId = voices.keys().next().value;
  return typeof firstAvailableVoiceId === 'string' ? firstAvailableVoiceId : normalizedVoiceId;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function writeWavFile(samples: number[] | Float32Array, sampleRate: number) {
  const sampleArray = samples instanceof Float32Array ? samples : Float32Array.from(samples);
  const buffer = new ArrayBuffer(44 + sampleArray.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  const pcm = new Int16Array(buffer, 44);
  for (let i = 0; i < sampleArray.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, sampleArray[i] ?? 0));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + sampleArray.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, sampleArray.length * 2, true);

  return buffer;
}
