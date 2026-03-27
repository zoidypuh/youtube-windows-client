import { ipcRenderer } from "electron";

type PlayerCommand = "play-pause" | "next" | "volume-up" | "volume-down" | "mute";
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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

function buildState(status: PlayerStatus, error: string | null): PlayerState {
  const video = getVideoElement();
  const metadata = getMediaSessionMetadata();
  const nextButton = getNextButton();

  return {
    status,
    title: getTrackTitle(),
    artist: getTrackArtist(),
    currentTime: Math.floor(sanitizeNumber(video?.currentTime ?? 0)),
    duration: Math.floor(sanitizeNumber(video?.duration ?? 0)),
    videoWidth: Math.floor(sanitizeNumber(video?.videoWidth ?? 0)),
    videoHeight: Math.floor(sanitizeNumber(video?.videoHeight ?? 0)),
    volume: clamp(video?.volume ?? DEFAULT_PLAYER_STATE.volume, 0, 1),
    isMuted: video?.muted ?? false,
    isPlaying: Boolean(video && !video.paused && !video.ended),
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

  if (Math.abs(video.currentTime - targetTime) > 1) {
    video.currentTime = targetTime;
  }

  if (pendingResumePlayback.shouldResumePlaying && video.paused) {
    void video.play().catch(() => {
      document.querySelector<HTMLButtonElement>(".ytp-play-button")?.click();
    });
  }

  pendingResumePlayback = null;
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

function handleVideoEvent() {
  syncPlayerOnlyLayout();
  currentStatus = getVideoElement() ? "ready" : "idle";
  lastError = null;
  if (activeVideo) {
    ensureWatchPagePlayback(activeVideo);
  }
  tryResumePlayback();
  emitState();
}

function detachVideoEvents() {
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

  if (!video) {
    return;
  }

  video.muted = false;
  video.volume = clamp(value, 0, 1);
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
        case "volume-up":
          setVolume((video?.volume ?? 0.5) + 0.08);
          break;
        case "volume-down":
          setVolume((video?.volume ?? 0.5) - 0.08);
          break;
        case "mute":
          if (video) {
            video.muted = !video.muted;
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

ipcRenderer.on("youtube:resume-playback", (_event, message: ResumePlaybackMessage) => {
  pendingResumePlayback = message;
  tryResumePlayback();
});

ipcRenderer.on("youtube:force-layout", () => {
  window.setTimeout(() => {
    refreshPlayerLayout();
  }, 0);
});

window.addEventListener("DOMContentLoaded", () => {
  updateStatus("loading");
  syncPlayerOnlyLayout();
  attachVideoEvents();

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
