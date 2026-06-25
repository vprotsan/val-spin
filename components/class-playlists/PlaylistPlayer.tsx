'use client';

/**
 * Sticky bottom playback bar for a saved class playlist.
 *
 * Track line: coloured segments per timestamp mark, dimmed future portion,
 * click/tap anywhere to seek. Active mark note shown below the bar.
 *
 * Uses the Spotify Web Playback SDK (Premium required).
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Script from 'next/script';
import type { Sequence, Song } from '@/types';
import ConnectPlayer from './ConnectPlayer';

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
 * Spotify's REST API lags behind the SDK ready event by a few seconds.
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

// ── Segment colours & gradient ────────────────────────────────────────────────

/** Cycling palette for mark segments — visually distinct on dark backgrounds. */
const MARK_COLOURS = [
  '#f59e0b', // amber
  '#0ea5e9', // sky
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#f97316', // orange
  '#10b981', // emerald
] as const;

const GAP_COLOUR = '#3f3f46'; // zinc-700 — used for un-marked portions

/**
 * Build a CSS linear-gradient that colours each sequence range and leaves
 * the gaps between them (and before/after) in the neutral gap colour.
 */
function buildSegmentGradient(sequences: Sequence[], durationMs: number): string {
  if (!sequences.length || durationMs === 0) return GAP_COLOUR;

  const stops: string[] = [];
  let prev = 0;

  for (let i = 0; i < sequences.length; i++) {
    const seq = sequences[i];
    const colour = MARK_COLOURS[i % MARK_COLOURS.length];
    const startPct = (seq.startMs / durationMs) * 100;
    const endPct   = (seq.endMs   / durationMs) * 100;

    // Gap before this mark
    if (startPct > prev + 0.01) {
      stops.push(`${GAP_COLOUR} ${prev.toFixed(2)}%`, `${GAP_COLOUR} ${startPct.toFixed(2)}%`);
    }
    // Mark range
    stops.push(`${colour} ${startPct.toFixed(2)}%`, `${colour} ${endPct.toFixed(2)}%`);
    prev = endPct;
  }

  // Tail after last mark
  if (prev < 99.99) {
    stops.push(`${GAP_COLOUR} ${prev.toFixed(2)}%`, `${GAP_COLOUR} 100%`);
  }

  return `linear-gradient(to right, ${stops.join(', ')})`;
}

// ── Mobile detection ──────────────────────────────────────────────────────────

/**
 * The Spotify Web Playback SDK requires desktop Chrome / Firefox / Edge.
 * It silently fails on mobile browsers (iOS blocks MSE entirely; Android
 * Chrome connects but can't actually play), which causes the "skip through
 * all songs" bug. Detect mobile early and render a fallback instead.
 */
function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
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

// ── SegmentedTrackBar ─────────────────────────────────────────────────────────

/**
 * Full-width track line with coloured sections per sequence mark.
 * - Past portion: full colour.
 * - Future portion: darkened overlay so upcoming marks are still visible.
 * - Playhead: small white dot.
 * - Click/tap anywhere: seeks to that position.
 */
