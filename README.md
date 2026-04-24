# YouTube Tray

A Windows tray app for people who use YouTube like a music player and want fast, separate controls without hunting for the right browser tab.

## Status

Final.

The desktop shell, launcher, build scripts, packaging configuration, and setup documentation are complete. The app is meant for people who keep YouTube running in the background and want play/pause, next-track, window visibility, and volume control in a dedicated desktop shell.

## Supported Environment

Run and package the app from Windows 10 or Windows 11. WSL, macOS, and Linux are useful for editing files, but the Electron runtime and installer flow are Windows-first and should be verified from Windows PowerShell or Command Prompt.

## Current State

- tray integration with close-to-tray behavior
- mini and full window modes
- a persistent YouTube `WebContentsView` with its own preload and profile partition
- a React renderer that mirrors the live embedded player state
- Windows build, run, and packaging scripts

## Requirements

- Windows 10 or Windows 11
- Git
- Node.js 22.12 or newer
- npm, included with Node.js

Install missing tools from PowerShell:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
```

Close and reopen PowerShell after installing, then check the tools:

```powershell
git --version
node --version
npm --version
```

## Clone And Install

```powershell
git clone https://github.com/zoidypuh/yt-music-client.git
cd yt-music-client
npm install
```

## Development Run

```powershell
npm run dev
```

`npm run dev` starts the Vite renderer, watches the Electron TypeScript entrypoints, and launches Electron against the local dev server.

## Build And Run

```powershell
npm run build
npm start
```

For Windows, you can also use the repo-local launcher:

```powershell
.\yt-music-client.cmd
```

That script installs dependencies if needed, builds the app, and starts Electron from the repo root.

## Packaging

```powershell
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

- `npm start` expects a completed production build in `dist/` and `dist-electron/`.
- The YouTube session is persisted through the Electron profile partition used by the embedded view.
- If you hit small runtime issues, build and run natively on Windows before debugging anything through WSL.
