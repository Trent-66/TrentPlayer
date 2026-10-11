import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AuthInput } from '../components/AuthInput';
import { ApiConfigurationError, getApiBaseUrl, login, register } from '../services/apiService';
import { radii, shadows, type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 8;

export interface AuthScreenProps {
  notice?: string;
  onAuthenticated: (username: string) => void;
}

type AuthMode = 'login' | 'register';

function describeError(error: unknown): string {
  if (error instanceof ApiConfigurationError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Failed to connect to the TrentPlayer server.';
}

function serverHost(): string | null {
  try {
    return new URL(getApiBaseUrl()).host;
  } catch {
    return null;
  }
}

export default function AuthScreen({ notice, onAuthenticated }: AuthScreenProps) {
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const glow = useRef(new Animated.Value(0.55)).current;
  const float = useRef(new Animated.Value(0)).current;
  const form = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.45, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    pulse.start();
    bob.start();
    Animated.timing(form, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    return () => {
      pulse.stop();
      bob.stop();
    };
  }, [float, form, glow]);

  const host = useMemo(() => serverHost(), []);
  const trimmedUsername = username.trim();

  const canSubmit =
    !busy &&
    trimmedUsername.length >= MIN_USERNAME_LENGTH &&
    password.length >= MIN_PASSWORD_LENGTH &&
    (mode === 'login' || password === confirmPassword);

  const switchMode = useCallback((next: AuthMode) => {
    setMode(next);
    setFormError(null);
    setFormNotice(null);
    setConfirmPassword('');
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    setBusy(true);
    setFormError(null);
    setFormNotice(null);
    try {
      if (mode === 'register') {
        await register(trimmedUsername, password);
        setFormNotice('Account created. Signing you in…');
      }
      const session = await login(trimmedUsername, password);
      setPassword('');
      setConfirmPassword('');
      onAuthenticated(session.username);
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setBusy(false);
    }
  }, [canSubmit, mode, onAuthenticated, password, trimmedUsername]);

  const banner = formNotice ?? notice;
  const headsetY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Animated.View style={[styles.glow, { opacity: glow, transform: [{ scale: glow.interpolate({ inputRange: [0.45, 1], outputRange: [0.92, 1.08] }) }] }]}>
            <LinearGradient colors={['#E63950', '#7B2CBF', '#121212']} style={styles.glowFill} />
          </Animated.View>
          <Animated.View style={[styles.headset, { transform: [{ translateY: headsetY }] }]}>
            <Ionicons name="headset" size={88} color={colors.text} />
          </Animated.View>
        </View>

        <Animated.View style={{ opacity: form, transform: [{ translateY: form.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
          <Text style={styles.brand}>TrentPlayer</Text>
          <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>

          {banner ? <Text style={styles.notice}>{banner}</Text> : null}

          <AuthInput
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            autoComplete="username"
            textContentType="username"
            editable={!busy}
            accessibilityLabel="Username"
          />
          <View style={styles.gap} />
          <AuthInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry={!showPassword}
            showSecretToggle
            secretVisible={showPassword}
            onToggleSecret={() => setShowPassword((value) => !value)}
            autoComplete={mode === 'login' ? 'password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            editable={!busy}
            accessibilityLabel="Password"
            onSubmitEditing={() => {
              if (mode === 'login') {
                void submit();
              }
            }}
          />
          {mode === 'register' ? (
            <>
              <View style={styles.gap} />
              <AuthInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!busy}
                accessibilityLabel="Confirm password"
                onSubmitEditing={() => void submit()}
              />
            </>
          ) : null}

          {formError ? <Text style={styles.error}>{formError}</Text> : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={mode === 'login' ? 'Log In' : 'Sign up'}
            disabled={!canSubmit}
            onPress={() => void submit()}
            style={({ pressed }) => [styles.primary, !canSubmit && styles.disabled, pressed && canSubmit && styles.pressed]}
          >
            {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>{mode === 'login' ? 'Log In' : 'Sign up'}</Text>}
          </Pressable>

          <Pressable accessibilityRole="button" onPress={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            <Text style={styles.switch}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <Text style={styles.switchAccent}>{mode === 'login' ? 'Sign up' : 'Log In'}</Text>
            </Text>
          </Pressable>
          <Text style={styles.server}>
            {host ? `Signing in through ${host}` : 'EXPO_PUBLIC_API_URL is missing. Add it to .env before signing in.'}
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  hero: {
    height: 210,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  glow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
  },
  glowFill: {
    flex: 1,
  },
  headset: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: 'rgba(18,18,18,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  title: {
    color: palette.textMuted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 22,
  },
  notice: {
    color: palette.accentBright,
    textAlign: 'center',
    marginBottom: 12,
  },
  gap: {
    height: 12,
  },
  error: {
    color: palette.danger,
    textAlign: 'center',
    marginTop: 12,
  },
  primary: {
    marginTop: 20,
    minHeight: 54,
    borderRadius: radii.pill,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  primaryText: {
    color: palette.onAccent,
    fontSize: 16,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
  switch: {
    color: palette.textMuted,
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
  },
  switchAccent: {
    color: palette.accentBright,
    fontWeight: '700',
  },
  server: {
    color: palette.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
  },
});
}
