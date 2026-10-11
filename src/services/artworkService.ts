/**
 * Looks up album artwork for a library track. TrentPlayer files do not ship
 * with cover images, so we match title + artist against public catalogs.
 */

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

const MAX_CONCURRENT = 3;
let activeLookups = 0;
const waiting: Array<() => void> = [];

function cacheKey(title: string, artist: string): string {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function withSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeLookups >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  }
  activeLookups += 1;
  try {
    return await run();
  } finally {
    activeLookups -= 1;
    waiting.shift()?.();
  }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function upscaleItunesArt(url: string): string {
  return url.replace(/\/\d+x\d+bb(?:-\d+)?\./, '/600x600bb.');
}

function scoreMatch(candidateTitle: string, candidateArtist: string, title: string, artist: string): number {
  const wantTitle = title.trim().toLowerCase();
  const wantArtist = artist.trim().toLowerCase();
  const gotTitle = candidateTitle.trim().toLowerCase();
  const gotArtist = candidateArtist.trim().toLowerCase();
  let score = 0;
  if (gotTitle === wantTitle) {
    score += 4;
  } else if (gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle)) {
    score += 2;
  }
  if (wantArtist && wantArtist !== 'unknown' && gotArtist.includes(wantArtist)) {
    score += 3;
  }
  return score;
}

async function searchItunes(title: string, artist: string, signal?: AbortSignal): Promise<string | null> {
  const term = [artist !== 'Unknown' ? artist : '', title].filter((part) => part.trim().length > 0).join(' ');
  if (term.length === 0) {
    return null;
  }
  const query = new URLSearchParams({
    term,
    entity: 'song',
    limit: '5',
  });
  const response = await fetch(`https://itunes.apple.com/search?${query.toString()}`, { signal });
  if (!response.ok) {
    return null;
  }
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return null;
  }

  let bestUrl: string | null = null;
  let bestScore = 0;
  for (const row of results) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }
    const item = row as Record<string, unknown>;
    const artwork = readString(item.artworkUrl100);
    const trackName = readString(item.trackName) ?? '';
    const artistName = readString(item.artistName) ?? '';
    if (!artwork) {
      continue;
    }
    const score = scoreMatch(trackName, artistName, title, artist);
    if (score > bestScore || bestUrl === null) {
      bestScore = score;
      bestUrl = upscaleItunesArt(artwork);
    }
  }
  return bestUrl;
}

async function searchDeezer(title: string, artist: string, signal?: AbortSignal): Promise<string | null> {
  const term = [artist !== 'Unknown' ? artist : '', title].filter((part) => part.trim().length > 0).join(' ');
  if (term.length === 0) {
    return null;
  }
  const query = new URLSearchParams({ q: term, limit: '5' });
  const response = await fetch(`https://api.deezer.com/search?${query.toString()}`, { signal });
  if (!response.ok) {
    return null;
  }
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  let bestUrl: string | null = null;
  let bestScore = 0;
  for (const row of data) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }
    const item = row as Record<string, unknown>;
    const album = item.album;
    const albumRecord = typeof album === 'object' && album !== null ? (album as Record<string, unknown>) : null;
    const artwork =
      readString(albumRecord?.cover_xl) ?? readString(albumRecord?.cover_big) ?? readString(albumRecord?.cover_medium);
    if (!artwork) {
      continue;
    }
    const artistField = item.artist;
    const artistName =
      typeof artistField === 'object' && artistField !== null
        ? (readString((artistField as Record<string, unknown>).name) ?? '')
        : '';
    const score = scoreMatch(readString(item.title) ?? '', artistName, title, artist);
    if (score > bestScore || bestUrl === null) {
      bestScore = score;
      bestUrl = artwork;
    }
  }
  return bestUrl;
}

async function findArtwork(title: string, artist: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const itunes = await searchItunes(title, artist, signal);
    if (itunes) {
      return itunes;
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
  }
  try {
    return await searchDeezer(title, artist, signal);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return null;
  }
}

export async function lookupArtwork(title: string, artist: string, signal?: AbortSignal): Promise<string | null> {
  const key = cacheKey(title, artist);
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }
  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const job = withSlot(async () => {
    try {
      const url = await findArtwork(title, artist, signal);
      if (!signal?.aborted) {
        cache.set(key, url);
      }
      return url;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      cache.set(key, null);
      return null;
    }
  }).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, job);
  return job;
}
