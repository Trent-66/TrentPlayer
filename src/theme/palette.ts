export type Palette = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  divider: string;
  track: string;
  text: string;
  textMuted: string;
  /** Artist line. Black in light mode so it stays readable on white. */
  artist: string;
  /** Label color for text that sits on the red accent. */
  onAccent: string;
  accent: string;
  accentBright: string;
  accentSoft: string;
  danger: string;
  header: string;
  nowPlaying: string;
  tabBar: string;
  black: string;
  glow: string;
};

/** Dark player surfaces with a red-pink accent, matching the reference UI. */
export const darkPalette: Palette = {
  bg: '#121212',
  surface: '#1E1E1E',
  surfaceRaised: '#242424',
  divider: '#2A2A2A',
  track: '#3A3A3A',
  text: '#FFFFFF',
  textMuted: '#9A9A9A',
  artist: '#9A9A9A',
  onAccent: '#FFFFFF',
  accent: '#E63950',
  accentBright: '#FF4D67',
  accentSoft: 'rgba(230, 57, 80, 0.16)',
  danger: '#E63950',
  header: '#1E1E1E',
  nowPlaying: '#1E1E1E',
  tabBar: '#121212',
  black: '#000000',
  glow: '#7B2CBF',
};

export const lightPalette: Palette = {
  bg: '#F4F4F5',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  divider: '#E4E4E7',
  track: '#C4C4CC',
  text: '#121212',
  textMuted: '#5E5E66',
  artist: '#000000',
  onAccent: '#FFFFFF',
  accent: '#E63950',
  accentBright: '#FF4D67',
  accentSoft: 'rgba(230, 57, 80, 0.12)',
  danger: '#E63950',
  header: '#FFFFFF',
  nowPlaying: '#FFFFFF',
  tabBar: '#FFFFFF',
  black: '#000000',
  glow: '#7B2CBF',
};

/** Dark colors, for modules that have not subscribed to the theme yet. */
export const palette = darkPalette;

export const radii = {
  card: 18,
  art: 18,
  pill: 24,
  button: 22,
  circle: 999,
} as const;

export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  float: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
  },
} as const;
