import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type Palette } from '../theme/palette';
import { useThemedStyles } from '../theme/useThemedStyles';
import { Avatar } from './Avatar';

interface ProfileHeaderProps {
  name: string;
  imageUri?: string | null;
  onPress: () => void;
}

export function ProfileHeader({ name, imageUri, onPress }: ProfileHeaderProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, view profile`}
      onPress={onPress}
      style={styles.row}
    >
      <Avatar name={name} imageUri={imageUri} size={56} />
      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.link}>View profile</Text>
      </View>
    </Pressable>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  copy: {
    flex: 1,
  },
  name: {
    color: palette.text,
    fontSize: 26,
    fontWeight: '800',
  },
  link: {
    color: palette.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
});
}
