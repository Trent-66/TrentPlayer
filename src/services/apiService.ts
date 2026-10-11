/**
 * apiService
 * ----------
 * Authenticated HTTP client for the TrentPlayer Spring Boot gateway.
 *
 * SECURITY INVARIANTS (do not relax without a security review)
 *   1. The origin is read only from `process.env.EXPO_PUBLIC_API_URL` via static
 *      Expo dot-notation. No host, IP, or port is hardcoded (OWASP Mobile M1).
 *      In dev, a localhost or LAN host in that URL is replaced with the
 *      computer address Expo Go used to load this bundle, so a new Wi-Fi
 *      network does not require editing the env file. The port stays 8080.
 *   2. Every authenticated request goes through `secureFetch`, which injects
 *      `Authorization: Bearer <access>` from hardware-backed SecureStore.
 *   3. Tokens are never logged, interpolated into URLs, or written to disk
 *      outside SecureStore.
 *
 * TOKEN LIFECYCLE
 *   - `login()` / `register()` obtain an access + refresh pair from the gateway.
 *   - `secureFetch` refreshes *before* the access token expires (decoded
 *     locally), and once more if the gateway still answers 401 `token_expired`.
 *   - 401 `invalid_token` (bad signature, secret rotated, account deleted,
 *     refresh token stale) wipes the session and throws `ApiSecurityError`
 *     with `requiresSignIn = true` so the UI shows the sign-in form instead of
 *     retrying a dead credential.
 *   - Concurrent refreshes are single-flight so a burst of 401s cannot rotate
 *     the refresh token several times and race each other into a logout.
 */

import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

import type { CatalogSong } from '../services/catalogService';
import {
  type AuthSession,
  clearSession,
  isAccessTokenStale,
  loadSession,
  saveSession,
} from '../security/AuthSession';

const FAVORITES_PATH = '/api/v1/metadata/favorites';
const LIKE_PATH = '/api/v1/metadata/like';
const UNLIKE_PATH = '/api/v1/metadata/unlike';
const PLAYBACK_HISTORY_PATH = '/api/v1/history/log';
const RECENT_HISTORY_PATH = '/api/v1/history/recent';
const LOGIN_PATH = '/api/v1/auth/login';
const REGISTER_PATH = '/api/v1/auth/register';
const REFRESH_PATH = '/api/v1/auth/refresh';

/** Per-request timeout so a dead server surfaces as an error, not a hang. */
const REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Track entity joined onto a favorite row (PostgreSQL `favorites -> tracks`). */
export interface TrackMetadata {
  id: number | string;
  title: string;
  artist?: string;
  genre?: string;
}

/** Cloud favorite row from GET /api/v1/metadata/favorites. */
export interface FavoriteMetadata {
  id: number | string;
  track: TrackMetadata;
}

/** Playback row from GET /api/v1/history/recent. */
export interface HistoryMetadata {
  id: number | string;
  track: TrackMetadata;
  playedAt?: string;
}

/** Optional per-call controls for read hooks. */
export interface FetchOptions {
  /** Abort the underlying request (e.g. when the caller unmounts or switches tabs). */
  signal?: AbortSignal;
}

/** JSON body posted to POST /api/v1/history/log when a stream initializes. */
export interface PlaybackHistoryPayload {
  trackId: number;
}

interface TokenPairResponse {
  accessToken?: string;
  refreshToken?: string;
  /** Legacy field: same value as `accessToken`. */
  token?: string;
  username?: string;
}

interface GatewayErrorBody {
  error?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * The gateway refused the credential. When `requiresSignIn` is true the stored
 * session has already been discarded and the user must log in again.
 */
export class ApiSecurityError extends Error {
  readonly status: 401 | 403;
  readonly requiresSignIn: boolean;

