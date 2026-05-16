import * as ort from 'onnxruntime-web';

export const AVAILABLE_LANGS = ['en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi'] as const;

export function configureOnnxRuntime(wasmPath: string) {
  ort.env.logLevel = 'error';
  (ort.env.wasm as typeof ort.env.wasm & { logLevel?: string }).logLevel = 'error';
  ort.env.wasm.wasmPaths = wasmPath;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
}

export function isValidLang(lang: string): lang is (typeof AVAILABLE_LANGS)[number] {
  return (AVAILABLE_LANGS as readonly string[]).includes(lang);
}

type VoiceStyleTensor = {
  dims: number[];
  data: number[][];
};

export class UnicodeProcessor {
  constructor(private readonly indexer: number[]) {}

  call(textList: string[], langList: string[]) {
    const processedTexts = textList.map((text, i) => this.preprocessText(text, langList[i]));
    const textIdsLengths = processedTexts.map((text) => text.length);
    const maxLen = Math.max(...textIdsLengths);

    const textIds = processedTexts.map((text) => {
      const row = new Array(maxLen).fill(0);
      for (let j = 0; j < text.length; j++) {
        const codePoint = text.codePointAt(j);
        row[j] = codePoint !== undefined && codePoint < this.indexer.length ? this.indexer[codePoint] : -1;
      }
      return row;
    });

    const textMask = this.getTextMask(textIdsLengths);
    return { textIds, textMask };
  }

  preprocessText(text: string, lang: string) {
    text = text.normalize('NFKD');

    const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;
    text = text.replace(emojiPattern, '');

    const replacements: Record<string, string> = {
      '–': '-',
      '‑': '-',
      '—': '-',
      _: ' ',
      '\u201C': '"',
      '\u201D': '"',
      '\u2018': "'",
      '\u2019': "'",
      '´': "'",
      '`': "'",
      '[': ' ',
      ']': ' ',
      '|': ' ',
      '/': ' ',
      '#': ' ',
      '→': ' ',
      '←': ' ',
    };
    for (const [key, value] of Object.entries(replacements)) {
      text = text.replaceAll(key, value);
    }

    text = text.replace(/[♥☆♡©\\]/g, '');

    const exprReplacements: Record<string, string> = {
      '@': ' at ',
      'e.g.,': 'for example, ',
      'i.e.,': 'that is, ',
    };
    for (const [key, value] of Object.entries(exprReplacements)) {
      text = text.replaceAll(key, value);
    }

    text = text.replace(/ ,/g, ',');
    text = text.replace(/ \./g, '.');
    text = text.replace(/ !/g, '!');
    text = text.replace(/ \?/g, '?');
    text = text.replace(/ ;/g, ';');
    text = text.replace(/ :/g, ':');
    text = text.replace(/ '/g, "'");

    while (text.includes('""')) {
      text = text.replace('""', '"');
    }
    while (text.includes("''")) {
      text = text.replace("''", "'");
    }
    while (text.includes('``')) {
      text = text.replace('``', '`');
    }

    text = text.replace(/\s+/g, ' ').trim();

    if (!/[.!?;:,'\"')\]}…。」』】〉》›»]$/.test(text)) {
      text += '.';
    }

    if (!isValidLang(lang)) {
      throw new Error(`Invalid language: ${lang}. Available: ${AVAILABLE_LANGS.join(', ')}`);
    }

    return `<${lang}>${text}</${lang}>`;
  }

  getTextMask(textIdsLengths: number[]) {
    const maxLen = Math.max(...textIdsLengths);
    return this.lengthToMask(textIdsLengths, maxLen);
  }

  lengthToMask(lengths: number[], maxLen: number | null = null) {
    const actualMaxLen = maxLen || Math.max(...lengths);
    return lengths.map((len) => {
      const row = new Array(actualMaxLen).fill(0.0);
      for (let j = 0; j < Math.min(len, actualMaxLen); j++) {
        row[j] = 1.0;
      }
      return [row];
    });
  }
}

