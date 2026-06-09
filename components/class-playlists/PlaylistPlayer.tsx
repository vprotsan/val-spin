'use client';

/**
 * Sticky bottom playback bar for a saved class playlist.
 *
 * Plays songs in the order they are passed (segment order → song order).
 * Handles: play/pause, prev/next, smooth progress tick, auto-advance on
 * track end, and "restart current track" when ‹ is pressed mid-song.
 *
 * Uses the Spotify Web Playback SDK (Premium required).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import type { Song } from '@/types';

// ── Spotify Web API helpers ───────────────────────────────────────────────────

async function fetchToken(): Promise<string> {
  const res = await fetch('/api/auth/token');
  if (!res.ok) throw new Error('Failed to fetch token');
  const { accessToken } = await res.json();
  return accessToken;
}

async function transferPlayback(deviceId: string, token: string): Promise<void> {
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

/**
 * Poll /me/player/devices until our device ID appears (max ~5 s).
 * Spotify's REST API lags behind the SDK ready event by up to a few seconds.
 */
async function waitForDevice(deviceId: string, token: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) continue;
    const { devices } = (await res.json()) as { devices: { id: string }[] };
    if (devices.some((d) => d.id === deviceId)) return true;
  }
  return false;
}

async function playUri(uri: string, deviceId: string, token: string): Promise<void> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [uri] }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`Spotify play ${res.status}`), { status: res.status, body });
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlaybackState {
  paused: boolean;
  positionMs: number;
  durationMs: number;
  trackUri: string;
}

