/**
 * LocalDatabase
 * -------------
 * Offline ledger for downloaded tracks (`trent_player_library.db`).
 *
 * RUNTIME TARGET: standard Expo Go client. The database is a plain,
 * unencrypted SQLite file opened with no key, cipher or password arguments.
 *
 * SECURITY INVARIANTS (do not relax without a security review)
 *   1. Every DML statement (INSERT / UPDATE / SELECT / DELETE) that involves a
 *      runtime value uses `?` placeholders with an array of bindings. No string
 *      concatenation, no template literals, no `execAsync` with data.
 *   2. Static DDL (`CREATE TABLE`, `CREATE INDEX`, `PRAGMA journal_mode`) is
 *      the only thing passed to `execAsync`, and it contains no runtime values.
 *   3. `PRAGMA user_version = N` inlines `SCHEMA_VERSION`, a compile-time
 *      integer constant — never runtime data.
 *
 * ENCRYPTION AT REST — DEFERRED
 *   At-rest AES-256 (SQLCipher) is intentionally disabled for Expo Go
 *   prototyping. The hardware-vault key module (`src/security/DatabaseKeyVault.ts`)
 *   is retained but unreferenced. To re-enable in a native build:
 *     1. Set `["expo-sqlite", { "useSQLCipher": true }]` in app.json and run
 *        `npx expo prebuild`.
 *     2. In `openAndPrepare`, fetch the key via `getOrCreateDatabaseKey()`
 *        BEFORE `openDatabaseAsync`, then issue `PRAGMA key = "x'<64 hex>'"`
 *        (guarded by `isValidHexKey`) as the first statement on the connection.
 *     3. Verify with `PRAGMA cipher_version` and fail closed in production.
 */

import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DATABASE_NAME = 'trent_player_library.db';

/** Bumped whenever `MIGRATIONS` gains an entry. Stored in `PRAGMA user_version`. */
const SCHEMA_VERSION = 1;

/** Upper bound for free-text columns so a hostile server can't bloat the ledger. */
const MAX_TEXT_LENGTH = 512;

/**
 * The closed genre spectrum TrentPlayer renders as folders.
 * Adding a genre here is the *only* way a new category can be persisted.
 */
export const TRENT_GENRES = [
  'Rap',
  'R&B',
  'Afrobeats',
  'Highlife',
  'Reggae',
  'Amapiano',
  'Sadcore',
  'Gospel',
  'Phonk',
] as const;

export type TrentGenre = (typeof TRENT_GENRES)[number];

/** Fallback bucket for metadata that does not map onto the spectrum. */
export const UNCATEGORIZED_GENRE = 'Uncategorized' as const;

export type TrackCategory = TrentGenre | typeof UNCATEGORIZED_GENRE;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Domain object handed to the rest of the app. */
export interface Track {
  id: string;
  title: string;
  artist: string;
  localPath: string;
  automatedCategory: TrackCategory;
  isFavorite: boolean;
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
}

/** Raw row shape exactly as SQLite returns it. */
interface TrackRow {
  id: string;
  title: string;
  artist: string;
  local_path: string;
  automated_category: string;
  is_favorite: number;
  created_at: string;
}

/** Input for persisting a freshly downloaded track. */
export interface SaveTrackInput {
  /** Stable identifier (remote track id). Generated if omitted. */
  id?: string;
  title: string;
  artist: string;
  /** `file://` URI returned by `FileCacheManager.downloadTrack`. */
  localPath: string;
  /**
   * Free-form genre/mood metadata from the source (e.g. "hip-hop", "afro pop").
   * Normalised through `mapToTrentGenre`; never stored verbatim.
   */
  rawGenre?: string | null;
}

/** Category plus its track count, for folder badges. */
export interface CategoryFolder {
  category: TrackCategory;
  trackCount: number;
}

export class LocalDatabaseError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'LocalDatabaseError';
  }
}

// ---------------------------------------------------------------------------
// Genre mapping
// ---------------------------------------------------------------------------

/**
 * Alias table: normalised token -> canonical genre.
 * Keys must already be lower-case with punctuation/whitespace removed.
 */
