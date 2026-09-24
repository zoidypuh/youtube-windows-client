import { ipcRenderer, webFrame } from "electron";

type PlayerCommand = "play-pause" | "next" | "volume-up" | "volume-down" | "mute" | "like";
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

type PlayerStatus = "loading" | "ready" | "idle" | "error";

type UpcomingItem = {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  durationLabel: string;
  thumbnailUrl: string | null;
  isActive: boolean;
};

type ResumePlaybackMessage = {
  url: string;
  currentTime: number;
  shouldResumePlaying: boolean;
};

type AudioProbeConfig = {
  enabled: boolean;
  sinkMatch: string;
  volume: number;
  logIntervalMs: number;
};

type AudioHistoryEntry = {
  at: string;
  performanceMs: number;
  event: string;
  mediaKey: string;
  url: string;
  currentTime: number;
  duration: number;
  readyState: number | null;
  paused: boolean | null;
  volume: number;
  muted: boolean;
  detail?: Record<string, unknown>;
};

type PlayerState = {
  status: PlayerStatus;
  title: string;
  artist: string;
  currentTime: number;
  duration: number;
  videoWidth: number;
  videoHeight: number;
  volume: number;
  isMuted: boolean;
  isPlaying: boolean;
  isLiked: boolean;
  canGoNext: boolean;
  hasVideo: boolean;
  url: string;
  pageTitle: string;
  artworkUrl: string | null;
  upcomingItems: UpcomingItem[];
  error: string | null;
};

const DEFAULT_PLAYER_STATE: PlayerState = {
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
  isLiked: false,
  canGoNext: false,
  hasVideo: false,
  url: window.location.href,
  pageTitle: document.title,
  artworkUrl: null,
  upcomingItems: [],
  error: null
};

const VIDEO_EVENTS = [
  "play",
  "pause",
  "timeupdate",
  "durationchange",
  "loadedmetadata",
  "canplay",
  "volumechange",
  "ended",
  "emptied",
  "seeking",
  "seeked"
] as const;
const PLAYER_ONLY_CLASS = "youtube-tray-player-only";
const PLAYER_ONLY_STYLE_ID = "youtube-tray-player-only-style";
const PREFERRED_VOLUME_KEY = "youtube-tray-preferred-volume";
const PREFERRED_MUTED_KEY = "youtube-tray-preferred-muted";
const AUDIO_VOLUME_DRIFT_TOLERANCE = 0.005;
const PAGE_AUDIO_GUARD_SCRIPT_ID = "youtube-tray-audio-guard-script";
const PAGE_AUDIO_GUARD_APPLY_EVENT = "youtube-tray-audio-guard-apply";
const mediaVolumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
const mediaMutedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "muted");
const PLAYER_ONLY_STYLES = `
  html.${PLAYER_ONLY_CLASS},
  body.${PLAYER_ONLY_CLASS} {
    background: #000 !important;
    overflow: hidden !important;
  }

  html.${PLAYER_ONLY_CLASS} ytd-masthead,
  html.${PLAYER_ONLY_CLASS} #secondary,
  html.${PLAYER_ONLY_CLASS} #secondary-inner,
  html.${PLAYER_ONLY_CLASS} #below,
  html.${PLAYER_ONLY_CLASS} #related,
  html.${PLAYER_ONLY_CLASS} #comments,
  html.${PLAYER_ONLY_CLASS} ytd-comments,
  html.${PLAYER_ONLY_CLASS} #chat,
  html.${PLAYER_ONLY_CLASS} ytd-playlist-panel-renderer,
  html.${PLAYER_ONLY_CLASS} tp-yt-app-drawer,
  html.${PLAYER_ONLY_CLASS} #guide {
    display: none !important;
  }

  html.${PLAYER_ONLY_CLASS} ytd-app,
  html.${PLAYER_ONLY_CLASS} #content,
  html.${PLAYER_ONLY_CLASS} #page-manager,
  html.${PLAYER_ONLY_CLASS} ytd-watch-flexy,
  html.${PLAYER_ONLY_CLASS} #player,
  html.${PLAYER_ONLY_CLASS} #columns,
  html.${PLAYER_ONLY_CLASS} #primary,
  html.${PLAYER_ONLY_CLASS} #primary-inner,
  html.${PLAYER_ONLY_CLASS} #full-bleed-container,
  html.${PLAYER_ONLY_CLASS} #player-full-bleed-container,
  html.${PLAYER_ONLY_CLASS} #player-container-outer,
  html.${PLAYER_ONLY_CLASS} #player-container-inner,
  html.${PLAYER_ONLY_CLASS} #player-container,
  html.${PLAYER_ONLY_CLASS} #ytd-player,
  html.${PLAYER_ONLY_CLASS} #movie_player,
  html.${PLAYER_ONLY_CLASS} .html5-video-player {
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  html.${PLAYER_ONLY_CLASS} #page-manager,
  html.${PLAYER_ONLY_CLASS} ytd-watch-flexy,
  html.${PLAYER_ONLY_CLASS} #player,
  html.${PLAYER_ONLY_CLASS} #columns,
  html.${PLAYER_ONLY_CLASS} #primary,
  html.${PLAYER_ONLY_CLASS} #primary-inner,
  html.${PLAYER_ONLY_CLASS} #full-bleed-container,
  html.${PLAYER_ONLY_CLASS} #player-full-bleed-container,
  html.${PLAYER_ONLY_CLASS} #player-container-outer,
  html.${PLAYER_ONLY_CLASS} #player-container-inner,
  html.${PLAYER_ONLY_CLASS} #player-container,
  html.${PLAYER_ONLY_CLASS} #ytd-player,
  html.${PLAYER_ONLY_CLASS} #movie_player,
  html.${PLAYER_ONLY_CLASS} .html5-video-player,
  html.${PLAYER_ONLY_CLASS} .html5-video-container {
    height: 100% !important;
    min-height: 0 !important;
    max-height: none !important;
  }

  html.${PLAYER_ONLY_CLASS} body,
  html.${PLAYER_ONLY_CLASS} ytd-app,
  html.${PLAYER_ONLY_CLASS} #content,
  html.${PLAYER_ONLY_CLASS} #page-manager,
  html.${PLAYER_ONLY_CLASS} ytd-watch-flexy,
  html.${PLAYER_ONLY_CLASS} #player,
  html.${PLAYER_ONLY_CLASS} #columns,
  html.${PLAYER_ONLY_CLASS} #primary,
  html.${PLAYER_ONLY_CLASS} #primary-inner,
  html.${PLAYER_ONLY_CLASS} #full-bleed-container,
  html.${PLAYER_ONLY_CLASS} #player-full-bleed-container,
  html.${PLAYER_ONLY_CLASS} #player-container-outer,
  html.${PLAYER_ONLY_CLASS} #player-container-inner,
  html.${PLAYER_ONLY_CLASS} #player-container,
  html.${PLAYER_ONLY_CLASS} #ytd-player {
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    min-width: 0 !important;
    max-height: none !important;
  }

  html.${PLAYER_ONLY_CLASS} #player,
  html.${PLAYER_ONLY_CLASS} #player-full-bleed-container,
  html.${PLAYER_ONLY_CLASS} #player-container-outer,
  html.${PLAYER_ONLY_CLASS} #player-container-inner,
  html.${PLAYER_ONLY_CLASS} #player-container,
  html.${PLAYER_ONLY_CLASS} #ytd-player {
    position: fixed !important;
    inset: 0 !important;
    top: 0 !important;
    left: 0 !important;
    transform: none !important;
  }

  html.${PLAYER_ONLY_CLASS} #page-manager,
  html.${PLAYER_ONLY_CLASS} ytd-watch-flexy,
  html.${PLAYER_ONLY_CLASS} #player,
  html.${PLAYER_ONLY_CLASS} #columns,
  html.${PLAYER_ONLY_CLASS} #primary,
  html.${PLAYER_ONLY_CLASS} #primary-inner {
    margin: 0 !important;
    padding: 0 !important;
  }

  html.${PLAYER_ONLY_CLASS} #movie_player,
  html.${PLAYER_ONLY_CLASS} .html5-video-player,
  html.${PLAYER_ONLY_CLASS} .html5-video-container {
    border-radius: 0 !important;
    background: #000 !important;
  }
`;

