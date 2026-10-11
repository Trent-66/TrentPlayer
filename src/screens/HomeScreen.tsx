import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { SearchPill } from '../components/SearchPill';
import { SongCard } from '../components/SongCard';
import { usePlayback } from '../player/PlaybackProvider';
import { loadHomeCatalog, type CatalogSong } from '../services/catalogService';
import { ApiSecurityError } from '../services/apiService';
import { palette as darkPalette, type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Could not load songs.';
}

interface HomeScreenProps {
  username: string;
  onOpenSearch: (query: string) => void;
  onOpenMenu: () => void;
  onSignedOut: () => void;
}

function SongRail({
  title,
  songs,
  loading,
  error,
  empty,
  onPlay,
  onRetry,
}: {
  title: string;
  songs: CatalogSong[];
  loading: boolean;
  error: string | null;
  empty: string;
  onPlay: (song: CatalogSong) => void;
  onRetry: () => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {loading ? <ActivityIndicator color={darkPalette.accent} style={styles.loader} /> : null}
      {error ? (
        <Pressable onPress={onRetry} style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Tap to retry</Text>
        </Pressable>
      ) : null}
      {!loading && !error && songs.length === 0 ? <Text style={styles.errorText}>{empty}</Text> : null}
      {!loading && !error && songs.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {songs.map((song) => (
            <SongCard key={song.id} song={song} onPress={onPlay} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

export default function HomeScreen({ username, onOpenSearch, onOpenMenu, onSignedOut }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = usePalette();
  styles = useMemo(() => createHomeStyles(colors), [colors]);
  const { playSong } = usePlayback();
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState<CatalogSong[]>([]);
  const [recent, setRecent] = useState<CatalogSong[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadHomeCatalog({ signal: controller.signal })
      .then((catalog) => {
        if (controller.signal.aborted) {
          return;
        }
        setLibrary(catalog.library);
        setRecent(catalog.recentlyPlayed);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (caught instanceof ApiSecurityError && caught.requiresSignIn) {
          onSignedOut();
          return;
        }
        setLibrary([]);
        setRecent([]);
        setError(describeError(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => controller.abort();
  }, [onSignedOut, reload]);

  const retry = useCallback(() => {
    setReload((value) => value + 1);
  }, []);

  const playFrom = useCallback(
    (song: CatalogSong, queue: CatalogSong[]) => {
      playSong(song, queue);
    },
    [playSong],
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.accent}
          colors={[colors.accent]}
          onRefresh={() => {
            setRefreshing(true);
            retry();
          }}
        />
      }
    >
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${username} account`}
          onPress={onOpenMenu}
          hitSlop={8}
        >
          <Avatar name={username} size={36} />
        </Pressable>
        <Text style={styles.wordmark}>TrentPlayer</Text>
      </View>

      <SearchPill value={query} onChangeText={setQuery} onSubmit={() => onOpenSearch(query)} />

      <SongRail
        title="Recently Played"
        songs={recent}
        loading={loading}
        error={error}
        empty="Play a song from your folder and it will show up here."
        onPlay={(song) => playFrom(song, recent)}
        onRetry={retry}
      />
      <SongRail
        title="Your Music"
        songs={library}
        loading={loading}
        error={error}
        empty="Add audio files to OneDrive\TrentPlayer-Music, then pull to refresh."
        onPlay={(song) => playFrom(song, library)}
        onRetry={retry}
      />
    </ScrollView>
  );
}

let styles = createHomeStyles(darkPalette);

function createHomeStyles(palette: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  wordmark: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
  },
  rail: {
    paddingRight: 8,
  },
  loader: {
    marginVertical: 24,
  },
  errorCard: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 16,
  },
  errorText: {
    color: palette.textMuted,
    fontSize: 13,
  },
  retry: {
    color: palette.accent,
    fontWeight: '700',
    marginTop: 8,
  },
});
}