  constructor(status: 401 | 403, message: string, requiresSignIn: boolean) {
    super(message);
    this.name = 'ApiSecurityError';
    this.status = status;
    this.requiresSignIn = requiresSignIn;
  }
}

export class ApiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

/** Transport-level failure (unreachable host, timeout). */
export class ApiNetworkError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

/** Gateway answered with a non-2xx status that is not an auth failure. */
export class ApiResponseError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'ApiResponseError';
  }
}

// ---------------------------------------------------------------------------
// URL resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the gateway origin from the Expo-public environment.
 * Expo inlines `process.env.EXPO_PUBLIC_*` only when referenced with static
 * dot notation — never bracket access or destructuring.
 *
 * `EXPO_PUBLIC_API_URL` supplies the scheme and port (`http://localhost:8080`).
 * While developing, the hostname is taken from the Expo dev server the phone
 * is already connected to, so it follows whichever LAN the phone and PC share.
 */
let resolvedOrigin: string | undefined;

function resolveApiBaseUrl(): string {
  if (resolvedOrigin) {
    return resolvedOrigin;
  }

  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (typeof configured !== 'string' || configured.trim().length === 0) {
    throw new ApiConfigurationError(
      'EXPO_PUBLIC_API_URL is not configured. Set it in the Expo environment before making API calls.',
    );
  }

  const origin = configured.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new ApiConfigurationError('EXPO_PUBLIC_API_URL must be an absolute http(s) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ApiConfigurationError('EXPO_PUBLIC_API_URL must use http or https.');
  }

  if (__DEV__ && isLocalDevHost(parsed.hostname)) {
    const devHost = devMachineHost();
    if (devHost && devHost !== parsed.hostname) {
      parsed.hostname = devHost;
      console.log(`[api] API host follows Expo dev server: ${parsed.origin}`);
    }
  }

  resolvedOrigin = parsed.origin;
  return resolvedOrigin;
}

/** True for loopback and private LAN addresses, which change between networks. */
function isLocalDevHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return true;
  }
  if (host.startsWith('10.') || host.startsWith('192.168.')) {
    return true;
  }
  const rfc1918 = /^172\.(\d+)\./.exec(host);
  if (!rfc1918) {
    return false;
  }
  const second = Number(rfc1918[1]);
  return second >= 16 && second <= 31;
}

/**
 * Address of the computer serving this bundle (`10.x.x.x`), without the Metro port.
 * Null in a release build or when the packager host cannot be read.
 */