let activeVideo: HTMLVideoElement | null = null;
let lastSentState = "";
let lastError: string | null = null;
let currentStatus: PlayerStatus = "loading";
let mutationObserver: MutationObserver | null = null;
let scheduledScan = false;
let pendingResumePlayback: ResumePlaybackMessage | null = null;
let autoplayWatchUrl = "";
let autoplayWatchAttempts = 0;
let preferredVolume = loadPreferredVolume();
let preferredMuted = loadPreferredMuted();
let suppressPreferredVolumeCaptureUntil = 0;
let preferredAudioReapplyTimeouts: number[] = [];
let audioControlIntentUntil = 0;
let activeMediaKey = "";
let lastAudioOutputWarmupKey = "";
let audioProbeConfig: AudioProbeConfig | null = loadAudioProbeConfigFromEnv();
let audioProbeSinkAppliedKey = "";
let audioProbeLevelTimer: number | null = null;
let preferredAudioWriteDepth = 0;
let pageAudioGuardInstalled = false;
const recentAudioEvents: AudioHistoryEntry[] = [];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function loadAudioProbeConfigFromEnv(): AudioProbeConfig | null {
  if (process.env.YOUTUBE_TRAY_AUDIO_PROBE !== "1") {
    return null;
  }

  const parsedVolume = Number(process.env.YOUTUBE_TRAY_AUDIO_PROBE_VOLUME ?? "0.5");
  const parsedLogIntervalMs = Number(process.env.YOUTUBE_TRAY_AUDIO_PROBE_LOG_INTERVAL_MS ?? "250");

  return {
    enabled: true,
    sinkMatch: process.env.YOUTUBE_TRAY_AUDIO_PROBE_SINK_MATCH || "CABLE Input",
    volume: Number.isFinite(parsedVolume) ? clamp(parsedVolume, 0, 1) : 0.5,
    logIntervalMs: Number.isFinite(parsedLogIntervalMs)
      ? clamp(Math.round(parsedLogIntervalMs), 100, 5000)
      : 250
  };
}

