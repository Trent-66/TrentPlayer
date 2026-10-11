/**
 * API configuration
 * -----------------
 * `EXPO_PUBLIC_API_URL` is inlined by the Expo CLI at bundle time from the
 * project's `.env` (only `EXPO_PUBLIC_`-prefixed keys are ever inlined, so the
 * backend's `JWT_SECRET` / `DB_*` entries in the same file never reach the app).
 *
 * On a physical device `localhost` points at the phone, not your PC. Set the
 * LAN address of the machine running Spring Boot, e.g.
 *   EXPO_PUBLIC_API_URL=http://192.168.1.20:8080
 * and fully reload the app after changing it.
 */

const DEFAULT_API_URL = 'http://localhost:8080';

function normaliseBaseUrl(raw: string | undefined): string {
  const candidate = (raw ?? '').trim();
  if (candidate.length === 0) {
    return DEFAULT_API_URL;
  }
  return candidate.replace(/\/+$/, '');
}

export const API_BASE_URL: string = normaliseBaseUrl(process.env.EXPO_PUBLIC_API_URL);

/** Refresh the access token when fewer than this many seconds remain. */
export const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 60;

/** Per-request timeout so a dead server surfaces as an error, not a hang. */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Logs token refresh attempts (never the tokens themselves).
 * On in dev builds. Set `EXPO_PUBLIC_AUTH_DEBUG=1` to force it on in any build.
 */
export const AUTH_DEBUG =
  (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_AUTH_DEBUG === '1';

export function authLog(event: string, detail?: Record<string, unknown>): void {
  if (!AUTH_DEBUG) {
    return;
  }
  if (detail) {
    console.log(`[auth] ${event}`, detail);
    return;
  }
  console.log(`[auth] ${event}`);
}
