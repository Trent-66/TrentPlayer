import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AccountMenu } from '../components/AccountMenu';
import { DownloadNoticeHost } from '../components/DownloadNotice';
import { BottomNav } from '../components/BottomNav';
import { MiniPlayer } from '../components/MiniPlayer';
import { CollectionProvider } from '../player/CollectionProvider';
import { PlaybackProvider } from '../player/PlaybackProvider';
import DownloadsScreen from '../screens/DownloadsScreen';
import FavouritesScreen from '../screens/FavouritesScreen';
import HomeScreen from '../screens/HomeScreen';
import LibraryScreen from '../screens/LibraryScreen';
import NowPlayingScreen from '../screens/NowPlayingScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SearchScreen from '../screens/SearchScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { signOut } from '../services/apiService';
import { usePalette, useTheme } from '../theme/ThemeProvider';
import type { TabKey } from './tabs';

interface PlayerShellProps {
  username: string;
  onSignedOut: () => void;
}

function Pane({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <View
      style={[styles.pane, !visible && styles.hidden]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </View>
  );
}

export default function PlayerShell({ username, onSignedOut }: PlayerShellProps) {
  const [tab, setTab] = useState<TabKey>('home');
  const [searchSeed, setSearchSeed] = useState('');
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const colors = usePalette();
  const { mode } = useTheme();
  const blocked = libraryOpen || profileOpen || settingsOpen;

  const openSearch = useCallback((query: string) => {
    setSearchSeed(query);
    setLibraryOpen(false);
    setProfileOpen(false);
    setTab('search');
  }, []);

  const logOut = useCallback(() => {
    setMenuOpen(false);
    setProfileOpen(false);
    void signOut().finally(() => onSignedOut());
  }, [onSignedOut]);

  const openMenu = useCallback(() => {
    setMenuOpen(true);
  }, []);

  return (
    <PlaybackProvider>
      <CollectionProvider>
        <View style={[styles.root, { backgroundColor: colors.bg }]}>
          <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
          <View style={styles.body}>
            <Pane visible={tab === 'home' && !blocked}>
              <HomeScreen
                username={username}
                onOpenSearch={openSearch}
                onOpenMenu={openMenu}
                onSignedOut={onSignedOut}
              />
            </Pane>
            <Pane visible={tab === 'search' && !blocked}>
              <SearchScreen username={username} seed={searchSeed} onViewProfile={() => setProfileOpen(true)} />
            </Pane>
            <Pane visible={tab === 'downloads' && !blocked}>
              <DownloadsScreen visible={tab === 'downloads' && !blocked} />
            </Pane>
            <Pane visible={tab === 'favourites' && !blocked}>
              <FavouritesScreen />
            </Pane>
            <Pane visible={libraryOpen && !profileOpen && !settingsOpen}>
              <LibraryScreen
                username={username}
                onSignedOut={onSignedOut}
                onClose={() => setLibraryOpen(false)}
                visible={libraryOpen}
              />
            </Pane>
            <Pane visible={profileOpen && !settingsOpen}>
              <ProfileScreen username={username} onClose={() => setProfileOpen(false)} onLogOut={logOut} />
            </Pane>
            <Pane visible={settingsOpen}>
              <SettingsScreen onClose={() => setSettingsOpen(false)} />
            </Pane>
          </View>
          {!nowPlayingOpen ? <MiniPlayer onOpen={() => setNowPlayingOpen(true)} /> : null}
          {!nowPlayingOpen ? (
            <BottomNav
              active={tab}
              onChange={(next) => {
                setLibraryOpen(false);
                setProfileOpen(false);
                setSettingsOpen(false);
                setTab(next);
              }}
            />
          ) : null}
          {nowPlayingOpen ? <NowPlayingScreen onClose={() => setNowPlayingOpen(false)} /> : null}
          <DownloadNoticeHost />
          <AccountMenu
            visible={menuOpen}
            username={username}
            onClose={() => setMenuOpen(false)}
            onLogOut={logOut}
            onLibrary={() => {
              setMenuOpen(false);
              setProfileOpen(false);
              setSettingsOpen(false);
              setLibraryOpen(true);
            }}
            onProfile={() => {
              setMenuOpen(false);
              setLibraryOpen(false);
              setSettingsOpen(false);
              setProfileOpen(true);
            }}
            onSettings={() => {
              setMenuOpen(false);
              setLibraryOpen(false);
              setProfileOpen(false);
              setSettingsOpen(true);
            }}
          />
        </View>
      </CollectionProvider>
    </PlaybackProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    flex: 1,
  },
  pane: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  hidden: {
    display: 'none',
  },
});