type PlayerStatus = 'loading' | 'initialising' | 'ready' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlaylistPlayer({ songs }: { songs: Song[] }) {
  // SDK refs — stable across renders, safe to read inside listeners
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref mirrors for stale-closure safety inside the SDK event listener
  const songsRef = useRef(songs);
  const currentIndexRef = useRef(0);
  const playbackRef = useRef<PlaybackState | null>(null);
  // True once the user has pressed play (guards auto-advance trigger)
  const hasStartedRef = useRef(false);

  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [statusMsg, setStatusMsg] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);

  // Keep ref mirrors in sync
  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { playbackRef.current = playback; }, [playback]);

  // ── Progress ticker (250 ms) ──────────────────────────────────────────────

  const startTick = useCallback(() => {
    if (tickRef.current) return;
    tickRef.current = setInterval(() => {
      setPlayback((prev) => {
        if (!prev || prev.paused) return prev;
        return { ...prev, positionMs: Math.min(prev.positionMs + 250, prev.durationMs) };
      });
    }, 250);
  }, []);

  const stopTick = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  // ── Play a song at a given queue index ───────────────────────────────────

  const playAtIndex = useCallback(async (idx: number) => {
    const list = songsRef.current;
    if (idx < 0 || idx >= list.length || !deviceIdRef.current) return;

    const token = await fetchToken();
    const uri = list[idx].spotifyUri;

    try {
      await playUri(uri, deviceIdRef.current, token);
    } catch (err) {
      // 404 = Spotify's REST API hasn't registered the SDK device yet.
      // Re-transfer to nudge it, then poll until the device actually appears
      // (up to ~5 s) before retrying play.
      const status = (err as { status?: number }).status;
      if (status === 404) {
        await transferPlayback(deviceIdRef.current, token);
        const found = await waitForDevice(deviceIdRef.current, token);
        if (!found) {
          console.error('[PlaylistPlayer] device never appeared in /me/player/devices');
          return;
        }
        await playUri(uri, deviceIdRef.current, token);
      } else {
        throw err;
      }
    }

    setCurrentIndex(idx);
    hasStartedRef.current = true;
  }, []);

  // ── SDK initialisation ────────────────────────────────────────────────────

  const initPlayer = useCallback(async () => {
    setStatus('initialising');

    let token: string;
    try { token = await fetchToken(); }
    catch {
      setStatus('error');
      setStatusMsg('Could not fetch token — try logging out and back in.');
      return;
    }

    const player = new window.Spotify.Player({
      name: 'Cycling Playlist',
      getOAuthToken: (cb) => { fetchToken().then(cb).catch(() => cb('')); },
      volume: 0.8,
    });
    playerRef.current = player;

    player.addListener('initialization_error', ({ message }) => {
      setStatus('error'); setStatusMsg(`Init error: ${message}`);
    });
    player.addListener('authentication_error', ({ message }) => {
      setStatus('error'); setStatusMsg(`Auth error: ${message}`);
    });
    player.addListener('account_error', ({ message }) => {
      setStatus('error'); setStatusMsg(`Spotify Premium required: ${message}`);
    });
    player.addListener('playback_error', ({ message }) => {
      console.warn('[PlaylistPlayer] playback error:', message);
    });

    player.addListener('ready', async ({ device_id }) => {
      deviceIdRef.current = device_id;
      try {
        await transferPlayback(device_id, token);
        setStatus('ready');
      } catch {
        setStatus('error'); setStatusMsg('Could not transfer playback to this browser.');
      }
    });

    player.addListener('not_ready', () => {
      setStatus('error'); setStatusMsg('Player went offline.');
    });

    player.addListener('player_state_changed', (state) => {
      if (!state) return;
      const { paused, position, duration, track_window } = state;
      const prevPaused = playbackRef.current?.paused ?? true;

      setPlayback({ paused, positionMs: position, durationMs: duration, trackUri: track_window.current_track.uri });

      if (paused) stopTick();
      else startTick();

      // Auto-advance: track ended = was playing → now paused at position 0
      if (paused && position === 0 && !prevPaused && hasStartedRef.current) {
        const next = currentIndexRef.current + 1;
        if (next < songsRef.current.length) {
          playAtIndex(next);
        } else {
          // End of playlist — reset so pressing play restarts from the top
          hasStartedRef.current = false;
          setCurrentIndex(0);
        }
      }
    });

    const connected = await player.connect();
    if (!connected) { setStatus('error'); setStatusMsg('Player failed to connect.'); }
  }, [startTick, stopTick, playAtIndex]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  useEffect(() => {
    return () => { stopTick(); playerRef.current?.disconnect(); };
  }, [stopTick]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const handlePlayPause = useCallback(async () => {
    if (!hasStartedRef.current) {
      // Never played yet (or playlist just ended) — start from current index
      await playAtIndex(currentIndexRef.current);
    } else {
      await playerRef.current?.togglePlay();
    }
  }, [playAtIndex]);

  const handleNext = useCallback(async () => {
    const next = currentIndexRef.current + 1;
    if (next < songsRef.current.length) await playAtIndex(next);
  }, [playAtIndex]);

  const handlePrev = useCallback(async () => {
    const posMs = playbackRef.current?.positionMs ?? 0;
    if (posMs > 3000) {
      // Mid-song: restart the current track
      await playerRef.current?.seek(0);
    } else {
      // Near the start: go to previous song
      const prev = currentIndexRef.current - 1;
      if (prev >= 0) await playAtIndex(prev);
      else await playerRef.current?.seek(0); // already first song
    }
  }, [playAtIndex]);

  // ── Nothing to play ───────────────────────────────────────────────────────

  if (songs.length === 0) return null;

  const currentSong = songs[currentIndex];
  const isPaused = !hasStartedRef.current || (playback?.paused ?? true);
  const progress =
    playback && playback.durationMs > 0
      ? playback.positionMs / playback.durationMs
      : 0;
  const posMs = playback?.positionMs ?? 0;
  const isAtStart = currentIndex === 0 && posMs <= 3000 && !hasStartedRef.current;
  const isAtEnd = currentIndex >= songs.length - 1;

  return (
    <>
      <Script
        src="https://sdk.scdn.co/spotify-player.js"
        strategy="afterInteractive"
        onReady={() => {
          if (window.Spotify) initPlayer();
          else window.onSpotifyWebPlaybackSDKReady = initPlayer;
        }}
      />

      {/* ── Sticky player bar ──────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800">

        {/* Track progress line — full bleed, sits right on the border */}
        <div className="w-full h-[3px] bg-zinc-800">
          <div
            className="h-full bg-[#1DB954] transition-none"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <div className="max-w-lg mx-auto px-4 py-3">

          {/* Status messages */}
          {status === 'loading' && (
            <p className="text-zinc-600 text-xs text-center py-1">Loading Spotify player…</p>
          )}
          {status === 'initialising' && (
            <p className="text-zinc-600 text-xs text-center py-1 animate-pulse">
              Connecting to Spotify…
            </p>
          )}
          {status === 'error' && (
            <p className="text-red-400 text-xs text-center py-1">{statusMsg}</p>
          )}

          {/* Player controls */}
          {status === 'ready' && (
            <div className="flex items-center gap-3">

              {/* Current song info */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate leading-snug">
                  {currentSong.title}
                </p>
                <p className="text-zinc-500 text-xs truncate">
                  {currentSong.artist}
                  {playback && (
                    <span className="ml-2 tabular-nums text-zinc-600">
                      {fmtMs(playback.positionMs)} / {fmtMs(currentSong.durationMs)}
                    </span>
                  )}
                </p>
              </div>

              {/* Queue position */}
              <span className="text-zinc-700 text-xs tabular-nums shrink-0">
                {currentIndex + 1} / {songs.length}
              </span>

              {/* Prev / Play-Pause / Next */}
              <div className="flex items-center gap-1 shrink-0">
                <CtrlBtn
                  label="Previous"
                  disabled={isAtStart}
                  onClick={handlePrev}
                >
                  <PrevIcon />
                </CtrlBtn>

                <button
                  onClick={handlePlayPause}
                  className="w-11 h-11 rounded-full bg-white flex items-center justify-center
                             active:scale-95 transition-transform shrink-0 ml-1"
                  aria-label={isPaused ? 'Play playlist' : 'Pause'}
                >
                  {isPaused ? <PlayIcon /> : <PauseIcon />}
                </button>

                <CtrlBtn
                  label="Next"
                  disabled={isAtEnd}
                  onClick={handleNext}
                >
                  <NextIcon />
                </CtrlBtn>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Icon button ───────────────────────────────────────────────────────────────

function CtrlBtn({
  children, label, disabled, onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors
        ${disabled
          ? 'text-zinc-700 cursor-not-allowed'
          : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-95 transition-transform'
        }`}
    >
      {children}
    </button>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 ml-0.5" fill="black">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="black">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" />
    </svg>
  );
}
