const SERVER_URL = 'http://localhost:3000';

let currentDomains = [];
let blockedDomains = new Set();
let activeTypeFilter = 'all';
let activeStateFilter = 'all';
let searchQuery = '';

const domainListEl = document.getElementById('domain-list');
const statusEl = document.getElementById('server-status');
const searchInput = document.getElementById('search-input');
const typeFilterButtons = document.querySelectorAll('#type-filters .filter');
const stateFilterButtons = document.querySelectorAll('#state-filters .filter');

const CATEGORY_ICONS = {
  document: '📄',
  script: '⚡',
  stylesheet: '🎨',
  image: '🖼️',
  media: '🎬',
  xhr: '📡',
  other: '📦'
};

typeFilterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    typeFilterButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeTypeFilter = btn.dataset.filter;
    render();
  });
});

stateFilterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    stateFilterButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeStateFilter = btn.dataset.state;
    render();
  });
});

searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim().toLowerCase();
  render();
});

async function checkServer() {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { cache: 'no-store' });
    if (res.ok) {
      statusEl.textContent = 'server online';
      statusEl.classList.add('online');
    } else {
      throw new Error('not ok');
    }
  } catch {
    statusEl.textContent = 'server offline';
    statusEl.classList.remove('online');
  }
}

async function loadData() {
  try {
    const [domainsRes, blockedRes] = await Promise.all([
      browser.runtime.sendMessage({ action: 'getDomains' }),
      browser.runtime.sendMessage({ action: 'refreshBlocked' })
    ]);

    currentDomains = domainsRes.domains || [];
    blockedDomains = new Set(blockedRes.blocked || []);
    render();
  } catch (err) {
    console.error('[AdForget] Failed to load data:', err);
    domainListEl.replaceChildren(createEmptyNode('Error loading data'));
  }
}

function getCategoryIcon(category) {
  return CATEGORY_ICONS[category] || '📦';
}

const SECOND_LEVEL_CCTLD = new Set([
  'co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'sch', 'me', 'nom', 'id',
  'plc', 'ltd', 'firm', 'info', 'biz', 'name', 'pro', 'web'
]);

function getRootDomain(domain) {
  const parts = domain.split('.');
  if (parts.length <= 2) return domain;

  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];

  // Handle common second-level ccTLDs like co.uk, com.au, etc.
  if (tld.length === 2 && SECOND_LEVEL_CCTLD.has(sld) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

function isDomainOrParentBlocked(domain) {
  if (blockedDomains.has(domain)) return true;
  const parts = domain.split('.');
  for (let i = 1; i < parts.length; i++) {
    const parent = parts.slice(i).join('.');
    if (blockedDomains.has(parent)) return true;
  }
  return false;
}

function createEmptyNode(text) {
  const el = document.createElement('div');
  el.className = 'empty';
  el.textContent = text;
  return el;
}

function render() {
  const filtered = currentDomains.filter((item) => {
    const matchesType = activeTypeFilter === 'all' || item.categories.includes(activeTypeFilter);
    const matchesSearch = !searchQuery || item.domain.toLowerCase().includes(searchQuery);
    const effectivelyBlocked = isDomainOrParentBlocked(item.domain);

    let matchesState = true;
    if (activeStateFilter === 'blocked') {
      matchesState = effectivelyBlocked;
    } else if (activeStateFilter === 'unblocked') {
      matchesState = !effectivelyBlocked;
    }

    return matchesType && matchesState && matchesSearch;
  });

  domainListEl.replaceChildren();

  if (!filtered.length) {
    domainListEl.appendChild(createEmptyNode('No domains found'));
    return;
  }

  for (const item of filtered) {
    const rootDomain = getRootDomain(item.domain);
    const exactBlocked = blockedDomains.has(item.domain);
    const rootBlocked = blockedDomains.has(rootDomain);
    const parentBlocked = !exactBlocked && !rootBlocked && isDomainOrParentBlocked(item.domain);

    const row = document.createElement('div');
    row.className = 'domain-row';

    const info = document.createElement('div');
    info.className = 'domain-info';

    const name = document.createElement('div');
    name.className = 'domain-name';
    name.title = item.domain;
    name.textContent = item.domain;

    const meta = document.createElement('div');
    meta.className = 'domain-meta';

    const categories = document.createElement('span');
    categories.className = 'domain-categories';
    for (const c of item.categories) {
      const span = document.createElement('span');
      span.className = 'category';
      span.title = c;
      span.textContent = getCategoryIcon(c);
      categories.appendChild(span);
    }

    const rootLabel = document.createElement('span');
    rootLabel.className = 'root-domain';
    rootLabel.textContent = `root: ${rootDomain}`;

    meta.appendChild(categories);
    meta.appendChild(rootLabel);

    info.appendChild(name);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'domain-actions';

    const exactBtn = document.createElement('button');
    exactBtn.className = 'btn';
    if (exactBlocked) exactBtn.classList.add('blocked');
    if (rootBlocked || parentBlocked) exactBtn.classList.add('disabled');
    exactBtn.textContent = exactBlocked ? 'Unblock' : 'Block';
    exactBtn.title = rootBlocked ? 'Blocked by root domain' : (parentBlocked ? 'Blocked by parent domain' : '');
    exactBtn.disabled = rootBlocked || parentBlocked;
    exactBtn.addEventListener('click', () => handleToggle(item.domain, exactBlocked));

    const rootBtn = document.createElement('button');
    rootBtn.className = 'btn btn-root';
    if (rootBlocked) rootBtn.classList.add('blocked');
    rootBtn.textContent = rootBlocked ? 'Unblock *' : 'Block *';
    rootBtn.addEventListener('click', () => handleToggle(rootDomain, rootBlocked));

    actions.appendChild(exactBtn);
    actions.appendChild(rootBtn);

    row.appendChild(info);
    row.appendChild(actions);
    domainListEl.appendChild(row);
  }
}

async function handleToggle(domain, isBlocked) {
  const action = isBlocked ? 'unblock' : 'block';
  try {
    const res = await browser.runtime.sendMessage({ action, domain });
    if (res.blocked) {
      blockedDomains.add(res.domain);
    } else {
      blockedDomains.delete(res.domain);
    }
    render();
  } catch (err) {
    console.error('[AdForget] Toggle failed:', err);
    alert(`Failed to ${action} ${domain}. Is the server running?`);
  }
}

async function init() {
  await checkServer();
  await loadData();
}

init();