const GENRE_ALIASES: Readonly<Record<string, TrentGenre>> = {
  // Rap
  rap: 'Rap',
  hiphop: 'Rap',
  trap: 'Rap',
  drill: 'Rap',
  grime: 'Rap',
  // R&B
  rb: 'R&B',
  rnb: 'R&B',
  randb: 'R&B',
  rhythmandblues: 'R&B',
  soul: 'R&B',
  neosoul: 'R&B',
  // Afrobeats
  afrobeats: 'Afrobeats',
  afrobeat: 'Afrobeats',
  afropop: 'Afrobeats',
  afrofusion: 'Afrobeats',
  afro: 'Afrobeats',
  // Highlife
  highlife: 'Highlife',
  hiplife: 'Highlife',
  // Reggae
  reggae: 'Reggae',
  dancehall: 'Reggae',
  dub: 'Reggae',
  roots: 'Reggae',
  // Amapiano
  amapiano: 'Amapiano',
  piano: 'Amapiano',
  // Sadcore
  sadcore: 'Sadcore',
  sad: 'Sadcore',
  slowcore: 'Sadcore',
  melancholic: 'Sadcore',
  melancholy: 'Sadcore',
  // Gospel
  gospel: 'Gospel',
  worship: 'Gospel',
  praise: 'Gospel',
  christian: 'Gospel',
  // Phonk
  phonk: 'Phonk',
  driftphonk: 'Phonk',
  houseophonk: 'Phonk',
};

/**
 * Maps arbitrary incoming genre/mood metadata onto the TrentPlayer spectrum.
 * Deterministic and total: always returns a member of `TrackCategory`.
 *
 * Matching strategy (first hit wins):
 *   1. Exact canonical genre name (case-insensitive).
 *   2. Alias table on the punctuation-stripped token.
 *   3. Alias table on each `/ , ; |`-separated segment (e.g. "Afrobeats / Pop").
 *   4. `UNCATEGORIZED_GENRE`.
 */
export function mapToTrentGenre(rawGenre: string | null | undefined): TrackCategory {
  if (typeof rawGenre !== 'string') {
    return UNCATEGORIZED_GENRE;
  }

  const trimmed = rawGenre.trim();
  if (trimmed.length === 0) {
    return UNCATEGORIZED_GENRE;
  }

  const exact = TRENT_GENRES.find((g) => g.toLowerCase() === trimmed.toLowerCase());
  if (exact) {
    return exact;
  }

  const normalise = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const whole = GENRE_ALIASES[normalise(trimmed)];
  if (whole) {
    return whole;
  }

  for (const segment of trimmed.split(/[\/,;|]/)) {
    const hit = GENRE_ALIASES[normalise(segment)];
    if (hit) {
      return hit;
    }
  }

  return UNCATEGORIZED_GENRE;
}

