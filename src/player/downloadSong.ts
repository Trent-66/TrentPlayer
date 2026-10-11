import { saveDownloadedTrack } from '../database/LocalDatabase';
import type { CatalogSong } from '../services/catalogService';
import { fileCacheManager } from '../utils/FileCacheManager';

/** Saves an online preview into the offline library. */
export async function downloadSongPreview(song: CatalogSong): Promise<void> {
  if (!song.streamUrl.startsWith('https://')) {
    throw new Error('This copy is already on the device.');
  }

  const cached = await fileCacheManager.downloadTrack({
    remoteUrl: song.streamUrl,
    trackId: song.id,
    title: song.title,
  });

  await saveDownloadedTrack({
    id: song.id,
    title: song.title,
    artist: song.artist,
    localPath: cached.localPath,
    rawGenre: song.genre,
  });
}
