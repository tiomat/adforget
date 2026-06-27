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
    const isBlocked = blockedDomains.has(item.domain);

    let matchesState = true;
    if (activeStateFilter === 'blocked') {
      matchesState = isBlocked;
    } else if (activeStateFilter === 'unblocked') {
      matchesState = !isBlocked;
    }

    return matchesType && matchesState && matchesSearch;
  });

  domainListEl.replaceChildren();

  if (!filtered.length) {
    domainListEl.appendChild(createEmptyNode('No domains found'));
    return;
  }

  for (const item of filtered) {
    const isBlocked = blockedDomains.has(item.domain);

    const row = document.createElement('div');
    row.className = 'domain-row';

    const info = document.createElement('div');
    info.className = 'domain-info';

    const name = document.createElement('div');
    name.className = 'domain-name';
    name.title = item.domain;
    name.textContent = item.domain;

    const categories = document.createElement('div');
    categories.className = 'domain-categories';
    for (const c of item.categories) {
      const span = document.createElement('span');
      span.className = 'category';
      span.title = c;
      span.textContent = getCategoryIcon(c);
      categories.appendChild(span);
    }

    info.appendChild(name);
    info.appendChild(categories);

    const btn = document.createElement('button');
    btn.className = 'btn';
    if (isBlocked) btn.classList.add('blocked');
    btn.textContent = isBlocked ? 'Unblock' : 'Block';
    btn.addEventListener('click', () => handleToggle(item.domain, isBlocked));

    row.appendChild(info);
    row.appendChild(btn);
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
