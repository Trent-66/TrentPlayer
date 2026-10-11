import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { palette } from '../theme/palette';

interface AvatarProps {
  name: string;
  /** Remote profile photo. When missing, the first letter of `name` is shown. */
  imageUri?: string | null;
  size?: number;
}

export function Avatar({ name, imageUri, size = 36 }: AvatarProps) {
  const letter = name.trim().charAt(0).toUpperCase() || '?';
  const radius = size / 2;

  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <View
      style={[styles.fallback, { width: size, height: size, borderRadius: radius }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.letter, { fontSize: Math.round(size * 0.42) }]}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: palette.onAccent,
    fontWeight: '800',
  },
});
