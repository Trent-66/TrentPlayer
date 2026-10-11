/**
 * FileCacheManager
 * ----------------
 * Downloads remote audio streams into the app's private sandbox and returns a
 * `file://` URI suitable for the SQLite ledger (`tracks.local_path`).
 *
 * WHY `expo-file-system/legacy`?
 *   In Expo SDK 57 the root `expo-file-system` export is the new
 *   `File`/`Directory`/`Paths` API; `downloadAsync` and `documentDirectory`
 *   imported from the root THROW at runtime. The complete, supported
 *   `downloadAsync` implementation lives under the `/legacy` entry point.
 *
 * SECURITY CONTROLS
 *   - HTTPS-only source URLs (blocks `file:`, `content:`, `javascript:` and
 *     cleartext `http:` which is trivially MITM-able on public Wi-Fi).
 *   - File names are reduced to a strict `[A-Za-z0-9._-]` allow-list; path
 *     separators, `..`, NUL and control characters can never survive.
 *   - Extension is chosen from an audio allow-list (never trusted from the URL
 *     or `Content-Type` blindly).
 *   - Output is confined to `<documentDirectory>/trent_audio/`; deletion refuses
 *     any path that resolves outside that directory (defeats a poisoned
 *     `local_path` being used to delete arbitrary sandbox files).
 *   - Response status and MIME type are validated; failed or non-audio
 *     responses (e.g. an HTML captive-portal page) are discarded.
 *   - The binary stream is written to disk natively by `downloadAsync`; it is
 *     never buffered through the JS heap.
 */

import * as FileSystem from 'expo-file-system/legacy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DownloadTrackParams {
  /** Remote stream URL. Must be `https:`. */
  remoteUrl: string;
  /** Stable identifier used to make the on-disk name unique and idempotent. */
  trackId: string;
  /** Human-readable name used as the file-name stem (sanitised). */
  title: string;
  /** Optional auth / range headers forwarded to the request. */
  headers?: Record<string, string>;
  /**
   * Allow cleartext `http:` sources. Defaults to `false`; only flip this for
   * a local dev server.
   */
  allowInsecureHttp?: boolean;
  /** Re-download even if a cached file already exists. Default `false`. */
  overwrite?: boolean;
}

export interface CachedFileResult {
  /** `file://` URI to store in `tracks.local_path`. */
  localPath: string;
  /** Sanitised basename, e.g. `Essence_a1b2c3.mp3`. */
  fileName: string;
  sizeBytes: number;
  mimeType: string | null;
  /** `true` when an existing file was reused instead of re-downloaded. */
  fromCache: boolean;
}

export class FileCacheError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'FileCacheError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_SUBDIRECTORY = 'trent_audio/';

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'wav',
  'ogg',
  'oga',
  'opus',
  'flac',
  'weba',
]);

const DEFAULT_EXTENSION = 'mp3';

/** Keep total path length well below platform limits. */
const MAX_STEM_LENGTH = 80;

