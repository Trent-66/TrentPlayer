import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlayback } from '../player/PlaybackProvider';
import { type Palette } from '../theme/palette';
import { useThemedStyles } from '../theme/useThemedStyles';
import { DownloadsPanel } from './LibraryScreen';

interface DownloadsScreenProps {
  visible: boolean;
}

export default function DownloadsScreen({ visible }: DownloadsScreenProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const { current, playSong } = usePlayback();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.title}>Downloads</Text>
      <View style={styles.body}>
        <DownloadsPanel activeId={current?.id ?? null} onPlay={playSong} visible={visible} refreshKey={0} />
      </View>
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  title: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  body: {
    flex: 1,
  },
});
}
