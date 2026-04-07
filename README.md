# YouTube Tray

Electron-based Windows tray shell for regular YouTube, built with Electron, React, and Vite.

## Status

Almost production ready.

The core desktop shell is working, packaging is set up, and the app can be built and run by someone else without extra local context. There are still a few small bugs to polish in live YouTube behavior and general runtime edge cases.

## Current State

- tray integration with close-to-tray behavior
- mini and full window modes
- a persistent YouTube `WebContentsView` with its own preload and profile partition
- a React renderer that mirrors the live embedded player state
- Windows build, run, and packaging scripts

## Requirements

- Windows 10 or Windows 11
- Node.js 24.x
- npm 11.x

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

This produces the Windows installer in `release/`.

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
- If you hit small runtime issues, build and run natively on Windows before debugging anything through WSL.
