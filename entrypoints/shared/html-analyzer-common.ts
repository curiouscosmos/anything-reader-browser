// @ts-nocheck
/**
 */

class HTMLAnalyzerCommon {
  constructor() {
    this.DEBUG_MODE = false;
    this.MIN_CONTENT_LENGTH = 200; // Minimum extracted content before fallback to textContent
  }

  getSiteSpecificMainContent(hostname, body) {
    if (hostname.includes('musicbusinessworldwide.com')) {
      const mbwSelectors = [
        '.mb-article__body',
        '.post-content',
        '.entry-content',
        '.article-content',
        '.content',
        'article .content',
        '.mb-article',
        'article',
        '.entry-header',
        '.post-header'
      ];

      for (const selector of mbwSelectors) {
        const element = body.querySelector(selector);
        if (element && element.textContent?.trim().length > 50) {
          return element;
        }
      }
    }

    if (hostname.includes('notion.so') || hostname.includes('notion.site')) {
      this.setupNotionAutoRefresh();

      const notionPageContent = body.querySelector('.notion-page-content');
      if (notionPageContent) {
        return notionPageContent;
      }

      const notionSelectors = [
        '.notion-page-content',
        '.notion-page-body',
        '.notion-page',
        '.notion-content',
        '[data-block-id]',
        '.notion-text-block',
        '.notion-page-content-inner'
      ];

      for (const selector of notionSelectors) {
        const element = body.querySelector(selector);
        if (element && element.textContent?.trim().length > 20) {
          return element;
        }
      }
    }

    return null;
  }

  setupNotionAutoRefresh() {
    if (this.notionAutoRefreshSetup) {
      return;
    }

    this.notionAutoRefreshSetup = true;

    setTimeout(() => {
      this.triggerNotionRefresh();
    }, 2000);
  }

  triggerNotionRefresh() {
    if (window.ttsManager && typeof window.ttsManager.requestRefresh === 'function') {
      window.ttsManager.requestRefresh();
    }
  }

  extractMainContent() {
    const body = document.body;
    if (!body) return null;

    const hostname = window.location.hostname.replace('www.', '');

    const siteSpecificContent = this.getSiteSpecificMainContent(hostname, body);
    if (siteSpecificContent) {
      return siteSpecificContent;
    }

    // Site-specific selectors for popular websites
    const siteSelectors = {
      // Wikipedia
      'wikipedia.org': '#mw-content-text .mw-parser-output',
      'en.wikipedia.org': '#mw-content-text .mw-parser-output',
      // Medium
      'medium.com': 'article',
      // News sites
      'nytimes.com': 'article[data-testid="article-body"]',
      'theguardian.com': '#maincontent',
      'bbc.com': 'article',
      'bbc.co.uk': 'article',
      'cnn.com': '.article__content',
      'reuters.com': '[data-testid="article-body"]',
      'washingtonpost.com': '.article-body',
      // Tech sites
      'techcrunch.com': '.article-content',
      'arstechnica.com': '.article-content',
      'theverge.com': '.duet--article--article-body-component',
      // Blogs
      'substack.com': '.body',
      'dev.to': '#article-body',
      'hashnode.com': '.prose',
      // Reddit
      'reddit.com': '[data-test-id="post-content"]',
      // Documentation
      'docs.google.com': '.kix-page',
      'github.com': '.markdown-body',
      // French sites
      'laviedesidees.fr': '#contenu_article',
    };

    let contentElement = null;

    // Try site-specific selector
    for (const [site, selector] of Object.entries(siteSelectors)) {
      if (hostname.includes(site.replace('www.', ''))) {
        contentElement = body.querySelector(selector);
        if (contentElement) {
          return contentElement;
        }
      }
    }

    // Fallback to generic selectors (in priority order)
    const genericSelectors = [
      // High-level containers that include headers
      '#content-area',
      '.content-area',
      '#contents',
      // Semantic HTML5 elements
      'article',
      'main',
      '[role="main"]',
      // Common content classes/IDs
      '#content',
      '#main-content',
      '.content',
      '.main-content',
      '[class*="main-container"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.post-body',
      '.article-body',
      // WordPress
      '.hentry',
      '.post',
      // Generic containers (less specific)
      '#primary',
      '.primary',
    ];

    for (const selector of genericSelectors) {
      contentElement = body.querySelector(selector);
      if (contentElement && contentElement.textContent.trim().length > this.MIN_CONTENT_LENGTH) {
        return contentElement;
      }
      contentElement = null;
    }

    // Last resort: use body
    return body;
  }

