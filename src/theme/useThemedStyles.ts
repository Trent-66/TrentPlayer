import { useMemo } from 'react';

import type { Palette } from './palette';
import { usePalette } from './ThemeProvider';

/** Rebuild a stylesheet when the saved theme changes. StyleSheet.create freezes colors. */
export function useThemedStyles<T>(factory: (palette: Palette) => T): T {
  const colors = usePalette();
  return useMemo(() => factory(colors), [colors, factory]);
}
