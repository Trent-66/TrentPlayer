import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';

import { logPlaybackHistory } from '../services/apiService';
import { parseLibraryTrackId, refreshLibraryStream, type CatalogSong } from '../services/catalogService';

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaybackContextValue {
  current: CatalogSong | null;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  audioReady: boolean;
  currentTime: number;
  duration: number;
  playSong: (song: CatalogSong, queue?: readonly CatalogSong[]) => void;
  /** Starts `songs` from the top, or pauses/resumes when that queue is already loaded. */
  toggleQueue: (songs: readonly CatalogSong[]) => void;
  togglePlayback: () => void;
  skipNext: () => void;
  skipPrevious: () => void;
  seekTo: (seconds: number) => void;
  setShuffle: (enabled: boolean) => void;
  cycleRepeat: () => void;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swap];
    copy[swap] = current;
  }
  return copy;
}

function orderQueue(
  songs: readonly CatalogSong[],
  startId: string | null,
  shuffleOn: boolean,
): { queue: CatalogSong[]; index: number } {
  if (songs.length === 0) {
    return { queue: [], index: 0 };
  }
  if (!shuffleOn) {
    const found = startId == null ? 0 : songs.findIndex((song) => song.id === startId);
    return { queue: [...songs], index: found >= 0 ? found : 0 };
  }
  if (startId == null) {
    return { queue: shuffled(songs), index: 0 };
  }
  const current = songs.find((song) => song.id === startId) ?? songs[0];
  const rest = shuffled(songs.filter((song) => song.id !== current.id));
  return { queue: [current, ...rest], index: 0 };
}

