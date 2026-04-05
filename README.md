# YouTube Tray

Electron-based Windows tray shell for regular YouTube, built with Electron, React, and Vite.

## Current State

This repository contains the current desktop shell:

- tray integration with close-to-tray behavior
- mini and full window modes
- a persistent YouTube `WebContentsView` with its own preload and profile partition
- a React renderer that mirrors the live embedded player state
- Windows build, run, and packaging scripts

## Development

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite renderer, watches the Electron TypeScript entrypoints, and launches Electron against the local dev server.

## Build And Run

```bash
npm run build
npm start
```

For Windows, you can also use the repo-local launcher:

```bat
yt-music-client.cmd
```

That script installs dependencies if needed, builds the app, and starts Electron from the repo root.

## Packaging

```bash
npm run dist
```

## Shortcuts

- `Ctrl+Alt+Space` play/pause
- `Ctrl+Alt+Right` next
- `Ctrl+Alt+Up` volume up
- `Ctrl+Alt+Down` volume down
- `Shift+Alt+M` mute
- `Ctrl+Alt+Enter` toggle mini/full
- `Ctrl+Alt+Y` show or hide the window

## Notes

- The app targets Windows first.
- `npm start` expects a completed production build in `dist/` and `dist-electron/`.
- The YouTube session is persisted through the Electron profile partition used by the embedded view.
