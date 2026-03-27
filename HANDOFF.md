# Handoff

## Workspace

- Primary workspace going forward: `C:\dev\yt-music-client`
- This project was initially scaffolded in WSL, then copied here and rebuilt natively on Windows.
- Use the Windows copy for all further runtime work. Do not use WSL for Electron smoke tests unless you only need static file edits.

## Current State

- Stack: Electron + React + TypeScript + Vite
- App shape: tray-first desktop shell for normal YouTube
- Mini/full modes exist
- Global shortcut plumbing exists
- Close-to-tray behavior exists
- A persistent embedded YouTube `WebContentsView` exists
- A dedicated YouTube preload script reads live page/player state and reports it to the React UI
- The React UI now shows live player metadata/progress/volume state instead of mock local playback

## Verified

- Windows-native `npm install` completed successfully in this folder
- Windows-native `npm run build` completed successfully in this folder

## Not Yet Verified

- Actual live runtime behavior on a Windows desktop session
- Google sign-in flow inside the embedded YouTube view
- Recommendation/watch-page behavior over time
- Shortcut behavior against the live embedded player
- Mini/full mode resizing and view bounds under real window interaction

## Key Files

- `electron/main/index.ts`
  Main process, tray, shortcuts, window modes, embedded YouTube `WebContentsView`, IPC.
- `electron/preload/index.ts`
  Renderer preload bridge exposed as `window.youtubeTray`.
- `electron/preload/youtube.ts`
  Runs inside the embedded YouTube page. Reads `video` state, metadata, next button, progress, volume, and accepts control messages.
- `src/App.tsx`
  Native shell UI, live player display, full-mode video anchor bounds reporting.
- `src/types.ts`
  Shared renderer-side state types.
- `package.json`
  Dev/build scripts. `dev:electron` already waits for `dist-electron/preload/youtube.js`.
- `AGENTS.md`
  Read this first in any new session.

## Next Concrete Step

Run the app natively on Windows from this folder:

```bat
cd /d C:\dev\yt-music-client
npm run dev
```

Then verify:

1. The app opens and the tray icon appears.
2. Full mode shows the embedded YouTube surface.
3. You can sign into Google/YouTube if needed.
4. Opening or playing a YouTube video updates the title, artist, progress, and volume in the shell UI.
5. `Ctrl+Alt+Space`, `Ctrl+Alt+Right`, `Ctrl+Alt+Up`, `Ctrl+Alt+Down`, and `Ctrl+Alt+M` affect the live player.
6. Switching mini/full mode hides and restores the video surface correctly.

## If Runtime Issues Show Up

- If the embedded surface is blank or mis-sized, inspect the bounds handoff between `src/App.tsx` and `electron/main/index.ts`.
- If play/pause or next fails on live YouTube, the likely fix point is `electron/preload/youtube.ts`.
- If Google auth or popup navigation behaves badly, adjust the navigation/window-open handling in `electron/main/index.ts`.

## Notes

- There is no initialized git repository here at the moment.
- `node_modules`, `dist`, and `dist-electron` are already present in this Windows workspace.
