const SERVER_URL = 'http://localhost:3000';

// Map<tabId, Map<domain, Set<category>>>
const tabData = new Map();
const blockedDomains = new Set();

const CATEGORY_MAP = {
  main_frame: 'document',
  sub_frame: 'other',
  stylesheet: 'stylesheet',
  script: 'script',
  image: 'image',
  object: 'image',
  object_subrequest: 'image',
  xmlhttprequest: 'xhr',
  media: 'media',
  websocket: 'xhr',
  other: 'other',
  beacon: 'xhr'
};

function getCategory(type) {
  return CATEGORY_MAP[type] || 'other';
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function recordRequest(tabId, url, resourceType) {
  const domain = extractDomain(url);
  if (!domain) return;

  // Skip localhost and the adforget server itself
  if (domain === 'localhost' || domain.startsWith('127.')) return;

  if (!tabData.has(tabId)) {
    tabData.set(tabId, new Map());
  }
  const domains = tabData.get(tabId);
  if (!domains.has(domain)) {
    domains.set(domain, new Set());
  }
  domains.get(domain).add(getCategory(resourceType));
}

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId >= 0) {
      recordRequest(details.tabId, details.url, details.type);
    }
  },
  { urls: ['<all_urls>'] },
  []
);

browser.tabs.onRemoved.addListener((tabId) => {
  tabData.delete(tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabData.set(tabId, new Map());
  }
});

async function fetchBlockedList() {
  try {
    const res = await fetch(`${SERVER_URL}/list`, { cache: 'no-store' });
    const data = await res.json();
    blockedDomains.clear();
    for (const d of data.domains) {
      blockedDomains.add(d);
    }
  } catch (err) {
    console.error('[AdForget] Failed to fetch blocked list:', err);
  }
}

async function blockDomain(domain) {
  try {
    const res = await fetch(`${SERVER_URL}/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
    const data = await res.json();
    if (data.blocked) blockedDomains.add(data.domain);
    return data;
  } catch (err) {
    console.error('[AdForget] Failed to block domain:', err);
    throw err;
  }
}

async function unblockDomain(domain) {
  try {
    const res = await fetch(`${SERVER_URL}/unblock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain })
    });
    const data = await res.json();
    if (!data.blocked) blockedDomains.delete(data.domain);
    return data;
  } catch (err) {
    console.error('[AdForget] Failed to unblock domain:', err);
    throw err;
  }
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getDomains') {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tabId = tabs[0]?.id;
      const domains = tabData.get(tabId) || new Map();
      const result = [];
      for (const [domain, categories] of domains) {
        result.push({ domain, categories: Array.from(categories) });
      }
      sendResponse({ domains: result, blocked: Array.from(blockedDomains) });
    });
    return true;
  }

  if (request.action === 'refreshBlocked') {
    fetchBlockedList().then(() => {
      sendResponse({ ok: true, blocked: Array.from(blockedDomains) });
    });
    return true;
  }

  if (request.action === 'block') {
    blockDomain(request.domain).then((data) => sendResponse(data));
    return true;
  }

  if (request.action === 'unblock') {
    unblockDomain(request.domain).then((data) => sendResponse(data));
    return true;
  }

  return false;
});

// Refresh blocked list periodically
fetchBlockedList();
setInterval(fetchBlockedList, 30000);
