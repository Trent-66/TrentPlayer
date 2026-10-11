/**
 * Fetches lyrics from LRCLIB (https://lrclib.net) — no API key required.
 */

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface TrackLyrics {
  synced: boolean;
  instrumental: boolean;
  plain: string;
  lines: LyricLine[];
  /** Length, in seconds, that `lines` were timed against. */
  durationSec: number;
}

const cache = new Map<string, TrackLyrics | null>();
const inflight = new Map<string, Promise<TrackLyrics | null>>();

const LYRICS_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'TrentPlayer/1.0 (Expo music player)',
} as const;

function cacheKey(title: string, artist: string, durationSec: number): string {
  const bucket = durationSec > 1 ? Math.round(durationSec) : 0;
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}|${bucket}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

interface LrcLibHit {
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

function parseHit(value: unknown): LrcLibHit | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const trackName = readString(row.trackName);
  const artistName = readString(row.artistName);
  if (!trackName || !artistName) {
    return null;
  }
  return {
    trackName,
    artistName,
    duration: typeof row.duration === 'number' ? row.duration : 0,
    instrumental: row.instrumental === true,
    plainLyrics: readString(row.plainLyrics),
    syncedLyrics: readString(row.syncedLyrics),
  };
}

/** Parses `[mm:ss.xx] lyric` / `[mm:ss.xxx] lyric` lines. */
export function parseSyncedLyrics(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const pattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  for (const row of raw.split(/\r?\n/)) {
    const stamps: number[] = [];
    pattern.lastIndex = 0;
    let match = pattern.exec(row);
    let lastIndex = 0;
    while (match) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ?? '0';
      const millis = Number(fraction.padEnd(3, '0').slice(0, 3));
      stamps.push(minutes * 60_000 + seconds * 1000 + millis);
      lastIndex = pattern.lastIndex;
      match = pattern.exec(row);
    }
    const text = row.slice(lastIndex).trim();
    if (stamps.length === 0 || text.length === 0) {
      continue;
    }
    for (const timeMs of stamps) {
      lines.push({ timeMs, text });
    }
  }
  lines.sort((left, right) => left.timeMs - right.timeMs);
  return lines;
}

function toTrackLyrics(hit: LrcLibHit): TrackLyrics | null {
  if (hit.instrumental) {
    return { synced: false, instrumental: true, plain: '', lines: [], durationSec: hit.duration };
  }
  const synced = hit.syncedLyrics ? parseSyncedLyrics(hit.syncedLyrics) : [];
  const plain = hit.plainLyrics ?? synced.map((line) => line.text).join('\n');
  if (!plain && synced.length === 0) {
    return null;
  }
  return {
    synced: synced.length > 0,
    instrumental: false,
    plain,
    lines: synced,
    durationSec: hit.duration,
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function getExact(title: string, artist: string, durationSec: number, signal?: AbortSignal): Promise<TrackLyrics | null> {
  const query = new URLSearchParams({
    track_name: title,
    artist_name: artist,
  });
  if (durationSec > 0) {
    query.set('duration', String(Math.round(durationSec)));
  }
  const response = await fetch(`https://lrclib.net/api/get?${query.toString()}`, {
    headers: LYRICS_HEADERS,
    signal,
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  const hit = parseHit(await readJson(response));
  return hit ? toTrackLyrics(hit) : null;
}

async function searchBest(title: string, artist: string, durationSec: number, signal?: AbortSignal): Promise<TrackLyrics | null> {
  const query = new URLSearchParams({
    track_name: title,
    artist_name: artist,
  });
  const response = await fetch(`https://lrclib.net/api/search?${query.toString()}`, {
    headers: LYRICS_HEADERS,
    signal,
  });
  if (!response.ok) {
    return null;
  }
  const payload = await readJson(response);
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  let best: LrcLibHit | null = null;
  let bestScore = -1;
  const wantTitle = title.trim().toLowerCase();
  const wantArtist = artist.trim().toLowerCase();
  for (const row of payload) {
    const hit = parseHit(row);
    if (!hit) {
      continue;
    }
    let score = 0;
    const gotTitle = hit.trackName.toLowerCase();
    const gotArtist = hit.artistName.toLowerCase();
    if (gotTitle === wantTitle) {
      score += 4;
    } else if (gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle)) {
      score += 2;
    }
    if (wantArtist && wantArtist !== 'unknown' && gotArtist.includes(wantArtist)) {
      score += 3;
    }
    if (hit.syncedLyrics) {
      score += 2;
    } else if (hit.plainLyrics) {
      score += 1;
    }
    if (durationSec > 0 && hit.duration > 0) {
      const delta = Math.abs(hit.duration - durationSec);
      if (delta <= 2) {
        score += 2;
      } else if (delta <= 8) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return best && bestScore >= 2 ? toTrackLyrics(best) : null;
}

/**
 * Hold lyrics back when the audio file is longer than the timed lyric sheet.
 * The extra time is the intro beat, so lines must not start at zero.
 */
export function alignLyricLines(
  lines: readonly LyricLine[],
  audioDurationSec: number,
  sourceDurationSec: number,
): LyricLine[] {
  if (lines.length === 0) {
    return [];
  }
  const audioMs = audioDurationSec * 1000;
  const timelineMs = sourceDurationSec > 0 ? sourceDurationSec * 1000 : lines[lines.length - 1].timeMs;
  const extraMs = audioMs - timelineMs;
  const introWasAdded = audioMs > 0 && extraMs >= 1500 && extraMs <= audioMs * 0.5 && lines[0].timeMs < 12_000;
  const shift = introWasAdded ? extraMs : 0;
  return lines.map((line) => ({ ...line, timeMs: line.timeMs + shift }));
}

export function activeLyricIndex(lines: readonly LyricLine[], currentTimeSec: number): number {
  if (lines.length === 0) {
    return -1;
  }
  const now = Math.max(0, currentTimeSec) * 1000;
  let index = -1;
  for (let cursor = 0; cursor < lines.length; cursor += 1) {
    if (lines[cursor].timeMs <= now) {
      index = cursor;
    } else {
      break;
    }
  }
  return index;
}

export async function fetchLyrics(
  title: string,
  artist: string,
  durationSec = 0,
  signal?: AbortSignal,
): Promise<TrackLyrics | null> {
  const key = cacheKey(title, artist, durationSec);
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }
  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const job = (async () => {
    try {
      const exact = await getExact(title, artist, durationSec, signal);
      const result = exact ?? (await searchBest(title, artist, durationSec, signal));
      if (!signal?.aborted) {
        cache.set(key, result);
      }
      return result;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      cache.set(key, null);
      return null;
    }
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, job);
  return job;
}
