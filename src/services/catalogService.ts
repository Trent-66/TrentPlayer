/**
 * TrentPlayer catalog
 * -------------------
 * Every playable song comes from the Spring Boot library:
 *   GET /api/v1/audio/tracks  → files in OneDrive\TrentPlayer-Music
 *   GET /api/v1/audio/stream/{id} with a Bearer token
 *   GET /api/v1/metadata/favorites
 *   GET /api/v1/history/recent
 */

import {
  asTrackId,
  getLibraryTracks,
  getRecentHistory,
  getUserFavorites,
  librarySong,
  type FavoriteMetadata,
  type LibraryTrack,
} from './apiService';

export interface CatalogSong {
  id: string;
  /** Numeric `tracks.id` when this row is a server file. */
  trackId?: number;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  streamUrl: string;
  /** Sent with `streamUrl` when the file is on the TrentPlayer server. */
  streamHeaders?: Record<string, string>;
  durationMs: number;
  genre?: string;
}

export interface SearchSongsOptions {
  signal?: AbortSignal;
  limit?: number;
}

export interface HomeCatalog {
  recentlyPlayed: CatalogSong[];
  library: CatalogSong[];
}

export function formatRuntime(durationMs: number): string {
  const minutes = Math.max(0, Math.round(durationMs / 60_000));
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours <= 0) {
    return `${minutes} min`;
  }
  return `${hours}h ${remain}min`;
}

export function parseLibraryTrackId(song: Pick<CatalogSong, 'id' | 'trackId'>): number | null {
  if (typeof song.trackId === 'number' && song.trackId > 0) {
    return song.trackId;
  }
  const match = /^library-(\d+)$/.exec(song.id);
  return match ? Number(match[1]) : null;
}

export async function refreshLibraryStream(song: CatalogSong): Promise<CatalogSong> {
  const trackId = parseLibraryTrackId(song);
  if (trackId == null) {
    return song;
  }
  return librarySong({
    id: trackId,
    title: song.title,
    artist: song.artist,
    genre: song.genre ?? 'Uncategorized',
  });
}

export async function loadLibrarySongs(options: SearchSongsOptions = {}): Promise<CatalogSong[]> {
  const tracks = await getLibraryTracks({ signal: options.signal });
  return Promise.all(tracks.map((track) => librarySong(track)));
}

export async function searchSongs(term: string, options: SearchSongsOptions = {}): Promise<CatalogSong[]> {
  const query = term.trim().toLowerCase();
  if (query.length === 0) {
    return [];
  }
  const songs = await loadLibrarySongs(options);
  const matches = songs.filter((song) => matchesQuery(song, query));
  return matches.slice(0, options.limit ?? matches.length);
}

export async function loadHomeCatalog(options: SearchSongsOptions = {}): Promise<HomeCatalog> {
  const [library, recentlyPlayed] = await Promise.all([
    loadLibrarySongs(options),
    loadRecentSongs(options).catch(() => []),
  ]);
  return { library, recentlyPlayed };
}

export async function loadFavoriteSongs(options: SearchSongsOptions = {}): Promise<CatalogSong[]> {
  const favorites = await getUserFavorites({ signal: options.signal });
  return songsFromTrackRows(favorites);
}

export async function loadRecentSongs(options: SearchSongsOptions = {}): Promise<CatalogSong[]> {
  const rows = await getRecentHistory({ signal: options.signal });
  const songs = await songsFromTrackRows(rows);
  const seen = new Set<string>();
  const unique: CatalogSong[] = [];
  for (const song of songs) {
    if (seen.has(song.id)) {
      continue;
    }
    seen.add(song.id);
    unique.push(song);
  }
  return unique;
}

function matchesQuery(song: CatalogSong, query: string): boolean {
  return (
    song.title.toLowerCase().includes(query) ||
    song.artist.toLowerCase().includes(query) ||
    (song.genre?.toLowerCase().includes(query) ?? false)
  );
}

async function songsFromTrackRows(rows: Array<FavoriteMetadata | { track: FavoriteMetadata['track'] }>): Promise<CatalogSong[]> {
  const songs: CatalogSong[] = [];
  for (const row of rows) {
    const track = toLibraryTrack(row.track);
    if (!track) {
      continue;
    }
    songs.push(await librarySong(track));
  }
  return songs;
}

function toLibraryTrack(track: FavoriteMetadata['track']): LibraryTrack | null {
  const id = asTrackId(track.id);
  if (id == null || track.title.trim().length === 0) {
    return null;
  }
  return {
    id,
    title: track.title,
    artist: track.artist?.trim() ? track.artist : 'Unknown',
    genre: track.genre?.trim() ? track.genre : 'Uncategorized',
  };
}
