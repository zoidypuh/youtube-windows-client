export type WindowMode = "mini" | "full";

export type PlayerCommand = "play-pause" | "next" | "volume-up" | "volume-down" | "mute";

export type VideoBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlayerStatus = "loading" | "ready" | "idle" | "error";

export type PlayerState = {
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

export type ShellState = {
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

export type ShellApi = {
  getShellState: () => Promise<ShellState>;
  getPlayerState: () => Promise<PlayerState>;
  toggleMode: () => Promise<ShellState>;
  toggleVisibility: () => Promise<void>;
  hideWindow: () => Promise<void>;
  quit: () => Promise<void>;
  sendPlayerCommand: (command: PlayerCommand) => Promise<void>;
  setPlayerVolume: (value: number) => Promise<void>;
  seekPlayer: (value: number) => Promise<void>;
  setVideoBounds: (bounds: VideoBounds | null) => Promise<void>;
  onShellStateChange: (callback: (state: ShellState) => void) => () => void;
  onPlayerStateChange: (callback: (state: PlayerState) => void) => () => void;
};
