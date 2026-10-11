import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Palette } from '../theme/palette';
import { useThemedStyles } from '../theme/useThemedStyles';

const PERKS = [
  'Search and stream 30-second song previews',
  'Save songs and build playlists on this device',
  'Keep cloud favorites on your TrentPlayer account',
  'Download previews into Your Library for offline play',
];

export default function PremiumScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.kicker}>TrentPlayer</Text>
      <Text style={styles.title}>Your plan</Text>
      <Text style={styles.lead}>
        Home, Search, Your Library, and Create are included with the account on this device.
        Full-length tracks come later with a hosted backend and a signed app build.
      </Text>
      {PERKS.map((perk) => (
        <View key={perk} style={styles.perk}>
          <View style={styles.dot} />
          <Text style={styles.perkText}>{perk}</Text>
        </View>
      ))}
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
  kicker: {
    color: palette.accentBright,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 12,
  },
  lead: {
    color: palette.textMuted,
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 22,
  },
  perk: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.accentBright,
    marginTop: 5,
  },
  perkText: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    lineHeight: 22,
  },
});
}
