'use client';

import { useEffect, useRef, useState, useCallback, useTransition } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import {
  addSequenceAction,
  updateSequenceAction,
  deleteSequenceAction,
} from '@/app/actions/sequences';
import type { Song, Sequence } from '@/types';

// ── Spotify helpers ────────────────────────────────────────────────────────────

async function fetchToken(): Promise<string> {
  const res = await fetch('/api/auth/token');
  if (!res.ok) throw new Error('Not authenticated');
  return res.json().then((d) => d.accessToken);
}

async function transferPlayback(deviceId: string, token: string) {
  const res = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: [deviceId], play: false }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`Transfer playback failed: ${res.status}`);
  }
}

async function playSong(uri: string, deviceId: string, positionMs: number, token: string): Promise<string | null> {
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ uris: [uri], position_ms: positionMs }),
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 403) return 'Spotify Premium is required for playback.';
    if (res.status === 404) return 'Player device not found — try reloading the page.';
    return body?.error?.message ?? `Playback failed (${res.status})`;
  }
  return null;
}

// ── Formatting ─────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Parse mm:ss or m:ss string → ms, or null if invalid. */
function parseTimestamp(s: string): number | null {
  const m = s.trim().match(/^(\d+):([0-5]\d)$/);
  if (!m) return null;
  return (parseInt(m[1]) * 60 + parseInt(m[2])) * 1000;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type PlayerStatus = 'loading' | 'connecting' | 'ready' | 'error';

interface PlaybackState {
  paused: boolean;
  positionMs: number;
  durationMs: number;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SequenceEditor({ song }: { song: Song }) {
  // Player state
  const playerRef = useRef<Spotify.Player | null>(null);
  const deviceIdRef = useRef('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>('loading');
  const [playerError, setPlayerError] = useState('');
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [isThisSongActive, setIsThisSongActive] = useState(false);

  // Sequence state — owned locally; server is source of truth on mount only
  const [sequences, setSequences] = useState<Sequence[]>(song.sequences);

  // Marking state
  const [pendingStartMs, setPendingStartMs] = useState<number | null>(null);
  const [pendingNote, setPendingNote] = useState('');
  const [markError, setMarkError] = useState('');
  const [isMarking, startMarkTransition] = useTransition();

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Ticker ─────────────────────────────────────────────────────────────────
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

  // ── SDK init ───────────────────────────────────────────────────────────────
  const initPlayer = useCallback(async () => {
    setPlayerStatus('connecting');
    let token: string;
    try { token = await fetchToken(); }
    catch { setPlayerStatus('error'); setPlayerError('Could not fetch token.'); return; }

    const player = new window.Spotify.Player({
      name: 'Cycling Playlist',
      getOAuthToken: (cb) => fetchToken().then(cb).catch(() => cb('')),
      volume: 0.8,
    });
    playerRef.current = player;

    player.addListener('initialization_error', ({ message }) => { setPlayerStatus('error'); setPlayerError(`Init: ${message}`); });
    player.addListener('authentication_error', ({ message }) => { setPlayerStatus('error'); setPlayerError(`Auth: ${message}`); });
    player.addListener('account_error', ({ message }) => { setPlayerStatus('error'); setPlayerError(`Account (Premium required): ${message}`); });
    player.addListener('playback_error', ({ message }) => console.warn('Playback:', message));

    player.addListener('ready', async ({ device_id }) => {
      deviceIdRef.current = device_id;
      try { await transferPlayback(device_id, token); setPlayerStatus('ready'); }
      catch { setPlayerStatus('error'); setPlayerError('Could not transfer playback.'); }
    });

    player.addListener('player_state_changed', (state) => {
      if (!state) { setIsThisSongActive(false); return; }
      const active = state.track_window.current_track.uri === song.spotifyUri;
      setIsThisSongActive(active);
      if (active) {
        setPlayback({ paused: state.paused, positionMs: state.position, durationMs: state.duration });
        if (state.paused) stopTick(); else startTick();
      }
    });

    const ok = await player.connect();
    if (!ok) { setPlayerStatus('error'); setPlayerError('Player failed to connect.'); }
  }, [song.spotifyUri, startTick, stopTick]);

  useEffect(() => () => { stopTick(); playerRef.current?.disconnect(); }, [stopTick]);

  // ── Playback controls ──────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (!deviceIdRef.current) return;
    const token = await fetchToken();
    const posMs = (isThisSongActive && playback) ? playback.positionMs : 0;
    const err = await playSong(song.spotifyUri, deviceIdRef.current, posMs, token);
    if (err) setPlayerError(err);
  }, [song.spotifyUri, isThisSongActive, playback]);

  const handleToggle = useCallback(async () => {
    if (!isThisSongActive) { await handlePlay(); return; }
    await playerRef.current?.togglePlay();
  }, [isThisSongActive, handlePlay]);

  const handleSeek = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const ms = Number(e.target.value);
    setPlayback((prev) => prev ? { ...prev, positionMs: ms } : prev);
    await playerRef.current?.seek(ms);
  }, []);

  // ── Mark Start — read exact SDK position at the moment of tap ────────────
  const handleMarkStart = useCallback(async () => {
    // getCurrentState() returns the authoritative position from the SDK,
    // avoiding up-to-250ms drift from the local ticker.
    const state = await playerRef.current?.getCurrentState();
    const pos = state?.position ?? playback?.positionMs ?? 0;
    setPendingStartMs(pos);
    // Sync the local display so the "Start: X:XX" label is immediately accurate
    if (state) setPlayback((prev) => prev ? { ...prev, positionMs: state.position } : prev);
    setMarkError('');
    setPendingNote('');
  }, [playback]);

  // ── Mark End — read exact SDK position at the moment of tap ─────────────
  const handleMarkEnd = useCallback(async () => {
    if (pendingStartMs === null) return;
    const state = await playerRef.current?.getCurrentState();
    const endMs = state?.position ?? playback?.positionMs ?? 0;
    if (state) setPlayback((prev) => prev ? { ...prev, positionMs: state.position } : prev);

    if (endMs <= pendingStartMs) {
      setMarkError(`End (${fmtMs(endMs)}) must be after start (${fmtMs(pendingStartMs)}). Keep playing then tap Mark End.`);
      return;
    }

    setMarkError('');
    startMarkTransition(async () => {
      const result = await addSequenceAction(song.spotifyUri, pendingStartMs, endMs, pendingNote || undefined);
      if (!result.ok) { setMarkError(result.error); return; }
      setSequences((prev) =>
        [...prev, { id: result.sequenceId, startMs: pendingStartMs, endMs, ...(pendingNote.trim() ? { note: pendingNote.trim() } : {}) }]
          .sort((a, b) => a.startMs - b.startMs)
      );
      setPendingStartMs(null);
      setPendingNote('');
    });
  }, [pendingStartMs, playback, pendingNote, song.id]);

  // ── Cancel mark ────────────────────────────────────────────────────────────
  const handleCancelMark = () => { setPendingStartMs(null); setPendingNote(''); setMarkError(''); };

  // ── Delete sequence ────────────────────────────────────────────────────────
  const handleDelete = useCallback((seqId: string) => {
    setSequences((prev) => prev.filter((s) => s.id !== seqId));
    deleteSequenceAction(song.spotifyUri, seqId);
  }, [song.id]);

  // ── Save edited sequence ───────────────────────────────────────────────────
  const handleSaveEdit = useCallback(async (
    seqId: string,
    startVal: string,
    endVal: string,
    noteVal: string,
  ) => {
    const startMs = parseTimestamp(startVal);
    const endMs = parseTimestamp(endVal);
    if (startMs === null) { return 'Invalid start time (use m:ss)'; }
    if (endMs === null) { return 'Invalid end time (use m:ss)'; }
    if (endMs <= startMs) { return 'End must be after start'; }

    const result = await updateSequenceAction(song.spotifyUri, seqId, startMs, endMs, noteVal || undefined);
    if (!result.ok) return result.error;

    setSequences((prev) =>
      prev.map((s) => s.id === seqId
        ? { ...s, startMs, endMs, ...(noteVal.trim() ? { note: noteVal.trim() } : { note: undefined }) }
        : s
      ).sort((a, b) => a.startMs - b.startMs)
    );
    setEditingId(null);
    return null;
  }, [song.id]);

  // ── Seek to sequence start ─────────────────────────────────────────────────
  const handleSeekToSeq = useCallback(async (startMs: number) => {
    if (!isThisSongActive) { await handlePlay(); }
    await playerRef.current?.seek(startMs);
    setPlayback((prev) => prev ? { ...prev, positionMs: startMs } : prev);
  }, [isThisSongActive, handlePlay]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const progress = playback && playback.durationMs > 0 ? playback.positionMs / playback.durationMs : 0;
  const isPlaying = isThisSongActive && playback && !playback.paused;

  return (
    <>
      <Script
        src="https://sdk.scdn.co/spotify-player.js"
        strategy="afterInteractive"
        onReady={() => { if (window.Spotify) initPlayer(); else window.onSpotifyWebPlaybackSDKReady = initPlayer; }}
      />

      {/* Scrollable content — padded at bottom for fixed controls */}
      <div className="min-h-screen bg-black pb-56">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-zinc-800 px-4 pt-4 pb-3">
          <div className="max-w-lg mx-auto">
            <Link href="/tagging" className="text-zinc-400 hover:text-white text-base transition-colors">
              ← Back
            </Link>
            <h1 className="text-white font-bold text-xl mt-1 truncate">{song.title}</h1>
            <p className="text-zinc-400 text-base truncate">{song.artist}</p>
          </div>
        </header>

        {/* Player status */}
        <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
          {playerStatus === 'loading' && (
            <p className="text-zinc-500 text-base animate-pulse">Loading Spotify player…</p>
          )}
          {playerStatus === 'connecting' && (
            <p className="text-zinc-500 text-base animate-pulse">Connecting…</p>
          )}
          {(playerStatus === 'error' || (playerStatus === 'ready' && playerError)) && (
            <p className="text-red-400 text-base bg-red-950/30 rounded-lg px-3 py-2">{playerError}</p>
          )}

          {/* Progress bar */}
          {playerStatus === 'ready' && (
            <div className="space-y-1">
              <input
                type="range"
                min={0}
                max={playback?.durationMs ?? song.durationMs}
                value={isThisSongActive ? (playback?.positionMs ?? 0) : 0}
                onChange={handleSeek}
                disabled={!isThisSongActive}
                className="w-full h-1.5 accent-[#1DB954] rounded-full cursor-pointer disabled:opacity-30"
              />
              <div className="flex justify-between text-sm text-zinc-500 tabular-nums">
                <span>{isThisSongActive && playback ? fmtMs(playback.positionMs) : '0:00'}</span>
                <span>{fmtMs(song.durationMs)}</span>
              </div>
            </div>
          )}

          {/* Play/pause */}
          {playerStatus === 'ready' && (
            <div className="flex justify-center">
              <button
                onClick={handleToggle}
                className="w-14 h-14 rounded-full bg-white flex items-center justify-center active:scale-95 transition-transform shadow-lg"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="black">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-6 h-6 ml-0.5" fill="black">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            </div>
          )}

          {/* Sequence list */}
          <section>
            <h2 className="text-zinc-400 text-sm font-semibold uppercase tracking-widest mb-3">
              Sequences — {sequences.length}
            </h2>
            {sequences.length === 0 && (
              <p className="text-zinc-600 text-base py-6 text-center">
                No sequences yet.
                <br />
                <span className="text-zinc-700">Play the track and tap Mark Start below.</span>
              </p>
            )}
            <ul className="space-y-2">
              {sequences.map((seq) =>
                editingId === seq.id ? (
                  <EditRow
                    key={seq.id}
                    seq={seq}
                    currentPositionMs={playback?.positionMs ?? 0}
                    onSave={handleSaveEdit}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <SequenceRow
                    key={seq.id}
                    seq={seq}
                    onSeek={() => handleSeekToSeq(seq.startMs)}
                    onEdit={() => setEditingId(seq.id)}
                    onDelete={() => handleDelete(seq.id)}
                  />
                )
              )}
            </ul>
          </section>
        </div>
      </div>

      {/* ── Fixed bottom controls ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-zinc-950 border-t border-zinc-800 px-4 pt-3 pb-6 safe-bottom">
        <div className="max-w-lg mx-auto space-y-2">
          {/* Error */}
          {markError && (
            <p className="text-red-400 text-sm bg-red-950/40 rounded-lg px-3 py-2 text-center">
              {markError}
            </p>
          )}

          {pendingStartMs === null ? (
            /* No pending start — show single Mark Start button */
            <button
              onClick={handleMarkStart}
              disabled={playerStatus !== 'ready' || isMarking}
              className={`
                w-full rounded-2xl py-5 text-center font-bold text-xl tracking-wide transition-all active:scale-[0.98]
                ${playerStatus === 'ready'
                  ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-900/40'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}
              `}
            >
              Mark Start
              {playback && isThisSongActive && (
                <span className="block text-base font-normal opacity-70 mt-0.5">
                  at {fmtMs(playback.positionMs)}
                </span>
              )}
            </button>
          ) : (
            /* Pending start — show note input + Mark End + cancel */
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-amber-950/40 border border-amber-800/50 rounded-xl px-4 py-2">
                <span className="text-amber-300 text-base font-medium shrink-0">
                  Start: {fmtMs(pendingStartMs)}
                </span>
                <input
                  type="text"
                  value={pendingNote}
                  onChange={(e) => setPendingNote(e.target.value)}
                  placeholder="Optional note…"
                  className="flex-1 bg-transparent text-white text-base placeholder-zinc-600 outline-none"
                />
              </div>
              <button
                onClick={handleMarkEnd}
                disabled={isMarking}
                className="w-full rounded-2xl py-5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xl tracking-wide transition-all active:scale-[0.98] shadow-lg shadow-emerald-900/40 disabled:opacity-50"
              >
                Mark End
                {playback && isThisSongActive && (
                  <span className="block text-base font-normal opacity-70 mt-0.5">
                    at {fmtMs(playback.positionMs)}
                  </span>
                )}
              </button>
              <button
                onClick={handleCancelMark}
                className="w-full text-zinc-500 hover:text-zinc-300 text-base py-1 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── SequenceRow ────────────────────────────────────────────────────────────────

function SequenceRow({
  seq,
  onSeek,
  onEdit,
  onDelete,
}: {
  seq: Sequence;
  onSeek: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
      {/* Timestamps — tap to seek */}
      <button onClick={onSeek} className="flex-1 text-left min-w-0">
        <p className="text-white text-base font-mono tabular-nums">
          {fmtMs(seq.startMs)}
          <span className="text-zinc-500"> – </span>
          {fmtMs(seq.endMs)}
          <span className="text-zinc-500"> · </span>
          {fmtMs(seq.endMs - seq.startMs)}
        </p>
        {seq.note && <p className="text-zinc-400 text-sm mt-0.5 truncate">{seq.note}</p>}
      </button>
      {/* Actions */}
      <button onClick={onEdit} className="text-zinc-500 hover:text-white transition-colors p-1.5" aria-label="Edit">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button onClick={onDelete} className="text-zinc-500 hover:text-red-400 transition-colors p-1.5" aria-label="Delete">
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
      </button>
    </li>
  );
}

// ── EditRow ────────────────────────────────────────────────────────────────────

function EditRow({
  seq,
  currentPositionMs,
  onSave,
  onCancel,
}: {
  seq: Sequence;
  currentPositionMs: number;
  onSave: (id: string, start: string, end: string, note: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [startVal, setStartVal] = useState(fmtMs(seq.startMs));
  const [endVal, setEndVal] = useState(fmtMs(seq.endMs));
  const [noteVal, setNoteVal] = useState(seq.note ?? '');
  const [error, setError] = useState('');
  const [saving, startSave] = useTransition();

  function handleSave() {
    startSave(async () => {
      const err = await onSave(seq.id, startVal, endVal, noteVal);
      if (err) setError(err);
    });
  }

  return (
    <li className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 space-y-2">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="flex gap-2">
        <label className="flex-1 space-y-0.5">
          <span className="text-zinc-500 text-sm">Start (m:ss)</span>
          <div className="flex gap-1">
            <input
              value={startVal}
              onChange={(e) => setStartVal(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-base font-mono outline-none focus:border-zinc-500"
              placeholder="0:00"
            />
            <button
              onClick={() => setStartVal(fmtMs(currentPositionMs))}
              className="text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700 rounded-lg px-2 text-sm transition-colors"
              title="Set to current position"
            >
              ↖
            </button>
          </div>
        </label>
        <label className="flex-1 space-y-0.5">
          <span className="text-zinc-500 text-sm">End (m:ss)</span>
          <div className="flex gap-1">
            <input
              value={endVal}
              onChange={(e) => setEndVal(e.target.value)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-base font-mono outline-none focus:border-zinc-500"
              placeholder="0:00"
            />
            <button
              onClick={() => setEndVal(fmtMs(currentPositionMs))}
              className="text-zinc-400 hover:text-white bg-zinc-800 border border-zinc-700 rounded-lg px-2 text-sm transition-colors"
              title="Set to current position"
            >
              ↖
            </button>
          </div>
        </label>
      </div>
      <input
        value={noteVal}
        onChange={(e) => setNoteVal(e.target.value)}
        placeholder="Note (optional)"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-base outline-none focus:border-zinc-500 placeholder-zinc-600"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-white text-black text-base font-semibold py-2 hover:bg-zinc-100 transition-colors disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-zinc-700 text-zinc-400 text-base py-2 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </li>
  );
}
