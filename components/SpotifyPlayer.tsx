'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';
import type { SpotifyTrack } from '@/lib/spotify-api';

// ── Spotify Web API helpers (client-side, token is short-lived) ───────────────

async function fetchToken(): Promise<string> {
  const res = await fetch('/api/auth/token');
  if (!res.ok) throw new Error('Not authenticated');
  const { accessToken } = await res.json();
  return accessToken;
}

async function transferPlayback(deviceId: string, token: string) {
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

async function playTrack(uri: string, deviceId: string, token: string) {
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uris: [uri] }),
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

type PlayerStatus =
  | 'loading'       // SDK script loading
  | 'initialising'  // Player connecting
  | 'ready'         // Device ready, playback transferred
  | 'error';

interface PlaybackState {
  paused: boolean;
  positionMs: number;
  durationMs: number;
  trackUri: string;
}

export default function SpotifyPlayer({ tracks }: { tracks: SpotifyTrack[] }) {
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef<string>('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [statusMsg, setStatusMsg] = useState('');
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [selectedUri, setSelectedUri] = useState<string>('');

  // ── Smooth position ticker ─────────────────────────────────────────────────
  const startTick = useCallback(() => {
    if (tickRef.current) return;
    tickRef.current = setInterval(() => {
      setPlayback((prev) => {
        if (!prev || prev.paused) return prev;
        const next = Math.min(prev.positionMs + 250, prev.durationMs);
        return { ...prev, positionMs: next };
      });
    }, 250);
  }, []);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // ── SDK ready callback ─────────────────────────────────────────────────────
  const initPlayer = useCallback(async () => {
    setStatus('initialising');

    let token: string;
    try {
      token = await fetchToken();
    } catch {
      setStatus('error');
      setStatusMsg('Could not fetch access token — try logging out and back in.');
      return;
    }

    const player = new window.Spotify.Player({
      name: 'Cycling Playlist',
      getOAuthToken: (cb) => {
        fetchToken().then(cb).catch(() => cb(''));
      },
      volume: 0.8,
    });
    playerRef.current = player;

    player.addListener('initialization_error', ({ message }) => {
      setStatus('error');
      setStatusMsg(`Init error: ${message}`);
    });
    player.addListener('authentication_error', ({ message }) => {
      setStatus('error');
      setStatusMsg(`Auth error: ${message}`);
    });
    player.addListener('account_error', ({ message }) => {
      setStatus('error');
      setStatusMsg(`Account error (Premium required): ${message}`);
    });
    player.addListener('playback_error', ({ message }) => {
      console.warn('Playback error:', message);
    });

    player.addListener('ready', async ({ device_id }) => {
      deviceIdRef.current = device_id;
      try {
        await transferPlayback(device_id, token);
        setStatus('ready');
      } catch {
        setStatus('error');
        setStatusMsg('Could not transfer playback to this browser.');
      }
    });

    player.addListener('not_ready', () => {
      setStatus('error');
      setStatusMsg('Player went offline.');
    });

    player.addListener('player_state_changed', (state) => {
      if (!state) return;
      const { paused, position, duration, track_window } = state;
      setPlayback({
        paused,
        positionMs: position,
        durationMs: duration,
        trackUri: track_window.current_track.uri,
      });
      setSelectedUri(track_window.current_track.uri);
      if (paused) stopTick();
      else startTick();
    });

    const connected = await player.connect();
    if (!connected) {
      setStatus('error');
      setStatusMsg('Player failed to connect.');
    }
  }, [startTick, stopTick]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopTick();
      playerRef.current?.disconnect();
    };
  }, [stopTick]);

  // ── Play a track ───────────────────────────────────────────────────────────
  const handleSelectTrack = useCallback(async (uri: string) => {
    if (!deviceIdRef.current) return;
    const token = await fetchToken();
    await playTrack(uri, deviceIdRef.current, token);
  }, []);

  // ── Toggle play/pause ──────────────────────────────────────────────────────
  const handleTogglePlay = useCallback(async () => {
    await playerRef.current?.togglePlay();
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const currentTrack = playback
    ? tracks.find((t) => t.uri === playback.trackUri)
    : null;

  return (
    <>
      {/* Load the Spotify Web Playback SDK */}
      <Script
        src="https://sdk.scdn.co/spotify-player.js"
        strategy="afterInteractive"
        onReady={() => {
          // SDK sets window.onSpotifyWebPlaybackSDKReady; if it already fired, call directly
          if (window.Spotify) {
            initPlayer();
          } else {
            window.onSpotifyWebPlaybackSDKReady = initPlayer;
          }
        }}
      />

      <div className="min-h-screen bg-black pb-32">
        {/* ── Now playing bar (sticky bottom) ── */}
        <div className="fixed bottom-0 left-0 right-0 z-20 bg-zinc-950 border-t border-zinc-800 px-4 py-3">
          <div className="max-w-lg mx-auto">
            {status === 'loading' && (
              <p className="text-zinc-500 text-sm text-center py-1">Loading Spotify player…</p>
            )}
            {status === 'initialising' && (
              <p className="text-zinc-500 text-sm text-center py-1 animate-pulse">Connecting to Spotify…</p>
            )}
            {status === 'error' && (
              <p className="text-red-400 text-sm text-center py-1">{statusMsg}</p>
            )}
            {status === 'ready' && !playback && (
              <p className="text-zinc-500 text-sm text-center py-1">Tap a track to play</p>
            )}
            {status === 'ready' && playback && currentTrack && (
              <NowPlayingBar
                track={currentTrack}
                playback={playback}
                onTogglePlay={handleTogglePlay}
              />
            )}
          </div>
        </div>

        {/* ── Track list ── */}
        <div className="max-w-lg mx-auto px-4 pt-6">
          <h1 className="text-xl font-bold text-white mb-1">Player</h1>
          <p className="text-zinc-500 text-xs mb-5">
            Tap a track to play it in this browser via Spotify Premium.
          </p>

          <ul>
            {tracks.map((track) => {
              const isSelected = track.uri === selectedUri;
              const isPlaying = isSelected && playback && !playback.paused;
              return (
                <TrackRow
                  key={track.id}
                  track={track}
                  isSelected={isSelected}
                  isPlaying={!!isPlaying}
                  disabled={status !== 'ready'}
                  onSelect={handleSelectTrack}
                />
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TrackRow({
  track,
  isSelected,
  isPlaying,
  disabled,
  onSelect,
}: {
  track: SpotifyTrack;
  isSelected: boolean;
  isPlaying: boolean;
  disabled: boolean;
  onSelect: (uri: string) => void;
}) {
  const thumb =
    track.album.images.find((img) => img.width && img.width <= 64)?.url ??
    track.album.images.at(-1)?.url;
  const artistNames = track.artists.map((a) => a.name).join(', ');

  return (
    <li>
      <button
        onClick={() => onSelect(track.uri)}
        disabled={disabled}
        className={`w-full flex items-center gap-3 py-3 border-b border-zinc-800/60 text-left transition-colors
          ${isSelected ? 'opacity-100' : 'opacity-80 hover:opacity-100'}
          ${disabled ? 'cursor-not-allowed' : 'cursor-pointer active:bg-zinc-800/40'}`}
      >
        {/* Thumb / playing indicator */}
        <div className="relative shrink-0 w-11 h-11">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={track.album.name} className="w-full h-full rounded object-cover bg-zinc-800" />
          ) : (
            <div className="w-full h-full rounded bg-zinc-800" />
          )}
          {isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50">
              <SoundWaveIcon />
            </div>
          )}
          {isSelected && !isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center rounded bg-black/50">
              <PauseIcon />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isSelected ? 'text-[#1DB954]' : 'text-white'}`}>
            {track.name}
          </p>
          <p className="text-zinc-400 text-xs truncate">{artistNames}</p>
        </div>

        <span className="text-zinc-600 text-xs shrink-0 tabular-nums">
          {formatMs(track.duration_ms)}
        </span>
      </button>
    </li>
  );
}

function NowPlayingBar({
  track,
  playback,
  onTogglePlay,
}: {
  track: SpotifyTrack;
  playback: PlaybackState;
  onTogglePlay: () => void;
}) {
  const thumb = track.album.images.at(-1)?.url;
  const progress = playback.durationMs > 0 ? playback.positionMs / playback.durationMs : 0;

  return (
    <div className="flex flex-col gap-2">
      {/* Progress bar */}
      <div className="w-full h-0.5 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#1DB954] rounded-full transition-none"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Track info + controls */}
      <div className="flex items-center gap-3">
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={track.album.name} className="w-10 h-10 rounded object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium truncate">{track.name}</p>
          <p className="text-zinc-400 text-xs tabular-nums">
            {formatMs(playback.positionMs)} / {formatMs(playback.durationMs)}
          </p>
        </div>
        <button
          onClick={onTogglePlay}
          className="shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform"
          aria-label={playback.paused ? 'Play' : 'Pause'}
        >
          {playback.paused ? <PlayIcon /> : <PauseIcon dark />}
        </button>
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 ml-0.5" fill="black">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ dark }: { dark?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill={dark ? 'black' : 'white'}>
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function SoundWaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#1DB954">
      <rect x="3" y="10" width="2" height="4" rx="1">
        <animate attributeName="height" values="4;10;4" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="y" values="10;7;10" dur="0.8s" repeatCount="indefinite" />
      </rect>
      <rect x="7" y="8" width="2" height="8" rx="1">
        <animate attributeName="height" values="8;4;8" dur="0.6s" repeatCount="indefinite" />
        <animate attributeName="y" values="8;10;8" dur="0.6s" repeatCount="indefinite" />
      </rect>
      <rect x="11" y="6" width="2" height="12" rx="1">
        <animate attributeName="height" values="12;6;12" dur="0.7s" repeatCount="indefinite" />
        <animate attributeName="y" values="6;9;6" dur="0.7s" repeatCount="indefinite" />
      </rect>
      <rect x="15" y="8" width="2" height="8" rx="1">
        <animate attributeName="height" values="8;12;8" dur="0.9s" repeatCount="indefinite" />
        <animate attributeName="y" values="8;6;8" dur="0.9s" repeatCount="indefinite" />
      </rect>
      <rect x="19" y="10" width="2" height="4" rx="1">
        <animate attributeName="height" values="4;8;4" dur="0.65s" repeatCount="indefinite" />
        <animate attributeName="y" values="10;8;10" dur="0.65s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
