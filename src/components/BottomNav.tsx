import { Ionicons } from '@expo/vector-icons';
import React, { type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TabKey } from '../navigation/tabs';
import { usePalette } from '../theme/ThemeProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: ReadonlyArray<{ key: TabKey; label: string; active: IconName; idle: IconName }> = [
  { key: 'home', label: 'Home', active: 'home', idle: 'home-outline' },
  { key: 'search', label: 'Search', active: 'search', idle: 'search-outline' },
  { key: 'downloads', label: 'Downloads', active: 'download', idle: 'download-outline' },
  { key: 'favourites', label: 'Favourites', active: 'heart', idle: 'heart-outline' },
];

interface BottomNavProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const colors = usePalette();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.tabBar, borderTopColor: colors.divider }]}>
      {TABS.map((tab) => {
        const selected = tab.key === active;
        const color = selected ? colors.accent : colors.textMuted;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <Ionicons name={selected ? tab.active : tab.idle} size={24} color={color} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});
