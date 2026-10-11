import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, shadows, type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

export type DownloadNoticeState =
  | { tone: 'saved'; title: string; artist: string }
  | { tone: 'error'; title: string; detail: string }
  | { tone: 'favourite'; title: string; artist: string };

type Listener = (notice: DownloadNoticeState | null) => void;

const listeners = new Set<Listener>();

/** One notice for every download, no matter which screen started it. */
export function showDownloadNotice(notice: DownloadNoticeState): void {
  listeners.forEach((listener) => listener(notice));
}

export function dismissDownloadNotice(): void {
  listeners.forEach((listener) => listener(null));
}

export function showFavoriteNotice(song: { title: string; artist: string }): void {
  showDownloadNotice({ tone: 'favourite', title: song.title, artist: song.artist });
}

function displayTitle(title: string): string {
  const cleaned = title.replace(/_/g, ' ').replace(/\s*\(\d+\)\s*$/, '').trim();
  return cleaned.length > 0 ? cleaned : title;
}

export function DownloadNoticeHost() {
  const insets = useSafeAreaInsets();
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);
  const [notice, setNotice] = useState<DownloadNoticeState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    listeners.add(setNotice);
    return () => {
      listeners.delete(setNotice);
    };
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }
    opacity.setValue(0);
    translateY.setValue(-16);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
    const timer = setTimeout(dismissDownloadNotice, 3200);
    return () => clearTimeout(timer);
  }, [notice, opacity, translateY]);

  if (!notice) {
    return null;
  }

  const saved = notice.tone === 'saved';
  const favourite = notice.tone === 'favourite';
  const title = displayTitle(notice.title);
  const detail =
    notice.tone === 'error'
      ? notice.detail
      : notice.artist
        ? `${title} · ${notice.artist}`
        : title;
  const heading = favourite ? 'Added to Favourites' : saved ? 'Downloaded' : 'Download failed';
  const icon = favourite ? 'heart' : saved ? 'checkmark' : 'close';

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <Animated.View style={[styles.dock, { top: insets.top + 8, opacity, transform: [{ translateY }] }]}>
        <View style={styles.bar}>
          <View style={[styles.badge, saved || favourite ? styles.badgeSaved : styles.badgeError]}>
            <Ionicons name={icon} size={16} color={colors.onAccent} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.heading} numberOfLines={1}>
              {heading}
            </Text>
            <Text style={styles.detail} numberOfLines={1}>
              {detail}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={dismissDownloadNotice} hitSlop={10}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    elevation: 40,
  },
  dock: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radii.card,
    backgroundColor: palette.surfaceRaised,
    ...shadows.float,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSaved: {
    backgroundColor: palette.accent,
  },
  badgeError: {
    backgroundColor: '#3A3A3A',
  },
  copy: {
    flex: 1,
  },
  heading: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '800',
  },
  detail: {
    color: palette.artist,
    fontSize: 13,
    marginTop: 2,
  },
});
}
