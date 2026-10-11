import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CatalogSong } from '../services/catalogService';
import { type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';
import { Cover } from './Cover';

interface SongRowProps {
  song: CatalogSong;
  active: boolean;
  onPress: (song: CatalogSong) => void;
  onMore: (song: CatalogSong) => void;
}

function SongRowComponent({ song, active, onPress, onMore }: SongRowProps) {
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${song.title} by ${song.artist}`}
      onPress={() => onPress(song)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Cover uri={song.artworkUrl} title={song.title} artist={song.artist} size={48} radius={4} />
      <View style={styles.copy}>
        <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More options for ${song.title}`}
        hitSlop={10}
        onPress={() => onMore(song)}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

export const SongRow = memo(SongRowComponent);

function createStyles(palette: Palette) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  titleActive: {
    color: palette.accentBright,
  },
  artist: {
    color: palette.artist,
    fontSize: 14,
    marginTop: 2,
  },
});
}