export class Style {
  constructor(
    public readonly ttl: ort.Tensor,
    public readonly dp: ort.Tensor,
  ) {}
}

export class TextToSpeech {
  public readonly sampleRate: number;

  constructor(
    private readonly cfgs: { ae: { sample_rate: number; base_chunk_size: number }; ttl: { chunk_compress_factor: number; latent_dim: number } },
    private readonly textProcessor: UnicodeProcessor,
    private readonly dpOrt: ort.InferenceSession,
    private readonly textEncOrt: ort.InferenceSession,
    private readonly vectorEstOrt: ort.InferenceSession,
    private readonly vocoderOrt: ort.InferenceSession,
  ) {
    this.sampleRate = cfgs.ae.sample_rate;
  }

  async _infer(textList: string[], langList: string[], style: Style, totalStep: number, speed = 1.05, progressCallback: ((step: number, total: number) => void) | null = null) {
    const bsz = textList.length;
    const { textIds, textMask } = this.textProcessor.call(textList, langList);

    const textIdsFlat = new BigInt64Array(textIds.flat().map((x) => BigInt(x)));
    const textIdsTensor = new ort.Tensor('int64', textIdsFlat, [bsz, textIds[0].length]);

    const textMaskFlat = new Float32Array(textMask.flat(2));
    const textMaskTensor = new ort.Tensor('float32', textMaskFlat, [bsz, 1, textMask[0][0].length]);

    const dpOutputs = await this.dpOrt.run({
      text_ids: textIdsTensor,
      style_dp: style.dp,
      text_mask: textMaskTensor,
    });
    const duration = Array.from(dpOutputs.duration.data as Iterable<number>);

    for (let i = 0; i < duration.length; i++) {
      duration[i] /= speed;
    }

    const textEncOutputs = await this.textEncOrt.run({
      text_ids: textIdsTensor,
      style_ttl: style.ttl,
      text_mask: textMaskTensor,
    });
    const textEmb = textEncOutputs.text_emb;

    let { xt, latentMask } = this.sampleNoisyLatent(duration, this.sampleRate, this.cfgs.ae.base_chunk_size, this.cfgs.ttl.chunk_compress_factor, this.cfgs.ttl.latent_dim);

    const latentMaskFlat = new Float32Array(latentMask.flat(2));
    const latentMaskTensor = new ort.Tensor('float32', latentMaskFlat, [bsz, 1, latentMask[0][0].length]);

    const totalStepArray = new Float32Array(bsz).fill(totalStep);
    const totalStepTensor = new ort.Tensor('float32', totalStepArray, [bsz]);

    for (let step = 0; step < totalStep; step++) {
      progressCallback?.(step + 1, totalStep);

      const currentStepArray = new Float32Array(bsz).fill(step);
      const currentStepTensor = new ort.Tensor('float32', currentStepArray, [bsz]);

      const xtFlat = new Float32Array(xt.flat(2));
      const xtTensor = new ort.Tensor('float32', xtFlat, [bsz, xt[0].length, xt[0][0].length]);

      const vectorEstOutputs = await this.vectorEstOrt.run({
        noisy_latent: xtTensor,
        text_emb: textEmb,
        style_ttl: style.ttl,
        latent_mask: latentMaskTensor,
        text_mask: textMaskTensor,
        current_step: currentStepTensor,
        total_step: totalStepTensor,
      });

      const denoised = Array.from(vectorEstOutputs.denoised_latent.data as Iterable<number>);
      const latentDim = xt[0].length;
      const latentLen = xt[0][0].length;
      xt = [];
      let idx = 0;
      for (let b = 0; b < bsz; b++) {
        const batch: number[][] = [];
        for (let d = 0; d < latentDim; d++) {
          const row: number[] = [];
          for (let t = 0; t < latentLen; t++) {
            row.push(denoised[idx++] ?? 0);
          }
          batch.push(row);
        }
        xt.push(batch);
      }
    }

    const finalXtFlat = new Float32Array(xt.flat(2));
    const finalXtTensor = new ort.Tensor('float32', finalXtFlat, [bsz, xt[0].length, xt[0][0].length]);

    const vocoderOutputs = await this.vocoderOrt.run({
      latent: finalXtTensor,
    });

    return {
      wav: Array.from(vocoderOutputs.wav_tts.data as Iterable<number>),
      duration,
    };
  }

