/**
 * TrentApi
 * --------
 * Thin client for the Spring Boot backend that owns the JWT lifecycle so no
 * screen ever has to think about tokens:
 *
 *   1. `authorizedFetch` attaches `Authorization: Bearer <access>`.
 *   2. If the access token is about to expire (decoded locally) it refreshes
 *      *before* the call, so the common path never sees a 401.
 *   3. If the server still answers 401 `token_expired`, it refreshes once and
 *      replays the request.
 *   4. If the server answers 401 `invalid_token` (bad signature, secret
 *      rotated, account deleted, refresh token stale), the session is wiped
 *      and `AuthRequiredError` is thrown so the UI shows the sign-in form.
 *
 * Concurrent 401s share a single in-flight refresh (`refreshInFlight`), so a
 * burst of requests cannot rotate the refresh token several times and race
 * each other into a logout.
 */

import { API_BASE_URL, REQUEST_TIMEOUT_MS, authLog } from './config';
import {
  type AuthSession,
  clearSession,
  clearTokens,
  isAccessTokenStale,
  loadSession,
  saveSession,
  secondsUntilExpiry,
  sessionGeneration,
} from '../security/AuthSession';

// ---------------------------------------------------------------------------
// Types mirrored from the backend
// ---------------------------------------------------------------------------

export interface RemoteTrack {
  id: number;
  title: string;
  artist: string;
  genre: string;
}

export interface RemoteFavorite {
  id: number;
  username: string;
  track: RemoteTrack;
}

export interface RemoteHistoryEntry {
  id: number;
  username: string;
  track: RemoteTrack;
  /** ISO-8601 instant. */
  playedAt: string;
}

interface TokenPairResponse {
  accessToken?: string;
  refreshToken?: string;
  /** Legacy field: same value as `accessToken`. */
  token?: string;
  username?: string;
  expiresIn?: number;
}

interface ErrorBody {
  error?: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | 'token_expired'
  | 'invalid_token'
  | 'unauthorized'
  | 'bad_request'
  | 'network'
  | 'timeout'
  | 'server'
  | 'unknown';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown once the stored session has been discarded; the user must sign in. */
export class AuthRequiredError extends ApiError {
  constructor(message: string, cause?: unknown) {
    super(message, 401, 'invalid_token', cause);
    this.name = 'AuthRequiredError';
  }
}

// ---------------------------------------------------------------------------
// Low-level fetch
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(`Request to ${url} timed out.`, 0, 'timeout', error);
    }
    throw new ApiError(
      `Could not reach the server at ${API_BASE_URL}. Check EXPO_PUBLIC_API_URL and that the backend is running.`,
      0,
      'network',
      error,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorBody(response: Response): Promise<ErrorBody> {
  try {
    const text = await response.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as ErrorBody) : {};
  } catch {
    return {};
  }
}

function toApiError(response: Response, body: ErrorBody): ApiError {
  const code: ApiErrorCode =
    body.error === 'token_expired' || body.error === 'invalid_token' || body.error === 'unauthorized'
      ? body.error
      : response.status === 401
        ? 'unauthorized'
        : response.status === 400
          ? 'bad_request'
          : response.status >= 500
            ? 'server'
            : 'unknown';
  const message = body.message ?? body.error ?? `Server responded with HTTP ${response.status}.`;
  return new ApiError(message, response.status, code);
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new ApiError('Server returned malformed JSON.', response.status, 'server', error);
  }
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  };
}

// ---------------------------------------------------------------------------
// Auth endpoints (no bearer token)
// ---------------------------------------------------------------------------

function toSession(body: TokenPairResponse, fallbackUsername: string): AuthSession {
  const accessToken = body.accessToken ?? body.token;
  const refreshToken = body.refreshToken;
  if (!accessToken || !refreshToken) {
    throw new ApiError('Login response did not include a token pair.', 200, 'server');
  }
  return { accessToken, refreshToken, username: body.username ?? fallbackUsername };
}

export async function register(username: string, password: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/auth/register`,
    jsonInit('POST', { username, password }),
  );
  if (!response.ok) {
    throw toApiError(response, await readErrorBody(response));
  }
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/api/v1/auth/login`,
    jsonInit('POST', { username, password }),
  );
  if (!response.ok) {
    throw toApiError(response, await readErrorBody(response));
  }
  const session = toSession(await parseJson<TokenPairResponse>(response), username.trim());
  await saveSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  await clearTokens();
}

let refreshInFlight: Promise<AuthSession> | null = null;

/**
 * Rotates the token pair. Single-flight: concurrent callers await the same
 * promise. On 401 the session is cleared and `AuthRequiredError` thrown.
 * Network and 5xx failures leave the stored refresh token alone.
 */
