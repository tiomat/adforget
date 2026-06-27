const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Path to adlist.txt in project root
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ADLIST_PATH = path.join(PROJECT_ROOT, 'adlist.txt');

app.use(cors());
app.use(express.json());

let blockedDomains = new Set();
let pendingChanges = [];
let syncTimeout = null;
const SYNC_DELAY_MS = 3000;

function normalizeDomain(input) {
  if (!input) return null;
  let domain = input.trim().toLowerCase();

  // If it looks like a URL, extract hostname
  if (domain.includes('://')) {
    try {
      domain = new URL(domain).hostname;
    } catch {
      return null;
    }
  }

  // Remove leading || and trailing ^ if user pasted AdGuard format
  domain = domain.replace(/^\|+/, '').replace(/\^+$/, '').trim();

  // Basic domain validation
  if (!domain || !domain.includes('.') || domain.length > 253) {
    return null;
  }

  return domain;
}

function removeSubdomains(parentDomain) {
  const suffix = '.' + parentDomain;
  for (const domain of blockedDomains) {
    if (domain !== parentDomain && domain.endsWith(suffix)) {
      blockedDomains.delete(domain);
    }
  }
}

function loadBlocked() {
  try {
    if (!fs.existsSync(ADLIST_PATH)) {
      fs.writeFileSync(ADLIST_PATH, '', 'utf8');
      return;
    }
    const content = fs.readFileSync(ADLIST_PATH, 'utf8');
    const lines = content.split(/\r?\n/);
    blockedDomains.clear();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('!')) continue;
      const domain = normalizeDomain(trimmed);
      if (domain) blockedDomains.add(domain);
    }
  } catch (err) {
    console.error('Failed to load adlist.txt:', err.message);
  }
}

function saveBlocked() {
  const sorted = Array.from(blockedDomains).sort();
  const lines = sorted.map((d) => `||${d}^`);
  const content = lines.join('\n') + (lines.length ? '\n' : '');
  fs.writeFileSync(ADLIST_PATH, content, 'utf8');
}

function runGit(args, description) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { cwd: PROJECT_ROOT });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${description} failed (code ${code}): ${stderr.trim() || stdout.trim()}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`${description} error: ${err.message}`));
    });
  });
}

async function syncToGit() {
  if (process.env.ADFORGET_NO_GIT === '1') {
    console.log('[git] Git sync disabled (ADFORGET_NO_GIT=1)');
    return;
  }

  try {
    await runGit(['add', 'adlist.txt'], 'git add');

    // Check if there is something to commit
    const status = await runGit(['status', '--porcelain', 'adlist.txt'], 'git status');
    if (!status.trim()) {
      console.log('[git] No changes to commit');
      return;
    }

    const messages = pendingChanges.slice(-3).join('; ');
    const commitMessage = `Update adlist.txt: ${messages}`;
    pendingChanges = [];

    await runGit(['commit', '-m', commitMessage], 'git commit');
    await runGit(['push', 'origin', 'main'], 'git push');
    console.log('[git] Pushed:', commitMessage);
  } catch (err) {
    console.error('[git] Sync failed:', err.message);
  }
}

function scheduleSync(changeMessage) {
  if (changeMessage) {
    pendingChanges.push(changeMessage);
  }
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    syncToGit();
  }, SYNC_DELAY_MS);
}

// Load on startup
loadBlocked();

// API: list blocked domains
app.get('/list', (req, res) => {
  res.json({ domains: Array.from(blockedDomains).sort() });
});

// API: block a domain
app.post('/block', (req, res) => {
  const domain = normalizeDomain(req.body.domain);
  if (!domain) {
    return res.status(400).json({ error: 'Invalid domain' });
  }

  if (blockedDomains.has(domain)) {
    return res.json({ domain, blocked: true, message: 'Already blocked' });
  }

  blockedDomains.add(domain);
  removeSubdomains(domain);
  saveBlocked();
  scheduleSync(`block ${domain}`);

  res.json({ domain, blocked: true });
});

// API: unblock a domain
app.post('/unblock', (req, res) => {
  const domain = normalizeDomain(req.body.domain);
  if (!domain) {
    return res.status(400).json({ error: 'Invalid domain' });
  }

  if (!blockedDomains.has(domain)) {
    return res.json({ domain, blocked: false, message: 'Not blocked' });
  }

  blockedDomains.delete(domain);
  saveBlocked();
  scheduleSync(`unblock ${domain}`);

  res.json({ domain, blocked: false });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, domains: blockedDomains.size });
});

app.listen(PORT, () => {
  console.log(`[adforget-server] listening on http://localhost:${PORT}`);
  console.log(`[adforget-server] adlist.txt: ${ADLIST_PATH}`);
});
