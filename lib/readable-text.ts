import { Readability } from '@mozilla/readability';

type ExtractResult =
  | {
      ok: true;
      title: string;
      site: string;
      url: string;
      text: string;
      textLength: number;
    }
  | {
      ok: false;
      error: string;
    };

export function extractReadableTextFromDocument(doc: Document): ExtractResult {
  const clonedDocument = doc.cloneNode(true) as Document;
  const article = new Readability(clonedDocument, {
    keepClasses: false,
  }).parse();

  if (!article?.textContent) {
    return {
      ok: false,
      error: 'No readable text was found on this page.',
    };
  }

  const text = normalizeText(article.textContent);
  if (!text) {
    return {
      ok: false,
      error: 'No readable text was found on this page.',
    };
  }

  const title = normalizeText(article.title || doc.title || '');
  const site = normalizeText(article.siteName || getSiteName(doc));

  return {
    ok: true,
    title: title || doc.title.trim(),
    site: site || getSiteName(doc),
    url: doc.location?.href || location.href,
    text,
    textLength: text.length,
  };
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

function getSiteName(doc: Document): string {
  const candidates = [
    'meta[property="og:site_name"]',
    'meta[name="application-name"]',
    'meta[name="apple-mobile-web-app-title"]',
    'meta[name="publisher"]',
  ];

  for (const selector of candidates) {
    const content = doc.querySelector(selector)?.getAttribute('content')?.trim();
    if (content) {
      return content;
    }
  }

  const hostname = doc.location?.hostname?.replace(/^www\./, '').trim() || location.hostname.replace(/^www\./, '').trim();
  return hostname || doc.title.trim() || 'Unknown site';
}