  async call(text: string, lang: string, style: Style, totalStep: number, speed = 1.05, silenceDuration = 0.3, progressCallback: ((step: number, total: number) => void) | null = null) {
    if (style.ttl.dims[0] !== 1) {
      throw new Error('Single speaker text to speech only supports single style');
    }

    const maxLen = lang === 'ko' || lang === 'ja' ? 120 : 300;
    const textList = chunkText(text, maxLen);
    const langList = new Array(textList.length).fill(lang);
    let wavCat: number[] = [];
    let durCat = 0;

    for (let i = 0; i < textList.length; i++) {
      const { wav, duration } = await this._infer([textList[i]], [langList[i]], style, totalStep, speed, progressCallback);
      if (wavCat.length === 0) {
        wavCat = wav;
        durCat = duration[0] ?? 0;
      } else {
        const silenceLen = Math.floor(silenceDuration * this.sampleRate);
        wavCat = [...wavCat, ...new Array(silenceLen).fill(0), ...wav];
        durCat += (duration[0] ?? 0) + silenceDuration;
      }
    }

    return { wav: wavCat, duration: [durCat] };
  }

  async batch(textList: string[], langList: string[], style: Style, totalStep: number, speed = 1.05, progressCallback: ((step: number, total: number) => void) | null = null) {
    return this._infer(textList, langList, style, totalStep, speed, progressCallback);
  }

  sampleNoisyLatent(duration: number[], sampleRate: number, baseChunkSize: number, chunkCompress: number, latentDim: number) {
    const bsz = duration.length;
    const maxDur = Math.max(...duration);
    const wavLenMax = Math.floor(maxDur * sampleRate);
    const wavLengths = duration.map((d) => Math.floor(d * sampleRate));

    const chunkSize = baseChunkSize * chunkCompress;
    const latentLen = Math.floor((wavLenMax + chunkSize - 1) / chunkSize);
    const latentDimVal = latentDim * chunkCompress;

    const xt: number[][][] = [];
    for (let b = 0; b < bsz; b++) {
      const batch: number[][] = [];
      for (let d = 0; d < latentDimVal; d++) {
        const row: number[] = [];
        for (let t = 0; t < latentLen; t++) {
          const u1 = Math.max(0.0001, Math.random());
          const u2 = Math.random();
          row.push(Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2));
        }
        batch.push(row);
      }
      xt.push(batch);
    }

    const latentLengths = wavLengths.map((len) => Math.floor((len + chunkSize - 1) / chunkSize));
    const latentMask = this.lengthToMask(latentLengths, latentLen);

    for (let b = 0; b < bsz; b++) {
      for (let d = 0; d < latentDimVal; d++) {
        for (let t = 0; t < latentLen; t++) {
          xt[b][d][t] *= latentMask[b][0][t] ?? 0;
        }
      }
    }

    return { xt, latentMask };
  }

  lengthToMask(lengths: number[], maxLen: number | null = null) {
    const actualMaxLen = maxLen || Math.max(...lengths);
    return lengths.map((len) => {
      const row = new Array(actualMaxLen).fill(0.0);
      for (let j = 0; j < Math.min(len, actualMaxLen); j++) {
        row[j] = 1.0;
      }
      return [row];
    });
  }
}

