/**
 * AuthProvider
 * ------------
 * Decides, once per launch, whether the saved refresh token is still good.
 * Screens read `isAuthenticated` / `login` / `logout` from here instead of
 * touching SecureStore themselves.
 *
 * The login screen is shown only when the refresh token is missing, expired,
 * or revoked. If the server cannot be reached but the access token is still
 * inside its lifetime, the app opens anyway and the next API call retries
 * the refresh.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { authLog } from '../api/config';
import { AuthRequiredError, login as loginRequest, refreshSession, register } from '../api/TrentApi';
import {
  clearTokens,
  getRefreshToken,
  isAccessTokenStale,
  loadSession,
  onSessionCleared,
} from '../security/AuthSession';

export type AuthStatus = 'booting' | 'authenticated' | 'unauthenticated' | 'offline';

interface AuthContextValue {
  status: AuthStatus;
  isAuthenticated: boolean;
  username: string | null;
  offlineMessage: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retrySession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('booting');
  const [username, setUsername] = useState<string | null>(null);
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    return onSessionCleared(() => {
      setUsername(null);
      setOfflineMessage(null);
      setStatus('unauthenticated');
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    (async () => {
      authLog('startup: checking for a refresh token');
      const refreshToken = await getRefreshToken();
      if (isCancelled()) return;

      if (!refreshToken) {
        authLog('startup: no refresh token; showing login');
        setUsername(null);
        setOfflineMessage(null);
        setStatus('unauthenticated');
        return;
      }

      authLog('startup: refresh token found; refreshing access token');
      try {
        const session = await refreshSession();
        if (isCancelled()) return;
        authLog('startup: session restored', { username: session.username });
        setUsername(session.username);
        setOfflineMessage(null);
        setStatus('authenticated');
      } catch (error) {
        if (isCancelled()) return;
        if (error instanceof AuthRequiredError) {
          authLog('startup: refresh token unusable; showing login', { message: error.message });
          setUsername(null);
          setOfflineMessage(null);
          setStatus('unauthenticated');
          return;
        }

        const session = await loadSession();
        if (isCancelled()) return;
        if (session && !isAccessTokenStale(session.accessToken, 0)) {
          authLog('startup: refresh failed but access token is still valid', {
            message: error instanceof Error ? error.message : 'unknown',
          });
          setUsername(session.username);
          setOfflineMessage(null);
          setStatus('authenticated');
          return;
        }

        const message = error instanceof Error ? error.message : 'Could not reach the server.';
        authLog('startup: refresh failed before the access token could be renewed', { message });
        setOfflineMessage(message);
        setStatus('offline');
      }
    })().catch((error: unknown) => {
      if (isCancelled()) return;
      const message = error instanceof Error ? error.message : 'Could not restore your session.';
      authLog('startup: session check crashed', { message });
      setOfflineMessage(message);
      setStatus('offline');
    });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await loginRequest(email.trim(), password);
    setUsername(session.username);
    setOfflineMessage(null);
    setStatus('authenticated');
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const account = email.trim();
    await register(account, password);
    const session = await loginRequest(account, password);
    setUsername(session.username);
    setOfflineMessage(null);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    authLog('logout');
    await clearTokens();
    setUsername(null);
    setOfflineMessage(null);
    setStatus('unauthenticated');
  }, []);

  const retrySession = useCallback(() => {
    authLog('startup: retrying session restore');
    setOfflineMessage(null);
    setStatus('booting');
    setAttempt((current) => current + 1);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      isAuthenticated: status === 'authenticated',
      username,
      offlineMessage,
      login,
      signup,
      logout,
      retrySession,
    }),
    [status, username, offlineMessage, login, signup, logout, retrySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return value;
}
