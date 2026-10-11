import * as FileSystem from 'expo-file-system/legacy';

import type { CatalogSong } from '../services/catalogService';

const COLLECTION_PATH = `${FileSystem.documentDirectory ?? ''}trent_collection.json`;

export interface UserPlaylist {
  id: string;
  name: string;
  songs: CatalogSong[];
}

export interface CollectionSnapshot {
  saved: CatalogSong[];
  playlists: UserPlaylist[];
}

const EMPTY: CollectionSnapshot = { saved: [], playlists: [] };

function isSong(value: unknown): value is CatalogSong {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.title === 'string' &&
    typeof row.artist === 'string' &&
    typeof row.album === 'string' &&
    typeof row.artworkUrl === 'string' &&
    typeof row.streamUrl === 'string' &&
    typeof row.durationMs === 'number'
  );
}

function isPlaylist(value: unknown): value is UserPlaylist {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.name === 'string' && Array.isArray(row.songs) && row.songs.every(isSong);
}

export async function loadCollection(): Promise<CollectionSnapshot> {
  if (!COLLECTION_PATH) {
    return EMPTY;
  }
  try {
    const info = await FileSystem.getInfoAsync(COLLECTION_PATH);
    if (!info.exists) {
      return EMPTY;
    }
    const raw = await FileSystem.readAsStringAsync(COLLECTION_PATH);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return EMPTY;
    }
    const row = parsed as Record<string, unknown>;
    const saved = Array.isArray(row.saved) ? row.saved.filter(isSong) : [];
    const playlists = Array.isArray(row.playlists) ? row.playlists.filter(isPlaylist) : [];
    return { saved, playlists };
  } catch {
    return EMPTY;
  }
}

export async function saveCollection(snapshot: CollectionSnapshot): Promise<void> {
  if (!COLLECTION_PATH) {
    return;
  }
  await FileSystem.writeAsStringAsync(COLLECTION_PATH, JSON.stringify(snapshot));
}
