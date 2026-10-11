import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { darkPalette, lightPalette, type Palette } from './palette';

export type ThemeMode = 'dark' | 'light';

const THEME_KEY = 'trentplayer.theme.v1';

interface ThemeContextValue {
  mode: ThemeMode;
  palette: Palette;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    void SecureStore.getItemAsync(THEME_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark') {
          setModeState(stored);
        }
      })
      .catch(() => {
        // Keep the dark theme if the saved choice cannot be read.
      });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void SecureStore.setItemAsync(THEME_KEY, next).catch(() => {
      // The choice still applies for this session.
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      palette: mode === 'light' ? lightPalette : darkPalette,
      setMode,
    }),
    [mode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider.');
  }
  return value;
}

export function usePalette(): Palette {
  return useTheme().palette;
}
