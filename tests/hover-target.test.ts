import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { findHoverTargetElement, isEligibleHoverTarget } from '../entrypoints/shared/hover-target.ts';

function createDom(html: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url: 'https://example.com',
  });

  Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', {
    value() {
      return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20 };
    },
  });

  return dom;
}

test('hover target prefers paragraph text', () => {
  const dom = createDom(`
    <main>
      <article>
        <p id="story">Readable paragraph text for the hover icon.</p>
      </article>
    </main>
  `);

  const paragraph = dom.window.document.getElementById('story');
  if (!paragraph) {
    throw new Error('missing paragraph');
  }
  assert.equal(isEligibleHoverTarget(paragraph, paragraph.textContent || ''), true);
  assert.equal(findHoverTargetElement(paragraph, paragraph.textContent || '')?.id, 'story');
});

test('hover target allows leaf span text in a reading region', () => {
  const dom = createDom(`
    <main>
      <article>
        <div class="tweet">
          <span id="tweet-text">A social feed text span that should still get the icon.</span>
        </div>
      </article>
    </main>
  `);

  const span = dom.window.document.getElementById('tweet-text');
  if (!span) {
    throw new Error('missing span');
  }
  assert.equal(isEligibleHoverTarget(span, span.textContent || ''), true);
  assert.equal(findHoverTargetElement(span, span.textContent || '')?.id, 'tweet-text');
});

test('hover target rejects navigation, pagination, and button text', () => {
  const dom = createDom(`
    <main>
      <nav>
        <a href="/about"><span id="nav-span">About us</span></a>
      </nav>
      <div class="pagination">
        <span id="page-number">2</span>
      </div>
      <button type="button">
        <span id="button-span">Play</span>
      </button>
    </main>
  `);

  const navSpan = dom.window.document.getElementById('nav-span');
  const pageNumber = dom.window.document.getElementById('page-number');
  const buttonSpan = dom.window.document.getElementById('button-span');

  if (!navSpan || !pageNumber || !buttonSpan) {
    throw new Error('missing nav test nodes');
  }
  assert.equal(isEligibleHoverTarget(navSpan, navSpan.textContent || ''), false);
  assert.equal(isEligibleHoverTarget(pageNumber, pageNumber.textContent || ''), false);
  assert.equal(isEligibleHoverTarget(buttonSpan, buttonSpan.textContent || ''), false);
  assert.equal(findHoverTargetElement(navSpan, navSpan.textContent || ''), null);
  assert.equal(findHoverTargetElement(pageNumber, pageNumber.textContent || ''), null);
  assert.equal(findHoverTargetElement(buttonSpan, buttonSpan.textContent || ''), null);
});

test('hover target rejects svg/icon wrapper text', () => {
  const dom = createDom(`
    <main>
      <article>
        <button type="button" class="icon-button">
          <svg aria-hidden="true" width="16" height="16"></svg>
          <span id="icon-label">Next</span>
        </button>
      </article>
    </main>
  `);

  const iconLabel = dom.window.document.getElementById('icon-label');
  if (!iconLabel) {
    throw new Error('missing icon label');
  }
  assert.equal(isEligibleHoverTarget(iconLabel, iconLabel.textContent || ''), false);
  assert.equal(findHoverTargetElement(iconLabel, iconLabel.textContent || ''), null);
});
