import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState
} from "react";
import { DEFAULT_PLAYER_STATE, DEFAULT_SHELL_STATE, shellApi } from "./shell";
import type { PlayerState, ShellState, VideoBounds } from "./types";

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export default function App() {
  const [shellState, setShellState] = useState<ShellState>(DEFAULT_SHELL_STATE);
  const [playerState, setPlayerState] = useState<PlayerState>(DEFAULT_PLAYER_STATE);
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
    if (shellState.mode !== "full" || shellState.isVideoFullscreen || !videoSurfaceRef.current) {
      void shellApi.setVideoBounds(null);
      return;
    }

    const rect = videoSurfaceRef.current.getBoundingClientRect();
    const bounds: VideoBounds | null =
      rect.width > 0 && rect.height > 0
        ? {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
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

    if (shellState.mode !== "full" || !videoSurfaceRef.current) {
      return () => {
        void shellApi.setVideoBounds(null);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      scheduleBoundsSync();
    });

    resizeObserver.observe(videoSurfaceRef.current);
    window.addEventListener("resize", scheduleBoundsSync);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleBoundsSync);
      void shellApi.setVideoBounds(null);
    };
  }, [shellState.isVideoFullscreen, shellState.mode, syncVideoBounds]);

  const displayVolume = deferredPlayerState.isMuted ? 0 : deferredPlayerState.volume;
  const progressValue = Math.min(
    deferredPlayerState.currentTime,
    Math.max(deferredPlayerState.duration, deferredPlayerState.currentTime)
  );

  let statusCopy = "Loading the persistent YouTube session.";
  if (deferredPlayerState.status === "ready") {
    statusCopy = deferredPlayerState.hasVideo
      ? "Connected to the live YouTube player."
      : "YouTube is open, but there is no active video element yet.";
  } else if (deferredPlayerState.status === "idle") {
    statusCopy = "YouTube is loaded. Pick a recommendation or open a watch page in full mode.";
  } else if (deferredPlayerState.status === "error") {
    statusCopy = deferredPlayerState.error ?? "The embedded YouTube view hit a load error.";
  }

  const title =
    deferredPlayerState.title.trim() || DEFAULT_PLAYER_STATE.title;
  const artist =
    deferredPlayerState.artist.trim() || DEFAULT_PLAYER_STATE.artist;

  return (
    <div
      className={`app app--${shellState.mode}${shellState.isVideoFullscreen ? " app--video-fullscreen" : ""}`}
    >
      <div className="backdrop" />
      <div className="shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Persistent YouTube Session</p>
            <h1>{shellState.mode === "mini" ? "Mini player" : "Full player"}</h1>
          </div>

          <div className="window-actions">
            <button className="ghost-button" onClick={() => void shellApi.toggleMode()}>
              {shellState.mode === "mini" ? "Open Full" : "Back to Mini"}
            </button>
            <button className="ghost-button" onClick={() => void shellApi.hideWindow()}>
              Hide to Tray
            </button>
          </div>
        </header>

        <main className="content">
          {shellState.mode === "full" ? (
            <section className="video-panel video-panel--surface">
              <div className="video-stage">
                <div ref={videoSurfaceRef} className="video-surface-anchor" />
              </div>
            </section>
          ) : null}

          <section className="control-panel">
            <div className="track-meta">
              <p className="label">Now playing</p>
              <h2>{title}</h2>
              <p className="supporting">{artist}</p>
              <p className="note">{statusCopy}</p>
              {shellState.mode === "full" ? (
                <p className="note">
                  Watch pages now collapse down to the player, and the YouTube fullscreen button
                  should take over the whole app window.
                </p>
              ) : null}
              <p className="meta-line">{deferredPlayerState.url}</p>
            </div>

            <div className="transport">
              <button className="icon-button" onClick={() => void shellApi.sendPlayerCommand("play-pause")}>
                {deferredPlayerState.isPlaying ? "Pause" : "Play"}
              </button>
              <button
                className="icon-button"
                disabled={!deferredPlayerState.canGoNext}
                onClick={() => void shellApi.sendPlayerCommand("next")}
              >
                Next
              </button>
              <button className="icon-button" onClick={() => void shellApi.sendPlayerCommand("mute")}>
                {deferredPlayerState.isMuted ? "Unmute" : "Mute"}
              </button>
            </div>

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
          </section>
        </main>

        <footer className="footer">
          <div className="status-line">
            <span
              className={`status-dot ${deferredPlayerState.isPlaying ? "status-dot--live" : ""}`}
            />
            <span>
              {deferredPlayerState.isPlaying
                ? "Playback active"
                : deferredPlayerState.status === "loading"
                  ? "Player loading"
                  : "Playback paused"}
            </span>
          </div>
          <div className="shortcut-list">
            <span>{shellState.shortcuts.playPause} play/pause</span>
            <span>{shellState.shortcuts.next} next</span>
            <span>{shellState.shortcuts.volumeUp} volume up</span>
            <span>{shellState.shortcuts.volumeDown} volume down</span>
            <span>{shellState.shortcuts.mute} mute</span>
            <span>{shellState.shortcuts.toggleMode} mode</span>
            <span>{shellState.shortcuts.toggleWindow} show/hide</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
