import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FavoriteRow } from '../components/FavoriteRow';
import { SearchPill } from '../components/SearchPill';
import { useCollection } from '../player/CollectionProvider';
import { usePlayback } from '../player/PlaybackProvider';
import { radii, shadows, type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

export default function FavouritesScreen() {
  const insets = useSafeAreaInsets();
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);
  const { saved } = useCollection();
  const { current, isPlaying, playSong, toggleQueue, setShuffle } = usePlayback();
  const [query, setQuery] = useState('');

  const filtered = saved.filter((song) => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return true;
    }
    return song.title.toLowerCase().includes(term) || song.artist.toLowerCase().includes(term);
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <View style={styles.search}>
          <SearchPill value={query} onChangeText={setQuery} placeholder="Search liked songs" />
        </View>
        <Ionicons name="heart" size={22} color={colors.accent} />
      </View>
      <Text style={styles.title}>Favourites</Text>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>Heart a song to save it to your TrentPlayer account.</Text>
        }
        renderItem={({ item }) => (
          <FavoriteRow
            song={item}
            active={current?.id === item.id}
            playing={isPlaying}
            onPlay={(song) => playSong(song, filtered)}
          />
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Shuffle favourites"
        disabled={filtered.length === 0}
        onPress={() => {
          setShuffle(true);
          toggleQueue(filtered);
        }}
        style={({ pressed }) => [styles.shuffle, filtered.length === 0 && styles.disabled, pressed && styles.pressed]}
      >
        <Text style={styles.shuffleText}>SHUFFLE</Text>
      </Pressable>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  search: {
    flex: 1,
  },
  title: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 12,
  },
  list: {
    paddingBottom: 12,
    flexGrow: 1,
  },
  empty: {
    color: palette.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 48,
  },
  shuffle: {
    marginBottom: 12,
    minHeight: 54,
    borderRadius: radii.pill,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  shuffleText: {
    color: palette.onAccent,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.8,
  },
});
}
