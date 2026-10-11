import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { radii, type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

interface AuthInputProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  showSecretToggle?: boolean;
  secretVisible?: boolean;
  onToggleSecret?: () => void;
  autoComplete?: 'username' | 'password' | 'new-password';
  textContentType?: 'username' | 'password' | 'newPassword';
  editable?: boolean;
  accessibilityLabel: string;
  onSubmitEditing?: () => void;
}

export function AuthInput({
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  showSecretToggle = false,
  secretVisible = false,
  onToggleSecret,
  autoComplete,
  textContentType,
  editable = true,
  accessibilityLabel,
  onSubmitEditing,
}: AuthInputProps) {
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={textContentType}
        editable={editable}
        accessibilityLabel={accessibilityLabel}
        onSubmitEditing={onSubmitEditing}
      />
      {showSecretToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secretVisible ? 'Hide password' : 'Show password'}
          hitSlop={8}
          onPress={onToggleSecret}
        >
          <Ionicons name={secretVisible ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  wrap: {
    minHeight: 54,
    borderRadius: radii.card,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.divider,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    paddingVertical: 14,
  },
});
}
