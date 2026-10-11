/**
 * CloudLibrary
 * ------------
 * The "Cloud" tab. Sign-in lives in `AuthFlow`; this screen only loads
 * favourites and history for the session `AuthProvider` already restored.
 *
 * A rejected refresh token clears the session inside `TrentApi`, and
 * `AuthProvider` sends the user back to the welcome screen.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  ApiError,
  AuthRequiredError,
  type RemoteFavorite,
  type RemoteHistoryEntry,
  getFavorites,
  getRecentHistory,
} from '../api/TrentApi';
import { API_BASE_URL } from '../api/config';
import { useAuth } from '../auth/AuthContext';
import { palette } from '../theme';

type CloudState =
  | { status: 'loading'; username: string }
  | { status: 'ready'; username: string; favorites: RemoteFavorite[]; recent: RemoteHistoryEntry[] }
  | { status: 'error'; username: string; message: string };

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong.';
}

export function CloudLibrary({ onToast }: { onToast: (message: string) => void }) {
  const { username, logout } = useAuth();
  const account = username ?? '';
  const [state, setState] = useState<CloudState>({ status: 'loading', username: account });

  const loadLibrary = useCallback(async (nextUsername: string) => {
    setState({ status: 'loading', username: nextUsername });
    try {
      const [favorites, recent] = await Promise.all([getFavorites(), getRecentHistory()]);
      setState({ status: 'ready', username: nextUsername, favorites, recent });
    } catch (error) {
      if (error instanceof AuthRequiredError) {
        await logout();
        return;
      }
      setState({
        status: 'error',
        username: nextUsername,
        message: messageFor(error),
      });
    }
  }, [logout]);

  useEffect(() => {
    if (!account) return;
    loadLibrary(account).catch(() => undefined);
  }, [account, loadLibrary]);

  const handleSignOut = useCallback(async () => {
    try {
      await logout();
    } catch (error) {
      onToast(messageFor(error));
    }
  }, [logout, onToast]);

  switch (state.status) {
    case 'loading':
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={palette.accent} />
          <Text style={styles.muted}>Loading your cloud library…</Text>
        </View>
      );

    case 'error':
      return (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not reach TrentPlayer Cloud</Text>
          <Text style={styles.errorBody}>{state.message}</Text>
          <Pressable style={styles.primaryButton} onPress={() => loadLibrary(state.username)}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </Pressable>
          <Text style={styles.hint}>Server: {API_BASE_URL}</Text>
        </View>
      );

    case 'ready':
      return (
        <View style={styles.list}>
          <View style={styles.rowBetween}>
            <Text style={styles.muted}>Signed in as {state.username}</Text>
            <View style={styles.rowActions}>
              <Pressable onPress={() => loadLibrary(state.username)} hitSlop={8}>
                <Text style={styles.link}>Refresh</Text>
              </Pressable>
              <Pressable onPress={handleSignOut} hitSlop={8}>
                <Text style={styles.link}>Sign out</Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.groupTitle}>❤️ Liked on cloud · {state.favorites.length}</Text>
          {state.favorites.length === 0 ? (
            <Text style={styles.muted}>No liked tracks yet.</Text>
          ) : (
            state.favorites.map((f) => (
              <TrackRow key={`fav-${f.id}`} title={f.track.title} subtitle={`${f.track.artist} · ${f.track.genre}`} />
            ))
          )}

          <Text style={styles.groupTitle}>🕘 Recently played · {state.recent.length}</Text>
          {state.recent.length === 0 ? (
            <Text style={styles.muted}>Nothing played yet.</Text>
          ) : (
            state.recent.slice(0, 20).map((h) => (
              <TrackRow
                key={`hist-${h.id}`}
                title={h.track.title}
                subtitle={`${h.track.artist} · ${new Date(h.playedAt).toLocaleString()}`}
              />
            ))
          )}
        </View>
      );
  }
}

function TrackRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.trackRow}>
      <View style={styles.trackGlyph}>
        <Text style={styles.trackGlyphText}>☁️</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.trackTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.trackSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  muted: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },
  hint: { color: palette.textMuted, fontSize: 11, textAlign: 'center', marginTop: 4 },
  link: { color: palette.accent, fontSize: 13, fontWeight: '700' },

  list: { gap: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowActions: { flexDirection: 'row', gap: 16 },
  groupTitle: { color: palette.text, fontSize: 15, fontWeight: '700', marginTop: 8 },

  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  trackGlyph: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: palette.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackGlyphText: { fontSize: 20 },
  trackTitle: { color: palette.text, fontSize: 15, fontWeight: '600' },
  trackSub: { color: palette.textMuted, fontSize: 12, marginTop: 2 },

  errorCard: {
    backgroundColor: palette.surface,
    borderColor: palette.danger,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    alignItems: 'center',
  },
  errorTitle: { color: palette.danger, fontSize: 17, fontWeight: '800' },
  errorBody: { color: palette.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },

  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  primaryButtonText: { color: palette.bg, fontSize: 15, fontWeight: '800' },
});
