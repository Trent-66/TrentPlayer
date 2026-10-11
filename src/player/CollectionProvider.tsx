import * as Crypto from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { showFavoriteNotice } from '../components/DownloadNotice';
import { likeTrack, unlikeTrack } from '../services/apiService';
import { loadFavoriteSongs, parseLibraryTrackId, type CatalogSong } from '../services/catalogService';
import { loadCollection, saveCollection, type UserPlaylist } from './collectionStore';

export type { UserPlaylist };

interface CollectionContextValue {
  saved: CatalogSong[];
  isSaved: (id: string) => boolean;
  toggleSaved: (song: CatalogSong) => void;
  setSongsSaved: (songs: readonly CatalogSong[], saved: boolean) => void;
  playlists: UserPlaylist[];
  createPlaylist: (name: string) => string;
  addSongToPlaylist: (playlistId: string, song: CatalogSong) => void;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<CatalogSong[]>([]);
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);
  const readyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snapshot = await loadCollection();
      if (cancelled) {
        return;
      }
      setPlaylists(snapshot.playlists);
      try {
        const favorites = await loadFavoriteSongs();
        if (!cancelled) {
          setSaved(favorites);
        }
      } catch {
        if (!cancelled) {
          setSaved(snapshot.saved);
        }
      }
      readyRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!readyRef.current) {
      return;
    }
    void saveCollection({ saved, playlists }).catch(() => {
      // Local cache write failures should not block browsing.
    });
  }, [playlists, saved]);

  const isSaved = useCallback((id: string) => saved.some((song) => song.id === id), [saved]);

  const toggleSaved = useCallback((song: CatalogSong) => {
    const trackId = parseLibraryTrackId(song);
    const alreadySaved = saved.some((item) => item.id === song.id);
    if (!alreadySaved) {
      showFavoriteNotice(song);
    }
    setSaved((current) => {
      const exists = current.some((item) => item.id === song.id);
      if (exists) {
        if (trackId != null) {
          void unlikeTrack(trackId).catch(() => {
            setSaved((rows) => [song, ...rows.filter((item) => item.id !== song.id)]);
          });
        }
        return current.filter((item) => item.id !== song.id);
      }
      if (trackId != null) {
        void likeTrack(trackId).catch(() => {
          setSaved((rows) => rows.filter((item) => item.id !== song.id));
        });
      }
      return [song, ...current];
    });
  }, [saved]);

  const setSongsSaved = useCallback((songs: readonly CatalogSong[], shouldSave: boolean) => {
    setSaved((current) => {
      const map = new Map(current.map((song) => [song.id, song]));
      for (const song of songs) {
        if (shouldSave) {
          map.set(song.id, song);
        } else {
          map.delete(song.id);
        }
      }
      return [...map.values()];
    });
  }, []);

  const createPlaylist = useCallback((name: string) => {
    const id = Crypto.randomUUID();
    const trimmed = name.trim();
    setPlaylists((current) => [...current, { id, name: trimmed, songs: [] }]);
    return id;
  }, []);

  const addSongToPlaylist = useCallback((playlistId: string, song: CatalogSong) => {
    setPlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId || playlist.songs.some((item) => item.id === song.id)) {
          return playlist;
        }
        return { ...playlist, songs: [...playlist.songs, song] };
      }),
    );
  }, []);

  const value = useMemo<CollectionContextValue>(
    () => ({
      saved,
      isSaved,
      toggleSaved,
      setSongsSaved,
      playlists,
      createPlaylist,
      addSongToPlaylist,
    }),
    [addSongToPlaylist, createPlaylist, isSaved, playlists, saved, setSongsSaved, toggleSaved],
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const value = useContext(CollectionContext);
  if (!value) {
    throw new Error('useCollection must be used inside CollectionProvider.');
  }
  return value;
}
