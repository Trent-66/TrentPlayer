/**
 * Signed-out flow
 * ---------------
 * Welcome (headset + glow) → email/password, or sign up.
 * There is no separate landing screen in the project, so the animated
 * headset lives on the welcome screen and "Continue with email" opens the form.
 * Email is sent as the account name (`username`) the backend already stores.
 */

import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/TrentApi';
import { API_BASE_URL } from '../api/config';
import { useAuth } from '../auth/AuthContext';
import { palette } from '../theme';

type Screen = 'welcome' | 'email' | 'signup';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function messageFor(error: unknown): string {
  const raw =
    error instanceof ApiError || error instanceof Error
      ? error.message
      : 'Something went wrong.';
  if (/already taken/i.test(raw)) {
    return 'An account with this email already exists.';
  }
  if (/invalid username or password/i.test(raw)) {
    return 'That email or password is incorrect.';
  }
  return raw;
}

export function AuthFlow() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const opacity = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const animating = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const navigate = useCallback(
    (next: Screen, direction: 1 | -1) => {
      if (animating.current || next === screen) return;
      animating.current = true;
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: -32 * direction,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!mounted.current) return;
        setScreen(next);
        translateX.setValue(32 * direction);
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(translateX, {
            toValue: 0,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          animating.current = false;
        });
      });
    },
    [opacity, screen, translateX],
  );

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <Animated.View style={[styles.flex, { opacity, transform: [{ translateX }] }]}>
        {screen === 'welcome' && (
          <WelcomeScreen
            onEmail={() => navigate('email', 1)}
            onSignup={() => navigate('signup', 1)}
          />
        )}
        {screen === 'email' && <EmailLoginScreen onBack={() => navigate('welcome', -1)} />}
        {screen === 'signup' && <SignUpScreen onBack={() => navigate('welcome', -1)} />}
      </Animated.View>
    </SafeAreaView>
  );
}

function WelcomeScreen({ onEmail, onSignup }: { onEmail: () => void; onSignup: () => void }) {
  return (
    <View style={styles.screen}>
      <TopBar />
      <View style={styles.heroBlock}>
        <HeadsetHero />
        <Text style={styles.heading}>Log in to TrentPlayer</Text>
      </View>
      <View style={styles.bottomBlock}>
        <PrimaryButton label="Continue with email" icon={<MailIcon />} onPress={onEmail} />
        <Text style={styles.prompt}>Don't have an account?</Text>
        <Pressable onPress={onSignup} hitSlop={10} accessibilityRole="button">
          <Text style={styles.promptAction}>Sign up</Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmailLoginScreen({ onBack }: { onBack: () => void }) {
  const { login } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(trimmed, password);
      setPassword('');
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }, [email, login, password]);

  return (
    <FormScaffold
      title="Log in"
      onBack={onBack}
      busy={busy}
      error={error}
      submitLabel="Log In"
      onSubmit={submit}
    >
      <Field
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!busy}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        inputRef={passwordRef}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        editable={!busy}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Pressable
        onPress={() =>
          Alert.alert(
            'Forgot password?',
            'Password reset by email is not available yet. Sign in with the email and password for your TrentPlayer account.',
          )
        }
        hitSlop={8}
        style={styles.forgotHit}
        accessibilityRole="button"
      >
        <Text style={styles.forgot}>Forgot password?</Text>
      </Pressable>
    </FormScaffold>
  );
}

function SignUpScreen({ onBack }: { onBack: () => void }) {
  const { signup } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signup(trimmed, password);
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  }, [confirm, email, password, signup]);

  return (
    <FormScaffold
      title="Sign up"
      onBack={onBack}
      busy={busy}
      error={error}
      submitLabel="Sign up"
      onSubmit={submit}
    >
      <Field
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!busy}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        inputRef={passwordRef}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!busy}
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <Field
        inputRef={confirmRef}
        placeholder="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!busy}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
    </FormScaffold>
  );
}

