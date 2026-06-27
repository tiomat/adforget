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

```bash
npm start
```

Server listens on `http://localhost:3000`.

To run without git sync (useful for development):

```bash
ADFORGET_NO_GIT=1 npm start
```

### 3. Install the Firefox extension

1. Open Firefox and go to `about:debugging`.
2. Click **This Firefox** → **Load Temporary Add-on…**.
3. Select `extention/manifest.json`.

The extension icon should appear in the toolbar.

## Usage

1. Open any website.
2. Click the AdForget icon in Firefox toolbar.
3. Filter domains by resource type (Document, Scripts, CSS, Images, Media, XHR, Other).
4. Click **Block** next to a domain to add it to `adlist.txt`.
5. Click **Unblock** to remove it.

The server batches changes and commits/pushes to GitHub within a few seconds.

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
