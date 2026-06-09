'use client';

/**
 * Spotify Connect player — works on any browser including mobile.
 *
 * Instead of running audio in the browser (which the Web Playback SDK blocks
 * on mobile), this component sends play/pause/seek commands to whatever
 * Spotify client is active on the user's device (Spotify app on the same
 * phone, a laptop, a smart speaker, etc.).
 *
 * The user keeps the web UI in the foreground the entire time; Spotify runs
 * in the background handling audio.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Sequence, Song } from '@/types';

// ── Spotify REST helpers ──────────────────────────────────────────────────────

async function fetchToken(): Promise<string> {
  const res = await fetch('/api/auth/token');
  if (!res.ok) throw new Error('Not authenticated');
  const { accessToken } = await res.json();
  return accessToken;
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;        // 'Computer' | 'Smartphone' | 'Speaker' | ...
  is_active: boolean;
  is_restricted: boolean;
  volume_percent: number;
}

interface ConnectState {
  is_playing: boolean;
  progress_ms: number;
  item: { uri: string; duration_ms: number } | null;
  device: { id: string; name: string } | null;
}

async function apiGetDevices(token: string): Promise<SpotifyDevice[]> {
  const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const { devices } = await res.json() as { devices: SpotifyDevice[] };
  return devices ?? [];
}

async function apiGetPlaybackState(token: string): Promise<ConnectState | null> {
  const res = await fetch('https://api.spotify.com/v1/me/player', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 204 || !res.ok) return null; // 204 = no active playback
  return res.json() as Promise<ConnectState>;
}

/** Play all URIs starting at offsetPosition on a specific device. */
async function apiPlayQueue(
  uris: string[],
  offsetPosition: number,
  deviceId: string,
  token: string,
): Promise<void> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris, offset: { position: offsetPosition } }),
    },
  );
  // 204 and 202 are both success responses
  if (!res.ok && res.status !== 204 && res.status !== 202) {
    throw Object.assign(new Error(`playQueue ${res.status}`), { status: res.status });
  }
}

