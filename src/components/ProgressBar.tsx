import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { formatClock } from '../theme/formatTime';
import { radii, type Palette } from '../theme/palette';
import { useThemedStyles } from '../theme/useThemedStyles';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
}

export function ProgressBar({ currentTime, duration, onSeek }: ProgressBarProps) {
  const styles = useThemedStyles(createStyles);
  const [width, setWidth] = React.useState(1);
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.max(1, event.nativeEvent.layout.width));
  }, []);

  const handleSeek = useCallback(
    (event: GestureResponderEvent) => {
      if (duration <= 0) {
        return;
      }
      const x = event.nativeEvent.locationX;
      onSeek((x / width) * duration);
    },
    [duration, onSeek, width],
  );

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="adjustable"
        accessibilityLabel="Playback progress"
        onLayout={onLayout}
        onPress={handleSeek}
        style={styles.trackHit}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      </Pressable>
      <View style={styles.times}>
        <Text style={styles.time}>{formatClock(currentTime)}</Text>
        <Text style={styles.time}>{formatClock(duration)}</Text>
      </View>
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  wrap: {
    width: '100%',
  },
  trackHit: {
    paddingVertical: 12,
  },
  track: {
    height: 4,
    borderRadius: radii.circle,
    backgroundColor: palette.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: palette.accent,
    borderRadius: radii.circle,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: palette.textMuted,
    fontSize: 12,
  },
});
}
