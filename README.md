# YouTube Tray

Electron-based Windows tray shell for normal YouTube.

## Current State

This repository now contains the initial shell:

- Electron main process with tray integration and close-to-tray behavior
- placeholder mini and full window modes
- preload bridge for shell state and player commands
- React renderer that now mirrors the live embedded player state
- persistent YouTube `WebContentsView` session with its own preload and profile partition
- build and packaging scripts for Windows

## Commands

```bash
npm install
npm run dev
npm run build
npm run dist
```

## Current Shortcuts

- `Ctrl+Alt+Space` play/pause
- `Ctrl+Alt+Right` next
- `Ctrl+Alt+Up` volume up
- `Ctrl+Alt+Down` volume down
- `Ctrl+Alt+M` mute
- `Ctrl+Alt+Enter` toggle mini/full
- `Ctrl+Alt+Y` show or hide the window

## Next Pass

Harden the real YouTube integration: improve login/navigation handling, add better next-track fallbacks, and start persisting window and shortcut preferences.