export function refreshSession(): Promise<AuthSession> {
  if (refreshInFlight) {
    authLog('refresh joined in-flight attempt');
    return refreshInFlight;
  }
  const generationAtStart = sessionGeneration();
  authLog('refresh started');
  refreshInFlight = (async () => {
    try {
      const current = await loadSession();
      if (!current || generationAtStart !== sessionGeneration()) {
        authLog('refresh aborted', { reason: 'no-session' });
        throw new AuthRequiredError('Not signed in.');
      }
      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/v1/auth/refresh`,
        jsonInit('POST', { refreshToken: current.refreshToken }),
      );
      if (response.status === 401) {
        const body = await readErrorBody(response);
        const reason = body.error === 'token_expired' ? 'refresh-expired' : 'refresh-revoked';
        authLog('refresh rejected', { status: 401, error: body.error ?? 'unauthorized' });
        if (generationAtStart === sessionGeneration()) {
          await clearSession(reason);
        }
        throw new AuthRequiredError(
          body.error === 'token_expired'
            ? 'Your session expired. Please sign in again.'
            : 'Your session is no longer valid. Please sign in again.',
        );
      }
      if (!response.ok) {
        const error = toApiError(response, await readErrorBody(response));
        authLog('refresh failed', { status: error.status, code: error.code });
        throw error;
      }
      const body = await parseJson<TokenPairResponse>(response);
      if (generationAtStart !== sessionGeneration()) {
        authLog('refresh ignored', { reason: 'signed-out-during-refresh' });
        throw new AuthRequiredError('Not signed in.');
      }
      const next = toSession(body, current.username);
      await saveSession(next);
      if (generationAtStart !== sessionGeneration()) {
        authLog('refresh ignored', { reason: 'signed-out-during-save' });
        throw new AuthRequiredError('Not signed in.');
      }
      authLog('refresh succeeded', {
        accessExpiresInSec: secondsUntilExpiry(next.accessToken),
        refreshRotated: next.refreshToken !== current.refreshToken,
      });
      return next;
    } catch (error) {
      const alreadyLogged =
        error instanceof AuthRequiredError || (error instanceof ApiError && error.status !== 0);
      if (!alreadyLogged) {
        authLog('refresh failed', {
          code: error instanceof ApiError ? error.code : undefined,
          message: error instanceof Error ? error.message : 'unknown',
        });
      }
      throw error;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

// ---------------------------------------------------------------------------
// Authorised requests
// ---------------------------------------------------------------------------

async function ensureFreshSession(): Promise<AuthSession> {
  const session = await loadSession();
  if (!session) {
    throw new AuthRequiredError('Not signed in.');
  }
  if (isAccessTokenStale(session.accessToken)) {
    return refreshSession();
  }
  return session;
}

/**
 * Performs an authenticated request. Handles refresh-and-retry once; anything
 * that still fails with 401 becomes `AuthRequiredError`.
 */
export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let session = await ensureFreshSession();

  const send = (token: string) =>
    fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
      },
    });

  let response = await send(session.accessToken);
  if (response.status !== 401) {
    return response;
  }

  const body = await readErrorBody(response);
  if (body.error === 'token_expired' || body.error === 'unauthorized') {
    // Server clock may disagree with ours; refresh once and replay.
    authLog('access token rejected; refreshing once', { error: body.error ?? 'unauthorized' });
    session = await refreshSession();
    response = await send(session.accessToken);
    if (response.status !== 401) {
      return response;
    }
  }

  authLog('access token rejected after refresh', { error: body.error ?? 'unauthorized' });
  await clearSession('access-rejected');
  throw new AuthRequiredError('Your session is no longer valid. Please sign in again.');
}

async function authorizedJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(path, init);
  if (!response.ok) {
    throw toApiError(response, await readErrorBody(response));
  }
  return parseJson<T>(response);
}

// ---------------------------------------------------------------------------
// Domain endpoints
// ---------------------------------------------------------------------------

export function getFavorites(): Promise<RemoteFavorite[]> {
  return authorizedJson<RemoteFavorite[]>('/api/v1/metadata/favorites');
}

export function likeTrack(trackId: number): Promise<void> {
  return authorizedJson<void>(`/api/v1/metadata/like?trackId=${encodeURIComponent(trackId)}`, {
    method: 'POST',
  });
}

export function getRecentHistory(): Promise<RemoteHistoryEntry[]> {
  return authorizedJson<RemoteHistoryEntry[]>('/api/v1/history/recent');
}

export function logPlayback(trackId: number): Promise<void> {
  return authorizedJson<void>(`/api/v1/history/log?trackId=${encodeURIComponent(trackId)}`, {
    method: 'POST',
  });
}

/** Absolute URL for the byte-range stream endpoint of a track. */
export function streamUrl(trackId: number): string {
  return `${API_BASE_URL}/api/v1/audio/stream/${encodeURIComponent(trackId)}`;
}

/**
 * Headers for `FileCacheManager.downloadTrack` / an audio player that need
 * the bearer token but cannot go through `authorizedFetch`.
 */
export async function authorizedHeaders(): Promise<Record<string, string>> {
  const session = await ensureFreshSession();
  return { Authorization: `Bearer ${session.accessToken}` };
}