function isTrackCategory(value: string): value is TrackCategory {
  return value === UNCATEGORIZED_GENRE || (TRENT_GENRES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Trims, collapses internal whitespace, strips control chars, caps length. */
function normaliseText(value: string, field: string): string {
  if (typeof value !== 'string') {
    throw new LocalDatabaseError(`Field "${field}" must be a string.`);
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) {
    throw new LocalDatabaseError(`Field "${field}" must not be empty.`);
  }
  return cleaned.length > MAX_TEXT_LENGTH ? cleaned.slice(0, MAX_TEXT_LENGTH) : cleaned;
}

function normaliseId(value: string | undefined): string {
  if (value === undefined) {
    return Crypto.randomUUID();
  }
  return normaliseText(value, 'id');
}

function normaliseLocalPath(value: string): string {
  const path = normaliseText(value, 'localPath');
  if (!path.startsWith('file://')) {
    throw new LocalDatabaseError('localPath must be a file:// URI produced by FileCacheManager.');
  }
  return path;
}

function rowToTrack(row: TrackRow): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    localPath: row.local_path,
    automatedCategory: isTrackCategory(row.automated_category)
      ? row.automated_category
      : UNCATEGORIZED_GENRE,
    isFavorite: row.is_favorite === 1,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Schema (static DDL only — zero runtime values)
// ---------------------------------------------------------------------------

const MIGRATIONS: ReadonlyArray<string> = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS tracks (
    id                 TEXT    PRIMARY KEY NOT NULL,
    title              TEXT    NOT NULL,
    artist             TEXT    NOT NULL,
    local_path         TEXT    NOT NULL UNIQUE,
    automated_category TEXT    NOT NULL,
    is_favorite        INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
    created_at         TEXT    NOT NULL
  );

  -- Folder listings: filter by category, newest first.
  CREATE INDEX IF NOT EXISTS idx_tracks_category
    ON tracks (automated_category, created_at DESC);

  -- Favorites view: filter by flag, newest first.
  CREATE INDEX IF NOT EXISTS idx_tracks_favorite
    ON tracks (is_favorite, created_at DESC);
  `,
];

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Columns the v1 schema requires. Used to recognise a foreign/legacy `tracks` table. */
const REQUIRED_TRACK_COLUMNS: ReadonlyArray<keyof TrackRow> = [
  'id',
  'title',
  'artist',
  'local_path',
  'automated_category',
  'is_favorite',
  'created_at',
];

/**
 * Handles a database that predates schema versioning (`user_version = 0`) but
 * already contains a `tracks` table — e.g. left behind by an earlier build in
 * the same Expo Go sandbox. `CREATE TABLE IF NOT EXISTS` would silently keep
 * the foreign shape and the index DDL would then fail on missing columns.
 *
 * If the existing table lacks any required column it is renamed aside
 * (data preserved, not dropped) and any same-named indexes are removed so the
 * v1 DDL can build a clean table. A correctly-shaped table is left untouched.
 *
 * All identifiers here are static constants — no runtime values are inlined.
 */
async function reconcileLegacySchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(tracks)', []);
  if (columns.length === 0) {
    return; // No pre-existing table; nothing to reconcile.
  }

  const present = new Set(columns.map((c) => c.name));
  const missing = REQUIRED_TRACK_COLUMNS.filter((c) => !present.has(c));
  if (missing.length === 0) {
    return; // Shape already matches v1.
  }

  console.warn(
    `[LocalDatabase] Found legacy 'tracks' table missing [${missing.join(', ')}]; ` +
      "moving it to 'tracks_legacy_v0' and rebuilding.",
  );

  await db.execAsync(`
    DROP TABLE IF EXISTS tracks_legacy_v0;
    ALTER TABLE tracks RENAME TO tracks_legacy_v0;
    DROP INDEX IF EXISTS idx_tracks_category;
    DROP INDEX IF EXISTS idx_tracks_favorite;
  `);
}

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= SCHEMA_VERSION) {
    return;
  }

  await db.withTransactionAsync(async () => {
    if (currentVersion === 0) {
      await reconcileLegacySchema(db);
    }

    for (let v = currentVersion; v < SCHEMA_VERSION; v += 1) {
      const ddl = MIGRATIONS[v];
      if (!ddl) {
        throw new LocalDatabaseError(`Missing migration for schema version ${v + 1}.`);
      }
      await db.execAsync(ddl);
    }
    // `user_version` cannot be bound either, but SCHEMA_VERSION is a compile-time
    // integer constant, never runtime data.
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  });
}

async function openAndPrepare(): Promise<SQLite.SQLiteDatabase> {
  // Standard, unencrypted SQLite — no key / cipher / password options.
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  try {
    await db.execAsync('PRAGMA journal_mode = WAL');
    await db.execAsync('PRAGMA foreign_keys = ON');

    await runMigrations(db);
    return db;
  } catch (error) {
    await db.closeAsync().catch(() => undefined);
    throw error;
  }
}

/**
 * Returns the shared, initialised connection. Concurrent callers during
 * start-up all await the same promise, so migrations run exactly once.
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openAndPrepare().catch((error) => {
      databasePromise = null; // allow a retry on the next call
      // Surface the underlying native/SQLite error in the Metro terminal.
      console.error('[LocalDatabase] open failed:', error);
      throw error instanceof LocalDatabaseError
        ? error
        : new LocalDatabaseError('Failed to open local database.', error);
    });
  }
  return databasePromise;
}

/** Eagerly initialise at app boot so the first screen doesn't pay the cost. */
export async function initializeDatabase(): Promise<void> {
  await getDatabase();
}

export async function closeDatabase(): Promise<void> {
  if (!databasePromise) {
    return;
  }
  const pending = databasePromise;
  databasePromise = null;
  try {
    const db = await pending;
    await db.closeAsync();
  } catch (error) {
    throw new LocalDatabaseError('Failed to close database.', error);
  }
}

// ---------------------------------------------------------------------------
// Internal error wrapper
// ---------------------------------------------------------------------------

async function withDb<T>(
  operation: string,
  fn: (db: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  try {
    const db = await getDatabase();
    return await fn(db);
  } catch (error) {
    if (error instanceof LocalDatabaseError) {
      throw error;
    }
    // Log the operation name only — never row contents or key material.
    console.error(`[LocalDatabase] ${operation} failed`, error);
    throw new LocalDatabaseError(`${operation} failed.`, error);
  }
}

// ---------------------------------------------------------------------------
// Public API — all DML strictly parameterised
// ---------------------------------------------------------------------------

/**
 * Persists a downloaded track. Idempotent on `id`: re-downloading the same
 * track updates its metadata/path while preserving `is_favorite`.
 */
export async function saveDownloadedTrack(input: SaveTrackInput): Promise<Track> {
  return withDb('saveDownloadedTrack', async (db) => {
    const id = normaliseId(input.id);
    const title = normaliseText(input.title, 'title');
    const artist = normaliseText(input.artist, 'artist');
    const localPath = normaliseLocalPath(input.localPath);
    const category = mapToTrentGenre(input.rawGenre);
    const createdAt = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO tracks (id, title, artist, local_path, automated_category, is_favorite, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(id) DO UPDATE SET
         title              = excluded.title,
         artist             = excluded.artist,
         local_path         = excluded.local_path,
         automated_category = excluded.automated_category`,
      [id, title, artist, localPath, category, createdAt],
    );

    const row = await db.getFirstAsync<TrackRow>('SELECT * FROM tracks WHERE id = ?', [id]);
    if (!row) {
      throw new LocalDatabaseError('Track vanished immediately after insert.');
    }
    return rowToTrack(row);
  });
}

