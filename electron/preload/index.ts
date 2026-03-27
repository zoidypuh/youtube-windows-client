import { contextBridge, ipcRenderer } from "electron";

type WindowMode = "mini" | "full";
type PlayerCommand = "play-pause" | "next" | "volume-up" | "volume-down" | "mute";
type PlayerStatus = "loading" | "ready" | "idle" | "error";

type VideoBounds = {
  x: number;
  y: number;
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

contextBridge.exposeInMainWorld("youtubeTray", {
  getShellState: () => ipcRenderer.invoke("shell:get-state") as Promise<ShellState>,
  getPlayerState: () => ipcRenderer.invoke("player:get-state") as Promise<PlayerState>,
  toggleMode: () => ipcRenderer.invoke("shell:toggle-mode") as Promise<ShellState>,
  toggleVisibility: () => ipcRenderer.invoke("shell:toggle-visibility") as Promise<void>,
  hideWindow: () => ipcRenderer.invoke("shell:hide-window") as Promise<void>,
  quit: () => ipcRenderer.invoke("shell:quit") as Promise<void>,
  sendPlayerCommand: (command: PlayerCommand) =>
    ipcRenderer.invoke("player:command", command) as Promise<void>,
  setPlayerVolume: (value: number) =>
    ipcRenderer.invoke("player:set-volume", value) as Promise<void>,
  seekPlayer: (value: number) => ipcRenderer.invoke("player:seek-to", value) as Promise<void>,
  setVideoBounds: (bounds: VideoBounds | null) =>
    ipcRenderer.invoke("shell:set-video-bounds", bounds) as Promise<void>,
  onShellStateChange: (callback: (state: ShellState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: ShellState) => {
      callback(state);
    };

    ipcRenderer.on("shell:state-changed", listener);

    return () => {
      ipcRenderer.removeListener("shell:state-changed", listener);
    };
  },
  onPlayerStateChange: (callback: (state: PlayerState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PlayerState) => {
      callback(state);
    };

    ipcRenderer.on("player:state-changed", listener);

    return () => {
      ipcRenderer.removeListener("player:state-changed", listener);
    };
  }
});
