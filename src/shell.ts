import type { PlayerState, ShellApi, ShellState } from "./types";

export const DEFAULT_SHELL_STATE: ShellState = {
  mode: "mini",
  isVideoFullscreen: false,
  sizeLockByMode: {
    mini: false,
    full: false
  },
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

export const DEFAULT_PLAYER_STATE: PlayerState = {
  status: "loading",
  title: "Opening YouTube",
  artist: "Persistent profile session",
  currentTime: 0,
  duration: 0,
  videoWidth: 0,
  videoHeight: 0,
  volume: 1,
  isMuted: false,
  isPlaying: false,
  canGoNext: false,
  hasVideo: false,
  url: "https://www.youtube.com/",
  pageTitle: "YouTube",
  artworkUrl: null,
  upcomingItems: [],
  error: null
};

const fallbackShellApi: ShellApi = {
  getShellState: async () => DEFAULT_SHELL_STATE,
  getPlayerState: async () => DEFAULT_PLAYER_STATE,
  toggleMode: async () => DEFAULT_SHELL_STATE,
  toggleSizeLock: async () => DEFAULT_SHELL_STATE,
  toggleVisibility: async () => undefined,
  hideWindow: async () => undefined,
  quit: async () => undefined,
  sendPlayerCommand: async () => undefined,
  setPlayerVolume: async () => undefined,
  seekPlayer: async () => undefined,
  searchYoutube: async () => undefined,
  openExternalUrl: async () => undefined,
  openYoutubeUrl: async () => undefined,
  openYoutubeHome: async () => undefined,
  setVideoBounds: async () => undefined,
  onShellStateChange: () => () => undefined,
  onPlayerStateChange: () => () => undefined
};

export const shellApi =
  typeof window !== "undefined" && window.youtubeTray ? window.youtubeTray : fallbackShellApi;