/** MIME prefixes we accept from the server. */
const ACCEPTED_MIME_PREFIXES = ['audio/', 'application/octet-stream', 'video/mp4', 'video/webm'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveCacheDirectory(): string {
  const base = FileSystem.documentDirectory;
  if (!base) {
    throw new FileCacheError('documentDirectory is unavailable on this platform.');
  }
  return base.endsWith('/') ? base + CACHE_SUBDIRECTORY : base + '/' + CACHE_SUBDIRECTORY;
}

/**
 * Reduces an arbitrary string to a safe file-name stem.
 * Result matches `^[A-Za-z0-9][A-Za-z0-9._-]*$` and never contains `..`.
 */
export function sanitizeFileName(raw: string): string {
  if (typeof raw !== 'string') {
    return 'track';
  }

  let stem = raw
    // Unicode normalise and strip diacritics so "Beyoncé" -> "Beyonce".
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Drop NUL and control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    // Path separators and shell/OS-reserved characters -> underscore.
    .replace(/[\\/:*?"<>|]/g, '_')
    // Anything outside the allow-list -> underscore.
    .replace(/[^A-Za-z0-9._-]/g, '_')
    // Collapse runs of separators.
    .replace(/[._-]{2,}/g, '_')
    // No leading dots (hidden files / ".." traversal) or dashes (CLI flags).
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '');

  if (stem.length > MAX_STEM_LENGTH) {
    stem = stem.slice(0, MAX_STEM_LENGTH).replace(/[._-]+$/, '');
  }

  return stem.length > 0 ? stem : 'track';
}

/** Chooses a file extension strictly from the audio allow-list. */
function resolveExtension(remoteUrl: URL, mimeType: string | null): string {
  const fromPath = remoteUrl.pathname.split('.').pop()?.toLowerCase() ?? '';
  if (ALLOWED_AUDIO_EXTENSIONS.has(fromPath)) {
    return fromPath;
  }

  if (mimeType) {
    const mimeMap: Record<string, string> = {
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/mp4': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/aac': 'aac',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/opus': 'opus',
      'audio/flac': 'flac',
      'audio/x-flac': 'flac',
      'audio/webm': 'weba',
    };
    const subtype = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    const mapped = mimeMap[subtype];
    if (mapped) {
      return mapped;
    }
  }

  return DEFAULT_EXTENSION;
}

function parseAndValidateUrl(remoteUrl: string, allowInsecureHttp: boolean): URL {
  let parsed: URL;
  try {
    parsed = new URL(remoteUrl);
  } catch (error) {
    throw new FileCacheError('remoteUrl is not a valid absolute URL.', error);
  }

  const allowed = allowInsecureHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowed.includes(parsed.protocol)) {
    throw new FileCacheError(`Refusing to download from "${parsed.protocol}" URL; HTTPS required.`);
  }
  if (parsed.username || parsed.password) {
    throw new FileCacheError('Credentials embedded in the URL are not permitted.');
  }
  return parsed;
}

function isAcceptedMime(mimeType: string | null): boolean {
  if (!mimeType) {
    return true; // Some CDNs omit Content-Type for range/stream endpoints.
  }
  const lower = mimeType.toLowerCase();
  return ACCEPTED_MIME_PREFIXES.some((p) => lower.startsWith(p));
}

async function safeDelete(fileUri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch {
    // Best-effort cleanup; swallow so the original error propagates.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class FileCacheManager {
  private readonly cacheDirectory: string;

  constructor() {
    this.cacheDirectory = resolveCacheDirectory();
  }

  /** Absolute `file://` URI of the private audio cache directory. */
  getCacheDirectory(): string {
    return this.cacheDirectory;
  }

  /** Creates the cache directory if it does not exist. Idempotent. */
  async ensureCacheDirectory(): Promise<void> {
    try {
      const info = await FileSystem.getInfoAsync(this.cacheDirectory);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(this.cacheDirectory, { intermediates: true });
      }
    } catch (error) {
      throw new FileCacheError('Failed to prepare audio cache directory.', error);
    }
  }

  /**
   * `true` if `fileUri` resolves inside the cache directory. Used as a guard
   * before any destructive operation.
   */
  isPathInsideCache(fileUri: string): boolean {
    if (typeof fileUri !== 'string' || !fileUri.startsWith(this.cacheDirectory)) {
      return false;
    }
    const remainder = fileUri.slice(this.cacheDirectory.length);
    // A single sanitised segment only — no nested paths, no traversal.
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remainder) && !remainder.includes('..');
  }

  /** Builds the deterministic target URI for a track without touching the disk. */
  buildLocalPath(trackId: string, title: string, remoteUrl: URL, mimeType: string | null = null): {
    localPath: string;
    fileName: string;
  } {
    const stem = sanitizeFileName(title);
    const idSuffix = sanitizeFileName(trackId);
    const ext = resolveExtension(remoteUrl, mimeType);
    const fileName = `${stem}_${idSuffix}.${ext}`;
    return { localPath: this.cacheDirectory + fileName, fileName };
  }

  /**
   * Downloads `remoteUrl` into the private cache and returns the safe local
   * `file://` path to persist in SQLite.
   */
  async downloadTrack(params: DownloadTrackParams): Promise<CachedFileResult> {
    const { remoteUrl, trackId, title, headers, allowInsecureHttp = false, overwrite = false } =
      params;

    if (typeof trackId !== 'string' || trackId.trim().length === 0) {
      throw new FileCacheError('trackId is required.');
    }

    const url = parseAndValidateUrl(remoteUrl, allowInsecureHttp);
    await this.ensureCacheDirectory();

    const { localPath, fileName } = this.buildLocalPath(trackId, title, url);

    // Idempotency: reuse an intact cached file unless told otherwise.
    if (!overwrite) {
      try {
        const existing = await FileSystem.getInfoAsync(localPath);
        if (existing.exists && !existing.isDirectory && existing.size > 0) {
          return {
            localPath,
            fileName,
            sizeBytes: existing.size,
            mimeType: null,
            fromCache: true,
          };
        }
      } catch {
        // Fall through to a fresh download.
      }
    }

    let result: FileSystem.FileSystemDownloadResult;
    try {
      // Streams straight to disk natively; the JS thread never holds the bytes.
      result = await FileSystem.downloadAsync(url.toString(), localPath, {
        headers,
        cache: false,
      });
    } catch (error) {
      await safeDelete(localPath);
      throw new FileCacheError('Network download failed.', error);
    }

    if (result.status < 200 || result.status >= 300) {
      await safeDelete(localPath);
      throw new FileCacheError(`Server responded with HTTP ${result.status}.`);
    }

    if (!isAcceptedMime(result.mimeType)) {
      await safeDelete(localPath);
      throw new FileCacheError(`Rejected non-audio response (Content-Type: ${result.mimeType}).`);
    }

    let sizeBytes = 0;
    try {
      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || info.isDirectory || info.size <= 0) {
        await safeDelete(localPath);
        throw new FileCacheError('Downloaded file is missing or empty.');
      }
      sizeBytes = info.size;
    } catch (error) {
      if (error instanceof FileCacheError) {
        throw error;
      }
      await safeDelete(localPath);
      throw new FileCacheError('Failed to verify downloaded file.', error);
    }

    return {
      localPath: result.uri,
      fileName,
      sizeBytes,
      mimeType: result.mimeType,
      fromCache: false,
    };
  }

  /**
   * Deletes a cached audio file. Refuses paths outside the cache directory so
   * a tampered `local_path` can never be used to remove other sandbox files.
   */
  async deleteCachedFile(localPath: string): Promise<void> {
    if (!this.isPathInsideCache(localPath)) {
      throw new FileCacheError('Refusing to delete a path outside the audio cache directory.');
    }
    try {
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    } catch (error) {
      throw new FileCacheError('Failed to delete cached file.', error);
    }
  }

  /** Total bytes currently held in the audio cache. */
  async getCacheSizeBytes(): Promise<number> {
    try {
      await this.ensureCacheDirectory();
      const names = await FileSystem.readDirectoryAsync(this.cacheDirectory);
      let total = 0;
      for (const name of names) {
        const info = await FileSystem.getInfoAsync(this.cacheDirectory + name);
        if (info.exists && !info.isDirectory) {
          total += info.size;
        }
      }
      return total;
    } catch (error) {
      throw new FileCacheError('Failed to compute cache size.', error);
    }
  }

  /** Wipes every cached audio file (e.g. "Clear downloads" setting). */
  async clearCache(): Promise<void> {
    try {
      await FileSystem.deleteAsync(this.cacheDirectory, { idempotent: true });
      await this.ensureCacheDirectory();
    } catch (error) {
      throw new FileCacheError('Failed to clear audio cache.', error);
    }
  }
}

/** Shared instance for app-wide use. */
export const fileCacheManager = new FileCacheManager();