async function apiPause(token: string): Promise<void> {
  await fetch('https://api.spotify.com/v1/me/player/pause', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function apiResume(deviceId: string, token: string): Promise<void> {
  await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function apiSeek(ms: number, token: string): Promise<void> {
  await fetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${ms}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function apiNext(token: string): Promise<void> {
  await fetch('https://api.spotify.com/v1/me/player/next', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function apiPrevious(token: string): Promise<void> {
  await fetch('https://api.spotify.com/v1/me/player/previous', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function apiTransfer(deviceId: string, token: string): Promise<void> {
  await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
}

// ── Track-line helpers (self-contained so ConnectPlayer has no SDK dep) ───────

const MARK_COLOURS = [
  '#f59e0b', '#0ea5e9', '#f43f5e', '#8b5cf6', '#f97316', '#10b981',
] as const;
const GAP_COLOUR = '#3f3f46';

function buildGradient(sequences: Sequence[], durationMs: number): string {
  if (!sequences.length || durationMs === 0) return GAP_COLOUR;
  const stops: string[] = [];
  let prev = 0;
  for (let i = 0; i < sequences.length; i++) {
    const seq = sequences[i];
    const colour = MARK_COLOURS[i % MARK_COLOURS.length];
    const s = (seq.startMs / durationMs) * 100;
    const e = (seq.endMs   / durationMs) * 100;
    if (s > prev + 0.01) stops.push(`${GAP_COLOUR} ${prev.toFixed(2)}%`, `${GAP_COLOUR} ${s.toFixed(2)}%`);
    stops.push(`${colour} ${s.toFixed(2)}%`, `${colour} ${e.toFixed(2)}%`);
    prev = e;
  }
  if (prev < 99.99) stops.push(`${GAP_COLOUR} ${prev.toFixed(2)}%`, `${GAP_COLOUR} 100%`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function deviceIcon(type: string): string {
  if (type === 'Smartphone') return '📱';
  if (type === 'Computer')   return '💻';
  if (type === 'Speaker')    return '🔊';
  if (type === 'TV')         return '📺';
  return '🎵';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConnectPlayer({ songs }: { songs: Song[] }) {
  const [devices, setDevices]                       = useState<SpotifyDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId]     = useState<string | null>(null);
  const [selectedDeviceName, setSelectedDeviceName] = useState('');
  const [isPlaying, setIsPlaying]                   = useState(false);
  const [positionMs, setPositionMs]                 = useState(0);
  const [durationMs, setDurationMs]                 = useState(0);
  const [currentIndex, setCurrentIndex]             = useState(0);
  const [hasStarted, setHasStarted]                 = useState(false);
  const [loadingDevices, setLoadingDevices]         = useState(true);
  const [error, setError]                           = useState('');

  const tickRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPlayingRef = useRef(false);

  const uris = useMemo(() => songs.map((s) => s.spotifyUri), [songs]);

  // ── Smooth position tick (250 ms) ────────────────────────────────────────────

  const startTick = useCallback(() => {
    if (tickRef.current) return;
    tickRef.current = setInterval(() => {
      setPositionMs((p) => Math.min(p + 250, durationMs || Infinity));
    }, 250);
  }, [durationMs]);

  const stopTick = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  // ── Poll /me/player every 2 s to stay in sync ─────────────────────────────

  const syncState = useCallback(async () => {
    try {
      const token = await fetchToken();
      const state = await apiGetPlaybackState(token);
      if (!state || !state.item) return;

      setIsPlaying(state.is_playing);
      isPlayingRef.current = state.is_playing;
      // Only sync position from server when not actively ticking (avoids jumps)
      if (!state.is_playing) {
        setPositionMs(state.progress_ms);
        stopTick();
      } else {
        // Correct drift: accept server value if >500 ms off
        setPositionMs((prev) => {
          return Math.abs(prev - state.progress_ms) > 500 ? state.progress_ms : prev;
        });
        startTick();
      }
      setDurationMs(state.item.duration_ms);

      // Sync which song is playing
      const idx = uris.indexOf(state.item.uri);
      if (idx >= 0 && idx !== currentIndex) setCurrentIndex(idx);

      // Update device info if it changed
      if (state.device) {
        setSelectedDeviceId(state.device.id);
        setSelectedDeviceName(state.device.name);
      }
    } catch {
      // Polling errors are non-fatal — just skip this tick
    }
  }, [uris, currentIndex, startTick, stopTick]);

  const startPoll = useCallback(() => {
    if (pollRef.current) return;
    syncState(); // immediate sync
    pollRef.current = setInterval(syncState, 2000);
  }, [syncState]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => { stopTick(); stopPoll(); }, [stopTick, stopPoll]);

  // ── Load devices on mount ────────────────────────────────────────────────────

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    setError('');
    try {
      const token = await fetchToken();
      const devs  = await apiGetDevices(token);
      setDevices(devs);

      // Pre-select the currently active device if there is one
      const active = devs.find((d) => d.is_active && !d.is_restricted);
      if (active) {
        setSelectedDeviceId(active.id);
        setSelectedDeviceName(active.name);
      }

      if (devs.length === 0) {
        setError('No Spotify devices found. Open the Spotify app on your phone first, then tap Refresh.');
      }
    } catch {
      setError('Could not reach Spotify. Check your connection and try again.');
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  // ── Play a song at a queue index ─────────────────────────────────────────────

  const playAtIndex = useCallback(async (idx: number) => {
    if (!selectedDeviceId) return;
    setError('');
    try {
      const token = await fetchToken();

      // device_id in the URL handles the transfer implicitly — no separate
      // apiTransfer call needed (that caused a race condition on iOS).
      await apiPlayQueue(uris, idx, selectedDeviceId, token);

      // Wait briefly for Spotify to process the command, then verify it
      // actually started. This catches the iOS "silent ignore" case where
      // the app accepts the HTTP call but doesn't actually start playing.
      await new Promise((r) => setTimeout(r, 800));
      const verifyToken = await fetchToken();
      const state = await apiGetPlaybackState(verifyToken);

      if (!state || !state.is_playing) {
        // Spotify received the command but didn't start — usually means the
        // app was idle (never played anything this session) on iOS.
        setError(
          'Spotify received the command but didn\'t start playing. ' +
          'Play any song in the Spotify app first, then press ▶ here.',
        );
        setIsPlaying(false);
        stopTick();
        return;
      }

      // Confirmed playing — sync from server state
      setCurrentIndex(idx);
      setHasStarted(true);
      setIsPlaying(true);
      isPlayingRef.current = true;
      setPositionMs(state.progress_ms);
      setDurationMs(state.item?.duration_ms ?? 0);
      startTick();
      startPoll();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        setError('Device not found — open the Spotify app and try Refresh.');
      } else if (status === 403) {
        setError('Spotify rejected the command. Make sure Premium is active.');
      } else {
        setError('Playback failed. Open the Spotify app, play any song, then press ▶ here.');
      }
      setIsPlaying(false);
      stopTick();
    }
  }, [selectedDeviceId, uris, startTick, stopTick, startPoll]);

  // ── Controls ──────────────────────────────────────────────────────────────────

  const handlePlayPause = useCallback(async () => {
    if (!hasStarted) {
      await playAtIndex(currentIndex);
      return;
    }
    try {
      const token = await fetchToken();
      if (isPlaying) {
        await apiPause(token);
        setIsPlaying(false);
        stopTick();
      } else {
        await apiResume(selectedDeviceId!, token);
        setIsPlaying(true);
        startTick();
      }
      startPoll();
    } catch {
      setError('Command failed. Check Spotify is still open.');
    }
  }, [hasStarted, isPlaying, currentIndex, selectedDeviceId, playAtIndex, startTick, stopTick, startPoll]);

  const handleNext = useCallback(async () => {
    const next = currentIndex + 1;
    if (next >= songs.length) return;
    if (hasStarted) {
      try {
        const token = await fetchToken();
        await apiNext(token);
      } catch { /* non-fatal */ }
    }
    setCurrentIndex(next);
  }, [currentIndex, songs.length, hasStarted]);

  const handlePrev = useCallback(async () => {
    if (positionMs > 3000 && hasStarted) {
      try { const token = await fetchToken(); await apiSeek(0, token); } catch { /* non-fatal */ }
      setPositionMs(0);
      return;
    }
    const prev = currentIndex - 1;
    if (prev < 0) return;
    if (hasStarted) {
      try { const token = await fetchToken(); await apiPrevious(token); } catch { /* non-fatal */ }
    }
    setCurrentIndex(prev);
  }, [positionMs, currentIndex, hasStarted]);

  const handleSeek = useCallback(async (ms: number) => {
    if (!hasStarted) return;
    try { const token = await fetchToken(); await apiSeek(ms, token); } catch { /* non-fatal */ }
    setPositionMs(ms);
  }, [hasStarted]);

  // ── Derived render values ─────────────────────────────────────────────────────

  const currentSong    = songs[currentIndex];
  const sequences      = currentSong.sequences;
  const effectiveDur   = durationMs || currentSong.durationMs;
  const progress       = effectiveDur > 0 ? Math.min(positionMs / effectiveDur, 1) : 0;
  const isAtEnd        = currentIndex >= songs.length - 1;
  const isAtStart      = currentIndex === 0 && positionMs <= 3000 && !hasStarted;

  const activeSeqIndex = sequences.findIndex((s) => positionMs >= s.startMs && positionMs < s.endMs);
  const activeSeq      = activeSeqIndex >= 0 ? sequences[activeSeqIndex] : null;
  const activeColour   = activeSeqIndex >= 0 ? MARK_COLOURS[activeSeqIndex % MARK_COLOURS.length] : null;

  const gradient = useMemo(
    () => buildGradient(sequences, effectiveDur),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sequences, effectiveDur],
  );

  // ── Track bar (seekable) ──────────────────────────────────────────────────────

  const barRef = useRef<HTMLDivElement>(null);
  const handleBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current || effectiveDur === 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    handleSeek(Math.round(ratio * effectiveDur));
  }, [effectiveDur, handleSeek]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800">

      {/* Track progress line */}
      <div
        ref={barRef}
        onClick={handleBarClick}
        className="relative w-full cursor-pointer select-none"
        style={{ height: '28px' }}
        role="slider"
        aria-label="Seek in track"
        aria-valuenow={positionMs}
        aria-valuemin={0}
        aria-valuemax={effectiveDur}
      >
        <div className="absolute left-0 right-0 rounded-sm" style={{ top: '10px', height: '8px', background: gradient }} />
        <div className="absolute right-0 rounded-r-sm bg-black/60" style={{ top: '10px', height: '8px', left: `${progress * 100}%` }} />
        <div className="absolute bg-white rounded-full shadow" style={{ top: '6px', width: '16px', height: '16px', left: `${progress * 100}%`, transform: 'translateX(-50%)', pointerEvents: 'none' }} />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-5 space-y-3">

        {/* Active mark note */}
        {activeSeq?.note && (
          <div className="pl-2.5 border-l-2" style={{ borderColor: activeColour ?? undefined }}>
            <p className="text-base text-zinc-300 leading-snug whitespace-pre-wrap">{activeSeq.note}</p>
          </div>
        )}

        {/* Device picker — shown when no device selected or none found */}
        {!selectedDeviceId && (
          <div className="space-y-2">
            {loadingDevices ? (
              <p className="text-zinc-500 text-sm text-center animate-pulse">Looking for Spotify devices…</p>
            ) : devices.length === 0 ? (
              <div className="text-center space-y-2">
                <p className="text-zinc-400 text-sm">{error || 'Open Spotify on your device first.'}</p>
                <button onClick={loadDevices} className="text-white text-sm underline">Refresh</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-zinc-500 text-sm">
                  Choose a device. If your phone shows a grey dot, play any song
                  in Spotify first to activate it, then come back.
                </p>
                {devices.filter((d) => !d.is_restricted).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setSelectedDeviceId(d.id); setSelectedDeviceName(d.name); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-left transition-colors"
                  >
                    <span className="text-xl">{deviceIcon(d.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-base truncate">{d.name}</p>
                      <p className="text-zinc-500 text-sm">
                        {d.type}
                        {d.is_active
                          ? <span className="text-[#1DB954] ml-1">· ready</span>
                          : <span className="text-zinc-600 ml-1">· needs activation</span>}
                      </p>
                    </div>
                    <span className={`text-sm shrink-0 ${d.is_active ? 'text-[#1DB954]' : 'text-zinc-700'}`}>●</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && selectedDeviceId && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        {/* Player controls — shown once a device is selected */}
        {selectedDeviceId && (
          <div className="flex items-center gap-3">

            {/* Current song info */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-base font-medium truncate leading-snug">{currentSong.title}</p>
              <p className="text-zinc-500 text-sm truncate">
                {currentSong.artist}
                {hasStarted && (
                  <span className="ml-2 tabular-nums text-zinc-600">
                    {fmtMs(positionMs)} / {fmtMs(effectiveDur)}
                  </span>
                )}
              </p>
              {/* Device indicator — tap to change */}
              <button
                onClick={() => setSelectedDeviceId(null)}
                className="text-zinc-700 text-sm hover:text-zinc-400 transition-colors truncate max-w-full text-left"
              >
                ▸ {selectedDeviceName}
              </button>
            </div>

            {/* Queue position */}
            <span className="text-zinc-700 text-sm tabular-nums shrink-0">
              {currentIndex + 1} / {songs.length}
            </span>

            {/* Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <ConnCtrlBtn label="Previous" disabled={isAtStart} onClick={handlePrev}>
                <PrevIcon />
              </ConnCtrlBtn>

              <button
                onClick={handlePlayPause}
                className="w-11 h-11 rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform shrink-0 ml-1"
                aria-label={isPlaying ? 'Pause' : 'Play playlist'}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>

              <ConnCtrlBtn label="Next" disabled={isAtEnd} onClick={handleNext}>
                <NextIcon />
              </ConnCtrlBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConnCtrlBtn({ children, label, disabled, onClick }: {
  children: React.ReactNode; label: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors
        ${disabled ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-95'}`}
    >
      {children}
    </button>
  );
}

function PlayIcon()  { return <svg viewBox="0 0 24 24" className="w-5 h-5 ml-0.5" fill="black"><path d="M8 5v14l11-7z"/></svg>; }
function PauseIcon() { return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="black"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>; }
function PrevIcon()  { return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>; }
function NextIcon()  { return <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>; }