/**
 * Atomically flips the favorite flag in a single UPDATE (no read-modify-write
 * race) and returns the new state. Returns `null` if the track does not exist.
 */
export async function toggleFavorite(trackId: string): Promise<boolean | null> {
  return withDb('toggleFavorite', async (db) => {
    const id = normaliseText(trackId, 'trackId');
    const row = await db.getFirstAsync<{ is_favorite: number }>(
      `UPDATE tracks
         SET is_favorite = CASE is_favorite WHEN 1 THEN 0 ELSE 1 END
       WHERE id = ?
       RETURNING is_favorite`,
      [id],
    );
    return row ? row.is_favorite === 1 : null;
  });
}

/** Explicitly sets the favorite flag. Returns `false` if no row matched. */
export async function setFavorite(trackId: string, isFavorite: boolean): Promise<boolean> {
  return withDb('setFavorite', async (db) => {
    const id = normaliseText(trackId, 'trackId');
    const result = await db.runAsync('UPDATE tracks SET is_favorite = ? WHERE id = ?', [
      isFavorite ? 1 : 0,
      id,
    ]);
    return result.changes > 0;
  });
}

/** Tracks belonging to one folder, newest first. */
export async function getTracksByCategory(category: TrackCategory | string): Promise<Track[]> {
  return withDb('getTracksByCategory', async (db) => {
    // Unknown strings simply match nothing; they are still bound, never inlined.
    const value = normaliseText(category, 'category');
    const rows = await db.getAllAsync<TrackRow>(
      `SELECT * FROM tracks
       WHERE automated_category = ?
       ORDER BY created_at DESC`,
      [value],
    );
    return rows.map(rowToTrack);
  });
}

export async function getFavoriteTracks(): Promise<Track[]> {
  return withDb('getFavoriteTracks', async (db) => {
    const rows = await db.getAllAsync<TrackRow>(
      `SELECT * FROM tracks
       WHERE is_favorite = ?
       ORDER BY created_at DESC`,
      [1],
    );
    return rows.map(rowToTrack);
  });
}

export async function getAllTracks(): Promise<Track[]> {
  return withDb('getAllTracks', async (db) => {
    const rows = await db.getAllAsync<TrackRow>('SELECT * FROM tracks ORDER BY created_at DESC', []);
    return rows.map(rowToTrack);
  });
}

export async function getTrackById(trackId: string): Promise<Track | null> {
  return withDb('getTrackById', async (db) => {
    const id = normaliseText(trackId, 'trackId');
    const row = await db.getFirstAsync<TrackRow>('SELECT * FROM tracks WHERE id = ?', [id]);
    return row ? rowToTrack(row) : null;
  });
}

/**
 * Distinct `automated_category` values currently present. Drives dynamic
 * folder rendering so the UI never hard-codes the genre list.
 */
export async function getDistinctCategories(): Promise<TrackCategory[]> {
  return withDb('getDistinctCategories', async (db) => {
    const rows = await db.getAllAsync<{ automated_category: string }>(
      `SELECT DISTINCT automated_category
       FROM tracks
       ORDER BY automated_category ASC`,
      [],
    );
    return rows
      .map((r) => r.automated_category)
      .filter(isTrackCategory);
  });
}

/** Same as `getDistinctCategories` but with per-folder counts for badges. */
export async function getCategoryFolders(): Promise<CategoryFolder[]> {
  return withDb('getCategoryFolders', async (db) => {
    const rows = await db.getAllAsync<{ automated_category: string; track_count: number }>(
      `SELECT automated_category, COUNT(*) AS track_count
       FROM tracks
       GROUP BY automated_category
       ORDER BY automated_category ASC`,
      [],
    );
    return rows
      .filter((r) => isTrackCategory(r.automated_category))
      .map((r) => ({
        category: r.automated_category as TrackCategory,
        trackCount: r.track_count,
      }));
  });
}

/**
 * Removes the ledger row and returns the `local_path` so the caller can
 * delete the audio file via `FileCacheManager.deleteCachedFile`.
 * Returns `null` if nothing was deleted.
 */
export async function deleteTrack(trackId: string): Promise<string | null> {
  return withDb('deleteTrack', async (db) => {
    const id = normaliseText(trackId, 'trackId');
    const row = await db.getFirstAsync<{ local_path: string }>(
      'DELETE FROM tracks WHERE id = ? RETURNING local_path',
      [id],
    );
    return row?.local_path ?? null;
  });
}