export function chunkText(text: string, maxLen = 300) {
  if (typeof text !== 'string') {
    throw new Error(`chunkText expects a string, got ${typeof text}`);
  }

  const paragraphs = text.trim().split(/\n\s*\n+/).filter((paragraph) => paragraph.trim());
  const chunks: string[] = [];

  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (!paragraph) {
      continue;
    }

    const sentences = paragraph.split(/(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length + 1 <= maxLen) {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
  }

  return chunks;
}

export async function loadVoiceStyle(voiceStylePaths: string[], verbose = false) {
  const bsz = voiceStylePaths.length;
  const firstResponse = await fetch(voiceStylePaths[0]);
  const firstStyle = (await firstResponse.json()) as { style_ttl: VoiceStyleTensor; style_dp: VoiceStyleTensor };
  const ttlDims = firstStyle.style_ttl.dims;
  const dpDims = firstStyle.style_dp.dims;

  const ttlSize = bsz * ttlDims[1] * ttlDims[2];
  const dpSize = bsz * dpDims[1] * dpDims[2];
  const ttlFlat = new Float32Array(ttlSize);
  const dpFlat = new Float32Array(dpSize);

  for (let i = 0; i < bsz; i++) {
    const response = await fetch(voiceStylePaths[i]);
    const voiceStyle = (await response.json()) as { style_ttl: VoiceStyleTensor; style_dp: VoiceStyleTensor };
    ttlFlat.set(Array.from(voiceStyle.style_ttl.data.flat(Infinity) as Iterable<number>), i * ttlDims[1] * ttlDims[2]);
    dpFlat.set(Array.from(voiceStyle.style_dp.data.flat(Infinity) as Iterable<number>), i * dpDims[1] * dpDims[2]);
  }

  const ttlTensor = new ort.Tensor('float32', ttlFlat, [bsz, ttlDims[1], ttlDims[2]]);
  const dpTensor = new ort.Tensor('float32', dpFlat, [bsz, dpDims[1], dpDims[2]]);

  if (verbose) {
    console.log(`Loaded ${bsz} voice styles`);
  }

  return new Style(ttlTensor, dpTensor);
}

export async function loadCfgs(onnxDir: string) {
  const response = await fetch(`${onnxDir}/tts.json`);
  return response.json();
}

export async function loadTextProcessor(onnxDir: string) {
  const response = await fetch(`${onnxDir}/unicode_indexer.json`);
  const indexer = (await response.json()) as number[];
  return new UnicodeProcessor(indexer);
}

export async function loadOnnx(onnxPath: string, options: ort.InferenceSession.SessionOptions) {
  return ort.InferenceSession.create(onnxPath, options);
}

export async function loadTextToSpeech(onnxDir: string, sessionOptions: ort.InferenceSession.SessionOptions = {}, progressCallback: ((modelName: string, current: number, total: number) => void) | null = null) {
  const cfgs = await loadCfgs(onnxDir);
  const modelPaths = [
    { name: 'Duration Predictor', path: `${onnxDir}/duration_predictor.onnx` },
    { name: 'Text Encoder', path: `${onnxDir}/text_encoder.onnx` },
    { name: 'Vector Estimator', path: `${onnxDir}/vector_estimator.onnx` },
    { name: 'Vocoder', path: `${onnxDir}/vocoder.onnx` },
  ];

  const sessions: ort.InferenceSession[] = [];
  for (let i = 0; i < modelPaths.length; i++) {
    progressCallback?.(modelPaths[i].name, i + 1, modelPaths.length);
    sessions.push(await loadOnnx(modelPaths[i].path, sessionOptions));
  }

  const [dpOrt, textEncOrt, vectorEstOrt, vocoderOrt] = sessions;
  const textProcessor = await loadTextProcessor(onnxDir);
  const textToSpeech = new TextToSpeech(cfgs, textProcessor, dpOrt, textEncOrt, vectorEstOrt, vocoderOrt);

  return { textToSpeech, cfgs };
}

export function writeWavFile(audioData: number[], sampleRate: number) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = audioData.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const int16Data = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    const clamped = Math.max(-1.0, Math.min(1.0, audioData[i] ?? 0));
    int16Data[i] = Math.floor(clamped * 32767);
  }

  new Uint8Array(buffer, 44).set(new Uint8Array(int16Data.buffer));
  return buffer;
}