function FormScaffold({
  title,
  onBack,
  busy,
  error,
  submitLabel,
  onSubmit,
  children,
}: {
  title: string;
  onBack: () => void;
  busy: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.formScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TopBar onBack={onBack} />
        <Text style={styles.formHeading}>{title}</Text>
        <View style={styles.fields}>{children}</View>
        {error && <Text style={styles.formError}>{error}</Text>}
        <PrimaryButton label={submitLabel} busy={busy} onPress={onSubmit} />
        <Text style={styles.serverHint}>Server: {API_BASE_URL}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  inputRef,
  ...props
}: React.ComponentProps<typeof TextInput> & { inputRef?: React.Ref<TextInput> }) {
  return (
    <TextInput
      ref={inputRef}
      style={styles.input}
      placeholderTextColor={palette.textMuted}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
    />
  );
}

function TopBar({ onBack }: { onBack?: () => void }) {
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          hitSlop={16}
          style={styles.backHit}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
      ) : (
        <View style={styles.backHit} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.backChevron}>‹</Text>
        </View>
      )}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  icon,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={({ pressed }) => [styles.primary, (pressed || busy) && styles.primaryPressed]}
    >
      {busy ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <View style={styles.primaryInner}>
          {icon ? <View style={styles.primaryIcon}>{icon}</View> : null}
          <Text style={styles.primaryText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

function MailIcon() {
  return (
    <View style={styles.mail}>
      <View style={styles.mailBody} />
      <View style={styles.mailFlap} />
    </View>
  );
}

function HeadsetHero() {
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [glow]);

  const ringScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.28] });
  const ringOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const coreOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.62] });

  return (
    <View style={styles.hero} accessibilityRole="image" accessibilityLabel="TrentPlayer headphones">
      <Animated.View style={[styles.glowRing, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
      <Animated.View style={[styles.glowCore, { opacity: coreOpacity }]} />
      <View style={styles.headset}>
        <View style={styles.headband} />
        <View style={[styles.earcup, styles.earcupLeft]} />
        <View style={[styles.earcup, styles.earcupRight]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  flex: { flex: 1 },
  screen: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 28,
  },
  topBar: {
    height: 52,
    justifyContent: 'center',
  },
  backHit: {
    width: 44,
    height: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backChevron: {
    color: palette.text,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '300',
    marginTop: -4,
  },
  heroBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  bottomBlock: {
    gap: 14,
    alignItems: 'center',
    paddingBottom: 12,
  },
  prompt: {
    color: palette.textMuted,
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
  promptAction: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  formScroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  formHeading: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 28,
    letterSpacing: -0.4,
  },
  fields: { gap: 12 },
  input: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: palette.text,
    fontSize: 16,
  },
  forgotHit: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 8 },
  forgot: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  formError: {
    color: palette.danger,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  primary: {
    backgroundColor: palette.favorite,
    borderRadius: 999,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: 20,
  },
  primaryPressed: { opacity: 0.75 },
  primaryInner: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryIcon: {
    position: 'absolute',
    left: 4,
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  serverHint: {
    color: palette.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 18,
  },
  mail: {
    width: 18,
    height: 14,
    alignItems: 'center',
  },
  mailBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    borderRadius: 2,
  },
  mailFlap: {
    position: 'absolute',
    top: 1,
    width: 12,
    height: 12,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '-45deg' }],
  },
  hero: {
    width: 230,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: palette.favorite,
  },
  glowCore: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: palette.favorite,
  },
  headset: {
    width: 124,
    height: 112,
    alignItems: 'center',
  },
  headband: {
    width: 96,
    height: 62,
    marginTop: 6,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    borderWidth: 9,
    borderBottomWidth: 0,
    borderColor: '#F4F4F8',
  },
  earcup: {
    position: 'absolute',
    top: 50,
    width: 30,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#F4F4F8',
  },
  earcupLeft: { left: 6 },
  earcupRight: { right: 6 },
});
