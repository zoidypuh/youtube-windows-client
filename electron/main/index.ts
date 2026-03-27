import fs from "node:fs";
import path from "node:path";
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
  WebContentsView
} from "electron";

type WindowMode = "mini" | "full";
type PlayerCommand = "play-pause" | "next" | "volume-up" | "volume-down" | "mute";
type PlayerStatus = "loading" | "ready" | "idle" | "error";

type VideoBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type StoredWindowBounds = {
  x?: number;
  y?: number;
  width: number;
  height: number;
};

type PlayerState = {
  status: PlayerStatus;
  title: string;
  artist: string;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isPlaying: boolean;
  canGoNext: boolean;
  hasVideo: boolean;
  url: string;
  pageTitle: string;
  artworkUrl: string | null;
  error: string | null;
};

type PlayerControlMessage =
  | {
      type: "command";
      command: PlayerCommand;
    }
  | {
      type: "set-volume";
      value: number;
    }
  | {
      type: "seek-to";
      value: number;
    };

type ShellState = {
  mode: WindowMode;
  isVideoFullscreen: boolean;
  shortcuts: {
    playPause: string;
    next: string;
    volumeUp: string;
    volumeDown: string;
    mute: string;
    toggleMode: string;
    toggleWindow: string;
  };
};

const isDev = !app.isPackaged;
const rendererDevUrl = process.env.VITE_DEV_SERVER_URL;
const rendererHtmlPath = path.join(__dirname, "..", "..", "dist", "index.html");
const preloadPath = path.join(__dirname, "..", "preload", "index.js");
const youtubePreloadPath = path.join(__dirname, "..", "preload", "youtube.js");
const youtubeHomeUrl = "https://www.youtube.com/";
const youtubePartition = "persist:youtube-tray";
const windowStatePath = path.join(app.getPath("userData"), "window-state.json");
const bundledIconPath = app.isPackaged
  ? path.join(process.resourcesPath, "icon.png")
  : path.join(__dirname, "..", "..", "icon.png");

const shellState: ShellState = {
  mode: "mini",
  isVideoFullscreen: false,
  shortcuts: {
    playPause: "Ctrl+Alt+Space",
    next: "Ctrl+Alt+Right",
    volumeUp: "Ctrl+Alt+Up",
    volumeDown: "Ctrl+Alt+Down",
    mute: "Shift+Alt+M",
    toggleMode: "Ctrl+Alt+Enter",
    toggleWindow: "Ctrl+Alt+Y"
  }
};

const defaultPlayerState: PlayerState = {
  status: "loading",
  title: "Opening YouTube",
  artist: "Persistent profile session",
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  isPlaying: false,
  canGoNext: false,
  hasVideo: false,
  url: youtubeHomeUrl,
  pageTitle: "YouTube",
  artworkUrl: null,
  error: null
};

const windowPresets = {
  mini: {
    width: 420,
    height: 250,
    minWidth: 360,
    minHeight: 220
  },
  full: {
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 560
  }
} satisfies Record<
  WindowMode,
  { width: number; height: number; minWidth: number; minHeight: number }
>;

let mainWindow: BrowserWindow | null = null;
let youtubeView: WebContentsView | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let videoBounds: VideoBounds | null = null;
let playerState: PlayerState = { ...defaultPlayerState };
let boundsSaveTimeout: NodeJS.Timeout | null = null;
let storedWindowBounds: Partial<Record<WindowMode, StoredWindowBounds>> = {};

function getCurrentPreset() {
  return windowPresets[shellState.mode];
}

function loadStoredWindowBounds() {
  try {
    const rawState = fs.readFileSync(windowStatePath, "utf8");
    const parsedState = JSON.parse(rawState) as {
      boundsByMode?: Partial<Record<WindowMode, StoredWindowBounds>>;
    };

    storedWindowBounds = parsedState.boundsByMode ?? {};
  } catch {
    storedWindowBounds = {};
  }
}

function saveStoredWindowBounds() {
  try {
    fs.mkdirSync(path.dirname(windowStatePath), { recursive: true });
    fs.writeFileSync(
      windowStatePath,
      JSON.stringify(
        {
          boundsByMode: storedWindowBounds
        },
        null,
        2
      )
    );
  } catch (error) {
    console.warn("Failed to persist window bounds", error);
  }
}

