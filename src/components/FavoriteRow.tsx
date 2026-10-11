import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CatalogSong } from '../services/catalogService';
import { radii, type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';
import { Cover } from './Cover';
import { DownloadButton } from './DownloadButton';

interface FavoriteRowProps {
  song: CatalogSong;
  active: boolean;
  playing: boolean;
  onPlay: (song: CatalogSong) => void;
}

function FavoriteRowComponent({ song, active, playing, onPlay }: FavoriteRowProps) {
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${song.title} by ${song.artist}`}
      onPress={() => onPlay(song)}
      style={({ pressed }) => [styles.row, active && styles.active, pressed && styles.pressed]}
    >
      <Cover uri={song.artworkUrl} title={song.title} artist={song.artist} size={48} radius={12} />
      <View style={styles.copy}>
        <Text style={[styles.title, active && styles.titleActive]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
      <DownloadButton song={song} size={20} />
      <View style={[styles.play, active && styles.playActive]}>
        <Ionicons name={playing && active ? 'pause' : 'play'} size={14} color={colors.onAccent} />
      </View>
    </Pressable>
  );
}

export const FavoriteRow = memo(FavoriteRowComponent);

function createStyles(palette: Palette) {
  return StyleSheet.create({
  row: {
    minHeight: 64,
    borderRadius: radii.card,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  active: {
    backgroundColor: palette.accentSoft,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  titleActive: {
    color: palette.accentBright,
  },
  artist: {
    color: palette.artist,
    fontSize: 13,
    marginTop: 3,
  },
  play: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playActive: {
    backgroundColor: palette.accentBright,
  },
  pressed: {
    opacity: 0.8,
  },
});
}
