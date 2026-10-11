import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { radii, type Palette } from '../theme/palette';
import { useThemedStyles } from '../theme/useThemedStyles';

interface ProfileScreenProps {
  username: string;
  onClose: () => void;
  onLogOut: () => void;
}

/** The account name is an email when it contains @. The server stores no separate email. */
function accountEmail(username: string): string | null {
  const value = username.trim();
  return value.includes('@') ? value : null;
}

export default function ProfileScreen({ username, onClose, onLogOut }: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const email = accountEmail(username);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} hitSlop={8}>
        <Text style={styles.back}>Back</Text>
      </Pressable>
      <View style={styles.hero}>
        <Avatar name={username} size={88} />
        <Text style={styles.name}>{username}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{username}</Text>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{email ?? 'No email on this account'}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onLogOut} style={styles.logout}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
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
  back: {
    color: palette.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
  hero: {
    alignItems: 'center',
    marginTop: 28,
    gap: 14,
  },
  name: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  card: {
    marginTop: 28,
    backgroundColor: palette.surface,
    borderRadius: radii.card,
    padding: 18,
    gap: 4,
  },
  label: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
  },
  value: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  logout: {
    marginTop: 24,
    backgroundColor: palette.accent,
    borderRadius: radii.pill,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: palette.onAccent,
    fontSize: 16,
    fontWeight: '800',
  },
});
}