function normalizeStoredWindowBounds(mode: WindowMode, bounds: StoredWindowBounds) {
  const preset = windowPresets[mode];

  return {
    x: typeof bounds.x === "number" ? Math.round(bounds.x) : undefined,
    y: typeof bounds.y === "number" ? Math.round(bounds.y) : undefined,
    width: Math.max(preset.minWidth, Math.round(bounds.width)),
    height: Math.max(preset.minHeight, Math.round(bounds.height))
  };
}

function getSavedBoundsForMode(mode: WindowMode, fallback?: Electron.Rectangle) {
  const preset = windowPresets[mode];
  const savedBounds = storedWindowBounds[mode];
  const normalizedSavedBounds = savedBounds ? normalizeStoredWindowBounds(mode, savedBounds) : null;

  return {
    x: normalizedSavedBounds?.x ?? fallback?.x,
    y: normalizedSavedBounds?.y ?? fallback?.y,
    width: normalizedSavedBounds?.width ?? preset.width,
    height: normalizedSavedBounds?.height ?? preset.height
  };
}

function rememberCurrentWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed() || shellState.isVideoFullscreen) {
    return;
  }

  const nextBounds = mainWindow.isNormal() ? mainWindow.getBounds() : mainWindow.getNormalBounds();
  storedWindowBounds[shellState.mode] = normalizeStoredWindowBounds(shellState.mode, nextBounds);
  saveStoredWindowBounds();
}

function scheduleWindowBoundsSave() {
  if (boundsSaveTimeout) {
    clearTimeout(boundsSaveTimeout);
  }

  boundsSaveTimeout = setTimeout(() => {
    boundsSaveTimeout = null;
    rememberCurrentWindowBounds();
  }, 200);
}

function createTrayImage() {
  const appIcon = nativeImage.createFromPath(bundledIconPath);

  if (!appIcon.isEmpty()) {
    return appIcon.resize({ width: 16, height: 16 });
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#12181d" />
          <stop offset="100%" stop-color="#2b333b" />
        </linearGradient>
      </defs>
      <rect x="3" y="6" width="26" height="20" rx="6" fill="url(#bg)" />
      <path d="M13 11.5 21 16l-8 4.5Z" fill="#ff8f3f" />
      <circle cx="24" cy="10" r="2" fill="#ffd36b" />
    </svg>
  `.trim();

  return nativeImage
    .createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`)
    .resize({ width: 16, height: 16 });
}

function revealWindow() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function toggleWindowVisibility() {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }

  revealWindow();
}

function sendShellState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("shell:state-changed", shellState);
}

function sendPlayerState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send("player:state-changed", playerState);
}

function normalizeVideoBounds(bounds: VideoBounds | null) {
  if (!bounds) {
    return null;
  }

  const width = Math.max(0, Math.round(bounds.width));
  const height = Math.max(0, Math.round(bounds.height));

  if (width === 0 || height === 0) {
    return null;
  }

  return {
    x: Math.max(0, Math.round(bounds.x)),
    y: Math.max(0, Math.round(bounds.y)),
    width,
    height
  };
}

function getWindowContentBounds() {
  if (!mainWindow) {
    return null;
  }

  const { width, height } = mainWindow.getContentBounds();

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x: 0, y: 0, width, height };
}

function syncYoutubeViewBounds() {
  if (!youtubeView) {
    return;
  }

  if (shellState.isVideoFullscreen) {
    const fullscreenBounds = getWindowContentBounds();

    if (!fullscreenBounds) {
      return;
    }

    youtubeView.setBorderRadius(0);
    youtubeView.setBounds(fullscreenBounds);
    youtubeView.setVisible(true);
    return;
  }

  const nextBounds = shellState.mode === "full" ? normalizeVideoBounds(videoBounds) : null;
  youtubeView.setBorderRadius(18);

  if (!nextBounds) {
    youtubeView.setVisible(false);
    youtubeView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }

  youtubeView.setBounds(nextBounds);
  youtubeView.setVisible(true);
}

function setVideoFullscreen(isVideoFullscreen: boolean) {
  if (shellState.isVideoFullscreen === isVideoFullscreen) {
    syncYoutubeViewBounds();
    return;
  }

  shellState.isVideoFullscreen = isVideoFullscreen;
  sendShellState();
  syncYoutubeViewBounds();
}

function isTrustedYoutubeNavigation(url: string) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname.endsWith("youtube.com") ||
      parsedUrl.hostname.endsWith("google.com") ||
      parsedUrl.hostname.endsWith("googleusercontent.com")
    );
  } catch {
    return false;
  }
}

