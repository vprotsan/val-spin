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

export default function ConnectPlayer({
  songs,
  onCurrentIndexChange,
}: {
  songs: Song[];
  onCurrentIndexChange?: (idx: number) => void;
}) {
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

  const tickRef                  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef                  = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPlayingRef             = useRef(false);
  const onCurrentIndexChangeRef  = useRef(onCurrentIndexChange);
  useEffect(() => { onCurrentIndexChangeRef.current = onCurrentIndexChange; }, [onCurrentIndexChange]);

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
      if (idx >= 0 && idx !== currentIndex) {
        setCurrentIndex(idx);
        onCurrentIndexChangeRef.current?.(idx);
      }

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

      // Send the play command. device_id in the URL handles transfer + play
      // atomically — no separate transfer call needed.
      await apiPlayQueue(uris, idx, selectedDeviceId, token);

      // Update UI optimistically so it feels instant
      setCurrentIndex(idx);
      onCurrentIndexChangeRef.current?.(idx);
      setHasStarted(true);
      setPositionMs(0);

      // Verify playback started. Spotify can take 1–3 s to transition
      // (it briefly pauses while loading the new track), so we retry up to
      // 5 times × 700 ms = 3.5 s before giving up.
      let confirmed = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 700));
        try {
          const checkToken = await fetchToken();
          const state = await apiGetPlaybackState(checkToken);
          if (state?.is_playing) {
            confirmed = true;
            setIsPlaying(true);
            isPlayingRef.current = true;
            setPositionMs(state.progress_ms);
            setDurationMs(state.item?.duration_ms ?? 0);
            startTick();
            startPoll();
            break;
          }
        } catch { /* network hiccup — keep retrying */ }
      }

      if (!confirmed) {
        setError(
          'Spotify didn\'t respond after 3 s. ' +
          'Make sure the Spotify app is open and has played at least one song this session, then press ▶ again.',
        );
        setIsPlaying(false);
        stopTick();
      }
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        setError('Device not found. Open the Spotify app and tap Refresh.');
      } else if (status === 403) {
        setError('Permission denied — check Spotify Premium is active.');
      } else {
        setError(`Playback failed (${status ?? 'network error'}). Open Spotify on your phone and try again.`);
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
    onCurrentIndexChangeRef.current?.(next);
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
    onCurrentIndexChangeRef.current?.(prev);
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

  const nextSeq      = sequences.find((s) => s.startMs > positionMs);
  const countdownMs  = activeSeq
    ? activeSeq.endMs - positionMs
    : nextSeq
      ? nextSeq.startMs - positionMs
      : effectiveDur - positionMs;
  const countdownLabel = activeSeq ? 'cue ends' : nextSeq ? 'next cue' : 'song ends';

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
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800 min-h-[33vh] flex flex-col">

      {/* Track progress line */}
      <div
        ref={barRef}
        onClick={handleBarClick}
        className="relative w-full cursor-pointer select-none shrink-0"
        style={{ height: '48px' }}
        role="slider"
        aria-label="Seek in track"
        aria-valuenow={positionMs}
        aria-valuemin={0}
        aria-valuemax={effectiveDur}
      >
        <div className="absolute left-0 right-0 rounded-sm" style={{ top: '16px', height: '18px', background: gradient }} />
        <div className="absolute right-0 rounded-r-sm bg-black/60" style={{ top: '16px', height: '18px', left: `${progress * 100}%` }} />
        <div className="absolute bg-white rounded-full shadow" style={{ top: '13px', width: '26px', height: '26px', left: `${progress * 100}%`, transform: 'translateX(-50%)', pointerEvents: 'none' }} />
      </div>

      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 pt-3 pb-5 min-h-0">

        {/* Song info */}
        <div className="mb-2 flex justify-between">
          {hasStarted && (
            <span className="tabular-nums text-3xl text-zinc-600">
              {fmtMs(positionMs)} / {fmtMs(effectiveDur)}
            </span>
          )}
          <span className="text-zinc-700 text-3xl tabular-nums ml-auto">
            {currentIndex + 1} / {songs.length}
          </span>
        </div>

        {/* All sequence notes — scrollable list, active one highlighted */}
        {sequences.some((s) => s.note) && (
          <div className="flex-1 overflow-y-auto mb-2 space-y-1 min-h-0">
            {sequences.map((seq, i) => {
              if (!seq.note) return null;
              const isActive = seq === activeSeq;
              const colour = MARK_COLOURS[i % MARK_COLOURS.length];
              const seqDurationMs = seq.endMs - seq.startMs;
              const remaining = isActive ? seq.endMs - positionMs : null;
              return (
                <div
                  key={seq.id ?? i}
                  className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors ${
                    isActive ? 'bg-zinc-800' : 'opacity-50'
                  }`}
                  style={isActive ? { borderLeft: `3px solid ${colour}` } : { borderLeft: '3px solid transparent' }}
                >
                  <p className={`text-base leading-snug flex-1 ${isActive ? 'text-white font-medium' : 'text-zinc-400'}`}>
                    {seq.note}
                  </p>
                  <div className="text-right shrink-0 tabular-nums">
                    {isActive && remaining !== null ? (
                      <>
                        <p className="text-white text-2xl font-semibold">{fmtMs(Math.max(0, remaining))}</p>
                        <p className="text-zinc-500 text-xs">of {fmtMs(seqDurationMs)}</p>
                      </>
                    ) : (
                      <p className="text-zinc-500 text-base">{fmtMs(seqDurationMs)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Standalone countdown when between cues or no notes */}
        {!activeSeq && hasStarted && (
          <div className="flex justify-end mb-2">
            <div className="text-right">
              <p className="text-zinc-100 text-4xl tabular-nums">{fmtMs(Math.max(0, countdownMs))}</p>
              <p className="text-zinc-500 text-sm">{countdownLabel}</p>
            </div>
          </div>
        )}

        {/* Device picker — shown when no device selected or none found */}
        {!selectedDeviceId && (
          <div className="space-y-2 mb-2">
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
          <p className="text-red-400 text-sm text-center mb-2">{error}</p>
        )}

        {/* Controls — pushed to bottom */}
        <div className="mt-auto">
          {selectedDeviceId && (
            <>
              <div className="flex items-center justify-center gap-10">
                <ConnCtrlBtn label="Previous" disabled={isAtStart} onClick={handlePrev}>
                  <PrevIcon />
                </ConnCtrlBtn>

                <button
                  onClick={handlePlayPause}
                  className="w-15 h-15 rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform shrink-0 ml-1"
                  aria-label={isPlaying ? 'Pause' : 'Play playlist'}
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </button>

                <ConnCtrlBtn label="Next" disabled={isAtEnd} onClick={handleNext}>
                  <NextIcon />
                </ConnCtrlBtn>
              </div>

              <button
                onClick={() => setSelectedDeviceId(null)}
                className="mt-1 text-zinc-700 text-sm hover:text-zinc-400 transition-colors truncate max-w-full text-left block mx-auto"
              >
                ▸ {selectedDeviceName}
              </button>
            </>
          )}
        </div>
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
      className={`w-18 h-18 flex items-center justify-center rounded-full transition-colors
        ${disabled ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-95'}`}
    >
      {children}
    </button>
  );
}

function PlayIcon()  { return <svg viewBox="0 0 24 24" className="w-10 h-10 ml-0.5" fill="black"><path d="M8 5v14l11-7z"/></svg>; }
function PauseIcon() { return <svg viewBox="0 0 24 24" className="w-10 h-10" fill="black"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>; }
function PrevIcon()  { return <svg viewBox="0 0 24 24" className="w-10 h-10" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>; }
function NextIcon()  { return <svg viewBox="0 0 24 24" className="w-10 h-10" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>; }
