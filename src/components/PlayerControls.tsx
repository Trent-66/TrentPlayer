import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { shadows, type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

interface PlayerControlsProps {
  isPlaying: boolean;
  onPrevious: () => void;
  onToggle: () => void;
  onNext: () => void;
}

export function PlayerControls({ isPlaying, onPrevious, onToggle, onNext }: PlayerControlsProps) {
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous" onPress={onPrevious} hitSlop={12}>
        <Ionicons name="play-skip-back" size={28} color={colors.text} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        onPress={onToggle}
        style={({ pressed }) => [styles.play, pressed && styles.pressed]}
      >
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color={colors.onAccent} style={!isPlaying && styles.nudge} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next" onPress={onNext} hitSlop={12}>
        <Ionicons name="play-skip-forward" size={28} color={colors.text} />
      </Pressable>
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },
  play: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.float,
  },
  nudge: {
    marginLeft: 3,
  },
  pressed: {
    opacity: 0.8,
  },
});
}
