/**
 * Saves a cloud song into the on-device library.
 * The audio file goes to the private cache; the ledger row stores the
 * genre folder (`automated_category`) the Downloads screen renders.
 */

import { getAllTracks, getTrackById, saveDownloadedTrack, suggestTone, updateTrackCategory } from '../database/LocalDatabase';
import { fileCacheManager } from '../utils/FileCacheManager';
import { loadLibrarySongs, parseLibraryTrackId, refreshLibraryStream, type CatalogSong } from './catalogService';

function ledgerId(song: CatalogSong): string | null {
  const trackId = parseLibraryTrackId(song);
  return trackId == null ? null : String(trackId);
}

export function canDownload(song: CatalogSong): boolean {
  return ledgerId(song) != null && song.streamUrl.length > 0 && !song.streamUrl.startsWith('file:');
}

export async function isSongDownloaded(song: CatalogSong): Promise<boolean> {
  const id = ledgerId(song);
  if (!id) {
    return false;
  }
  const row = await getTrackById(id);
  return row != null;
}

export async function downloadSong(song: CatalogSong): Promise<void> {
  const fresh = await refreshLibraryStream(song);
  const id = ledgerId(fresh);
  if (!id || fresh.streamUrl.length === 0) {
    throw new Error('This song cannot be downloaded.');
  }

  const cached = await fileCacheManager.downloadTrack({
    remoteUrl: fresh.streamUrl,
    trackId: id,
    title: fresh.title,
    headers: fresh.streamHeaders,
    allowInsecureHttp: fresh.streamUrl.startsWith('http:'),
  });

  await saveDownloadedTrack({
    id,
    title: fresh.title,
    artist: fresh.artist,
    localPath: cached.localPath,
    rawGenre: suggestTone(fresh.artist, fresh.title, fresh.genre),
  });
}

/** Files already saved offline pick up Sadcore, Reggae, and the other tones. */
export async function applyServerGenresToDownloads(): Promise<void> {
  const stored = await getAllTracks();
  await Promise.all(
    stored.map((track) => updateTrackCategory(track.id, suggestTone(track.artist, track.title, track.automatedCategory))),
  );
  try {
    const songs = await loadLibrarySongs();
    await Promise.all(
      songs.map((song) => {
        const id = ledgerId(song);
        if (!id) {
          return Promise.resolve();
        }
        return updateTrackCategory(id, suggestTone(song.artist, song.title, song.genre));
      }),
    );
  } catch {
    // The on-device artist pass already moved known songs out of Uncategorized.
  }
}
