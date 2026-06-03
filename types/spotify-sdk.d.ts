// Minimal typings for the Spotify Web Playback SDK
// https://developer.spotify.com/documentation/web-playback-sdk/reference

export {};

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: typeof Spotify;
  }

  namespace Spotify {
    interface PlayerInit {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    }

    interface WebPlaybackTrack {
      uri: string;
      id: string;
      name: string;
      duration_ms: number;
      artists: { name: string; uri: string }[];
      album: {
        name: string;
        uri: string;
        images: { url: string }[];
      };
    }

    interface WebPlaybackState {
      context: { uri: string };
      paused: boolean;
      position: number;       // ms
      duration: number;       // ms
      track_window: {
        current_track: WebPlaybackTrack;
        previous_tracks: WebPlaybackTrack[];
        next_tracks: WebPlaybackTrack[];
      };
    }

    interface WebPlaybackError {
      message: string;
    }

    class Player {
      constructor(options: PlayerInit);
      connect(): Promise<boolean>;
      disconnect(): void;
      togglePlay(): Promise<void>;
      pause(): Promise<void>;
      resume(): Promise<void>;
      seek(positionMs: number): Promise<void>;
      getCurrentState(): Promise<WebPlaybackState | null>;
      setVolume(volume: number): Promise<void>;
      addListener(event: 'ready', cb: (data: { device_id: string }) => void): void;
      addListener(event: 'not_ready', cb: (data: { device_id: string }) => void): void;
      addListener(event: 'player_state_changed', cb: (state: WebPlaybackState | null) => void): void;
      addListener(event: 'initialization_error', cb: (e: WebPlaybackError) => void): void;
      addListener(event: 'authentication_error', cb: (e: WebPlaybackError) => void): void;
      addListener(event: 'account_error', cb: (e: WebPlaybackError) => void): void;
      addListener(event: 'playback_error', cb: (e: WebPlaybackError) => void): void;
      removeListener(event: string, cb?: (...args: unknown[]) => void): void;
    }
  }
}
