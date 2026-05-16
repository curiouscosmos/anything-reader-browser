import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampText,
  resolveNativeHostError,
  isReadCurrentPageRequest,
  normalizeText,
  READ_CURRENT_PAGE_MESSAGE,
} from '../lib/native-messaging.ts';

test('normalizeText collapses whitespace while preserving paragraph breaks', () => {
  const text = normalizeText('Hello\r\nworld.\n\n\nNext  paragraph.');
  assert.equal(text, 'Hello\nworld.\n\nNext paragraph.');
});

test('clampText limits oversized payloads', () => {
  const text = 'a'.repeat(500_100);
  assert.equal(clampText(text).length, 500_000);
});

test('isReadCurrentPageRequest detects the read-current-page message', () => {
  assert.equal(isReadCurrentPageRequest({ type: READ_CURRENT_PAGE_MESSAGE, summarize: true }), true);
  assert.equal(isReadCurrentPageRequest({ type: 'anything-else' }), false);
});

test('resolveNativeHostError maps host connection failures to a friendly message', () => {
  const message = resolveNativeHostError(new Error('Native host has exited.'));
  assert.equal(
    message,
    'Anything Reader Mac app was not reachable. Make sure the macOS app is installed and its native messaging host is registered.',
  );
});