function updatePlayerState(nextState: Partial<PlayerState>) {
  playerState = {
    ...playerState,
    ...nextState
  };

  if (tray) {
    tray.setToolTip(
      playerState.title && playerState.title !== defaultPlayerState.title
        ? `YouTube Tray • ${playerState.title}`
        : "YouTube Tray"
    );
  }

  sendPlayerState();
}

function sendPlayerControl(message: PlayerControlMessage) {
  if (!youtubeView || youtubeView.webContents.isDestroyed()) {
    return;
  }

  youtubeView.webContents.send("youtube:player-control", message);
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Show Player",
        click: () => revealWindow()
      },
      {
        label: shellState.mode === "mini" ? "Switch to Full Mode" : "Switch to Mini Mode",
        click: () => toggleWindowMode()
      },
      {
        type: "separator"
      },
      {
        label: "Play / Pause",
        click: () => dispatchPlayerCommand("play-pause")
      },
      {
        label: "Next Recommendation",
        click: () => dispatchPlayerCommand("next")
      },
      {
        type: "separator"
      },
      {
        label: "Quit",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function applyWindowMode(mode: WindowMode) {
  shellState.mode = mode;
  updateTrayMenu();

  if (!mainWindow) {
    return;
  }

  const currentBounds = mainWindow.getBounds();
  const nextPreset = windowPresets[mode];
  const nextBounds = getSavedBoundsForMode(mode, currentBounds);

  mainWindow.setMinimumSize(nextPreset.minWidth, nextPreset.minHeight);
  mainWindow.setResizable(true);
  mainWindow.setMaximizable(true);
  mainWindow.setBounds({
    x: nextBounds.x ?? currentBounds.x,
    y: nextBounds.y ?? currentBounds.y,
    width: nextBounds.width,
    height: nextBounds.height
  });

  sendShellState();
  syncYoutubeViewBounds();
}

function toggleWindowMode() {
  if (shellState.isVideoFullscreen) {
    setVideoFullscreen(false);
    if (mainWindow?.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  }

  rememberCurrentWindowBounds();
  const nextMode: WindowMode = shellState.mode === "mini" ? "full" : "mini";
  applyWindowMode(nextMode);
  revealWindow();
}

function dispatchPlayerCommand(command: PlayerCommand) {
  sendPlayerControl({
    type: "command",
    command
  });
}

function registerShortcuts() {
  const registrations: Array<[string, () => void]> = [
    ["CommandOrControl+Alt+Space", () => dispatchPlayerCommand("play-pause")],
    ["CommandOrControl+Alt+Right", () => dispatchPlayerCommand("next")],
    ["CommandOrControl+Alt+Up", () => dispatchPlayerCommand("volume-up")],
    ["CommandOrControl+Alt+Down", () => dispatchPlayerCommand("volume-down")],
    ["Shift+Alt+M", () => dispatchPlayerCommand("mute")],
    ["CommandOrControl+Alt+Enter", () => toggleWindowMode()],
    ["CommandOrControl+Alt+Y", () => toggleWindowVisibility()]
  ];

  for (const [accelerator, callback] of registrations) {
    const registered = globalShortcut.register(accelerator, callback);
    if (!registered) {
      console.warn(`Failed to register shortcut: ${accelerator}`);
    }
  }
}

function createMainWindow() {
  const preset = getCurrentPreset();
  const initialBounds = getSavedBoundsForMode(shellState.mode);

  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    icon: bundledIconPath,
    minWidth: preset.minWidth,
    minHeight: preset.minHeight,
    resizable: true,
    maximizable: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0b1014",
    title: "YouTube Tray",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (rendererDevUrl) {
    void mainWindow.loadURL(rendererDevUrl);
  } else {
    void mainWindow.loadFile(rendererHtmlPath);
  }

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.once("ready-to-show", () => {
    if (isDev) {
      revealWindow();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-finish-load", () => {
    sendShellState();
    sendPlayerState();
  });

  mainWindow.on("resize", () => {
    scheduleWindowBoundsSave();
    syncYoutubeViewBounds();
  });

  mainWindow.on("move", () => {
    scheduleWindowBoundsSave();
  });

  mainWindow.on("leave-full-screen", () => {
    if (!shellState.isVideoFullscreen) {
      syncYoutubeViewBounds();
      return;
    }

    setVideoFullscreen(false);

    if (!youtubeView || youtubeView.webContents.isDestroyed()) {
      return;
    }

    void youtubeView.webContents
      .executeJavaScript("document.fullscreenElement ? document.exitFullscreen() : undefined", true)
      .catch(() => undefined);
  });
}

function createYoutubeView() {
  if (!mainWindow) {
    return;
  }

  youtubeView = new WebContentsView({
    webPreferences: {
      preload: youtubePreloadPath,
      partition: youtubePartition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      autoplayPolicy: "no-user-gesture-required",
      spellcheck: false
    }
  });

  youtubeView.setBorderRadius(18);
  youtubeView.setBackgroundColor("#0a0f13");
  youtubeView.setVisible(false);
  youtubeView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  mainWindow.contentView.addChildView(youtubeView);

  youtubeView.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedYoutubeNavigation(url)) {
      void youtubeView?.webContents.loadURL(url);
      return { action: "deny" };
    }

    void shell.openExternal(url);
    return { action: "deny" };
  });

  youtubeView.webContents.on("will-navigate", (event, url) => {
    if (isTrustedYoutubeNavigation(url)) {
      updatePlayerState({
        status: "loading",
        url,
        error: null
      });
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });

  youtubeView.webContents.on("did-start-loading", () => {
    updatePlayerState({
      status: "loading",
      error: null
    });
  });

  youtubeView.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) {
        return;
      }

      updatePlayerState({
        status: "error",
        error: errorDescription,
        url: validatedUrl || playerState.url
      });
    }
  );

  youtubeView.webContents.on("page-title-updated", (event, title) => {
    event.preventDefault();
    updatePlayerState({
      pageTitle: title
    });
  });

  youtubeView.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }

    updatePlayerState({
      url
    });

    youtubeView?.webContents.send("youtube:request-state");
  });

  youtubeView.webContents.on("enter-html-full-screen", () => {
    setVideoFullscreen(true);

    if (!mainWindow?.isFullScreen()) {
      mainWindow?.setFullScreen(true);
    }
  });

  youtubeView.webContents.on("leave-html-full-screen", () => {
    setVideoFullscreen(false);

    if (mainWindow?.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
  });

  void youtubeView.webContents.loadURL(youtubeHomeUrl);
}