function devMachineHost(): string | null {
  try {
    const sourceCode = NativeModules.SourceCode as
      | { scriptURL?: string; getConstants?: () => { scriptURL?: string } }
      | undefined;
    const scriptURL = sourceCode?.scriptURL ?? sourceCode?.getConstants?.().scriptURL;
    const candidates = [Constants.expoConfig?.hostUri, Constants.expoGoConfig?.debuggerHost, scriptURL];
    for (const candidate of candidates) {
      const host = hostnameFromDevServer(candidate);
      if (host) {
        return host;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Pulls `10.57.194.70` out of `10.57.194.70:8081` or a bundle URL. Ignores loopback. */
function hostnameFromDevServer(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const withScheme = value.includes('://') ? value : `http://${value}`;
  try {
    const hostname = new URL(withScheme).hostname.replace(/^\[|\]$/g, '');
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return null;
    }
    return hostname;
  } catch {
    return null;
  }
}

/** Public so the UI can show which server it is talking to. */
export function getApiBaseUrl(): string {
  return resolveApiBaseUrl();
}

function joinApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${resolveApiBaseUrl()}${normalizedPath}`;
}

// ---------------------------------------------------------------------------
// Header helpers
// ---------------------------------------------------------------------------

function isHeadersLike(headers: HeadersInit): headers is Headers {
  return typeof (headers as Headers).forEach === 'function';
}

/**
 * Flatten any `HeadersInit` shape (`Headers`, tuple list, or record) into a
 * plain `Record<string, string>` that `fetch` in Expo Go accepts without
 * widening to the boxed `String` object type. Duck-typing is required because
 * Expo's DOM + React Native libs both declare `Headers`.
 */
function headersFromInit(headers?: HeadersInit): Record<string, string> {
  const merged: Record<string, string> = {};

  if (headers == null) {
    return merged;
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      const name = entry[0];
      const value = entry[1];
      if (typeof name === 'string' && typeof value === 'string') {
        merged[name] = value;
      }
    }
    return merged;
  }

  if (isHeadersLike(headers)) {
    headers.forEach((value, key) => {
      merged[key] = value;
    });
    return merged;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      merged[key] = value;
    }
  }

  return merged;
}

function assertPositiveInteger(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
}

// ---------------------------------------------------------------------------
// Low-level transport
// ---------------------------------------------------------------------------

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * `fetch` with a timeout that still honours the caller's own `signal`.
 * Rejections from a caller-initiated abort are re-thrown untouched so the UI
 * can ignore them; every other transport failure becomes `ApiNetworkError`.
 */
async function rawFetch(path: string, init: RequestInit, callerSignal?: AbortSignal): Promise<Response> {
  const url = joinApiUrl(path);
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', onCallerAbort);
  if (callerSignal?.aborted) {
    controller.abort();
  }
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (callerSignal?.aborted) {
      throw error; // caller cancelled on purpose
    }
    if (controller.signal.aborted) {
      throw new ApiNetworkError(`Request to ${url} timed out.`, error);
    }
    throw new ApiNetworkError(
      `Could not reach the TrentPlayer server at ${resolveApiBaseUrl()}. Check EXPO_PUBLIC_API_URL and that the backend is running.`,
      error,
    );
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

async function readErrorBody(response: Response): Promise<GatewayErrorBody> {
  try {
    const text = await response.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as GatewayErrorBody) : {};
  } catch {
    return {};
  }
}

async function toResponseError(response: Response): Promise<ApiResponseError> {
  const body = await readErrorBody(response);
  return new ApiResponseError(
    body.message ?? body.error ?? `Server responded with HTTP ${response.status}.`,
    response.status,
    body.error,
  );
}

function jsonInit(method: string, body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  };
}

// ---------------------------------------------------------------------------
// Auth endpoints (no bearer token)
// ---------------------------------------------------------------------------

function toSession(body: TokenPairResponse, fallbackUsername: string): AuthSession {
  const accessToken = body.accessToken ?? body.token;
  const refreshToken = body.refreshToken;
  if (!accessToken || !refreshToken) {
    throw new ApiResponseError(
      'Login response did not include a token pair. Is the backend up to date?',
      200,
    );
  }
  return { accessToken, refreshToken, username: body.username ?? fallbackUsername };
}

/** `true` when a session is stored on this device (not necessarily still valid). */
export async function hasStoredSession(): Promise<boolean> {
  return (await loadSession()) !== null;
}

/** Username of the stored session, or `null` when signed out. */
export async function getSessionUsername(): Promise<string | null> {
  return (await loadSession())?.username ?? null;
}

export async function register(username: string, password: string): Promise<void> {
  const response = await rawFetch(REGISTER_PATH, jsonInit('POST', { username, password }));
  if (!response.ok) {
    throw await toResponseError(response);
  }
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const response = await rawFetch(LOGIN_PATH, jsonInit('POST', { username, password }));
  if (response.status === 401) {
    const body = await readErrorBody(response);
    throw new ApiSecurityError(401, body.message ?? 'Invalid username or password.', true);
  }
  if (!response.ok) {
    throw await toResponseError(response);
  }
  const session = toSession((await response.json()) as TokenPairResponse, username.trim());
  await saveSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  await clearSession();
}

let refreshInFlight: Promise<AuthSession> | null = null;

/**
 * Rotates the token pair. Single-flight: concurrent callers await the same
 * promise. On any 401 the session is cleared and `ApiSecurityError` thrown.
 */
export function refreshSession(): Promise<AuthSession> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    const current = await loadSession();
    if (!current) {
      throw new ApiSecurityError(401, 'You are not signed in.', true);
    }
    const response = await rawFetch(REFRESH_PATH, jsonInit('POST', { refreshToken: current.refreshToken }));
    if (response.status === 401) {
      const body = await readErrorBody(response);
      await clearSession();
      throw new ApiSecurityError(
        401,
        body.error === 'token_expired'
          ? 'Your session expired. Please sign in again.'
          : 'Your session is no longer valid. Please sign in again.',
        true,
      );
    }
    if (!response.ok) {
      throw await toResponseError(response);
    }
    const next = toSession((await response.json()) as TokenPairResponse, current.username);
    await saveSession(next);
    return next;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function ensureFreshSession(): Promise<AuthSession> {
  const session = await loadSession();
  if (!session) {
    throw new ApiSecurityError(401, 'Sign in to view your cloud library.', true);
  }
  if (isAccessTokenStale(session.accessToken)) {
    return refreshSession();
  }
  return session;
}

// ---------------------------------------------------------------------------
// Authenticated request engine
// ---------------------------------------------------------------------------

/**
 * Shared request engine: hardware-isolated JWT injection + refresh-and-retry.
 * Callers pass a relative Spring Boot path and a typed `RequestInit`.
 */
async function secureFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const callerSignal = init.signal ?? undefined;
  let session = await ensureFreshSession();

  const send = (token: string) =>
    rawFetch(
      path,
      {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...headersFromInit(init.headers),
          Authorization: `Bearer ${token}`,
        },
      },
      callerSignal,
    );

  let response = await send(session.accessToken);
  if (response.status === 403) {
    throw new ApiSecurityError(403, 'You do not have permission to access this resource.', false);
  }
  if (response.status !== 401) {
    return response;
  }

  const body = await readErrorBody(response);
  if (body.error === 'token_expired' || body.error === 'unauthorized') {
    // Server clock may disagree with ours; refresh once and replay.
    session = await refreshSession();
    response = await send(session.accessToken);
    if (response.status !== 401) {
      return response;
    }
    const retryBody = await readErrorBody(response);
    // A second "authentication required" after a successful refresh means this
    // endpoint failed, not that the account is gone. Wiping the session here
    // is what made Home show "Sign in" after every new account.
    if (retryBody.error !== 'invalid_token' && retryBody.error !== 'token_expired') {
      throw new ApiResponseError(
        retryBody.message ?? 'Could not load your cloud library.',
        response.status,
        retryBody.error,
      );
    }
  }

  await clearSession();
  throw new ApiSecurityError(401, 'Your session is no longer valid. Please sign in again.', true);
}

// ---------------------------------------------------------------------------
// Domain endpoints
// ---------------------------------------------------------------------------

function isEntityId(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}

function isHistoryMetadata(value: unknown): value is HistoryMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  if (!isEntityId(row.id) || typeof row.track !== 'object' || row.track === null) {
    return false;
  }
  const track = row.track as Record<string, unknown>;
  return isEntityId(track.id) && typeof track.title === 'string';
}

function isFavoriteMetadata(value: unknown): value is FavoriteMetadata {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  if (!isEntityId(row.id) || typeof row.track !== 'object' || row.track === null) {
    return false;
  }
  const track = row.track as Record<string, unknown>;
  return (
    isEntityId(track.id) &&
    typeof track.title === 'string' &&
    (track.artist === undefined || track.artist === null || typeof track.artist === 'string')
  );
}

/**
 * GET /api/v1/metadata/favorites — authorized user's personalized favorites map.
 */
export interface LibraryTrack {
  id: number;
  title: string;
  artist: string;
  genre: string;
}

/**
 * GET /api/v1/audio/tracks — audio files currently in the OneDrive music folder.
 * The server registers new files on this call.
 */
export async function getLibraryTracks(options: FetchOptions = {}): Promise<LibraryTrack[]> {
  const response = await secureFetch('/api/v1/audio/tracks', {
    method: 'GET',
    signal: options.signal,
  });
  if (!response.ok) {
    throw await toResponseError(response);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new ApiResponseError('Library response was not an array.', response.status);
  }
  const tracks: LibraryTrack[] = [];
  for (const row of payload) {
    if (typeof row !== 'object' || row === null) {
      continue;
    }
    const track = row as Record<string, unknown>;
    const id = asTrackId(track.id);
    if (id == null || typeof track.title !== 'string') {
      continue;
    }
    tracks.push({
      id,
      title: track.title,
      artist: typeof track.artist === 'string' ? track.artist : 'Unknown',
      genre: typeof track.genre === 'string' ? track.genre : 'Uncategorized',
    });
  }
  return tracks;
}

export function asTrackId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

/** Full-file stream for a track stored in the media folder. */
export async function librarySong(track: LibraryTrack): Promise<CatalogSong> {
  const session = await ensureFreshSession();
  return {
    id: `library-${track.id}`,
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    album: '',
    artworkUrl: '',
    streamUrl: joinApiUrl(`/api/v1/audio/stream/${track.id}`),
    streamHeaders: { Authorization: `Bearer ${session.accessToken}` },
    durationMs: 0,
    genre: track.genre,
  };
}

export async function likeTrack(trackId: number): Promise<void> {
  assertPositiveInteger(trackId, 'trackId');
  const response = await secureFetch(`${LIKE_PATH}?trackId=${trackId}`, { method: 'POST' });
  if (response.status === 409) {
    return;
  }
  if (!response.ok) {
    throw await toResponseError(response);
  }
}

export async function unlikeTrack(trackId: number): Promise<void> {
  assertPositiveInteger(trackId, 'trackId');
  const response = await secureFetch(`${UNLIKE_PATH}?trackId=${trackId}`, { method: 'POST' });
  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    throw await toResponseError(response);
  }
}

export async function getRecentHistory(options: FetchOptions = {}): Promise<HistoryMetadata[]> {
  const response = await secureFetch(RECENT_HISTORY_PATH, {
    method: 'GET',
    signal: options.signal,
  });
  if (!response.ok) {
    throw await toResponseError(response);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new ApiResponseError('History response was not an array.', response.status);
  }
  return payload.filter(isHistoryMetadata);
}

export async function getUserFavorites(options: FetchOptions = {}): Promise<FavoriteMetadata[]> {
  const response = await secureFetch(FAVORITES_PATH, {
    method: 'GET',
    signal: options.signal,
  });

  if (!response.ok) {
    throw await toResponseError(response);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new ApiResponseError('Favorites response was not an array.', response.status);
  }

  if (!payload.every(isFavoriteMetadata)) {
    throw new ApiResponseError(
      'Favorites response contained a malformed favorite/track row.',
      response.status,
    );
  }

  return payload;
}

/**
 * POST /api/v1/history/log — records a parameterized playback flag when an
 * authorized stream initializes. Auth failures propagate; transport errors
 * return `false` so playback is not interrupted.
 */
export async function logPlaybackHistory(trackId: number): Promise<boolean> {
  assertPositiveInteger(trackId, 'trackId');

  const payload: PlaybackHistoryPayload = { trackId };
  const query = new URLSearchParams({ trackId: String(payload.trackId) });

  try {
    const response = await secureFetch(`${PLAYBACK_HISTORY_PATH}?${query.toString()}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (error) {
    if (error instanceof ApiSecurityError || error instanceof ApiConfigurationError) {
      throw error;
    }
    if (isAbortError(error)) {
      return false;
    }
    console.error('History logging failed.', error);
    return false;
  }
}
