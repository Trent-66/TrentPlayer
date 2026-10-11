/**
 * AuthSession
 * -----------
 * Persists the backend's access + refresh JWT pair in the platform hardware
 * vault (`expo-secure-store`, same vault as `DatabaseKeyVault`) and answers
 * "is this access token about to expire?" without a network round-trip by
 * decoding the unsigned `exp` claim locally.
 *
 * The decode is *only* used for scheduling a proactive refresh. The server
 * remains the sole authority on validity: it re-verifies the signature and
 * expiry on every request and answers 401 `token_expired` / `invalid_token`.
 *
 * Tokens are never written to AsyncStorage, logs, or the SQLite ledger.
 */

import * as SecureStore from 'expo-secure-store';

import { ACCESS_TOKEN_REFRESH_SKEW_SECONDS, authLog } from '../api/config';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  username: string;
}

export class AuthSessionError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AuthSessionError';
  }
}

const KEY_ACCESS = 'trentplayer.auth.access.v1';
const KEY_REFRESH = 'trentplayer.auth.refresh.v1';
const KEY_USERNAME = 'trentplayer.auth.username.v1';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Compact JWS: three base64url segments. Cheap structural guard before storing. */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

let cached: AuthSession | null | undefined;

/**
 * Bumped on every clear. A refresh that started before a logout must not
 * write a new pair back into the vault afterwards.
 */
let generation = 0;

const sessionClearedListeners = new Set<() => void>();

/** Current session generation. Capture it before an async refresh. */
export function sessionGeneration(): number {
  return generation;
}

/** Fired after the vault copy of the session has been dropped. */
export function onSessionCleared(listener: () => void): () => void {
  sessionClearedListeners.add(listener);
  return () => {
    sessionClearedListeners.delete(listener);
  };
}

function notifySessionCleared(): void {
  for (const listener of sessionClearedListeners) {
    listener();
  }
}

// ---------------------------------------------------------------------------
// JWT payload decoding (no signature check; see header comment)
// ---------------------------------------------------------------------------

function base64UrlToUtf8(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  if (typeof atob !== 'function') {
    throw new AuthSessionError('atob is unavailable in this runtime.');
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (typeof TextDecoder === 'function') {
    return new TextDecoder().decode(bytes);
  }
  return decodeURIComponent(
    Array.from(bytes, (b) => `%${b.toString(16).padStart(2, '0')}`).join(''),
  );
}

export interface JwtClaims {
  sub?: string;
  exp?: number;
  iat?: number;
  typ?: string;
}

/** Returns the decoded payload or `null` if the token is not parseable. */
export function decodeJwtClaims(token: string): JwtClaims | null {
  if (!JWT_SHAPE.test(token)) {
    return null;
  }
  try {
    const payload = token.split('.')[1]!;
    const parsed: unknown = JSON.parse(base64UrlToUtf8(payload));
    return parsed && typeof parsed === 'object' ? (parsed as JwtClaims) : null;
  } catch {
    return null;
  }
}

/** Seconds until `exp`; negative when already expired; `null` if unknown. */
export function secondsUntilExpiry(token: string, now: number = Date.now()): number | null {
  const claims = decodeJwtClaims(token);
  if (!claims || typeof claims.exp !== 'number') {
    return null;
  }
  return claims.exp - Math.floor(now / 1000);
}

/**
 * `true` when the token is expired, unparseable, or inside the refresh skew
 * window — i.e. whenever the client should refresh *before* calling the API.
 */
export function isAccessTokenStale(
  token: string,
  skewSeconds: number = ACCESS_TOKEN_REFRESH_SKEW_SECONDS,
): boolean {
  const remaining = secondsUntilExpiry(token);
  return remaining === null || remaining <= skewSeconds;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function readItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  } catch (error) {
    throw new AuthSessionError('Failed reading auth session from secure storage.', error);
  }
}

/** Loads the persisted session (memoised). `null` when signed out. */
export async function loadSession(): Promise<AuthSession | null> {
  if (cached !== undefined) {
    return cached;
  }
  const [accessToken, refreshToken, username] = await Promise.all([
    readItem(KEY_ACCESS),
    readItem(KEY_REFRESH),
    readItem(KEY_USERNAME),
  ]);
  if (!accessToken || !refreshToken || !username) {
    cached = null;
    return null;
  }
  if (!JWT_SHAPE.test(accessToken) || !JWT_SHAPE.test(refreshToken)) {
    // Corrupted entry: safer to force a fresh login than to send garbage.
    await clearSession('corrupt-session');
    return null;
  }
  cached = { accessToken, refreshToken, username };
  return cached;
}

export async function saveSession(session: AuthSession): Promise<void> {
  if (!JWT_SHAPE.test(session.accessToken) || !JWT_SHAPE.test(session.refreshToken)) {
    throw new AuthSessionError('Refusing to store a malformed token.');
  }
  if (!session.username || session.username.trim().length === 0) {
    throw new AuthSessionError('Refusing to store a session without a username.');
  }
  const generationAtStart = generation;
  try {
    await Promise.all([
      SecureStore.setItemAsync(KEY_ACCESS, session.accessToken, SECURE_STORE_OPTIONS),
      SecureStore.setItemAsync(KEY_REFRESH, session.refreshToken, SECURE_STORE_OPTIONS),
      SecureStore.setItemAsync(KEY_USERNAME, session.username, SECURE_STORE_OPTIONS),
    ]);
  } catch (error) {
    throw new AuthSessionError('Failed persisting auth session to secure storage.', error);
  }
  if (generationAtStart !== generation) {
    // Logout won the race. Drop the pair we just wrote so a refresh cannot
    // resurrect a session the user already left.
    cached = null;
    await deleteStoredSession();
    authLog('tokens discarded', { reason: 'signed-out-during-save' });
    return;
  }
  cached = { ...session };
  authLog('tokens saved', { accessExpiresInSec: secondsUntilExpiry(session.accessToken) });
}

async function deleteStoredSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_ACCESS, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(KEY_REFRESH, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(KEY_USERNAME, SECURE_STORE_OPTIONS),
  ]);
}

export async function clearSession(reason = 'cleared'): Promise<void> {
  generation += 1;
  cached = null;
  authLog('clearing tokens', { reason });
  try {
    await deleteStoredSession();
    authLog('tokens cleared', { reason });
  } catch (error) {
    throw new AuthSessionError('Failed clearing auth session from secure storage.', error);
  } finally {
    notifySessionCleared();
  }
}

/**
 * Stores the access + refresh pair. `username` is optional because the
 * account name is also the JWT `sub` claim.
 */
export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  username?: string,
): Promise<void> {
  const resolved =
    username?.trim() ||
    decodeJwtClaims(accessToken)?.sub ||
    decodeJwtClaims(refreshToken)?.sub ||
    '';
  await saveSession({ accessToken, refreshToken, username: resolved });
}

export async function getAccessToken(): Promise<string | null> {
  const session = await loadSession();
  return session?.accessToken ?? null;
}

export async function getRefreshToken(): Promise<string | null> {
  const session = await loadSession();
  return session?.refreshToken ?? null;
}

/** Drops both tokens. Used by logout. */
export async function clearTokens(): Promise<void> {
  await clearSession('logout');
}
