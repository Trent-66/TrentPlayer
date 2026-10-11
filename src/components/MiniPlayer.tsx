import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePlayback } from '../player/PlaybackProvider';
import { palette, radii, shadows } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { Cover } from './Cover';

interface MiniPlayerProps {
  onOpen: () => void;
}

export function MiniPlayer({ onOpen }: MiniPlayerProps) {
  const { current, isPlaying, togglePlayback, skipNext } = usePlayback();
  const colors = usePalette();

  if (!current) {
    return null;
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]}>
      <View style={[styles.bar, { backgroundColor: colors.surface }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open now playing for ${current.title}`}
          onPress={onOpen}
          style={styles.main}
        >
          <Cover uri={current.artworkUrl} title={current.title} artist={current.artist} size={44} radius={12} />
          <View style={styles.copy}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {current.title}
            </Text>
            <Text style={[styles.artist, { color: colors.artist }]} numberOfLines={1}>
              {current.artist}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          onPress={togglePlayback}
          style={({ pressed }) => [styles.play, pressed && styles.pressed]}
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={colors.onAccent} style={!isPlaying && styles.nudge} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={skipNext} hitSlop={8}>
          <Ionicons name="play-skip-forward" size={20} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: palette.bg,
  },
  bar: {
    minHeight: 68,
    borderRadius: radii.card,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 10,
    paddingRight: 14,
    gap: 10,
    ...shadows.float,
  },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  copy: {
    flex: 1,
  },
  title: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  artist: {
    color: palette.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  play: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudge: {
    marginLeft: 2,
  },
  pressed: {
    opacity: 0.8,
  },
});
