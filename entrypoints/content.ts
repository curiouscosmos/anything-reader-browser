const EXTRACT_READABLE_TEXT_MESSAGE = 'anything-reader:extract-readable-text';
const DEBUG_PREFIX = '[Anything Reader][Content]';

const NOISE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  'iframe',
  'object',
  'embed',
  'template',
  'nav',
  'footer',
  'header',
  'aside',
  'form',
  'button',
  'input',
  'select',
  'textarea',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="complementary"]',
  '[role="contentinfo"]',
  '[role="search"]',
  '[role="menu"]',
].join(',');

const NOISE_KEYWORDS = [
  'nav',
  'menu',
  'pagination',
  'pager',
  'breadcrumb',
  'sidebar',
  'aside',
  'footer',
  'header',
  'toolbar',
  'share',
  'social',
  'subscribe',
  'promo',
  'advert',
  'ads',
  'ad-',
  'comment',
  'related',
  'recommended',
  'sponsored',
  'cookie',
  'consent',
  'modal',
  'popup',
  'overlay',
  'newsletter',
  'toc',
  'tableofcontents',
  'table-of-contents',
  'page-number',
  'filter',
  'sort',
];

type ExtractResult =
  | {
      ok: true;
      title: string;
      url: string;
      text: string;
      textLength: number;
    }
  | {
      ok: false;
      error: string;
    };

export default defineContentScript({
  matches: ['*://*/*'],
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isExtractRequest(message)) {
        return;
      }

      console.log(DEBUG_PREFIX, 'Received extraction request', message);
      const result = extractReadableText();
      console.log(DEBUG_PREFIX, 'Sending extraction result back to background', result);
      sendResponse(result);
      return true;
    });
  },
});

function isExtractRequest(message: unknown): message is { type: string } {
  return typeof message === 'object' && message !== null && 'type' in message && (message as { type?: unknown }).type === EXTRACT_READABLE_TEXT_MESSAGE;
}

function extractReadableText(): ExtractResult {
  console.log(DEBUG_PREFIX, 'Starting extraction');
  const root = selectCandidateRoot(document);
  console.log(DEBUG_PREFIX, 'Selected candidate root', describeElement(root));
  const clone = root.cloneNode(true) as HTMLElement;

  pruneNoise(clone);

  const rawText = getReadableText(clone);
  const text = normalizeText(rawText);
  console.log(DEBUG_PREFIX, 'Extracted raw text metrics', {
    rawLength: rawText.length,
    normalizedLength: text.length,
    title: document.title.trim(),
    url: location.href,
    preview: text.slice(0, 500),
  });

  if (!text) {
    console.error(DEBUG_PREFIX, 'No readable text found after extraction');
    return {
      ok: false,
      error: 'No readable text was found on this page.',
    };
  }

  return {
    ok: true,
    title: document.title.trim(),
    url: location.href,
    text,
    textLength: text.length,
  };
}

function selectCandidateRoot(doc: Document): HTMLElement {
  const preferredSelectors = ['article', 'main', '[role="main"]', '[itemprop="articleBody"]'];
  const candidates = preferredSelectors.flatMap((selector) =>
    Array.from(doc.querySelectorAll(selector)).filter(
      (element): element is HTMLElement => element instanceof HTMLElement,
    ),
  );

  if (candidates.length === 0) {
    console.log(DEBUG_PREFIX, 'No preferred candidate found, falling back to body');
    return doc.body;
  }

  const scoredCandidates = candidates.map((candidate) => ({
    element: candidate,
    score: scoreCandidate(candidate),
  }));
  console.log(DEBUG_PREFIX, 'Candidate scores', scoredCandidates.map(({ element, score }) => ({
    score,
    tagName: element.tagName,
    id: element.id,
    className: element.className,
  })));

  return scoredCandidates.reduce((best, candidate) => (candidate.score > best.score ? candidate : best)).element;
}

function scoreCandidate(element: HTMLElement): number {
  const textLength = getTextLength(element);
  const linkLength = Array.from(element.querySelectorAll('a')).reduce(
    (total, link) => total + getTextLength(link),
    0,
  );
  const paragraphCount = element.querySelectorAll('p').length;
  const headingCount = element.querySelectorAll('h1, h2, h3').length;

  return textLength + paragraphCount * 120 + headingCount * 40 - linkLength * 0.5;
}

function getTextLength(element: Element): number {
  return normalizeWhitespace(element.textContent ?? '').length;
}

function pruneNoise(root: ParentNode) {
  console.log(DEBUG_PREFIX, 'Pruning obvious noise nodes');
  root.querySelectorAll(NOISE_SELECTORS).forEach((element) => element.remove());

  root.querySelectorAll('*').forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    if (isNoiseElement(element)) {
      console.log(DEBUG_PREFIX, 'Removing noisy element', describeElement(element));
      element.remove();
    }
  });
}

function isNoiseElement(element: HTMLElement): boolean {
  const tokens = [
    element.id,
    element.className,
    element.getAttribute('role'),
    element.getAttribute('aria-label'),
    element.getAttribute('data-testid'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!tokens) {
    return false;
  }

  return NOISE_KEYWORDS.some((keyword) => tokens.includes(keyword));
}

function getReadableText(element: HTMLElement): string {
  const text = element.innerText || element.textContent || '';
  console.log(DEBUG_PREFIX, 'Collected readable text', {
    length: text.length,
    preview: text.slice(0, 500),
  });
  return text;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function describeElement(element: Element): Record<string, string | number | undefined> {
  return {
    tagName: element.tagName,
    id: element.id || undefined,
    className:
      element instanceof HTMLElement && typeof element.className === 'string' && element.className.length > 0
        ? element.className
        : undefined,
    childCount: element.children.length,
    textLength: normalizeWhitespace(element.textContent ?? '').length,
  };
}
