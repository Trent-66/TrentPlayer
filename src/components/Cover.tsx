import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { lookupArtwork } from '../services/artworkService';
import { type Palette } from '../theme/palette';
import { useThemedStyles } from '../theme/useThemedStyles';
import { trackInitials, trackLogoColors } from '../theme/trackLogo';

interface CoverProps {
  uri?: string;
  title?: string;
  artist?: string;
  size: number;
  radius: number;
  style?: StyleProp<ViewStyle>;
}

export function Cover({ uri = '', title = '', artist = '', size, radius, style }: CoverProps) {
  const styles = useThemedStyles(createStyles);
  const [remoteUri, setRemoteUri] = useState(uri);
  const [failed, setFailed] = useState(false);
  const initials = trackInitials(title || artist || '?');
  const logoColors = useMemo(() => trackLogoColors(title, artist), [artist, title]);
  const fontSize = Math.max(12, Math.round(size * 0.34));
  const shownUri = failed ? '' : remoteUri || uri;

  useEffect(() => {
    setRemoteUri(uri);
    setFailed(false);
  }, [artist, title, uri]);

  useEffect(() => {
    if (uri || title.trim().length === 0) {
      return;
    }
    let cancelled = false;
    void lookupArtwork(title, artist)
      .then((found) => {
        if (!cancelled && found) {
          setRemoteUri(found);
          setFailed(false);
        }
      })
      .catch(() => {
        // Generated initials logo stays visible.
      });
    return () => {
      cancelled = true;
    };
  }, [artist, title, uri]);

  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: radius }, style]}>
      <LinearGradient colors={logoColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.image}>
        <Text style={[styles.initials, { fontSize }]} numberOfLines={1}>
          {initials}
        </Text>
      </LinearGradient>
      {shownUri ? (
        <Image
          source={{ uri: shownUri }}
          style={styles.photo}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: palette.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    ...StyleSheet.absoluteFill,
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
}