function NativePlaybackProvider({ children }: { children: React.ReactNode }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const statusRef = useRef(status);
  statusRef.current = status;
  const [current, setCurrent] = useState<CatalogSong | null>(null);
  const [shuffle, setShuffleState] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const queueRef = useRef<CatalogSong[]>([]);
  const sourceRef = useRef<CatalogSong[]>([]);
  const indexRef = useRef(0);
  const advancingRef = useRef(false);
  const shuffleRef = useRef(shuffle);
  const repeatRef = useRef(repeat);
  const playGen = useRef(0);
  shuffleRef.current = shuffle;
  repeatRef.current = repeat;

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'doNotMix',
    }).catch(() => {
      // Foreground previews still work in Expo Go without extra audio entitlements.
    });
  }, []);

  const startAt = useCallback(
    (queue: readonly CatalogSong[], index: number) => {
      const song = queue[index];
      if (!song) {
        return;
      }
      queueRef.current = [...queue];
      indexRef.current = index;
      setCurrent(song);
      const generation = ++playGen.current;
      void (async () => {
        try {
          const playable = await refreshLibraryStream(song);
          if (generation !== playGen.current) {
            return;
          }
          queueRef.current[index] = playable;
          const sourceIndex = sourceRef.current.findIndex((item) => item.id === playable.id);
          if (sourceIndex >= 0) {
            sourceRef.current[sourceIndex] = playable;
          }
          setCurrent(playable);
          player.replace({ uri: playable.streamUrl, headers: playable.streamHeaders });
          player.loop = repeatRef.current === 'one';
          player.play();
          const trackId = parseLibraryTrackId(playable);
          if (trackId != null) {
            void logPlaybackHistory(trackId);
          }
        } catch {
          if (generation === playGen.current) {
            Alert.alert(song.title, 'Could not start this song. Check that the backend is running and you are signed in.');
          }
        }
      })();
    },
    [player],
  );

  useEffect(() => {
    if (!status.didJustFinish) {
      advancingRef.current = false;
      return;
    }
    if (advancingRef.current) {
      return;
    }
    advancingRef.current = true;
    if (repeatRef.current === 'one') {
      if (!player.loop) {
        void player.seekTo(0).then(() => player.play());
      }
      return;
    }
    const next = indexRef.current + 1;
    if (next < queueRef.current.length) {
      startAt(queueRef.current, next);
      return;
    }
    if (repeatRef.current === 'all' && queueRef.current.length > 0) {
      startAt(queueRef.current, 0);
    }
  }, [player, startAt, status.didJustFinish]);

  useEffect(() => {
    player.loop = repeat === 'one';
  }, [player, repeat]);

  const playSong = useCallback(
    (song: CatalogSong, queue: readonly CatalogSong[] = [song]) => {
      const list = queue.length > 0 ? queue : [song];
      sourceRef.current = [...list];
      const ordered = orderQueue(list, song.id, shuffleRef.current);
      startAt(ordered.queue, ordered.index);
    },
    [startAt],
  );

  const toggleQueue = useCallback(
    (songs: readonly CatalogSong[]) => {
      if (songs.length === 0) {
        return;
      }
      const playback = statusRef.current;
      const loaded = current !== null && songs.some((song) => song.id === current.id);
      if (loaded) {
        const atEndOfQueue =
          !playback.playing &&
          indexRef.current >= queueRef.current.length - 1 &&
          (playback.didJustFinish || (playback.duration > 0 && playback.currentTime >= playback.duration - 0.25));
        if (atEndOfQueue) {
          sourceRef.current = [...songs];
          const ordered = orderQueue(songs, null, shuffleRef.current);
          startAt(ordered.queue, ordered.index);
          return;
        }
        if (playback.playing) {
          player.pause();
        } else {
          player.play();
        }
        return;
      }
      sourceRef.current = [...songs];
      const ordered = orderQueue(songs, null, shuffleRef.current);
      startAt(ordered.queue, ordered.index);
    },
    [current, player, startAt],
  );

  const togglePlayback = useCallback(() => {
    if (!current) {
      return;
    }
    const playback = statusRef.current;
    if (playback.playing) {
      player.pause();
      return;
    }
    if (playback.didJustFinish || (playback.duration > 0 && playback.currentTime >= playback.duration - 0.25)) {
      void player.seekTo(0).then(() => player.play());
      return;
    }
    player.play();
  }, [current, player]);

  const setShuffle = useCallback((enabled: boolean) => {
    shuffleRef.current = enabled;
    setShuffleState(enabled);
    const source = sourceRef.current;
    const playing = queueRef.current[indexRef.current];
    if (source.length === 0 || !playing) {
      return;
    }
    const ordered = orderQueue(source, playing.id, enabled);
    const at = ordered.queue.findIndex((song) => song.id === playing.id);
    if (at >= 0) {
      ordered.queue[at] = playing;
    }
    queueRef.current = ordered.queue;
    indexRef.current = ordered.index;
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((currentMode) => (currentMode === 'off' ? 'all' : currentMode === 'all' ? 'one' : 'off'));
  }, []);

  const skipNext = useCallback(() => {
    const next = indexRef.current + 1;
    if (next < queueRef.current.length) {
      startAt(queueRef.current, next);
      return;
    }
    if (repeatRef.current === 'all' && queueRef.current.length > 0) {
      startAt(queueRef.current, 0);
      return;
    }
    if (repeatRef.current === 'one') {
      void player.seekTo(0).then(() => player.play());
    }
  }, [player, startAt]);

  const skipPrevious = useCallback(() => {
    if (statusRef.current.currentTime > 3) {
      void player.seekTo(0);
      return;
    }
    const previous = indexRef.current - 1;
    if (previous >= 0) {
      startAt(queueRef.current, previous);
      return;
    }
    if (repeatRef.current === 'all' && queueRef.current.length > 1) {
      startAt(queueRef.current, queueRef.current.length - 1);
      return;
    }
    void player.seekTo(0);
  }, [player, startAt]);

  const seekTo = useCallback(
    (seconds: number) => {
      void player.seekTo(Math.max(0, seconds));
    },
    [player],
  );

  const value = useMemo<PlaybackContextValue>(
    () => ({
      current,
      isPlaying: status.playing,
      shuffle,
      repeat,
      audioReady: true,
      currentTime: status.currentTime ?? 0,
      duration: status.duration ?? 0,
      playSong,
      toggleQueue,
      togglePlayback,
      skipNext,
      skipPrevious,
      seekTo,
      setShuffle,
      cycleRepeat,
    }),
    [
      current,
      cycleRepeat,
      playSong,
      repeat,
      seekTo,
      setShuffle,
      shuffle,
      skipNext,
      skipPrevious,
      status.currentTime,
      status.duration,
      status.playing,
      togglePlayback,
      toggleQueue,
    ],
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function PlaybackProvider({ children }: { children: React.ReactNode }) {
  return <NativePlaybackProvider>{children}</NativePlaybackProvider>;
}

export function usePlayback(): PlaybackContextValue {
  const value = useContext(PlaybackContext);
  if (!value) {
    throw new Error('usePlayback must be used inside PlaybackProvider.');
  }
  return value;
}
