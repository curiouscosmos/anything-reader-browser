import * as ort from 'onnxruntime-web';
import { phonemize } from 'phonemizer';
import { configureOnnxRuntime, loadTextToSpeech, loadVoiceStyle, writeWavFile, type Style, type TextToSpeech } from '@/lib/supertonic.ts';

const DEFAULT_VOICE_ID = 'M1';
const DEFAULT_KITTEN_VOICE_ID = 'expr-voice-3-f';
const DEFAULT_TOTAL_STEP = 8;
const DEFAULT_SPEECH_LENGTH = 1 / 1.25;
const KITTEN_SAMPLE_RATE = 24000;

type TtsModel = 'supertonic' | 'kitten';

export type TtsAction = 'tts-initialize' | 'tts-generate' | 'tts-unload' | 'tts-status';

export type TtsGenerateData = {
  text?: string;
  voiceId?: string;
  speechLength?: number;
  totalStep?: number;
  language?: string;
  model?: TtsModel;
};

type TtsEngineOptions = {
  debugPrefix: string;
  modelRoot: string;
  voiceStyleRoot: string;
  kittenRoot: string;
  ortWasmRoot: string;
  primaryExecutionProviders: string[];
  fallbackExecutionProviders?: string[];
};

type SupertonicEngineState = {
  loading: Promise<void> | null;
  textToSpeech: TextToSpeech | null;
  voiceStyles: Map<string, Style>;
  ready: boolean;
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

export function createSupertonicTtsEngine(options: TtsEngineOptions) {
  const supertonicEngine: SupertonicEngineState = {
    loading: null,
    textToSpeech: null,
    voiceStyles: new Map(),
    ready: false,
  };
  const kittenEngine: KittenEngineState = {
    loading: null,
    session: null,
    voices: new Map(),
    config: null,
    ready: false,
  };

  return {
    handle,
    ensureInitialized: () => ensureInitialized('kitten'),
  };

  async function handle(action: TtsAction, data: unknown = {}) {
    const model = normalizeModel((data as TtsGenerateData | undefined)?.model);
    switch (action) {
      case 'tts-initialize':
        await ensureInitialized(model);
        return { success: true, initialized: getReadyState(model), model };
      case 'tts-generate':
        return generateSpeech(data as TtsGenerateData);
      case 'tts-status':
        return {
          success: true,
          initialized: getReadyState(model),
          model,
          voices: model === 'kitten' ? [...kittenEngine.voices.keys()] : [...supertonicEngine.voiceStyles.keys()],
        };
      case 'tts-unload':
        supertonicEngine.loading = null;
        supertonicEngine.textToSpeech = null;
        supertonicEngine.voiceStyles.clear();
        supertonicEngine.ready = false;
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

  async function ensureInitialized(model: TtsModel) {
    if (model === 'kitten') {
      return ensureKittenInitialized();
    }

    return ensureSupertonicInitialized();
  }

  async function ensureSupertonicInitialized() {
    if (supertonicEngine.ready && supertonicEngine.textToSpeech) {
      return;
    }

    if (!supertonicEngine.loading) {
      supertonicEngine.loading = (async () => {
        console.log(options.debugPrefix, 'Loading Supertonic assets', {
          models: options.modelRoot,
          voices: options.voiceStyleRoot,
          wasm: options.ortWasmRoot,
          providers: options.primaryExecutionProviders,
        });

        configureOnnxRuntime(options.ortWasmRoot);

        const { textToSpeech } = await loadTextToSpeechWithProviderFallback();

        supertonicEngine.textToSpeech = textToSpeech;
        supertonicEngine.ready = true;

        console.log(options.debugPrefix, 'Supertonic TTS ready');
      })().catch((error) => {
        supertonicEngine.loading = null;
        supertonicEngine.textToSpeech = null;
        supertonicEngine.ready = false;
        throw error;
      });
    }

    await supertonicEngine.loading;

    if (!supertonicEngine.textToSpeech) {
      throw new Error('Supertonic TTS did not initialize.');
    }
  }

  async function ensureKittenInitialized() {
    if (kittenEngine.ready && kittenEngine.session) {
      return;
    }

    if (!kittenEngine.loading) {
      kittenEngine.loading = (async () => {
        console.log(options.debugPrefix, 'Loading KittenTTS assets', {
          root: options.kittenRoot,
          wasm: options.ortWasmRoot,
          providers: options.primaryExecutionProviders,
        });

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

        console.log(options.debugPrefix, 'KittenTTS ready');
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

  async function loadTextToSpeechWithProviderFallback() {
    const primaryProviders = options.primaryExecutionProviders;
    const fallbackProviders = options.fallbackExecutionProviders ?? ['wasm'];
    const progress = (providerLabel: string) => (modelName: string, current: number, total: number) => {
      console.log(options.debugPrefix, `Loading ONNX model with ${providerLabel} (${current}/${total})`, modelName);
    };

    try {
      return await loadTextToSpeech(
        options.modelRoot,
        {
          executionProviders: primaryProviders,
          graphOptimizationLevel: 'all',
        },
        progress(primaryProviders.join('/')),
      );
    } catch (error) {
      if (primaryProviders.join(',') === fallbackProviders.join(',')) {
        throw error;
      }

      console.warn(options.debugPrefix, `Provider ${primaryProviders.join('/')} failed, retrying with ${fallbackProviders.join('/')}`, error);
      return loadTextToSpeech(
        options.modelRoot,
        {
          executionProviders: fallbackProviders,
          graphOptimizationLevel: 'all',
        },
        progress(fallbackProviders.join('/')),
      );
    }
  }

  async function generateSpeech(data: TtsGenerateData) {
    const text = data.text?.trim();
    if (!text) {
      return { success: false, error: 'No text was provided.' };
    }

    const model = normalizeModel(data.model);
    if (model === 'kitten') {
      return generateKittenSpeech(text, data);
    }

    return generateSupertonicSpeech(text, data);
  }

  async function generateSupertonicSpeech(text: string, data: TtsGenerateData) {
    await ensureSupertonicInitialized();

    if (!supertonicEngine.textToSpeech) {
      throw new Error('Supertonic TTS was not ready.');
    }

    const voiceId = normalizeVoiceId(data.voiceId);
    const style = await loadCachedVoiceStyle(voiceId);
    const language = normalizeLanguage(data.language);
    const totalStep = data.totalStep ?? DEFAULT_TOTAL_STEP;
    const speechLength = data.speechLength && data.speechLength > 0 ? data.speechLength : DEFAULT_SPEECH_LENGTH;
    const speed = 1 / speechLength;

    const { wav } = await supertonicEngine.textToSpeech.call(text, language, style, totalStep, speed, 0);
    const wavBuffer = writeWavFile(wav, supertonicEngine.textToSpeech.sampleRate);

    return {
      success: true,
      audioBase64: arrayBufferToBase64(wavBuffer),
      sampleRate: supertonicEngine.textToSpeech.sampleRate,
    };
  }

  async function generateKittenSpeech(text: string, data: TtsGenerateData) {
    await ensureKittenInitialized();

    if (!kittenEngine.session || !kittenEngine.config) {
      throw new Error('KittenTTS was not ready.');
    }

    const voiceId = normalizeKittenVoiceId(data.voiceId);
    const voice = kittenEngine.voices.get(voiceId);
    if (!voice) {
      throw new Error(`KittenTTS voice is missing: ${voiceId}`);
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

  async function loadCachedVoiceStyle(voiceId: string) {
    const cached = supertonicEngine.voiceStyles.get(voiceId);
    if (cached) {
      return cached;
    }

    const voiceStyleUrl = `${options.voiceStyleRoot}/${voiceId}.json`;
    console.log(options.debugPrefix, 'Loading voice style', { voiceId, voiceStyleUrl });
    const style = await loadVoiceStyle([voiceStyleUrl], true);
    supertonicEngine.voiceStyles.set(voiceId, style);
    return style;
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

      console.warn(options.debugPrefix, `KittenTTS provider ${primaryProviders.join('/')} failed, retrying with ${fallbackProviders.join('/')}`, error);
      return ort.InferenceSession.create(modelPath, {
        executionProviders: fallbackProviders,
        graphOptimizationLevel: 'all',
      });
    }
  }

  function getReadyState(model: TtsModel) {
    return model === 'kitten' ? kittenEngine.ready : supertonicEngine.ready;
  }
}

async function loadKittenVoices(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load KittenTTS voices: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return parseNpzFloat32Arrays(buffer);
}

function parseNpzFloat32Arrays(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const files = new Map<string, Float32Array>();

  const entries = readZipCentralDirectory(bytes, view);
  for (const entry of entries) {
    if (entry.compression !== 0) {
      throw new Error('Compressed KittenTTS voice archives are not supported in this build.');
    }

    const localHeaderOffset = entry.localHeaderOffset;
    const localSignature = view.getUint32(localHeaderOffset, true);
    if (localSignature !== 0x04034b50) {
      throw new Error(`Invalid local header for KittenTTS voice: ${entry.name}`);
    }

    const fileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const extraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
    const fileBytes = bytes.subarray(dataStart, dataStart + entry.compressedSize);
    files.set(entry.name.replace(/\.npy$/, ''), parseNpyFloat32(fileBytes));
  }

  return files;
}

type ZipEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function readZipCentralDirectory(bytes: Uint8Array, view: DataView) {
  const eocdSignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;

  let eocdOffset = -1;
  for (let offset = bytes.length - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error('Could not locate ZIP end-of-central-directory record for KittenTTS voices.');
  }

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries; index++) {
    if (view.getUint32(offset, true) !== centralDirectorySignature) {
      throw new Error('Invalid ZIP central directory for KittenTTS voices.');
    }

    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + fileNameLength));

    entries.push({
      name,
      compression,
      compressedSize,
      localHeaderOffset,
    });

    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function parseNpyFloat32(bytes: Uint8Array) {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x93 ||
    bytes[1] !== 0x4e ||
    bytes[2] !== 0x55 ||
    bytes[3] !== 0x4d ||
    bytes[4] !== 0x50 ||
    bytes[5] !== 0x59
  ) {
    throw new Error('Invalid NPY file inside KittenTTS voices archive.');
  }

  const major = bytes[6];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  const headerStart = major === 1 ? 10 : 12;
  const dataStart = headerStart + headerLength;
  const header = new TextDecoder().decode(bytes.subarray(headerStart, dataStart));
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

function normalizeModel(model: unknown): TtsModel {
  return model === 'supertonic' ? 'supertonic' : 'kitten';
}

function normalizeVoiceId(voiceId: unknown) {
  return typeof voiceId === 'string' && /^[MF][1-5]$/.test(voiceId) ? voiceId : DEFAULT_VOICE_ID;
}

function normalizeKittenVoiceId(voiceId: unknown) {
  return typeof voiceId === 'string' && /^expr-voice-[2-5]-[mf]$/.test(voiceId) ? voiceId : DEFAULT_KITTEN_VOICE_ID;
}

function normalizeLanguage(language: unknown) {
  if (typeof language !== 'string') {
    return 'en';
  }

  const normalized = language.toLowerCase().split('-')[0];
  return normalized.length === 2 ? normalized : 'en';
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}
