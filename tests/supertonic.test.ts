import assert from 'node:assert/strict';
import test from 'node:test';

import { AVAILABLE_LANGS, chunkText, isValidLang, writeWavFile } from '../lib/supertonic.ts';

test('available languages include common reader languages', () => {
  assert.equal(isValidLang('en'), true);
  assert.equal(isValidLang('ko'), true);
  assert.equal(isValidLang('xx'), false);
  assert.ok(AVAILABLE_LANGS.includes('en'));
});

test('chunkText preserves sentence boundaries across paragraphs', () => {
  const text = [
    'Dr. Smith went home. He slept well.',
    '',
    'The second paragraph is here. It has two sentences.',
  ].join('\n\n');

  const chunks = chunkText(text, 80);
  assert.deepEqual(chunks, [
    'Dr. Smith went home. He slept well.',
    'The second paragraph is here. It has two sentences.',
  ]);
});

test('writeWavFile produces a valid PCM WAV header', () => {
  const buffer = writeWavFile([0, 0.5, -0.5], 24000);
  const view = new DataView(buffer);
  const readAscii = (offset: number, length: number) =>
    String.fromCharCode(...new Uint8Array(buffer, offset, length));

  assert.equal(buffer.byteLength, 44 + 3 * 2);
  assert.equal(readAscii(0, 4), 'RIFF');
  assert.equal(readAscii(8, 4), 'WAVE');
  assert.equal(readAscii(12, 4), 'fmt ');
  assert.equal(readAscii(36, 4), 'data');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(24, true), 24000);
});
