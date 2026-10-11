import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette as darkPalette, type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { Avatar } from './Avatar';

interface AccountMenuProps {
  visible: boolean;
  username: string;
  onClose: () => void;
  onLogOut: () => void;
  onLibrary: () => void;
  onProfile: () => void;
  onSettings: () => void;
}

export function AccountMenu({ visible, username, onClose, onLogOut, onLibrary, onProfile, onSettings }: AccountMenuProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(Math.round(width * 0.86), 360);
  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(visible);
  const renderedRef = useRef(visible);
  const colors = usePalette();
  const drawerStyles = useMemo(() => createStyles(colors), [colors]);
  styles = drawerStyles;

  useEffect(() => {
    if (visible) {
      translateX.setValue(-drawerWidth);
      scrim.setValue(0);
      renderedRef.current = true;
      setRendered(true);
      Animated.parallel([
        Animated.timing(translateX, { toValue: 0, duration: 260, useNativeDriver: true }),
        Animated.timing(scrim, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
      return;
    }
    if (!renderedRef.current) {
      return;
    }
    Animated.parallel([
      Animated.timing(translateX, { toValue: -drawerWidth, duration: 220, useNativeDriver: true }),
      Animated.timing(scrim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) {
        renderedRef.current = false;
        setRendered(false);
      }
    });
  }, [drawerWidth, scrim, translateX, visible]);

  return (
    <Modal visible={rendered} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.scrim, { opacity: scrim }]}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.drawer,
            {
              width: drawerWidth,
              paddingTop: insets.top + 20,
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateX }],
            },
          ]}
        >
          <Pressable accessibilityRole="button" accessibilityLabel="View profile" onPress={onProfile} style={styles.profile}>
            <Avatar name={username} size={52} />
            <View style={styles.profileCopy}>
              <Text style={styles.name} numberOfLines={1}>
                {username}
              </Text>
              <Text style={styles.viewProfile}>View profile</Text>
            </View>
          </Pressable>
          <View style={styles.divider} />
          <DrawerRow icon="library-outline" label="Your Library" onPress={onLibrary} />
          <DrawerRow icon="settings-outline" label="Settings" onPress={onSettings} />
          <View style={styles.spacer} />
          <DrawerRow icon="log-out-outline" label="Log out" onPress={onLogOut} />
        </Animated.View>
      </View>
    </Modal>
  );
}

function DrawerRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const colors = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.row}>
      <Ionicons name={icon} size={24} color={colors.text} />
      <Text style={styles.rowLabel}>{label}</Text>
    </Pressable>
  );
}

let styles = createStyles(darkPalette);

function createStyles(palette: Palette) {
  return StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: palette.bg,
    paddingHorizontal: 20,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  profileCopy: {
    flex: 1,
  },
  name: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
  },
  viewProfile: {
    color: palette.textMuted,
    fontSize: 14,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.divider,
    marginTop: 22,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 52,
  },
  rowLabel: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  spacer: {
    flex: 1,
  },
});
}