function sanitizeNumber(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizeResumeUrl(rawUrl: string) {
  try {
    const parsedUrl = new URL(rawUrl, window.location.origin);
    parsedUrl.hash = "";
    parsedUrl.searchParams.delete("t");
    parsedUrl.searchParams.delete("start");
    parsedUrl.searchParams.delete("time_continue");
    return parsedUrl.toString();
  } catch {
    return rawUrl;
  }
}

function loadPreferredVolume() {
  try {
    const storedValue = window.localStorage.getItem(PREFERRED_VOLUME_KEY);
    const parsedValue = storedValue === null ? Number.NaN : Number(storedValue);
    return Number.isFinite(parsedValue) ? clamp(parsedValue, 0, 1) : DEFAULT_PLAYER_STATE.volume;
  } catch {
    return DEFAULT_PLAYER_STATE.volume;
  }
}

function loadPreferredMuted() {
  try {
    return window.localStorage.getItem(PREFERRED_MUTED_KEY) === "true";
  } catch {
    return DEFAULT_PLAYER_STATE.isMuted;
  }
}

function persistPreferredAudioState() {
  try {
    window.localStorage.setItem(PREFERRED_VOLUME_KEY, String(preferredVolume));
    window.localStorage.setItem(PREFERRED_MUTED_KEY, preferredMuted ? "true" : "false");
  } catch {
    // Ignore storage failures in the embedded browser context.
  }

  applyPageAudioGuard("persist");
}

function installPageAudioGuard() {
  if (pageAudioGuardInstalled) {
    return;
  }

  pageAudioGuardInstalled = true;

  const guardScript = `(() => {
  const INSTALL_KEY = ${JSON.stringify(PAGE_AUDIO_GUARD_SCRIPT_ID)};
  if (window[INSTALL_KEY]) {
    return;
  }
  window[INSTALL_KEY] = true;
  const VOLUME_KEY = ${JSON.stringify(PREFERRED_VOLUME_KEY)};
  const MUTED_KEY = ${JSON.stringify(PREFERRED_MUTED_KEY)};
  const APPLY_EVENT = ${JSON.stringify(PAGE_AUDIO_GUARD_APPLY_EVENT)};
  const nativeVolume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
  const nativeMuted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "muted");
  const patchedPlayers = new WeakSet();
  let internalWriteDepth = 0;
  let userAudioIntentUntil = 0;

  if (!nativeVolume?.get || !nativeVolume?.set || !nativeMuted?.get || !nativeMuted?.set) {
    return;
  }

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const readPreferredVolume = () => {
    const parsed = Number(window.localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : 1;
  };
  const readPreferredMuted = () => window.localStorage.getItem(MUTED_KEY) === "true";
  const hasUserAudioIntent = () => Date.now() <= userAudioIntentUntil;
  const markUserAudioIntent = (durationMs = 2200) => {
    userAudioIntentUntil = Date.now() + durationMs;
  };
  const persistPreferredVolume = (volume) => {
    try {
      window.localStorage.setItem(VOLUME_KEY, String(clamp(volume, 0, 1)));
    } catch {}
  };
  const persistPreferredMuted = (muted) => {
    try {
      window.localStorage.setItem(MUTED_KEY, muted ? "true" : "false");
    } catch {}
  };
  const emitGuardEvent = (detail) => {
    window.postMessage({ source: "youtube-tray-audio-guard", ...detail }, "*");
  };
  const withInternalWrite = (callback) => {
    internalWriteDepth += 1;
    try {
      return callback();
    } finally {
      internalWriteDepth -= 1;
    }
  };
  const applyPreferredToVideo = (video) => {
    const nextVolume = readPreferredVolume();
    const nextMuted = readPreferredMuted();
    withInternalWrite(() => {
      if (Math.abs(nativeVolume.get.call(video) - nextVolume) > 0.001) {
        nativeVolume.set.call(video, nextVolume);
      }
      if (nativeMuted.get.call(video) !== nextMuted) {
        nativeMuted.set.call(video, nextMuted);
      }
    });
  };
  const getMoviePlayer = () => document.querySelector("#movie_player");
  const applyPreferredToPlayer = (reason = "apply") => {
    const player = getMoviePlayer();
    const targetPercent = Math.round(readPreferredVolume() * 100);
    if (player && typeof player.setVolume === "function") {
      patchMoviePlayer(player);
      withInternalWrite(() => {
        try {
          if (typeof player.getVolume !== "function" || Math.abs(Number(player.getVolume()) - targetPercent) > 1) {
            player.setVolume(targetPercent);
          }
        } catch {}
      });
    }
    for (const video of document.querySelectorAll("video")) {
      applyPreferredToVideo(video);
    }
    emitGuardEvent({ event: "page-audio-guard-applied", reason, targetPercent });
  };
  const patchMoviePlayer = (player) => {
    if (!player || patchedPlayers.has(player) || typeof player.setVolume !== "function") {
      return;
    }

    const nativeSetVolume = player.setVolume.bind(player);
    player.setVolume = (value) => {
      const requestedPercent = clamp(Number(value), 0, 100);

      if (internalWriteDepth > 0 || hasUserAudioIntent()) {
        persistPreferredVolume(requestedPercent / 100);
        return nativeSetVolume(requestedPercent);
      }

      const targetPercent = Math.round(readPreferredVolume() * 100);
      if (Math.abs(requestedPercent - targetPercent) > 1) {
        emitGuardEvent({
          event: "page-player-volume-blocked",
          requestedPercent,
          targetPercent
        });
      }

      return nativeSetVolume(targetPercent);
    };
    patchedPlayers.add(player);
  };

  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    configurable: true,
    enumerable: nativeVolume.enumerable,
    get() {
      return nativeVolume.get.call(this);
    },
    set(value) {
      const requestedVolume = clamp(Number(value), 0, 1);

      if (internalWriteDepth > 0 || hasUserAudioIntent()) {
        persistPreferredVolume(requestedVolume);
        return nativeVolume.set.call(this, requestedVolume);
      }

      const targetVolume = readPreferredVolume();
      if (Math.abs(requestedVolume - targetVolume) > 0.005) {
        emitGuardEvent({
          event: "page-media-volume-blocked",
          requestedVolume,
          targetVolume,
          currentTime: Number.isFinite(this.currentTime) ? Math.round(this.currentTime * 1000) / 1000 : 0
        });
      }

      return nativeVolume.set.call(this, targetVolume);
    }
  });

  Object.defineProperty(HTMLMediaElement.prototype, "muted", {
    configurable: true,
    enumerable: nativeMuted.enumerable,
    get() {
      return nativeMuted.get.call(this);
    },
    set(value) {
      const requestedMuted = Boolean(value);

      if (internalWriteDepth > 0 || hasUserAudioIntent()) {
        persistPreferredMuted(requestedMuted);
        return nativeMuted.set.call(this, requestedMuted);
      }

      const targetMuted = readPreferredMuted();
      if (requestedMuted !== targetMuted) {
        emitGuardEvent({
          event: "page-media-muted-blocked",
          requestedMuted,
          targetMuted
        });
      }

      return nativeMuted.set.call(this, targetMuted);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".ytp-volume-area, .ytp-volume-panel, .ytp-volume-slider, .ytp-mute-button, .ytp-volume-panel-handle")) {
      markUserAudioIntent(2600);
    }
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key.toLowerCase() === "m") {
      markUserAudioIntent(1800);
    }
  }, true);
  window.addEventListener(APPLY_EVENT, () => applyPreferredToPlayer("event"));
  window.setInterval(() => {
    patchMoviePlayer(getMoviePlayer());
  }, 1000);

  applyPreferredToPlayer("install");
})();`;

  void webFrame.executeJavaScript(guardScript, false).catch((error) => {
    pageAudioGuardInstalled = false;
    logAudioProbe("page-audio-guard-install-failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  });
}

function applyPageAudioGuard(reason: string) {
  installPageAudioGuard();
  window.dispatchEvent(new CustomEvent(PAGE_AUDIO_GUARD_APPLY_EVENT));
  logAudioProbe("page-audio-guard-requested", { reason });
}

function suppressPreferredVolumeCapture(durationMs = 1200) {
  suppressPreferredVolumeCaptureUntil = Date.now() + durationMs;
}

function markAudioControlIntent(durationMs = 1800) {
  audioControlIntentUntil = Date.now() + durationMs;
}

function hasRecentAudioControlIntent() {
  return Date.now() <= audioControlIntentUntil;
}

function withPreferredAudioWrite<T>(callback: () => T) {
  preferredAudioWriteDepth += 1;

  try {
    return callback();
  } finally {
    preferredAudioWriteDepth -= 1;
  }
}

function setNativeVolume(video: HTMLVideoElement, value: number) {
  mediaVolumeDescriptor?.set?.call(video, clamp(value, 0, 1));
}

function getNativeVolume(video: HTMLVideoElement) {
  return clamp(Number(mediaVolumeDescriptor?.get?.call(video) ?? DEFAULT_PLAYER_STATE.volume), 0, 1);
}

function setNativeMuted(video: HTMLVideoElement, value: boolean) {
  mediaMutedDescriptor?.set?.call(video, value);
}

function getNativeMuted(video: HTMLVideoElement) {
  return Boolean(mediaMutedDescriptor?.get?.call(video) ?? DEFAULT_PLAYER_STATE.isMuted);
}

function clearPreferredAudioReapplyTimeouts() {
  for (const timeoutId of preferredAudioReapplyTimeouts) {
    window.clearTimeout(timeoutId);
  }

  preferredAudioReapplyTimeouts = [];
}

function capturePreferredAudioState(video: HTMLVideoElement | null) {
  if (!video) {
    return;
  }

  preferredVolume = getNativeVolume(video);
  preferredMuted = getNativeMuted(video);
  persistPreferredAudioState();
}

function applyPreferredAudioState(video: HTMLVideoElement | null) {
  if (!video) {
    applyPageAudioGuard("no-video");
    return;
  }

  const nextVolume = clamp(preferredVolume, 0, 1);
  const previousVolume = getNativeVolume(video);
  const previousMuted = getNativeMuted(video);

  withPreferredAudioWrite(() => {
    if (Math.abs(previousVolume - nextVolume) > 0.001) {
      setNativeVolume(video, nextVolume);
    }

    if (previousMuted !== preferredMuted) {
      setNativeMuted(video, preferredMuted);
    }
  });

  if (Math.abs(previousVolume - nextVolume) > 0.001 || previousMuted !== preferredMuted) {
    rememberAudioEvent("preferred-audio-applied", video, {
      previousVolume,
      nextVolume,
      previousMuted,
      nextMuted: preferredMuted
    });
  }

  applyPageAudioGuard("preferred-state");
}

function hasPreferredAudioDrift(video: HTMLVideoElement) {
  return (
    Math.abs(getNativeVolume(video) - preferredVolume) > AUDIO_VOLUME_DRIFT_TOLERANCE ||
    getNativeMuted(video) !== preferredMuted
  );
}

function getAudioProbeSnapshot(video = activeVideo) {
  return {
    mediaKey: getMediaKey(video),
    title: getTrackTitle(),
    url: window.location.href,
    currentTime: Math.round(sanitizeNumber(video?.currentTime ?? 0) * 1000) / 1000,
    duration: Math.round(sanitizeNumber(video?.duration ?? 0) * 1000) / 1000,
    readyState: video?.readyState ?? null,
    paused: video?.paused ?? null,
    ended: video?.ended ?? null,
    volume: video ? Math.round(getNativeVolume(video) * 1000) / 1000 : preferredVolume,
    muted: video ? getNativeMuted(video) : preferredMuted,
    sinkId:
      video && "sinkId" in video && typeof video.sinkId === "string" ? video.sinkId : null
  };
}

function rememberAudioEvent(
  event: string,
  video: HTMLVideoElement | null = activeVideo,
  detail?: Record<string, unknown>
) {
  recentAudioEvents.push({
    at: new Date().toISOString(),
    performanceMs: Math.round(performance.now()),
    event,
    mediaKey: getMediaKey(video),
    url: window.location.href,
    currentTime: Math.round(sanitizeNumber(video?.currentTime ?? 0) * 1000) / 1000,
    duration: Math.round(sanitizeNumber(video?.duration ?? 0) * 1000) / 1000,
    readyState: video?.readyState ?? null,
    paused: video?.paused ?? null,
    volume: video ? Math.round(getNativeVolume(video) * 1000) / 1000 : preferredVolume,
    muted: video ? getNativeMuted(video) : preferredMuted,
    ...(detail ? { detail } : {})
  });

  if (recentAudioEvents.length > 120) {
    recentAudioEvents.splice(0, recentAudioEvents.length - 120);
  }
}

function logAudioProbe(event: string, payload: Record<string, unknown> = {}) {
  if (!audioProbeConfig?.enabled) {
    return;
  }

  console.info(
    `[youtube-tray][audio-probe] ${JSON.stringify({
      at: new Date().toISOString(),
      performanceMs: Math.round(performance.now()),
      event,
      ...getAudioProbeSnapshot(),
      ...payload
    })}`
  );
}

function applyAudioProbeVolume(video: HTMLVideoElement | null, reason: string) {
  if (!audioProbeConfig?.enabled || !video) {
    return;
  }

  const nextVolume = clamp(audioProbeConfig.volume, 0, 1);
  preferredVolume = nextVolume;
  preferredMuted = false;
  suppressPreferredVolumeCapture(1800);
  withPreferredAudioWrite(() => {
    setNativeMuted(video, false);
    setNativeVolume(video, nextVolume);
  });
  logAudioProbe("probe-volume-applied", { reason, targetVolume: nextVolume });
}

async function applyAudioProbeSink(video: HTMLVideoElement | null, reason: string) {
  if (!audioProbeConfig?.enabled || !video) {
    return;
  }

  const mediaKey = getMediaKey(video);

  if (mediaKey && mediaKey === audioProbeSinkAppliedKey) {
    return;
  }

  if (!("setSinkId" in video) || typeof video.setSinkId !== "function") {
    logAudioProbe("probe-sink-unsupported", { reason });
    return;
  }

  try {
    if (!navigator.mediaDevices?.enumerateDevices) {
      logAudioProbe("probe-sink-enumerate-unsupported", { reason });
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices.filter((device) => device.kind === "audiooutput");
    const sinkMatch = audioProbeConfig.sinkMatch.toLowerCase();
    const matchedDevice = audioOutputs.find((device) => device.label.toLowerCase().includes(sinkMatch));

    applyPreferredAudioState(video);
    logAudioProbe("probe-sink-devices", {
      reason,
      sinkMatch: audioProbeConfig.sinkMatch,
      audioOutputs: audioOutputs.map((device) => ({
        deviceId: device.deviceId,
        label: device.label,
        groupId: device.groupId
      }))
    });

    if (!matchedDevice) {
      logAudioProbe("probe-sink-missing", { reason, sinkMatch: audioProbeConfig.sinkMatch });
      return;
    }

    await video.setSinkId(matchedDevice.deviceId);
    audioProbeSinkAppliedKey = mediaKey;
    applyPreferredAudioState(video);
    logAudioProbe("probe-sink-applied", {
      reason,
      deviceId: matchedDevice.deviceId,
      label: matchedDevice.label
    });
  } catch (error) {
    logAudioProbe("probe-sink-failed", {
      reason,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function startAudioProbeLevelLog() {
  if (!audioProbeConfig?.enabled || audioProbeLevelTimer !== null) {
    return;
  }

  audioProbeLevelTimer = window.setInterval(() => {
    logAudioProbe("probe-level");
  }, audioProbeConfig.logIntervalMs);
}

function applyAudioProbe(video: HTMLVideoElement | null, reason: string) {
  if (!audioProbeConfig?.enabled || !video) {
    return;
  }

  applyAudioProbeVolume(video, reason);
  void applyAudioProbeSink(video, reason);
  startAudioProbeLevelLog();
}

function warmAudioOutput(video: HTMLVideoElement, reason: string) {
  if (
    activeVideo !== video ||
    video.paused ||
    video.ended ||
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return false;
  }

  const mediaKey = getMediaKey(video);

  if (mediaKey && mediaKey === lastAudioOutputWarmupKey) {
    return false;
  }

  const targetVolume = clamp(preferredVolume, 0, 1);
  const targetMuted = preferredMuted;

  try {
    applyPreferredAudioState(video);
    lastAudioOutputWarmupKey = mediaKey;
    logAudioProbe("audio-output-settled", {
      reason,
      targetMuted,
      targetVolume: Math.round(targetVolume * 100)
    });
  } catch (error) {
    logAudioProbe("audio-output-settle-failed", {
      reason,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }

  return true;
}

function scheduleAudioOutputWarmup(video: HTMLVideoElement, reason: string) {
  for (const delay of [80, 260, 700]) {
    window.setTimeout(() => {
      warmAudioOutput(video, reason);
    }, delay);
  }
}

function getMediaKey(video: HTMLVideoElement | null) {
  if (!video) {
    return "";
  }

  return [
    normalizeResumeUrl(window.location.href),
    video.currentSrc || video.src,
    Number.isFinite(video.duration) ? Math.floor(video.duration) : 0
  ].join("|");
}

function schedulePreferredAudioReapply(video: HTMLVideoElement) {
  clearPreferredAudioReapplyTimeouts();
  suppressPreferredVolumeCapture(5200);

  for (const delay of [0, 120, 360, 900, 1800, 3200, 4800]) {
    const timeoutId = window.setTimeout(() => {
      if (activeVideo !== video) {
        return;
      }

      applyPreferredAudioState(video);
    }, delay);

    preferredAudioReapplyTimeouts.push(timeoutId);
  }
}

function refreshMediaAudioState(video: HTMLVideoElement) {
  const mediaKey = getMediaKey(video);

  if (mediaKey === activeMediaKey) {
    return;
  }

  rememberAudioEvent("media-key-change", video, {
    previousMediaKey: activeMediaKey,
    nextMediaKey: mediaKey
  });
  activeMediaKey = mediaKey;
  applyPreferredAudioState(video);
  schedulePreferredAudioReapply(video);
  applyAudioProbe(video, "media-change");
  scheduleAudioOutputWarmup(video, "media-change");
}

function getVideoElement() {
  return document.querySelector("video");
}

function getNextButton() {
  return (
    document.querySelector<HTMLButtonElement>(".ytp-next-button") ??
    document.querySelector<HTMLButtonElement>('button[aria-label*="Next"]') ??
    document.querySelector<HTMLButtonElement>('a[aria-label*="Next"]')
  );
}

function getLikeButton() {
  const candidates = Array.from(
    document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>(
      [
        'segmented-like-dislike-button-view-model button',
        'like-button-view-model button',
        'ytd-toggle-button-renderer button',
        'button[aria-label]',
        'button[title]'
      ].join(", ")
    )
  );

  return candidates.find((candidate) => {
    const ariaLabel = candidate.getAttribute("aria-label")?.toLowerCase() ?? "";
    const title = candidate.getAttribute("title")?.toLowerCase() ?? "";
    const text = getTextContent(candidate).toLowerCase();
    const combined = `${ariaLabel} ${title} ${text}`;

    return (
      (combined.includes("like") || combined.includes("me gusta")) &&
      !combined.includes("dislike") &&
      !combined.includes("no me gusta")
    );
  }) ?? null;
}

function isLikeButtonActive(button: HTMLButtonElement | HTMLAnchorElement | null) {
  if (!button) {
    return false;
  }

  const ariaPressed = button.getAttribute("aria-pressed");
  const ariaLabel = button.getAttribute("aria-label")?.toLowerCase() ?? "";
  const title = button.getAttribute("title")?.toLowerCase() ?? "";

  return (
    ariaPressed === "true" ||
    button.classList.contains("style-default-active") ||
    button.closest(".style-default-active") !== null ||
    ariaLabel.includes("unlike") ||
    ariaLabel.includes("remove like") ||
    title.includes("unlike") ||
    title.includes("remove like")
  );
}

function getTextContent(element: Element | null | undefined) {
  return element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function getItemUrl(item: HTMLElement) {
  return (
    item.querySelector<HTMLAnchorElement>("a#wc-endpoint")?.href ??
    item.querySelector<HTMLAnchorElement>("a#thumbnail")?.href ??
    item.querySelector<HTMLAnchorElement>("a#video-title")?.href ??
    ""
  );
}

function isActiveUpcomingItem(item: HTMLElement, href: string) {
  return (
    item.hasAttribute("selected") ||
    item.getAttribute("selected") === "" ||
    item.querySelector('[aria-current="true"]') !== null ||
    normalizeResumeUrl(href) === normalizeResumeUrl(window.location.href)
  );
}

function getUpcomingItems() {
  const playlistItems = Array.from(document.querySelectorAll<HTMLElement>("ytd-playlist-panel-video-renderer"));
  const recommendationItems = Array.from(
    document.querySelectorAll<HTMLElement>(
      "ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer, ytd-item-section-renderer ytd-compact-video-renderer"
    )
  );
  const activePlaylistIndex = playlistItems.findIndex((item) => {
    const href = getItemUrl(item);
    return href ? isActiveUpcomingItem(item, href) : false;
  });
  const futurePlaylistItems =
    activePlaylistIndex >= 0 ? playlistItems.slice(activePlaylistIndex + 1) : playlistItems;
  const sourceItems = (futurePlaylistItems.length > 0 ? futurePlaylistItems : recommendationItems).slice(0, 12);
  const seenUrls = new Set<string>();
  const upcomingItems: UpcomingItem[] = [];
  const currentUrl = normalizeResumeUrl(window.location.href);

  for (const item of sourceItems) {
    const href = getItemUrl(item);
    const title = getTextContent(
      item.querySelector("#video-title") ??
        item.querySelector("yt-formatted-string#video-title") ??
        item.querySelector("h3 a")
    );

    if (!href || !title) {
      continue;
    }

    const normalizedHref = normalizeResumeUrl(href);

    if (!normalizedHref || normalizedHref === currentUrl || seenUrls.has(normalizedHref)) {
      continue;
    }

    seenUrls.add(normalizedHref);

    const subtitle = getTextContent(
      item.querySelector("#byline") ??
        item.querySelector("#channel-name") ??
        item.querySelector(".short-byline-text") ??
        item.querySelector("ytd-channel-name")
    );
    const durationLabel = getTextContent(
      item.querySelector("ytd-thumbnail-overlay-time-status-renderer #text") ??
        item.querySelector("badge-shape .badge-shape-wiz__text") ??
        item.querySelector(".ytd-thumbnail-overlay-time-status-renderer")
    );
    const thumbnailUrl =
      item.querySelector<HTMLImageElement>("img")?.src ||
      item.querySelector<HTMLImageElement>("img")?.getAttribute("src") ||
      null;

    upcomingItems.push({
      id: normalizedHref,
      title,
      subtitle,
      url: href,
      durationLabel,
      thumbnailUrl,
      isActive: isActiveUpcomingItem(item, href)
    });
  }

  return upcomingItems;
}

function isWatchPage() {
  return window.location.pathname === "/watch";
}

function ensurePlayerOnlyStyles() {
  if (document.getElementById(PLAYER_ONLY_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = PLAYER_ONLY_STYLE_ID;
  style.textContent = PLAYER_ONLY_STYLES;
  document.documentElement.append(style);
}

function syncPlayerOnlyLayout() {
  ensurePlayerOnlyStyles();

  const shouldUsePlayerOnlyLayout = isWatchPage();
  document.documentElement.classList.toggle(PLAYER_ONLY_CLASS, shouldUsePlayerOnlyLayout);
  document.body?.classList.toggle(PLAYER_ONLY_CLASS, shouldUsePlayerOnlyLayout);
}

function getMediaSessionMetadata() {
  const metadata = navigator.mediaSession?.metadata;

  return {
    title: metadata?.title?.trim() ?? "",
    artist: metadata?.artist?.trim() ?? "",
    artworkUrl: metadata?.artwork?.[0]?.src ?? null
  };
}

function getDocumentTitle() {
  return document.title.replace(/\s*-\s*YouTube$/, "").trim();
}

function getTrackTitle() {
  const mediaMetadata = getMediaSessionMetadata();

  if (mediaMetadata.title) {
    return mediaMetadata.title;
  }

  const heading =
    document.querySelector<HTMLElement>("h1.ytd-watch-metadata yt-formatted-string") ??
    document.querySelector<HTMLElement>("h1.title");

  return heading?.textContent?.trim() || getDocumentTitle() || DEFAULT_PLAYER_STATE.title;
}

function getTrackArtist() {
  const mediaMetadata = getMediaSessionMetadata();

  if (mediaMetadata.artist) {
    return mediaMetadata.artist;
  }

  const channel =
    document.querySelector<HTMLElement>("#owner #channel-name a") ??
    document.querySelector<HTMLElement>("ytd-channel-name a");

  return channel?.textContent?.trim() || DEFAULT_PLAYER_STATE.artist;
}

function getDisplayAudioState(video: HTMLVideoElement | null) {
  if (!video) {
    return {
      volume: preferredVolume,
      isMuted: preferredMuted
    };
  }

  if (Date.now() < suppressPreferredVolumeCaptureUntil) {
    return {
      volume: preferredVolume,
      isMuted: preferredMuted
    };
  }

  return {
    volume: getNativeVolume(video),
    isMuted: getNativeMuted(video)
  };
}

function buildState(status: PlayerStatus, error: string | null): PlayerState {
  const video = getVideoElement();
  const metadata = getMediaSessionMetadata();
  const nextButton = getNextButton();
  const likeButton = getLikeButton();

  if (video) {
    applyPreferredAudioState(video);
  }

  const audioState = getDisplayAudioState(video);

  return {
    status,
    title: getTrackTitle(),
    artist: getTrackArtist(),
    currentTime: Math.floor(sanitizeNumber(video?.currentTime ?? 0)),
    duration: Math.floor(sanitizeNumber(video?.duration ?? 0)),
    videoWidth: Math.floor(sanitizeNumber(video?.videoWidth ?? 0)),
    videoHeight: Math.floor(sanitizeNumber(video?.videoHeight ?? 0)),
    volume: audioState.volume,
    isMuted: audioState.isMuted,
    isPlaying: Boolean(video && !video.paused && !video.ended),
    isLiked: isLikeButtonActive(likeButton),
    canGoNext: Boolean(nextButton && !nextButton.hasAttribute("disabled")),
    hasVideo: Boolean(video),
    url: window.location.href,
    pageTitle: document.title,
    artworkUrl: metadata.artworkUrl,
    upcomingItems: getUpcomingItems(),
    error
  };
}

function ensureWatchPagePlayback(video: HTMLVideoElement) {
  const currentUrl = normalizeResumeUrl(window.location.href);

  if (currentUrl !== autoplayWatchUrl) {
    autoplayWatchUrl = currentUrl;
    autoplayWatchAttempts = 0;
  }

  if (
    !isWatchPage() ||
    !video.paused ||
    video.ended ||
    pendingResumePlayback !== null ||
    sanitizeNumber(video.currentTime) > 2.5 ||
    autoplayWatchAttempts >= 4
  ) {
    return;
  }

  autoplayWatchAttempts += 1;

  window.setTimeout(() => {
    if (
      normalizeResumeUrl(window.location.href) !== currentUrl ||
      !isWatchPage() ||
      !activeVideo ||
      activeVideo !== video ||
      !video.paused ||
      video.ended ||
      sanitizeNumber(video.currentTime) > 2.5
    ) {
      return;
    }

    void video.play().catch(() => {
      document.querySelector<HTMLButtonElement>(".ytp-play-button")?.click();
    });
  }, 120 * autoplayWatchAttempts);
}

function restoreAfterQuietSeek(video: HTMLVideoElement, shouldResumePlaying: boolean) {
  if (activeVideo !== video) {
    return;
  }

  applyPreferredAudioState(video);
  rememberAudioEvent("quiet-seek-restore", video, { shouldResumePlaying });

  if (shouldResumePlaying) {
    void video.play().catch(() => {
      document.querySelector<HTMLButtonElement>(".ytp-play-button")?.click();
    });
  }

  emitState();
}

function seekQuietly(video: HTMLVideoElement, targetTime: number, shouldResumePlaying: boolean) {
  rememberAudioEvent("quiet-seek-start", video, {
    targetTime,
    shouldResumePlaying
  });

  withPreferredAudioWrite(() => {
    setNativeMuted(video, true);
    setNativeVolume(video, 0);
  });

  video.pause();

  let finished = false;
  const finish = () => {
    if (finished) {
      return;
    }

    finished = true;
    video.removeEventListener("seeked", finish);
    window.setTimeout(() => restoreAfterQuietSeek(video, shouldResumePlaying), 140);
  };

  video.addEventListener("seeked", finish, { once: true });
  video.currentTime = targetTime;
  window.setTimeout(finish, 900);
}

function tryResumePlayback() {
  if (!pendingResumePlayback) {
    return;
  }

  if (normalizeResumeUrl(window.location.href) !== normalizeResumeUrl(pendingResumePlayback.url)) {
    return;
  }

  const video = getVideoElement();

  if (!video) {
    return;
  }

  const targetTime = clamp(
    pendingResumePlayback.currentTime,
    0,
    sanitizeNumber(video.duration || pendingResumePlayback.currentTime)
  );
  const shouldResumePlaying = pendingResumePlayback.shouldResumePlaying;

  pendingResumePlayback = null;

  if (Math.abs(video.currentTime - targetTime) > 1) {
    seekQuietly(video, targetTime, shouldResumePlaying);
    return;
  }

  if (shouldResumePlaying && video.paused) {
    void video.play().catch(() => {
      document.querySelector<HTMLButtonElement>(".ytp-play-button")?.click();
    });
  }

  window.setTimeout(() => emitState(), 50);
}

function refreshPlayerLayout() {
  syncPlayerOnlyLayout();
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  if (document.body) {
    document.body.scrollTop = 0;
  }
  window.dispatchEvent(new Event("resize"));

  const video = getVideoElement();

  if (video) {
    video.style.willChange = "transform";
    window.requestAnimationFrame(() => {
      video.style.willChange = "";
      emitState();
    });
    return;
  }

  emitState();
}

function emitState(status = currentStatus, error = lastError) {
  syncPlayerOnlyLayout();
  tryResumePlayback();

  const state = buildState(status, error);
  const serialized = JSON.stringify(state);

  if (serialized === lastSentState) {
    return;
  }

  lastSentState = serialized;
  ipcRenderer.send("youtube:state", state);
}

function updateStatus(status: PlayerStatus, error: string | null = null) {
  currentStatus = status;
  lastError = error;
  emitState(status, error);
}

function handleVideoEvent(event?: Event) {
  syncPlayerOnlyLayout();
  currentStatus = getVideoElement() ? "ready" : "idle";
  lastError = null;

  if (activeVideo && event?.type && event.type !== "timeupdate") {
    rememberAudioEvent(`media-${event.type}`, activeVideo);
  }

  if (activeVideo) {
    refreshMediaAudioState(activeVideo);
  }

  if (activeVideo && !hasRecentAudioControlIntent() && hasPreferredAudioDrift(activeVideo)) {
    rememberAudioEvent("preferred-audio-drift", activeVideo);
    applyPreferredAudioState(activeVideo);
  }

  if (activeVideo && event?.type === "volumechange") {
    if (Date.now() < suppressPreferredVolumeCaptureUntil) {
      // Ignore our own reapply writes, but still clamp YouTube's larger external jumps.
      if (hasPreferredAudioDrift(activeVideo)) {
        applyPreferredAudioState(activeVideo);
      }
    } else if (hasRecentAudioControlIntent()) {
      capturePreferredAudioState(activeVideo);
    } else if (
      Math.abs(getNativeVolume(activeVideo) - preferredVolume) > 0.01 ||
      getNativeMuted(activeVideo) !== preferredMuted
    ) {
      suppressPreferredVolumeCapture(1200);
      applyPreferredAudioState(activeVideo);
    }
  }

  if (activeVideo) {
    logAudioProbe("video-event", { type: event?.type ?? "poll" });

    if (event?.type === "play" || event?.type === "canplay" || event?.type === "loadedmetadata") {
      scheduleAudioOutputWarmup(activeVideo, event.type);
    }
  }

  if (activeVideo) {
    ensureWatchPagePlayback(activeVideo);
  }
  tryResumePlayback();
  emitState();
}

function detachVideoEvents() {
  clearPreferredAudioReapplyTimeouts();
  lastAudioOutputWarmupKey = "";
  audioProbeSinkAppliedKey = "";

  if (!activeVideo) {
    return;
  }

  for (const eventName of VIDEO_EVENTS) {
    activeVideo.removeEventListener(eventName, handleVideoEvent);
  }

  activeVideo = null;
}

function attachVideoEvents() {
  const nextVideo = getVideoElement();

  if (nextVideo === activeVideo) {
    return;
  }

  detachVideoEvents();

  if (!nextVideo) {
    updateStatus(document.readyState === "complete" ? "idle" : "loading");
    return;
  }

  activeVideo = nextVideo;
  activeMediaKey = getMediaKey(activeVideo);
  rememberAudioEvent("video-attached", activeVideo);
  applyPreferredAudioState(activeVideo);
  schedulePreferredAudioReapply(activeVideo);
  applyAudioProbe(activeVideo, "attach");
  scheduleAudioOutputWarmup(activeVideo, "attach");

  for (const eventName of VIDEO_EVENTS) {
    activeVideo.addEventListener(eventName, handleVideoEvent);
  }

  ensureWatchPagePlayback(activeVideo);
  tryResumePlayback();
  updateStatus("ready");
}

function scheduleAttachVideoEvents() {
  if (scheduledScan) {
    return;
  }

  scheduledScan = true;
  window.setTimeout(() => {
    scheduledScan = false;
    attachVideoEvents();
    syncPlayerOnlyLayout();
    emitState();
  }, 50);
}

function clickNextButton() {
  const nextButton = getNextButton();

  if (!nextButton || nextButton.hasAttribute("disabled")) {
    return;
  }

  nextButton.click();
}

function likeCurrentVideo() {
  const likeButton = getLikeButton();

  if (!likeButton || isLikeButtonActive(likeButton)) {
    return;
  }

  likeButton.click();
  window.setTimeout(() => emitState(), 250);
  window.setTimeout(() => emitState(), 900);
}

function togglePlayPause() {
  const video = getVideoElement();

  if (!video) {
    return;
  }

  if (video.paused || video.ended) {
    void video.play().catch(() => {
      document.querySelector<HTMLButtonElement>(".ytp-play-button")?.click();
    });
    return;
  }

  video.pause();
}

function setVolume(value: number) {
  const video = getVideoElement();

  markAudioControlIntent();
  preferredMuted = false;
  preferredVolume = clamp(value, 0, 1);
  persistPreferredAudioState();
  suppressPreferredVolumeCapture();

  if (video) {
    withPreferredAudioWrite(() => {
      setNativeMuted(video, false);
      setNativeVolume(video, preferredVolume);
    });
  }

  logAudioProbe("app-volume-set", { targetVolume: preferredVolume });
}

function seekTo(value: number) {
  const video = getVideoElement();

  if (!video) {
    return;
  }

  video.currentTime = clamp(value, 0, sanitizeNumber(video.duration));
}

function handleControlMessage(message: PlayerControlMessage) {
  switch (message.type) {
    case "command": {
      const video = getVideoElement();

      switch (message.command) {
        case "play-pause":
          togglePlayPause();
          break;
        case "next":
          clickNextButton();
          break;
        case "like":
          likeCurrentVideo();
          break;
        case "volume-up":
          markAudioControlIntent();
          setVolume(preferredVolume + 0.08);
          break;
        case "volume-down":
          markAudioControlIntent();
          setVolume(preferredVolume - 0.08);
          break;
        case "mute":
          markAudioControlIntent();
          preferredMuted = !preferredMuted;
          persistPreferredAudioState();
          suppressPreferredVolumeCapture();

          if (video) {
            withPreferredAudioWrite(() => {
              setNativeMuted(video, preferredMuted);
            });
          }
          break;
      }
      break;
    }
    case "set-volume":
      setVolume(message.value);
      break;
    case "seek-to":
      seekTo(message.value);
      break;
  }

  window.setTimeout(() => emitState(), 25);
}

ipcRenderer.on("youtube:player-control", (_event, message: PlayerControlMessage) => {
  handleControlMessage(message);
});

ipcRenderer.on("youtube:request-state", () => {
  emitState();
});

ipcRenderer.on(
  "youtube:mark-audio-glitch",
  (_event, marker: { markerId: string; source: string; at: string }) => {
    const payload = {
      markerId: marker.markerId,
      source: marker.source,
      requestedAt: marker.at,
      performanceMs: Math.round(performance.now()),
      ...getAudioProbeSnapshot(),
      recentAudioEvents: recentAudioEvents.slice(-80)
    };

    console.info(
      `[youtube-tray][audio-glitch-marker] ${JSON.stringify({
        at: new Date().toISOString(),
        ...payload
      })}`
    );
    ipcRenderer.send("youtube:audio-glitch-marker", payload);
  }
);

ipcRenderer.on("youtube:audio-probe-config", (_event, config: AudioProbeConfig) => {
  audioProbeConfig = {
    enabled: config.enabled === true,
    sinkMatch: String(config.sinkMatch || "CABLE Input"),
    volume: clamp(Number(config.volume), 0, 1),
    logIntervalMs: clamp(Math.round(Number(config.logIntervalMs) || 250), 100, 5000)
  };

  logAudioProbe("probe-config-received", {
    sinkMatch: audioProbeConfig.sinkMatch,
    volume: audioProbeConfig.volume,
    logIntervalMs: audioProbeConfig.logIntervalMs
  });
  applyAudioProbe(activeVideo, "config");
  emitState();
});

ipcRenderer.on("youtube:resume-playback", (_event, message: ResumePlaybackMessage) => {
  pendingResumePlayback = message;
  logAudioProbe("resume-playback-received", {
    url: message.url,
    currentTime: message.currentTime,
    shouldResumePlaying: message.shouldResumePlaying
  });
  tryResumePlayback();
});

ipcRenderer.on("youtube:force-layout", () => {
  window.setTimeout(() => {
    refreshPlayerLayout();
    if (activeVideo) {
      ensureWatchPagePlayback(activeVideo);
    }
  }, 0);
});

window.addEventListener("message", (event) => {
  if (event.source !== window) {
    return;
  }

  const data = event.data;

  if (!data || typeof data !== "object" || data.source !== "youtube-tray-audio-guard") {
    return;
  }

  const guardEvent = typeof data.event === "string" ? data.event : "page-audio-guard-event";
  const detail = Object.fromEntries(
    Object.entries(data as Record<string, unknown>).filter(([key]) => key !== "source" && key !== "event")
  );

  logAudioProbe(guardEvent, detail);

  if (guardEvent.includes("blocked")) {
    rememberAudioEvent(guardEvent, activeVideo, detail);
  }
});

installPageAudioGuard();

window.addEventListener("DOMContentLoaded", () => {
  updateStatus("loading");
  syncPlayerOnlyLayout();
  installPageAudioGuard();
  applyPageAudioGuard("dom-content-loaded");
  logAudioProbe("probe-config-from-env", audioProbeConfig ?? {});
  attachVideoEvents();

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (
      target.closest(
        ".ytp-volume-area, .ytp-volume-panel, .ytp-volume-slider, .ytp-mute-button, .ytp-volume-panel-handle"
      )
    ) {
      markAudioControlIntent(2200);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key.toLowerCase() === "m") {
      markAudioControlIntent(1500);
    }
  });

  mutationObserver = new MutationObserver(() => {
    scheduleAttachVideoEvents();
  });

  mutationObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.setInterval(() => {
    attachVideoEvents();
    emitState();
  }, 1000);
});

window.addEventListener("load", () => {
  attachVideoEvents();
  syncPlayerOnlyLayout();
  emitState();
});

document.addEventListener("fullscreenchange", () => {
  ipcRenderer.send("youtube:fullscreen-change", {
    active: Boolean(document.fullscreenElement)
  });
  window.setTimeout(() => {
    refreshPlayerLayout();
  }, 0);
});