function createTray() {
  tray = new Tray(createTrayImage());
  tray.setToolTip("YouTube Tray");
  tray.on("click", () => toggleWindowVisibility());
  updateTrayMenu();
}

function registerIpc() {
  ipcMain.handle("shell:get-state", () => shellState);
  ipcMain.handle("player:get-state", () => playerState);

  ipcMain.handle("shell:toggle-mode", () => {
    toggleWindowMode();
    return shellState;
  });

  ipcMain.handle("shell:toggle-visibility", () => {
    toggleWindowVisibility();
  });

  ipcMain.handle("shell:hide-window", () => {
    mainWindow?.hide();
  });

  ipcMain.handle("shell:set-video-bounds", (_event, bounds: VideoBounds | null) => {
    videoBounds = bounds;
    syncYoutubeViewBounds();
  });

  ipcMain.handle("player:command", (_event, command: PlayerCommand) => {
    dispatchPlayerCommand(command);
  });

  ipcMain.handle("player:set-volume", (_event, value: number) => {
    sendPlayerControl({
      type: "set-volume",
      value
    });
  });

  ipcMain.handle("player:seek-to", (_event, value: number) => {
    sendPlayerControl({
      type: "seek-to",
      value
    });
  });

  ipcMain.handle("shell:quit", () => {
    isQuitting = true;
    app.quit();
  });

  ipcMain.on("youtube:state", (event, nextState: PlayerState) => {
    if (event.sender.id !== youtubeView?.webContents.id) {
      return;
    }

    updatePlayerState(nextState);
  });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    revealWindow();
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.gismar.youtube-tray");
  }

  loadStoredWindowBounds();
  Menu.setApplicationMenu(null);
  registerIpc();
  createMainWindow();
  createYoutubeView();
  createTray();
  registerShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      return;
    }

    revealWindow();
  });
});

app.on("will-quit", () => {
  if (boundsSaveTimeout) {
    clearTimeout(boundsSaveTimeout);
    boundsSaveTimeout = null;
  }

  rememberCurrentWindowBounds();
  globalShortcut.unregisterAll();
});
