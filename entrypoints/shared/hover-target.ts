// @ts-nocheck

const ALLOWED_TAGS = new Set(['p', 'span']);
const BLOCKED_TAGS = new Set([
  'a',
  'button',
  'form',
  'input',
  'label',
  'select',
  'textarea',
  'svg',
  'path',
  'img',
  'canvas',
  'video',
  'audio',
  'iframe',
  'nav',
  'header',
  'footer',
  'aside',
]);
const BLOCKED_ROLES = new Set([
  'button',
  'menu',
  'menubar',
  'menuitem',
  'navigation',
  'toolbar',
  'tab',
  'link',
  'checkbox',
  'radio',
  'switch',
  'textbox',
  'search',
  'presentation',
]);
const BLOCKED_KEYWORDS = [
  'nav',
  'navbar',
  'navigation',
  'menu',
  'breadcrumb',
  'pager',
  'pagination',
  'page-number',
  'page-numbering',
  'next',
  'prev',
  'previous',
  'icon',
  'svg',
  'button',
  'btn',
  'share',
  'social',
  'follow',
  'subscribe',
  'footer',
  'header',
  'sidebar',
  'tooltip',
  'popup',
  'modal',
  'search',
  'settings',
];
const CONTENT_ANCESTOR_SELECTOR = [
  'article',
  'main',
  'section',
  'blockquote',
  'li',
  'dd',
  'dt',
  'td',
  'th',
  '[role="main"]',
  '[data-testid*="tweet"]',
  '[data-testid*="post"]',
  '[data-testid*="content"]',
].join(', ');

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasMeaningfulText(text) {
  return /[\p{L}\p{N}]/u.test(text);
}

function getOwnerWindow(element) {
  return element?.ownerDocument?.defaultView || globalThis.window;
}

function isElementVisible(element) {
  if (!element) return false;

  const ownerWindow = getOwnerWindow(element);
  const style = ownerWindow?.getComputedStyle?.(element);
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) {
    return false;
  }

  const rect = element.getBoundingClientRect?.();
  if (!rect) {
    return false;
  }

  return rect.width > 0 || rect.height > 0;
}

function hasBlockedAncestor(element) {
  const ownerBody = element?.ownerDocument?.body || null;
  let current = element;

  while (current && current.parentElement) {
    current = current.parentElement;
    if (!current || current === ownerBody) {
      break;
    }

    const tagName = current.tagName?.toLowerCase() || '';
    if (BLOCKED_TAGS.has(tagName)) {
      return true;
    }

    const role = current.getAttribute?.('role');
    if (role && BLOCKED_ROLES.has(role.toLowerCase())) {
      return true;
    }

    const ariaHidden = current.getAttribute?.('aria-hidden');
    if (ariaHidden === 'true' || current.hasAttribute?.('hidden')) {
      return true;
    }

    const className = String(current.className || '').toLowerCase();
    const elementId = String(current.id || '').toLowerCase();
    if (BLOCKED_KEYWORDS.some((keyword) => className.includes(keyword) || elementId.includes(keyword))) {
      return true;
    }
  }

  return false;
}

function isLeafTextSpan(element) {
  if (!element || element.tagName?.toLowerCase() !== 'span') {
    return false;
  }

  return element.childElementCount === 0;
}

function isInsideLikelyReadingRegion(element) {
  return Boolean(element.closest(CONTENT_ANCESTOR_SELECTOR));
}

export function isEligibleHoverTarget(element, takeText = '') {
  if (!element || !element.tagName) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tagName)) {
    return false;
  }

  if (!isElementVisible(element) || hasBlockedAncestor(element)) {
    return false;
  }

  const text = normalizeText(takeText || element.textContent || '');
  if (text.length < (tagName === 'p' ? 8 : 12)) {
    return false;
  }

  if (!hasMeaningfulText(text) || /^\d+$/.test(text)) {
    return false;
  }

  if (tagName === 'span') {
    if (!isLeafTextSpan(element)) {
      return false;
    }

    if (!isInsideLikelyReadingRegion(element)) {
      return false;
    }

    const directText = normalizeText(Array.from(element.childNodes || [])
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent)
      .join(''));

    if (directText.length < 4) {
      return false;
    }
  }

  return true;
}

function collectCandidateElements(root, takeText) {
  const candidates = [];
  const tagName = root.tagName?.toLowerCase();

  if (ALLOWED_TAGS.has(tagName) && isEligibleHoverTarget(root, takeText)) {
    candidates.push(root);
  }

  const ownerWindow = getOwnerWindow(root);
  const nodeFilter = ownerWindow?.NodeFilter;
  if (!nodeFilter) {
    return candidates;
  }

  const walker = root.ownerDocument.createTreeWalker(root, nodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      const nodeTagName = node.tagName?.toLowerCase();
      if (!ALLOWED_TAGS.has(nodeTagName)) {
        return nodeFilter.FILTER_SKIP;
      }

      return isEligibleHoverTarget(node, takeText) ? nodeFilter.FILTER_ACCEPT : nodeFilter.FILTER_SKIP;
    },
  });

  let current;
  while ((current = walker.nextNode())) {
    candidates.push(current);
  }

  return candidates;
}

export function findHoverTargetElement(sourceElement, takeText = '') {
  if (!sourceElement) {
    return null;
  }

  const candidates = collectCandidateElements(sourceElement, takeText);
  if (candidates.length === 0) {
    return null;
  }

  const paragraphCandidate = candidates.find((candidate) => candidate.tagName?.toLowerCase() === 'p');
  if (paragraphCandidate) {
    return paragraphCandidate;
  }

  return candidates.find((candidate) => candidate.tagName?.toLowerCase() === 'span') || null;
}
