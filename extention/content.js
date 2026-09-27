const SITE_STATE_KEY = 'adforgetSiteState';

let currentState = { iframes: false, bigImages: false, noTextBlocks: false };
let observer = null;

function getHostname() {
  return window.location.hostname;
}

async function loadState() {
  const data = await browser.storage.local.get(SITE_STATE_KEY);
  const all = data[SITE_STATE_KEY] || {};
  currentState = all[getHostname()] || { iframes: false, bigImages: false };
}

function isBigImage(img) {
  const nw = img.naturalWidth || 0;
  const nh = img.naturalHeight || 0;
  if (nw > 100 && nh > 100) return true;

  const rw = img.width || 0;
  const rh = img.height || 0;
  return rw > 100 && rh > 100;
}

function checkImage(img) {
  if (!img.complete) {
    img.addEventListener('load', () => {
      if (currentState.bigImages && isBigImage(img)) {
        removeWithEmptyParents(img);
      }
    }, { once: true });
    return;
  }

  if (isBigImage(img)) {
    removeWithEmptyParents(img);
  }
}

const STOP_TAGS = new Set(['BODY', 'HTML', 'HEAD']);

const NON_EMPTY_TAGS = new Set([
  'IMG', 'IFRAME', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG',
  'OBJECT', 'EMBED', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON',
  'BR', 'HR', 'WBR'
]);

const IGNORED_CONTENT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT']);

function isEffectivelyEmpty(el) {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.COMMENT_NODE) {
      continue;
    }

    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent.trim().length > 0) return false;
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    const tag = child.tagName;
    if (NON_EMPTY_TAGS.has(tag)) return false;
    if (IGNORED_CONTENT_TAGS.has(tag)) continue;

    if (!isEffectivelyEmpty(child)) return false;
  }
  return true;
}

function removeWithEmptyParents(node) {
  if (!node || STOP_TAGS.has(node.tagName)) return;
  let current = node;
  current.remove();
  while (
    current.parentElement &&
    !STOP_TAGS.has(current.parentElement.tagName) &&
    isEffectivelyEmpty(current.parentElement)
  ) {
    current = current.parentElement;
    current.remove();
  }
}

function removeIframes() {
  document.querySelectorAll('iframe').forEach((el) => removeWithEmptyParents(el));
}

function hasImageBackground(el) {
  const bg = window.getComputedStyle(el).backgroundImage;
  return bg && bg !== 'none' && bg.startsWith('url(');
}

function isBigElement(el) {
  const rect = el.getBoundingClientRect();
  return rect.width > 100 && rect.height > 100;
}

function removeBackgroundImages(root = document) {
  const elements = root.querySelectorAll('*');
  for (const el of elements) {
    if (STOP_TAGS.has(el.tagName)) continue;
    if (hasImageBackground(el) && isBigElement(el)) {
      removeWithEmptyParents(el);
    }
  }
}

function removeBigImages() {
  document.querySelectorAll('img').forEach(checkImage);
  removeBackgroundImages();
}

const PROTECTED_TAGS = new Set([
  'BODY', 'HTML', 'HEAD', 'MAIN', 'ARTICLE', 'SECTION', 'NAV',
  'HEADER', 'FOOTER', 'ASIDE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'P', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'CAPTION',
  'FIGURE', 'FIGCAPTION', 'PRE', 'CODE', 'SAMP', 'KBD', 'VAR',
  'BLOCKQUOTE', 'Q', 'CITE'
]);

const NO_TEXT_MIN_SIZE = 50;

function hasVisibleText(el) {
  const walker = document.createTreeWalker(
    el,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        let parent = node.parentElement;
        while (parent) {
          if (IGNORED_CONTENT_TAGS.has(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          parent = parent.parentElement;
        }
        return node.textContent.trim().length > 0
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );
  return walker.nextNode() !== null;
}

function isNoTextBlock(el) {
  if (PROTECTED_TAGS.has(el.tagName)) return false;
  if (el.offsetWidth < NO_TEXT_MIN_SIZE || el.offsetHeight < NO_TEXT_MIN_SIZE) return false;
  return !hasVisibleText(el);
}

function removeNoTextBlocks(root = document) {
  const elements = root.querySelectorAll('*');
  for (const el of elements) {
    if (PROTECTED_TAGS.has(el.tagName)) continue;
    if (isNoTextBlock(el)) {
      removeWithEmptyParents(el);
    }
  }
}

function processNode(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  if (currentState.iframes && node.tagName === 'IFRAME') {
    removeWithEmptyParents(node);
    return;
  }

  if (currentState.bigImages && node.tagName === 'IMG') {
    checkImage(node);
    return;
  }

  if (currentState.bigImages && !STOP_TAGS.has(node.tagName) && hasImageBackground(node) && isBigElement(node)) {
    removeWithEmptyParents(node);
    return;
  }

  if (currentState.noTextBlocks && !PROTECTED_TAGS.has(node.tagName) && isNoTextBlock(node)) {
    removeWithEmptyParents(node);
    return;
  }

  if (!node.querySelectorAll) return;

  if (currentState.iframes) {
    node.querySelectorAll('iframe').forEach((el) => removeWithEmptyParents(el));
  }
  if (currentState.bigImages) {
    node.querySelectorAll('img').forEach(checkImage);
    removeBackgroundImages(node);
  }
  if (currentState.noTextBlocks) {
    removeNoTextBlocks(node);
  }
}

function processMutations(mutations) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      processNode(node);
    }
  }
}

function startObserver() {
  if (observer) return;
  observer = new MutationObserver(processMutations);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function stopObserver() {
  if (!observer) return;
  observer.disconnect();
  observer = null;
}

async function apply() {
  await loadState();

  if (currentState.iframes || currentState.bigImages || currentState.noTextBlocks) {
    startObserver();
  } else {
    stopObserver();
  }

  if (currentState.iframes) removeIframes();
  if (currentState.bigImages) removeBigImages();
  if (currentState.noTextBlocks) removeNoTextBlocks();
}

browser.runtime.onMessage.addListener((request) => {
  if (request.action === 'applySiteState') {
    apply();
  }
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SITE_STATE_KEY]) {
    apply();
  }
});

apply();