  findContentElements(container) {
    if (!container) return [];

    const contentElements = [];
    const processedElements = new Set();
    const textParts = [];

    const unwantedSelectors = [
      // Scripts and styles
      'script', 'style', 'noscript', 'iframe',
      // Navigation and structure
      'nav', 'footer', 'aside',
      '[role="navigation"]', '[role="complementary"]', '[role="banner"]', '[role="contentinfo"]',
      // Hidden elements
      '[aria-hidden="true"]', '[hidden]', '.hidden', '.visually-hidden', '.sr-only',
      // Ads and promotions
      '.ad', '.ads', '.advertisement', '.advert', '[class*="advert"]',
      '.sponsored', '.promo', '.promotion',
      // Social and sharing
      '.social', '.share', '.sharing', '[class*="share"]',
      '.follow', '.subscribe',
      // Comments
      '#comments', '.comments', '.comment-section', '[class*="comment"]',
      // Related content
      '.related', '.recommended', '.more-stories', '.read-more', '.see-also',
      '[class*="related"]', '[class*="recommended"]',
      // Sidebars and widgets
      '.sidebar', '.widget', '.widgets',
      '#sidebar', '[class*="sidebar"]',
      // Menus
      '.menu', '.dropdown', '[class*="menu"]',
      // Forms
      'form', '.search', '[class*="search"]',
      // Wikipedia-specific
      '.mw-editsection', '.reference', '.reflist', '.references',
      '.navbox', '.infobox', '.sidebar', '.toc', '#toc',
      '.hatnote', '.mbox', '.ambox', '.dmbox', '.tmbox',
      '.portal', '.catlinks', '#catlinks',
      '.mw-headline-anchor',
      // Tables of contents
      '.table-of-contents', '.toc',
      // Footers and metadata
      '.footer', '.meta', '.metadata', '.byline', '.author-info',
      '.tags', '.categories', '.breadcrumb',
      // Popups and modals
      '.modal', '.popup', '.overlay', '.tooltip',
      // Cookie notices
      '.cookie', '[class*="cookie"]', '[class*="consent"]',
      // Icons
      '[class*="icon"]',
      // Download elements
      '[class*="download"]',
    ];

    const unwantedElements = new Set();
    unwantedSelectors.forEach(selector => {
      container.querySelectorAll(selector).forEach(el => unwantedElements.add(el));
    });

    // Remove specific unwanted elements from headers
    container.querySelectorAll('header button, header .breadcrumb, header nav, header [class*="menu"]').forEach(el => {
      unwantedElements.add(el);
    });

    // Remove elements that are likely navigation based on link density
    container.querySelectorAll('div, section, ul').forEach(div => {
      const links = div.querySelectorAll('a');
      const text = div.textContent || '';
      const linkText = Array.from(links).map(a => a.textContent).join('');

      // If more than 50% of text is links, it's probably navigation
      if (text.length > 0 && linkText.length / text.length > 0.5 && links.length > 5) {
        unwantedElements.add(div);
      }
    });

    // Extract text from remaining paragraphs and headings
    const body = document.body;
    const bodyHeadings = body ? Array.from(body.querySelectorAll('h1, h2, h3, h4, h5, h6')) : [];
    const containerElements = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, span, div');

    const allContainerElements = Array.from(containerElements);
    const elementsSet = new Set(allContainerElements);

    bodyHeadings.forEach(heading => {
      if (!container.contains(heading)) {
        elementsSet.add(heading);
      }
    });

    const elements = Array.from(elementsSet);

    const normalizeText = (s) => {
      return (s || '')
        .replace(/\u00A0/g, ' ')   // &nbsp;
        .replace(/\u200B/g, '')    // zero-width space
        .replace(/\s+/g, ' ')
        .trim();
    };
    const seenExact = new Set();
    const seenPrefixSuffix = new Map();

    const PREFIX_N = 100;
    const SUFFIX_N = 50;
    const MIN_LEN_FOR_PREFIX = 140;
    const MAX_LEN_RATIO = 1.25;

    elements.forEach(el => {
      const tagName = el.tagName.toLowerCase();
      const isHeading = tagName.match(/^h[1-6]$/);

      if (isHeading && processedElements.has(el)) {
        return;
      }

      if (isHeading) {
        const headingText = this.extractAllTextFromElement(el);
        if (headingText && headingText.trim().length > 0) {
          if (!processedElements.has(el)) {
            contentElements.push(el);
            processedElements.add(el);
            textParts.push(headingText);
          }
        }
        return;
      }

      if (unwantedElements.has(el)) {
        return;
      }

      let parent = el.parentElement;
      let isInUnwanted = false;
      while (parent && parent !== container) {
        if (unwantedElements.has(parent)) {
          isInUnwanted = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (isInUnwanted) {
        return;
      }

      // Skip <p> elements that are children of <li> to avoid duplication
      if (el.tagName === 'P' && el.parentElement && el.parentElement.tagName === 'LI') {
        return;
      }

      if (tagName === 'div') {
        const hasBlockChildren = el.querySelector('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div, article, section');

        if (hasBlockChildren) {
          return;
        }

      }

      if (tagName === 'span' || tagName === 'a' || tagName === 'strong' || tagName === 'em' || tagName === 'b' || tagName === 'i' || tagName === 'code' || tagName === 'small' || tagName === 'sub' || tagName === 'sup') {
        let parent = el.parentElement;
        while (parent && parent !== container) {
          const parentTag = parent.tagName.toLowerCase();
          if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'article', 'section', 'td', 'th'].includes(parentTag)) {
            const parentText = normalizeText(parent.textContent || '');
            const currentText = normalizeText(el.textContent || '');
            if (currentText.length >= 5 && parentText.length > currentText.length && parentText.includes(currentText)) {
              return;
            }
            break;
          }
          parent = parent.parentElement;
        }
      }

      const rawText = el.textContent || '';
      if (rawText.includes('<img') || rawText.includes('<img>')) {
        return;
      }

      if (rawText.includes('@context') || rawText.includes('@type') ||
          rawText.includes('schema.org') || rawText.includes('BreadcrumbList') ||
          rawText.includes('itemListElement')) {
        return;
      }

      const isJavaScriptCode = this.detectJavaScriptCode(rawText);
      if (isJavaScriptCode) {
        return;
      }

      const text = normalizeText(rawText);
      if (text.length > 0) {
        let isParentChildDuplicate = false;

        for (const existingEl of contentElements) {
          if (el !== existingEl && existingEl.contains(el)) {
            const parentText = normalizeText(existingEl.textContent || '');
            const normalizedCurrentText = text;
            if (parentText.length >= normalizedCurrentText.length &&
                parentText.includes(normalizedCurrentText) &&
                normalizedCurrentText.length >= 20) {
              isParentChildDuplicate = true;
              break;
            }
          }
        }

        if (!isParentChildDuplicate) {
          for (let i = contentElements.length - 1; i >= 0; i--) {
            const existingEl = contentElements[i];
            if (el !== existingEl && el.contains(existingEl)) {
              const childText = normalizeText(existingEl.textContent || '');
              const normalizedCurrentText = text;
              if (normalizedCurrentText.length >= childText.length &&
                  normalizedCurrentText.includes(childText) &&
                  childText.length >= 20) {
                contentElements.splice(i, 1);
                processedElements.delete(existingEl);
                const childTextIndex = textParts.findIndex(t => normalizeText(t) === childText);
                if (childTextIndex > -1) {
                  textParts.splice(childTextIndex, 1);
                }
                seenExact.delete(childText);
                break;
              }
            }
          }
        }

        if (isParentChildDuplicate) {
          return;
        }

        if (seenExact.has(text)) {
          return;
        }

        let isDuplicate = false;
        if (text.length >= MIN_LEN_FOR_PREFIX) {
          const prefix = text.slice(0, PREFIX_N);
          const suffix = text.slice(-SUFFIX_N);
          const entries = seenPrefixSuffix.get(prefix);
          if (entries && entries.length > 0) {
            for (const entry of entries) {
              if (entry.suffix === suffix) {
                const minLen = Math.min(entry.len, text.length);
                const maxLen = Math.max(entry.len, text.length);
                const ratio = maxLen / minLen;
                if (ratio <= MAX_LEN_RATIO) {
                  isDuplicate = true;
                  break;
                }
              }
            }
          }

          if (!isDuplicate) {
            const list = seenPrefixSuffix.get(prefix) || [];
            list.push({ len: text.length, suffix });
            seenPrefixSuffix.set(prefix, list);
          }
        }

        if (isDuplicate) {
          return;
        }

        if (this.isVisibleElement(el) && !this.isExcludedElement(el)) {
          contentElements.push(el);
          processedElements.add(el);
          textParts.push(text);
          seenExact.add(text);
        }
      }
    });

    contentElements.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position && Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      } else if (position && Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });

    return contentElements;
  }

  shouldExcludeElement(element) {
    const isExcluded = this.isExcludedElement(element);
    const isVisible = this.isVisibleElement(element);
    return isExcluded || !isVisible;
  }

  isVisibleElement(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return !(rect.width === 0 && rect.height === 0);
  }

  getDirectTextContent(element) {
    let text = '';

    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tagName = child.tagName.toLowerCase();
        const inlineTags = ['span', 'strong', 'em', 'b', 'i', 'a', 'code', 'small', 'sub', 'sup'];
        if (inlineTags.includes(tagName)) {
          text += child.textContent;
        }
      }
    }

    return text.trim();
  }

  extractTextFromElement(element) {
    return this.extractAllTextFromElement(element);
  }

  detectJavaScriptCode(text) {
    if (!text || text.length < 10) return false;

    const trimmed = text.trim();

    if (/\$\(['"]/.test(trimmed) || /\.(css|each|attr|find|html|text|append|prepend|remove|addClass|removeClass|hasClass)\(/.test(trimmed)) {
      return true;
    }

    if (/\w+\([^)]*\);/.test(trimmed)) {
      if (/\([^)]*['"{}[\]]/.test(trimmed) || /\([^)]*\d+/.test(trimmed)) {
        return true;
      }
    }

    if (/^\w+\([^)]*\)/.test(trimmed)) {
      if (/\([^)]*['"].*['"].*['"]/.test(trimmed) || /\([^)]*\d+.*['"]/.test(trimmed)) {
        return true;
      }
    }

    if (/^\s*(var|let|const)\s+\w+\s*=/.test(trimmed) || /\b(var|let|const)\s+\w+\s*=/.test(trimmed)) {
      return true;
    }

    if (/[{}]/.test(trimmed) && (/['"]\s*[:=]\s*['"]/.test(trimmed) || /^\s*\{[^}]*[:=]/.test(trimmed))) {
      return true;
    }

    if (/;/.test(trimmed) && /[{}[\]]/.test(trimmed)) {
      if (/\(['"]/, /\.\w+\(/, /indexOf\(/, /\$\(/.test(trimmed)) {
        return true;
      }
    }

    if (/\b(if|for|while|function|return)\s*\(/.test(trimmed) || /\bindexOf\(/.test(trimmed)) {
      return true;
    }

    if (/\w+\([^)]*\)\s*\.\s*\w+\(/.test(trimmed) || /\.\w+\([^)]*\{/.test(trimmed)) {
      return true;
    }

    if (/^\{[^}]*[:=]/.test(trimmed) || /\{'[^']+'\s*:/.test(trimmed)) {
      return true;
    }

    return /\w+\s*=\s*\w+\(/.test(trimmed) || /\w+\s*=\s*\$\(/.test(trimmed);
  }

  generateElementSelector(element) {
    let selector = element.tagName.toLowerCase();

    if (element.id) {
      selector += `#${element.id}`;
    } else if (element.className) {
      const classes = element.className.trim().split(/\s+/).slice(0, 2);
      selector += '.' + classes.join('.');
    }

    return selector;
  }

  isSiteSpecificExcludedElement(hostname, element, className, elementId) {
    const textContent = element.textContent?.trim() || '';

    if (hostname.includes('notion.so') || hostname.includes('notion.site')) {
      const notionExcludedClasses = [
        'notion-sidebar', 'notion-header', 'notion-footer', 'notion-navigation',
        'notion-menu', 'notion-search', 'notion-breadcrumb', 'notion-toolbar',
        'notion-status-bar', 'notion-comments', 'notion-share', 'notion-export',
        'notion-settings', 'notion-help', 'notion-feedback', 'notion-upgrade',
        'notion-template', 'notion-gallery', 'notion-calendar', 'notion-database',
        'notion-table', 'notion-kanban', 'notion-timeline', 'notion-board'
      ];

      if (notionExcludedClasses.some(cls => className.includes(cls) || elementId.includes(cls))) {
        return true;
      }

      const notionButtonPatterns = [
        /^(add|create|new|edit|delete|share|export|import|duplicate|move|copy)$/i,
        /^(undo|redo|save|cancel|close|back|forward|refresh|reload)$/i,
        /^(search|filter|sort|view|hide|show|expand|collapse)$/i,
        /^(comment|reply|like|bookmark|favorite|star|pin)$/i,
        /^(template|gallery|list|board|calendar|timeline|kanban)$/i,
        /^(upgrade|premium|pro|enterprise|team|workspace)$/i,
        /^(help|support|feedback|bug|feature|request)$/i
      ];

      if (notionButtonPatterns.some(pattern => pattern.test(textContent))) {
        return true;
      }
    }

    if (hostname.includes('musicbusinessworldwide.com')) {
      const mbwExcludedClasses = [
        'mb-header',
        'mb-footer',
        'mb-sidebar',
        'mb-newsletter',
        'mb-subscribe',
        'mb-social',
        'mb-advertisement',
        'mb-related',
        'mb-author',
        'mb-tags',
        'mb-navigation',
        'subscription',
        'paywall',
        'premium',
        'login-form',
        'signup-form'
      ];

      if (mbwExcludedClasses.some(cls => className.includes(cls) || elementId.includes(cls))) {
        return true;
      }

      const mbwButtonPatterns = [
        /^(subscribe|sign up|login|register)/i,
        /^(premium|exclusive|members only)/i,
        /^(read more|continue reading|full story)/i,
        /^(share|tweet|facebook|linkedin)/i,
        /^(newsletter|updates|notifications)/i
      ];

      if (mbwButtonPatterns.some(pattern => pattern.test(textContent))) {
        return true;
      }
    }

    return false;
  }

  isSiteSpecificMainContent(hostname, element, text) {
    const className = (element.className || '').toLowerCase();
    const elementId = (element.id || '').toLowerCase();
    const textLength = text.length;
    const tagName = element.tagName.toLowerCase();

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      if (textLength >= 2) {
        return true;
      }
    }

    if (hostname.includes('notion.so') || hostname.includes('notion.site')) {
      if (textLength >= 2 && (
        className.includes('notion-page-title') ||
        className.includes('notion-text-block') ||
        className.includes('notion-bulleted-list-block') ||
        className.includes('notion-numbered-list-block') ||
        className.includes('notion-toggle-block') ||
        className.includes('notion-code-block') ||
        className.includes('notion-quote-block') ||
        elementId.includes('notion')
      )) {
        return true;
      }

      const notionContentClasses = [
        'notion-page-content', 'notion-page-body', 'notion-content',
        'notion-text-block', 'notion-bulleted-list-block', 'notion-numbered-list-block',
        'notion-toggle-block', 'notion-code-block', 'notion-quote-block'
      ];

      if (notionContentClasses.some(cls => className.includes(cls))) {
        return true;
      }
    }

    if (hostname.includes('musicbusinessworldwide.com')) {
      if (textLength >= 10 && (
        className.includes('title') ||
        className.includes('headline') ||
        className.includes('header') ||
        elementId.includes('title')
      )) {
        return true;
      }

      if (textLength >= 40) {
        const musicBizKeywords = [
          'record label', 'streaming', 'royalties', 'publishing', 'artist',
          'music industry', 'revenue', 'catalog', 'copyright', 'licensing',
          'spotify', 'apple music', 'universal', 'warner', 'sony'
        ];

        const hasMusicBiz = musicBizKeywords.some(keyword =>
          text.toLowerCase().includes(keyword)
        );

        if (hasMusicBiz) {
          return true;
        }
      }

      const mbwContentClasses = [
        'mb-article__body', 'post-content', 'entry-content',
        'article-content', 'content', 'mb-article'
      ];

      if (mbwContentClasses.some(cls => className.includes(cls))) {
        return true;
      }
    }

    return null;
  }

  isExcludedElement(element) {
    const hostname = window.location.hostname.toLowerCase();
    const className = (element.className || '').toLowerCase();
    const elementId = (element.id || '').toLowerCase();

    if (this.isSiteSpecificExcludedElement(hostname, element, className, elementId)) {
      return true;
    }

    if (className.includes('paywall')) {
      const tagName = element.tagName.toLowerCase();
      const textContent = element.textContent?.trim() || '';

      const isContentTag = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'article', 'main', 'section', 'div'].includes(tagName);

      const hasSubstantialText = textContent.length > 100;

      const isNotSubscriptionText = !/^(subscribe|sign up|login|register|premium|exclusive|members only)/i.test(textContent);

      if (isContentTag && hasSubstantialText && isNotSubscriptionText) {
        return false;
      }
    }

    const excludedTags = [
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'BUTTON', 'INPUT',
      'SELECT', 'TEXTAREA', 'FORM', 'LABEL', 'FIELDSET', 'LEGEND'
    ];

    if (excludedTags.includes(element.tagName)) {
      return true;
    }

    const excludedRoles = [
      'button', 'menu', 'menubar', 'menuitem', 'toolbar', 'navigation',
      'banner', 'contentinfo', 'form', 'search', 'dialog', 'alertdialog'
    ];

    const role = element.getAttribute('role');
    if (role && excludedRoles.includes(role.toLowerCase())) {
      return true;
    }

    const excludedKeywords = [
      'ad-', '-ad', 'advertisement', 'ad-banner', 'ad-container', 'sponsored', 'sponsored-content', 'promo', 'promotion',
      'navbar', 'header-nav', 'footer-nav', 'sidebar-nav', 'navigation', 'nav', 'menu', 'sidebar', 'footer', 'header',
      'button-container', 'btn-container', 'btn',
      'screen-reader-only', 'sr-only', 'visually-hidden', 'hidden',
      'popup-overlay', 'modal-backdrop', 'overlay', 'modal', 'popup', 'tooltip',
      'social-', '-social', 'share-', '-share', 'sharing-', '-sharing', 'follow', 'subscribe',
      'comments', 'comment-section', 'comment',
      'related', 'recommended', 'more-stories', 'read-more', 'see-also',
      'widget', 'widgets',
      'search',
      'meta', 'metadata', 'byline', 'author-info', 'tags', 'categories', 'breadcrumb',
      'speechify', 'speechify-ignore',
      'poll', 'newsletter', 'feedback', 'cookie', 'consent'
    ];

    if (excludedKeywords.some(keyword => className.includes(keyword) || elementId.includes(keyword))) {
      return true;
    }

    let parent = element.parentElement;
    for (let i = 0; i < 2 && parent; i++) {
      const parentClassName = (parent.className || '').toLowerCase();
      const parentId = (parent.id || '').toLowerCase();

      if (parentClassName.includes('paywall')) {
        const parentTagName = parent.tagName.toLowerCase();
        const parentTextContent = parent.textContent?.trim() || '';
        const isParentContentTag = ['article', 'main', 'section', 'div'].includes(parentTagName);
        const hasParentSubstantialText = parentTextContent.length > 200;
        const isParentNotSubscriptionText = !/^(subscribe|sign up|login|register|premium|exclusive|members only)/i.test(parentTextContent);

        if (isParentContentTag && hasParentSubstantialText && isParentNotSubscriptionText) {
          parent = parent.parentElement;
          continue;
        }
      }

      if (excludedKeywords.some(keyword => parentClassName.includes(keyword) || parentId.includes(keyword))) {
        return true;
      }
      parent = parent.parentElement;
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && (ariaLabel.includes('button') || ariaLabel.includes('menu') ||
                     ariaLabel.includes('navigation') || ariaLabel.includes('link'))) {
      return true;
    }

    const tagName = element.tagName.toLowerCase();
    if (['div', 'section', 'ul'].includes(tagName)) {
      const links = element.querySelectorAll('a');
      const text = element.textContent || '';
      const linkText = Array.from(links).map(a => a.textContent).join('');

      if (text.length > 0 && linkText.length / text.length > 0.5 && links.length > 5) {
        return true;
      }
    }

    let currentElement = element.parentElement;
    for (let depth = 0; depth < 2 && currentElement; depth++) {
      const parentRole = currentElement.getAttribute('role');
      if (parentRole && excludedRoles.includes(parentRole.toLowerCase())) {
        return true;
      }
      currentElement = currentElement.parentElement;
    }

    return false;
  }

  extractAllTextFromElement(element) {
    if (!element) return '';

    const tagName = element.tagName.toLowerCase();
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'td', 'th', 'span'].includes(tagName)) {
      return element.textContent?.trim() || '';
    }

    return element.textContent?.trim() || '';
  }

  isMainContentText(element, text) {
    const hostname = window.location.hostname.toLowerCase();

    const siteSpecificResult = this.isSiteSpecificMainContent(hostname, element, text);
    if (siteSpecificResult !== null) {
      return siteSpecificResult;
    }

    if (this.isExcludedElement(element)) {
      return false;
    }

    const textLength = text.length;

    return textLength >= 1;
  }

  isImportantContent(element, text) {
    const tagName = element.tagName.toLowerCase();
    const className = (element.className || '').toLowerCase();
    const elementId = (element.id || '').toLowerCase();

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      return true;
    }

    if (tagName === 'p') {
      return true;
    }

    const contentClasses = [
      'content', 'text', 'body', 'main', 'article', 'post', 'story',
      'paragraph', 'section', 'block', 'entry', 'description'
    ];

    if (contentClasses.some(cls => className.includes(cls) || elementId.includes(cls))) {
      return true;
    }

    return text.length >= 50;
  }

  extractVisibleText() {
    const selectedElement = window.ttsSelector?.currentElement;
    if (!selectedElement) return '';

    const visibleTexts = [];

    const walker = document.createTreeWalker(
      selectedElement,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text.length > 0) {
        const parentElement = node.parentElement;
        if (parentElement && this.isElementVisible(parentElement)) {
          visibleTexts.push(text);
        }
      }
    }

    return visibleTexts.join(' ');
  }

  isElementVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }

    return true;
  }
}

window.htmlAnalyzerCommon = new HTMLAnalyzerCommon();

window.htmlAnalyzerSites = window.htmlAnalyzerCommon;

