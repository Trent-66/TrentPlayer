import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { palette, radii, shadows } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';

interface SearchPillProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchPill({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Search Online...',
  autoFocus = false,
}: SearchPillProps) {
  const colors = usePalette();
  return (
    <View style={styles.row}>
      <View style={[styles.field, { backgroundColor: colors.surface }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="search"
          accessibilityLabel="Search songs"
          onSubmitEditing={onSubmit}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search"
        onPress={onSubmit}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Ionicons name="search" size={18} color={palette.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  field: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    ...shadows.card,
  },
  input: {
    flex: 1,
    color: palette.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
