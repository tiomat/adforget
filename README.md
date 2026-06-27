# AdForget

Firefox extension + local server that inspects domains used by the current web page, lets you block/unblock them, and syncs the blocklist to GitHub for AdGuard Home.

## How it works

1. Firefox extension (`extention/`) watches network requests and shows a popup with domains grouped by resource type.
2. Clicking **Block** sends the domain to the local server (`server/`).
3. The server appends the domain to `adlist.txt` in AdGuard Home format (`||domain.com^`).
4. After a short delay, the server commits and pushes `adlist.txt` to GitHub.
5. AdGuard Home pulls the raw `adlist.txt` from GitHub as a blocklist.

## Project structure

```
.
├── adforget.sh          # Server control script (start/stop/restart/status/logs)
├── adlist.txt           # AdGuard Home blocklist (managed by server)
├── server/
│   ├── package.json
│   └── server.js        # Node.js API + git sync
└── extention/
    ├── manifest.json
    ├── background.js    # Collects network requests
    ├── popup.html       # Extension UI
    ├── popup.js
    ├── styles.css
    └── icons/
```

## Prerequisites

- Node.js 18+
- Firefox
- Git repository with `origin` remote and SSH key configured (for autopush)
- AdGuard Home pointing to the raw GitHub URL of `adlist.txt`

## Setup

### 1. Install server dependencies

```bash
cd server
npm install
```

### 2. Start the server

Use the control script from the project root:

```bash
./adforget.sh start      # start server in background
./adforget.sh status     # check if running
./adforget.sh logs       # tail server logs
./adforget.sh stop       # stop server
./adforget.sh restart    # restart server
```

Server listens on `http://localhost:3000`.

To run without git sync (useful for development):

```bash
ADFORGET_NO_GIT=1 ./adforget.sh start
```

Or start directly from the `server/` directory:

```bash
cd server
npm start
```

### 3. Install the Firefox extension

1. Open Firefox and go to `about:debugging`.
2. Click **This Firefox** → **Load Temporary Add-on…**.
3. Select `extention/manifest.json`.

The extension icon should appear in the toolbar.

## Usage

1. Open any website.
2. Click the AdForget icon in Firefox toolbar.
3. Use the top filter row to show **All**, **Blocked**, or **Allowed** domains.
4. Use the bottom filter row to filter by resource type (Document, Scripts, CSS, Images, Media, XHR, Other). Each filter has an icon matching the domain icons.
5. Each domain has two action buttons:
   - **Block / Unblock** — blocks the exact domain (e.g. `log.strm.example.com`).
   - **Block \* / Unblock \*** — blocks the root domain (e.g. `example.com`), which covers all subdomains.
   - If a parent domain is already blocked, the exact-domain button is disabled with a tooltip.

The server batches changes and commits/pushes to GitHub within a few seconds.

### Note on video streaming

Many video streaming sites use HLS/DASH segments (`.m3u8`, `.mpd`, `.ts`, `.mp4`, etc.) over `XMLHttpRequest` or `fetch`. The extension detects these URLs by file extension and categorizes them as **Media** even when Firefox reports them as XHR.

## AdGuard Home integration

Add a custom filtering rule list in AdGuard Home:

```
https://raw.githubusercontent.com/YOUR_USERNAME/adforget/main/adlist.txt
```

Replace `YOUR_USERNAME` with your GitHub username.

## Server API

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET    | `/health` | — | Check server status |
| GET    | `/list` | — | List blocked domains |
| POST   | `/block` | `{ "domain": "example.com" }` | Add domain to blocklist |
| POST   | `/unblock` | `{ "domain": "example.com" }` | Remove domain from blocklist |

## Notes

- The server uses a 3-second debounce before committing/pushing to avoid a flood of tiny commits.
- Git push uses the configured `origin` remote on the `main` branch.
- Make sure your SSH key is loaded in the agent so `git push` works without a password.
