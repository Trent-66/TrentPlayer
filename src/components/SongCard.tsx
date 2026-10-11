import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CatalogSong } from '../services/catalogService';
import { radii, shadows, type Palette } from '../theme/palette';
import { useThemedStyles } from '../theme/useThemedStyles';
import { Cover } from './Cover';
import { DownloadButton } from './DownloadButton';

interface SongCardProps {
  song: CatalogSong;
  onPress: (song: CatalogSong) => void;
}

function SongCardComponent({ song, onPress }: SongCardProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${song.title} by ${song.artist}`}
      onPress={() => onPress(song)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.artWrap}>
        <Cover uri={song.artworkUrl} title={song.title} artist={song.artist} size={118} radius={radii.art} />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {song.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {song.artist}
      </Text>
      <DownloadButton song={song} size={18} />
    </Pressable>
  );
}

export const SongCard = memo(SongCardComponent);

function createStyles(palette: Palette) {
  return StyleSheet.create({
  card: {
    width: 118,
    marginRight: 14,
  },
  artWrap: {
    ...shadows.card,
    borderRadius: radii.art,
    marginBottom: 8,
  },
  title: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  artist: {
    color: palette.artist,
    fontSize: 12,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.75,
  },
});
}
