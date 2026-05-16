import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { transform } from 'esbuild';
import { JSDOM } from 'jsdom';

async function loadScriptIntoWindow(relativePath: string, window: Window) {
  const filePath = path.resolve(relativePath);
  const source = await readFile(filePath, 'utf8');
  const result = await transform(source, {
    loader: 'ts',
    format: 'iife',
    target: 'es2020',
  });

  const sandbox: Record<string, unknown> = {
    window,
    document: window.document,
    Node: (window as unknown as { Node: typeof Node }).Node,
    NodeFilter: (window as unknown as { NodeFilter: typeof NodeFilter }).NodeFilter,
    console,
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  };

  // eslint-disable-next-line no-new-func
  const fn = new Function('sandbox', `with (sandbox) { ${result.code} }`);
  fn(sandbox);
}

test('text preprocessor normalizes text and adds language-specific replacements', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.com' });
  await loadScriptIntoWindow('entrypoints/shared/text-preprocessor.ts', dom.window as unknown as Window);

  const preprocessor = (dom.window as unknown as { textPreprocessor: { addLanguageReplacements: (language: string, replacements: Record<string, string>) => void; preprocess: (text: string) => string } }).textPreprocessor;
  assert.ok(preprocessor);

  preprocessor.addLanguageReplacements('en', { NASA: 'N A S A' });

  const output = preprocessor.preprocess('NASA — hello  world');
  assert.equal(output, 'N A S A hello world');
});

test('html analyzer extracts visible text from the selected element', async () => {
  const dom = new JSDOM(
    `<!doctype html>
      <html>
        <body>
          <main id="article">
            <h1>Headline</h1>
            <p>Visible paragraph text.</p>
            <p style="display:none">Hidden paragraph text.</p>
            <div><span>Nested visible text</span></div>
          </main>
          <aside>Sidebar should not be included.</aside>
        </body>
      </html>`,
    { url: 'https://example.com' },
  );

  Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', {
    value() {
      return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20 };
    },
  });

  await loadScriptIntoWindow('entrypoints/shared/html-analyzer-common.ts', dom.window as unknown as Window);
  (dom.window as unknown as { ttsSelector: { currentElement: Element | null } }).ttsSelector = {
    currentElement: dom.window.document.getElementById('article'),
  };

  const text = (dom.window as unknown as { htmlAnalyzerCommon: { extractVisibleText: () => string } }).htmlAnalyzerCommon.extractVisibleText();
  assert.equal(text, 'Headline Visible paragraph text. Nested visible text');
});
