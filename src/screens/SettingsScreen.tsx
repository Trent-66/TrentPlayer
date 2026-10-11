import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePalette, useTheme } from '../theme/ThemeProvider';
import { radii, type Palette } from '../theme/palette';

interface SettingsScreenProps {
  onClose: () => void;
}

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function SettingsScreen({ onClose }: SettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = usePalette();
  const { mode, setMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} hitSlop={8}>
        <Text style={styles.back}>Back</Text>
      </Pressable>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.section}>Theme</Text>
      <View style={styles.card}>
        <ThemeChoice label="Dark" selected={mode === 'dark'} onPress={() => setMode('dark')} styles={styles} />
        <View style={styles.rule} />
        <ThemeChoice label="Light" selected={mode === 'light'} onPress={() => setMode('light')} styles={styles} />
      </View>

      <Text style={styles.section}>About</Text>
      <View style={styles.card}>
        <Text style={styles.appName}>TrentPlayer</Text>
        <Text style={styles.version}>Version {APP_VERSION}</Text>
      </View>
    </View>
  );
}

function ThemeChoice({
  label,
  selected,
  onPress,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const colors = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.choice}
    >
      <Text style={styles.choiceLabel}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.bg,
      paddingHorizontal: 20,
    },
    back: {
      color: palette.textMuted,
      fontSize: 15,
      fontWeight: '700',
    },
    title: {
      color: palette.text,
      fontSize: 32,
      fontWeight: '800',
      marginTop: 18,
    },
    section: {
      color: palette.textMuted,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.4,
      marginTop: 28,
      marginBottom: 10,
    },
    card: {
      backgroundColor: palette.surface,
      borderRadius: radii.card,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    choice: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    choiceLabel: {
      color: palette.text,
      fontSize: 16,
      fontWeight: '700',
    },
    rule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: palette.divider,
    },
    appName: {
      color: palette.text,
      fontSize: 16,
      fontWeight: '800',
      marginTop: 12,
    },
    version: {
      color: palette.textMuted,
      fontSize: 14,
      marginTop: 4,
      marginBottom: 12,
    },
  });
}
