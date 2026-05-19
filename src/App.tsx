import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";
import type { FormEvent, WheelEvent } from "react";
import { DEFAULT_PLAYER_STATE, DEFAULT_SHELL_STATE, shellApi } from "./shell";
import type { PlayerState, ShellState, UpcomingItem, VideoBounds } from "./types";

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function createMusicSearchQuery(playerState: PlayerState) {
  const title = playerState.title.trim();
  const artist = playerState.artist.trim();

  if (!title || title === DEFAULT_PLAYER_STATE.title || title === "YouTube") {
    return "";
  }

  if (/\s[-–—]\s/.test(title)) {
    return title;
  }

  const normalizedArtist = artist
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\s*VEVO$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();

  if (!normalizedArtist || normalizedArtist === DEFAULT_PLAYER_STATE.artist) {
    return title;
  }

  return title.toLowerCase().includes(normalizedArtist.toLowerCase())
    ? title
    : `${normalizedArtist} ${title}`;
}

function createSpotifySearchUrl(query: string) {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

function createAppleMusicSearchUrl(query: string) {
  const url = new URL("https://beta.music.apple.com/us/search");
  url.searchParams.set("term", query);
  return url.toString();
}

export default function App() {
  const [shellState, setShellState] = useState<ShellState>(DEFAULT_SHELL_STATE);
  const [playerState, setPlayerState] = useState<PlayerState>(DEFAULT_PLAYER_STATE);
  const [searchQuery, setSearchQuery] = useState("");
  const shellRef = useRef<HTMLDivElement | null>(null);
  const controlPanelRef = useRef<HTMLElement | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const videoSurfaceRef = useRef<HTMLDivElement | null>(null);
  const deferredPlayerState = useDeferredValue(playerState);

  useEffect(() => {
    let isMounted = true;

    void shellApi.getShellState().then((state) => {
      if (isMounted) {
        setShellState(state);
      }
    });

    void shellApi.getPlayerState().then((state) => {
      if (isMounted) {
        setPlayerState(state);
      }
    });

    const unsubscribeState = shellApi.onShellStateChange((state) => {
      startTransition(() => {
        setShellState(state);
      });
    });

    const unsubscribePlayer = shellApi.onPlayerStateChange((state) => {
      startTransition(() => {
        setPlayerState(state);
      });
    });

    return () => {
      isMounted = false;
      unsubscribeState();
      unsubscribePlayer();
    };
  }, []);

  const syncVideoBounds = useEffectEvent(() => {
    if (shellState.mode !== "full" || !videoStageRef.current) {
      void shellApi.setVideoBounds(null);
      return;
    }

    if (shellState.isVideoFullscreen) {
      return;
    }

    const rect = videoStageRef.current.getBoundingClientRect();
    const hasVideoAspectRatio = playerState.videoWidth > 0 && playerState.videoHeight > 0;
    const videoAspectRatio = hasVideoAspectRatio ? playerState.videoWidth / playerState.videoHeight : 0;
    const stageAspectRatio = rect.height > 0 ? rect.width / rect.height : 0;

    let nextX = rect.left;
    let nextY = rect.top;
    let nextWidth = rect.width;
    let nextHeight = rect.height;

    if (videoAspectRatio > 0 && stageAspectRatio > 0) {
      if (stageAspectRatio > videoAspectRatio) {
        nextHeight = rect.height;
        nextWidth = nextHeight * videoAspectRatio;
        nextX = rect.left + (rect.width - nextWidth) / 2;
      } else {
        nextWidth = rect.width;
        nextHeight = nextWidth / videoAspectRatio;
        nextY = rect.top + (rect.height - nextHeight) / 2;
      }
    }

    const bounds: VideoBounds | null =
      nextWidth > 0 && nextHeight > 0
        ? {
            x: Math.round(nextX),
            y: Math.round(nextY),
            width: Math.round(nextWidth),
            height: Math.round(nextHeight)
          }
        : null;

    void shellApi.setVideoBounds(bounds);
  });

  useEffect(() => {
    const scheduleBoundsSync = () => {
      window.requestAnimationFrame(() => {
        syncVideoBounds();
      });
    };

    scheduleBoundsSync();

    if (shellState.mode !== "full" || !videoStageRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleBoundsSync();
    });

    resizeObserver.observe(videoStageRef.current);
    window.addEventListener("resize", scheduleBoundsSync);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleBoundsSync);
    };
  }, [
    playerState.videoHeight,
    playerState.videoWidth,
    shellState.isVideoFullscreen,
    shellState.mode,
    syncVideoBounds
  ]);

  useEffect(() => {
    if (shellState.mode !== "full") {
      void shellApi.setVideoBounds(null);
    }
  }, [shellState.mode]);

  const displayVolume = deferredPlayerState.isMuted ? 0 : deferredPlayerState.volume;
  const progressValue = Math.min(
    deferredPlayerState.currentTime,
    Math.max(deferredPlayerState.duration, deferredPlayerState.currentTime)
  );

  const title =
    deferredPlayerState.title.trim() || DEFAULT_PLAYER_STATE.title;
  const musicSearchQuery = createMusicSearchQuery(deferredPlayerState);
  const upcomingItems = deferredPlayerState.upcomingItems.slice(0, 8);
  const isSizeLocked = shellState.sizeLockByMode[shellState.mode];
  const videoAspectRatio =
    deferredPlayerState.videoWidth > 0 && deferredPlayerState.videoHeight > 0
      ? `${deferredPlayerState.videoWidth} / ${deferredPlayerState.videoHeight}`
      : "16 / 9";
  const transportControls = (
    <>
      <button
        className="icon-button"
        type="button"
        onClick={() => void shellApi.sendPlayerCommand("play-pause")}
      >
        {deferredPlayerState.isPlaying ? "Pause" : "Play"}
      </button>
      <button
        className="icon-button"
        type="button"
        disabled={!deferredPlayerState.canGoNext}
        onClick={() => void shellApi.sendPlayerCommand("next")}
      >
        Next
      </button>
      <button
        className="icon-button"
        type="button"
        onClick={() => void shellApi.sendPlayerCommand("mute")}
      >
        {deferredPlayerState.isMuted ? "Unmute" : "Mute"}
      </button>
    </>
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      return;
    }

    void shellApi.searchYoutube(trimmedQuery);
  };

  const openUpcomingItem = (item: UpcomingItem) => {
    void shellApi.openYoutubeUrl(item.url);
  };

  const likeCurrentVideo = () => {
    void shellApi.sendPlayerCommand("like");
  };

  const openMusicSearch = (service: "spotify" | "apple-music") => {
    if (!musicSearchQuery) {
      return;
    }

    const url =
      service === "spotify"
        ? createSpotifySearchUrl(musicSearchQuery)
        : createAppleMusicSearchUrl(musicSearchQuery);

    void shellApi.openExternalUrl(url);
  };

  const sourceActionControls = (
    <>
      <button
        className="music-link-button music-link-button--spotify"
        type="button"
        disabled={!musicSearchQuery}
        aria-label="Open current song in Spotify"
        title="Open current song in Spotify"
        onClick={() => openMusicSearch("spotify")}
      >
        Spotify
      </button>
      <button
        className="music-link-button music-link-button--apple"
        type="button"
        disabled={!musicSearchQuery}
        aria-label="Open current song in Apple Music"
        title="Open current song in Apple Music"
        onClick={() => openMusicSearch("apple-music")}
      >
        Apple
      </button>
      <button
        className={`heart-button${deferredPlayerState.isLiked ? " heart-button--active" : ""}`}
        type="button"
        aria-label={deferredPlayerState.isLiked ? "Current video liked" : "Like current video"}
        title={deferredPlayerState.isLiked ? "Current video liked" : "Like current video"}
        onClick={likeCurrentVideo}
      >
        {deferredPlayerState.isLiked ? "♥" : "♡"}
      </button>
      <button className="ghost-button" type="button" onClick={() => void shellApi.openYoutubeHome()}>
        Browse
      </button>
    </>
  );

  const searchActions =
    shellState.mode === "mini" ? (
      <>
        <div className="search-action-row">{sourceActionControls}</div>
        <div className="search-action-row search-action-row--transport">{transportControls}</div>
      </>
    ) : (
      <>
        {sourceActionControls}
        {transportControls}
      </>
    );

  const handleShellWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (shellState.mode !== "mini" || !shellRef.current) {
      return;
    }

    const scrollContainer = shellRef.current;

    if (scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
      return;
    }

    event.preventDefault();
    scrollContainer.scrollTop += event.deltaY;
  };

  const handleControlPanelWheel = (event: WheelEvent<HTMLElement>) => {
    if (shellState.mode !== "full" || !controlPanelRef.current) {
      return;
    }

    const scrollContainer = controlPanelRef.current;

    if (scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
      return;
    }

    event.preventDefault();
    scrollContainer.scrollTop += event.deltaY;
  };

  return (
    <div
      className={`app app--${shellState.mode}${shellState.isVideoFullscreen ? " app--video-fullscreen" : ""}`}
    >
      <div className="backdrop" />
      <div ref={shellRef} className="shell" onWheelCapture={handleShellWheel}>
        <header className="topbar">
          {shellState.mode === "mini" ? (
            <div>
              <p className="eyebrow">Persistent YouTube Session</p>
              <h1>Mini player</h1>
            </div>
          ) : (
            <div className="topbar-copy topbar-copy--full">
              <h2 className="topbar-title">{title}</h2>
            </div>
          )}

          <div className="window-actions">
            {shellState.mode === "full" ? (
              <button
                className={`ghost-button${isSizeLocked ? " ghost-button--active" : ""}`}
                onClick={() => void shellApi.toggleSizeLock()}
              >
                Lock Size {isSizeLocked ? "On" : "Off"}
              </button>
            ) : null}
            <button className="ghost-button" onClick={() => void shellApi.toggleMode()}>
              {shellState.mode === "mini" ? "Open Full" : "Back to Mini"}
            </button>
            <button className="ghost-button" onClick={() => void shellApi.hideWindow()}>
              Hide to Tray
            </button>
            {shellState.mode === "mini" ? (
              <button
                className={`ghost-button${isSizeLocked ? " ghost-button--active" : ""}`}
                onClick={() => void shellApi.toggleSizeLock()}
              >
                Lock Size {isSizeLocked ? "On" : "Off"}
              </button>
            ) : null}
          </div>
        </header>

        <main className="content">
          {shellState.mode === "full" ? (
            <section className="video-panel video-panel--surface">
              <div
                ref={videoStageRef}
                className="video-stage"
                style={{ aspectRatio: videoAspectRatio }}
              >
                <div ref={videoSurfaceRef} className="video-surface-anchor" />
              </div>
            </section>
          ) : null}

          <section ref={controlPanelRef} className="control-panel" onWheelCapture={handleControlPanelWheel}>
            <section className="search-panel">
              <form className="search-form" onSubmit={submitSearch}>
                <input
                  className="search-input"
                  type="search"
                  value={searchQuery}
                  placeholder="Search YouTube videos or playlists"
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <div className="search-actions">
                  {searchActions}
                </div>
              </form>
            </section>

            {shellState.mode === "mini" ? (
              <div className="track-meta">
                <h2>{title}</h2>
              </div>
            ) : null}

            <div className="slider-block">
              <div className="slider-copy">
                <span>Progress</span>
                <span>
                  {formatSeconds(deferredPlayerState.currentTime)} /{" "}
                  {formatSeconds(deferredPlayerState.duration)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(deferredPlayerState.duration, 1)}
                value={progressValue}
                disabled={deferredPlayerState.duration === 0}
                onChange={(event) => void shellApi.seekPlayer(Number(event.target.value))}
              />
            </div>

            <div className="slider-block">
              <div className="slider-copy">
                <span>App volume</span>
                <span>{Math.round(displayVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(displayVolume * 100)}
                onChange={(event) => void shellApi.setPlayerVolume(Number(event.target.value) / 100)}
              />
            </div>

            <section className="queue-panel">
              {upcomingItems.length > 0 ? (
                <div className="queue-list">
                  {upcomingItems.map((item) => (
                    <button
                      key={item.id}
                      className={`queue-item${item.isActive ? " queue-item--active" : ""}`}
                      type="button"
                      onClick={() => openUpcomingItem(item)}
                    >
                      <span className="queue-item-row">
                        <span className="queue-item-title">{item.title}</span>
                        {item.durationLabel ? (
                          <span className="queue-item-duration">{item.durationLabel}</span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="section-note">
                  No queue is exposed on this page yet. Search or open a playlist to populate this list.
                </p>
              )}
            </section>
          </section>
        </main>
      </div>
    </div>
  );
}
