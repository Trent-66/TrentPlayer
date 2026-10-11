/**
 * AuthSession
 * -----------
 * Persists the backend's access + refresh JWT pair in the platform hardware
 * vault (`expo-secure-store`) and answers "is this access token about to
 * expire?" without a network round-trip by decoding the unsigned `exp` claim
 * locally.
 *
 * The decode is *only* used for scheduling a proactive refresh. The server
 * remains the sole authority on validity: it re-verifies the signature and
 * expiry on every request and answers 401 `token_expired` / `invalid_token`.
 *
 * Tokens are never written to AsyncStorage, logs, or the SQLite ledger.
 */

import * as SecureStore from 'expo-secure-store';

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

/** Refresh the access token when fewer than this many seconds remain. */
export const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 60;

/** Hardware-keystore entry for the JWT access token (OWASP Mobile M9). */
export const JWT_ACCESS_TOKEN_KEY = 'jwt_access_token';
const KEY_REFRESH = 'trentplayer.auth.refresh.v1';
const KEY_USERNAME = 'trentplayer.auth.username.v1';

/** Previous access-token key. Removed on write and sign-out so a second copy cannot linger. */
const PREVIOUS_KEY_ACCESS = 'trentplayer.auth.access.v1';

export const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Compact JWS: three base64url segments. Cheap structural guard before storing. */
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

let cached: AuthSession | null | undefined;

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
    readItem(JWT_ACCESS_TOKEN_KEY),
    readItem(KEY_REFRESH),
    readItem(KEY_USERNAME),
  ]);
  if (!accessToken || !refreshToken || !username) {
    cached = null;
    return null;
  }
  if (!JWT_SHAPE.test(accessToken) || !JWT_SHAPE.test(refreshToken)) {
    // Corrupted entry: safer to force a fresh login than to send garbage.
    await clearSession();
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
  try {
    await Promise.all([
      SecureStore.setItemAsync(JWT_ACCESS_TOKEN_KEY, session.accessToken, SECURE_STORE_OPTIONS),
      SecureStore.setItemAsync(KEY_REFRESH, session.refreshToken, SECURE_STORE_OPTIONS),
      SecureStore.setItemAsync(KEY_USERNAME, session.username, SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(PREVIOUS_KEY_ACCESS, SECURE_STORE_OPTIONS),
    ]);
  } catch (error) {
    throw new AuthSessionError('Failed persisting auth session to secure storage.', error);
  }
  cached = { ...session };
}

export async function clearSession(): Promise<void> {
  cached = null;
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(JWT_ACCESS_TOKEN_KEY, SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(KEY_REFRESH, SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(KEY_USERNAME, SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(PREVIOUS_KEY_ACCESS, SECURE_STORE_OPTIONS),
    ]);
  } catch (error) {
    throw new AuthSessionError('Failed clearing auth session from secure storage.', error);
  }
}
