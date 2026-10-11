import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FavoriteRow } from '../components/FavoriteRow';
import { ProfileHeader } from '../components/ProfileHeader';
import { SearchPill } from '../components/SearchPill';
import { usePlayback } from '../player/PlaybackProvider';
import { searchSongs, type CatalogSong } from '../services/catalogService';
import { type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Search failed.';
}

interface SearchScreenProps {
  username: string;
  seed?: string;
  onViewProfile: () => void;
}

export default function SearchScreen({ username, seed = '', onViewProfile }: SearchScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);
  const { current, isPlaying, playSong } = usePlayback();
  const [query, setQuery] = useState(seed);
  const [results, setResults] = useState<CatalogSong[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (seed && seed !== query) {
      setQuery(seed);
    }
  }, [seed]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setErrorMessage(null);
      setBusy(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      setErrorMessage(null);
      searchSongs(term, { signal: controller.signal })
        .then((songs) => {
          if (!controller.signal.aborted) {
            setResults(songs);
          }
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) {
            return;
          }
          setResults([]);
          setErrorMessage(describeError(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setBusy(false);
          }
        });
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const trimmed = query.trim();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <ProfileHeader name={username} onPress={onViewProfile} />
      <Text style={styles.title}>Search</Text>
      <SearchPill value={query} onChangeText={setQuery} autoFocus={seed.length > 0} />
      {busy ? <ActivityIndicator style={styles.loader} color={colors.accent} /> : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      {!busy && !errorMessage && trimmed.length >= 2 && results.length === 0 ? (
        <Text style={styles.empty}>No songs matched “{trimmed}”.</Text>
      ) : null}
      {trimmed.length < 2 ? (
        <Text style={styles.empty}>Search the songs in your OneDrive music folder.</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <FavoriteRow
              song={item}
              active={current?.id === item.id}
              playing={isPlaying}
              onPlay={(song) => playSong(song, results)}
            />
          )}
        />
      )}
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingHorizontal: 20,
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 14,
  },
  loader: {
    marginTop: 20,
  },
  error: {
    color: palette.danger,
    textAlign: 'center',
    marginTop: 20,
  },
  empty: {
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 36,
    paddingHorizontal: 12,
  },
  list: {
    paddingTop: 16,
    paddingBottom: 24,
  },
});
}