function SegmentedTrackBar({
  sequences,
  positionMs,
  durationMs,
  onSeek,
}: {
  sequences: Sequence[];
  positionMs: number;
  durationMs: number;
  onSeek: (ms: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const progress = durationMs > 0 ? Math.min(positionMs / durationMs, 1) : 0;

  const gradient = useMemo(
    () => buildSegmentGradient(sequences, durationMs),
    // sequences is a stable array reference per song; durationMs changes when
    // SDK fires its first state event — both are the right invalidation triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sequences, durationMs],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!barRef.current || durationMs === 0) return;
      const rect = barRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(Math.round(ratio * durationMs));
    },
    [durationMs, onSeek],
  );

  return (
    <div
      ref={barRef}
      onClick={handleClick}
      // 28 px tall hit area; visual bar is 8 px centered inside it
      className="relative w-full cursor-pointer select-none"
      style={{ height: '28px' }}
      aria-label="Seek in track"
      role="slider"
      aria-valuenow={positionMs}
      aria-valuemin={0}
      aria-valuemax={durationMs}
    >
      {/* Coloured segment background */}
      <div
        className="absolute left-0 right-0 rounded-sm"
        style={{ top: '10px', height: '8px', background: gradient }}
      />

      {/* Future dimmer — everything right of the playhead */}
      <div
        className="absolute right-0 rounded-r-sm bg-black/60"
        style={{ top: '10px', height: '8px', left: `${progress * 100}%` }}
      />

      {/* Playhead dot */}
      <div
        className="absolute bg-white rounded-full shadow"
        style={{
          top: '6px',
          width: '16px',
          height: '16px',
          left: `${progress * 100}%`,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlaylistPlayer({
  songs,
  onCurrentIndexChange,
}: {
  songs: Song[];
  onCurrentIndexChange?: (idx: number) => void;
}) {
  // Computed once on mount — safe because navigator.userAgent never changes mid-session
  const [isMobile]    = useState(detectMobile);

  const playerRef      = useRef<Spotify.Player | null>(null);
  const deviceIdRef    = useRef('');
  const tickRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref mirrors for stale-closure safety inside SDK event listeners
  const songsRef                  = useRef(songs);
  const currentIndexRef           = useRef(0);
  const playbackRef               = useRef<PlaybackState | null>(null);
  const hasStartedRef             = useRef(false);
  const onCurrentIndexChangeRef   = useRef(onCurrentIndexChange);
  // Timestamp of the last playAtIndex call — guards against the "instant
  // paused-at-0" false-positive that triggers rapid auto-advance when the SDK
  // fails to start (e.g. on mobile, or during a 404 retry).
  const lastPlayStartedAtRef = useRef(0);

  const [status, setStatus]             = useState<PlayerStatus>('loading');
  const [statusMsg, setStatusMsg]       = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playback, setPlayback]         = useState<PlaybackState | null>(null);

  // Keep ref mirrors in sync with state/props
  useEffect(() => { songsRef.current = songs; },                           [songs]);
  useEffect(() => { currentIndexRef.current = currentIndex; },             [currentIndex]);
  useEffect(() => { playbackRef.current = playback; },                     [playback]);
  useEffect(() => { onCurrentIndexChangeRef.current = onCurrentIndexChange; }, [onCurrentIndexChange]);

  // ── Progress ticker (250 ms) ────────────────────────────────────────────────

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

  // ── Play a song at queue index ──────────────────────────────────────────────

  const playAtIndex = useCallback(async (idx: number) => {
    const list = songsRef.current;
    if (idx < 0 || idx >= list.length || !deviceIdRef.current) return;

    const token = await fetchToken();
    const uri   = list[idx].spotifyUri;

    try {
      await playUri(uri, deviceIdRef.current, token);
    } catch (err) {
      const httpStatus = (err as { status?: number }).status;
      if (httpStatus === 404) {
        // Device not yet registered on Spotify's backend — re-transfer & poll
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
    onCurrentIndexChangeRef.current?.(idx);
    hasStartedRef.current = true;
    lastPlayStartedAtRef.current = Date.now(); // stamp for auto-advance guard
  }, []);

  // ── SDK initialisation ──────────────────────────────────────────────────────

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

      setPlayback({
        paused,
        positionMs: position,
        durationMs: duration,
        trackUri: track_window.current_track.uri,
      });

      if (paused) stopTick(); else startTick();

      // Auto-advance: was playing → now paused at position 0 = track ended.
      // The 3 s guard prevents false-positives when the SDK fires an immediate
      // paused-at-0 event because playback failed (mobile, device error, etc.).
      const playedLongEnough = Date.now() - lastPlayStartedAtRef.current > 3000;
      if (paused && position === 0 && !prevPaused && hasStartedRef.current && playedLongEnough) {
        const next = currentIndexRef.current + 1;
        if (next < songsRef.current.length) {
          playAtIndex(next);
        } else {
          hasStartedRef.current = false;
          setCurrentIndex(0);
          onCurrentIndexChangeRef.current?.(0);
        }
      }
    });

    const connected = await player.connect();
    if (!connected) { setStatus('error'); setStatusMsg('Player failed to connect.'); }
  }, [startTick, stopTick, playAtIndex]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => { stopTick(); playerRef.current?.disconnect(); };
  }, [stopTick]);

  // ── Controls ────────────────────────────────────────────────────────────────

  const handlePlayPause = useCallback(async () => {
    if (!hasStartedRef.current) await playAtIndex(currentIndexRef.current);
    else await playerRef.current?.togglePlay();
  }, [playAtIndex]);

  const handleNext = useCallback(async () => {
    const next = currentIndexRef.current + 1;
    if (next < songsRef.current.length) await playAtIndex(next);
  }, [playAtIndex]);

  const handlePrev = useCallback(async () => {
    const posMs = playbackRef.current?.positionMs ?? 0;
    if (posMs > 3000) await playerRef.current?.seek(0);
    else {
      const prev = currentIndexRef.current - 1;
      if (prev >= 0) await playAtIndex(prev);
      else await playerRef.current?.seek(0);
    }
  }, [playAtIndex]);

  const handleSeek = useCallback(async (ms: number) => {
    await playerRef.current?.seek(ms);
  }, []);

  // ── Derived values for render ───────────────────────────────────────────────

  if (songs.length === 0) return null;

  // ── Mobile: Spotify Connect player ─────────────────────────────────────────
  // The Web Playback SDK doesn't run on mobile browsers. ConnectPlayer uses
  // the REST API to control a Spotify client running in the background on the
  // same device (or any other active Spotify device).
  if (isMobile) {
    return <ConnectPlayer songs={songs} onCurrentIndexChange={onCurrentIndexChange} />;
  }

  const currentSong  = songs[currentIndex];
  const sequences    = currentSong.sequences;
  const positionMs   = playback?.positionMs ?? 0;
  const durationMs   = playback?.durationMs || currentSong.durationMs;
  const isPaused     = !hasStartedRef.current || (playback?.paused ?? true);
  const isAtStart    = currentIndex === 0 && positionMs <= 3000 && !hasStartedRef.current;
  const isAtEnd      = currentIndex >= songs.length - 1;

  // Which sequence mark is the playhead currently inside?
  const activeSeqIndex = sequences.findIndex(
    (seq) => positionMs >= seq.startMs && positionMs < seq.endMs,
  );
  const activeSeq      = activeSeqIndex >= 0 ? sequences[activeSeqIndex] : null;
  const activeColour   = activeSeqIndex >= 0
    ? MARK_COLOURS[activeSeqIndex % MARK_COLOURS.length]
    : null;

  // Countdown logic:
  // - inside a cue → time until this cue ends
  // - between cues → time until next cue starts
  // - after all cues (or no cues) → time until song ends
  const nextSeq = sequences.find((seq) => seq.startMs > positionMs);
  const countdownMs = activeSeq
    ? activeSeq.endMs - positionMs
    : nextSeq
      ? nextSeq.startMs - positionMs
      : durationMs - positionMs;
  const countdownLabel = activeSeq ? 'cue ends' : nextSeq ? 'next cue' : 'song ends';

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

      {/* ── Sticky player bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800 min-h-[33vh] flex flex-col">

        {/* Segmented track line — full bleed, click to seek */}
        <SegmentedTrackBar
          sequences={sequences}
          positionMs={positionMs}
          durationMs={durationMs}
          onSeek={handleSeek}
        />

        <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 pt-3 pb-5">

          {/* Song info */}
          {status === 'ready' && (
            <div className="mb-2">
              <p className="flex justify-between">
                {playback && (
                  <span className="ml-2 tabular-nums text-xl text-zinc-600">
                    {fmtMs(positionMs)} / {fmtMs(durationMs)}
                  </span>
                )}
                <span className="ml-2 text-zinc-700 text-xl tabular-nums">
                  {currentIndex + 1} / {songs.length}
                </span>
              </p>
            </div>
          )}

          {/* All sequence notes — scrollable list, active one highlighted */}
          {status === 'ready' && sequences.some((s) => s.note) && (
            <div className="flex-1 overflow-y-auto mb-2 space-y-1 min-h-0">
              {sequences.map((seq, i) => {
                if (!seq.note) return null;
                const isActive = seq === activeSeq;
                const colour = MARK_COLOURS[i % MARK_COLOURS.length];
                const seqDurationMs = seq.endMs - seq.startMs;
                const remaining = isActive ? seq.endMs - positionMs : null;
                return (
                  <div
                    key={seq.id}
                    className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors ${
                      isActive ? 'bg-zinc-800' : 'opacity-50'
                    }`}
                    style={isActive ? { borderLeft: `3px solid ${colour}` } : { borderLeft: '3px solid transparent' }}
                  >
                    <p className={`text-xl leading-snug flex-1 ${isActive ? 'text-white font-medium' : 'text-zinc-400'}`}>
                      {seq.note}
                    </p>
                    <div className="text-right shrink-0 tabular-nums">
                      {isActive && remaining !== null ? (
                        <>
                          <p className="text-white text-2xl font-semibold">{fmtMs(Math.max(0, remaining))}</p>
                          <p className="text-zinc-500 text-xl">of {fmtMs(seqDurationMs)}</p>
                        </>
                      ) : (
                        <p className="text-zinc-500 text-xl">{fmtMs(seqDurationMs)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Standalone countdown when between cues or no notes on song */}
          {status === 'ready' && !activeSeq && playback && (
            <div className="flex justify-end mb-2">
              <div className="text-right">
                <p className="text-zinc-100 text-4xl tabular-nums">{fmtMs(countdownMs)}</p>
                <p className="text-zinc-500 text-sm">{countdownLabel}</p>
              </div>
            </div>
          )}

          {/* <div className="flex flex-col">
            <p className="text-white text-base font-medium truncate leading-snug">
                {currentSong.title}
              </p>
              <p className="text-zinc-500 text-sm truncate">
                {currentSong.artist}
              </p>
          </div> */}

          {/* Status messages */}
          {status === 'loading' && (
            <p className="text-zinc-600 text-sm text-center py-1">Loading Spotify player…</p>
          )}
          {status === 'initialising' && (
            <p className="text-zinc-600 text-sm text-center py-1 animate-pulse">
              Connecting to Spotify…
            </p>
          )}
          {status === 'error' && (
            <p className="text-red-400 text-sm text-center py-1">{statusMsg}</p>
          )}

          {/* Prev / Play-Pause / Next — 3 equal columns, pushed to bottom */}
          {status === 'ready' && (
            <div className="mt-auto grid grid-cols-3 items-center">
              <div className="flex justify-center">
                <CtrlBtn label="Previous" disabled={isAtStart} onClick={handlePrev}>
                  <PrevIcon />
                </CtrlBtn>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handlePlayPause}
                  className="w-16 h-16 rounded-full bg-white flex items-center justify-center
                             active:scale-95 transition-transform"
                  aria-label={isPaused ? 'Play playlist' : 'Pause'}
                >
                  {isPaused ? <PlayIcon /> : <PauseIcon />}
                </button>
              </div>

              <div className="flex justify-center">
                <CtrlBtn label="Next" disabled={isAtEnd} onClick={handleNext}>
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

// ── CtrlBtn ───────────────────────────────────────────────────────────────────

function CtrlBtn({ children, label, disabled, onClick }: {
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
      className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors
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
  return <svg viewBox="0 0 24 24" className="w-7 h-7 ml-0.5" fill="black"><path d="M8 5v14l11-7z" /></svg>;
}
function PauseIcon() {
  return <svg viewBox="0 0 24 24" className="w-7 h-7" fill="black"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>;
}
function PrevIcon() {
  return <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>;
}
function NextIcon() {
  return <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z" /></svg>;
}

