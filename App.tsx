import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import PlayerShell from './src/navigation/PlayerShell';
import AuthScreen from './src/screens/AuthScreen';
import { isAccessTokenStale, loadSession } from './src/security/AuthSession';
import { ApiSecurityError, refreshSession } from './src/services/apiService';
import { ThemeProvider, usePalette, useTheme } from './src/theme/ThemeProvider';

type AuthState =
  | { status: 'unknown' }
  | { status: 'signedOut'; notice?: string }
  | { status: 'signedIn'; username: string };

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SessionGate />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function SessionGate() {
  const colors = usePalette();
  const { mode } = useTheme();
  const [auth, setAuth] = useState<AuthState>({ status: 'unknown' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await loadSession();
        if (!session) {
          if (!cancelled) {
            setAuth({ status: 'signedOut' });
          }
          return;
        }
        if (isAccessTokenStale(session.accessToken)) {
          try {
            const refreshed = await refreshSession();
            if (!cancelled) {
              setAuth({ status: 'signedIn', username: refreshed.username });
            }
            return;
          } catch (error) {
            if (!cancelled) {
              setAuth({
                status: 'signedOut',
                notice:
                  error instanceof ApiSecurityError
                    ? error.message
                    : 'Your saved session expired. Please sign in.',
              });
            }
            return;
          }
        }
        if (!cancelled) {
          setAuth({ status: 'signedIn', username: session.username });
        }
      } catch {
        if (!cancelled) {
          setAuth({
            status: 'signedOut',
            notice: 'Could not read the saved session. Please sign in.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuthenticated = useCallback((username: string) => {
    setAuth({ status: 'signedIn', username });
  }, []);

  const handleSignedOut = useCallback(() => {
    setAuth({ status: 'signedOut' });
  }, []);

  if (auth.status === 'signedIn') {
    return <PlayerShell username={auth.username} onSignedOut={handleSignedOut} />;
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'left', 'right']}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {auth.status === 'unknown' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <AuthScreen notice={auth.notice} onAuthenticated={handleAuthenticated} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
