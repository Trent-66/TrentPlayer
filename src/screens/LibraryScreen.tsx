import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DownloadButton } from '../components/DownloadButton';
import { SongRow } from '../components/SongRow';
import {
  deleteTrack,
  getCategoryFolders,
  getTracksByCategory,
  type CategoryFolder,
  type Track,
  type TrackCategory,
} from '../database/LocalDatabase';
import { useCollection } from '../player/CollectionProvider';
import { usePlayback } from '../player/PlaybackProvider';
import { loadLibrarySongs, loadRecentSongs, type CatalogSong } from '../services/catalogService';
import { applyServerGenresToDownloads } from '../services/downloadService';
import { ApiSecurityError } from '../services/apiService';
import { palette, type Palette } from '../theme/palette';
import { useThemedStyles } from '../theme/useThemedStyles';
import { fileCacheManager } from '../utils/FileCacheManager';

type LibrarySection = 'Music' | 'Favourites' | 'Downloads' | 'Recent';

const SECTIONS: readonly LibrarySection[] = ['Music', 'Favourites', 'Downloads', 'Recent'];

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Failed to connect to the TrentPlayer server.';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

interface LibraryScreenProps {
  username: string;
  onSignedOut: () => void;
  onClose?: () => void;
  /** When the library is on screen. Used to refresh genre folders after a download. */
  visible?: boolean;
}

const GENRE_STYLE: Record<TrackCategory, { color: string }> = {
  Rap: { color: '#F97316' },
  'R&B': { color: '#EC4899' },
  Afrobeats: { color: '#22C55E' },
  Highlife: { color: '#EAB308' },
  Reggae: { color: '#10B981' },
  Amapiano: { color: '#06B6D4' },
  Sadcore: { color: '#6366F1' },
  Gospel: { color: '#F59E0B' },
  Phonk: { color: '#A855F7' },
  Uncategorized: { color: '#64748B' },
};

export default function LibraryScreen({ username, onSignedOut, onClose, visible = true }: LibraryScreenProps) {
  const styles = useThemedStyles(createLibraryStyles);
  const insets = useSafeAreaInsets();
  const [section, setSection] = useState<LibrarySection>('Downloads');
  const [downloadEpoch, setDownloadEpoch] = useState(0);
  const { saved, isSaved, toggleSaved } = useCollection();
  const { current, playSong } = usePlayback();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.titleRow}>
          <View style={styles.titleCopy}>
            {onClose ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} style={styles.back}>
                <Text style={styles.logout}>Back</Text>
              </Pressable>
            ) : null}
            <Text style={styles.title}>Your Library</Text>
            <Text style={styles.username} numberOfLines={1}>
              {username}
            </Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SECTIONS.map((item) => {
            const selected = item === section;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSection(item)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{item}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {section === 'Music' ? <MusicPanel onDownloaded={() => setDownloadEpoch((value) => value + 1)} /> : null}
      {section === 'Favourites' ? (
        <SavedPanel
          songs={saved}
          activeId={current?.id ?? null}
          onPlay={(song) => playSong(song, saved)}
          onMore={(song) =>
            Alert.alert(song.title, song.artist, [
              { text: 'Play', onPress: () => playSong(song, saved) },
              {
                text: isSaved(song.id) ? 'Remove from Favourites' : 'Add to Favourites',
                onPress: () => toggleSaved(song),
              },
              { text: 'Cancel', style: 'cancel' },
            ])
          }
        />
      ) : null}
      {section === 'Downloads' ? (
        <DownloadsPanel
          activeId={current?.id ?? null}
          onPlay={playSong}
          visible={visible}
          refreshKey={downloadEpoch}
        />
      ) : null}
      {section === 'Recent' ? <CloudPanel onSignedOut={onSignedOut} /> : null}
    </View>
  );
}

function MusicPanel({ onDownloaded }: { onDownloaded: () => void }) {
  const styles = useThemedStyles(createLibraryStyles);
  const { playSong } = usePlayback();
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setSongs(await loadLibrarySongs());
    } catch (error) {
      if (error instanceof ApiSecurityError && error.requiresSignIn) {
        setErrorMessage('Sign in again to load your music folder.');
      } else {
        setErrorMessage(describeError(error));
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.accentBright} />
      </View>
    );
  }

  if (errorMessage) {
    return <ErrorBlock title="Could not read your music folder" message={errorMessage} onRetry={() => void load()} />;
  }

  return (
    <FlatList
      data={songs}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <Text style={styles.empty}>
          No songs in OneDrive\TrentPlayer-Music yet. Add audio files there, then open this list again.
        </Text>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title} by ${item.artist}`}
          onPress={() => playSong(item, songs)}
          style={({ pressed }) => [styles.cloudRow, pressed && styles.pressed]}
        >
          <View style={styles.cloudCopy}>
            <Text style={styles.cloudTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.cloudArtist} numberOfLines={1}>
              {item.artist}
            </Text>
          </View>
          <DownloadButton song={item} onDownloaded={onDownloaded} />
        </Pressable>
      )}
    />
  );
}

function SavedPanel({
  songs,
  activeId,
  onPlay,
  onMore,
}: {
  songs: CatalogSong[];
  activeId: string | null;
  onPlay: (song: CatalogSong) => void;
  onMore: (song: CatalogSong) => void;
}) {
  const styles = useThemedStyles(createLibraryStyles);
  return (
    <FlatList
      data={songs}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>Heart a song to save it to your TrentPlayer account.</Text>}
      renderItem={({ item }) => (
        <SongRow song={item} active={item.id === activeId} onPress={onPlay} onMore={onMore} />
      )}
    />
  );
}

export function DownloadsPanel({
  activeId,
  onPlay,
  visible,
  refreshKey,
}: {
  activeId: string | null;
  onPlay: (song: CatalogSong, queue: CatalogSong[]) => void;
  visible: boolean;
  refreshKey: number;
}) {
  const styles = useThemedStyles(createLibraryStyles);
  const [folders, setFolders] = useState<CategoryFolder[]>([]);
  const [openCategory, setOpenCategory] = useState<TrackCategory | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [menuSong, setMenuSong] = useState<CatalogSong | null>(null);
  const [removing, setRemoving] = useState(false);

  const removeDownload = async (song: CatalogSong) => {
    if (removing) {
      return;
    }
    setRemoving(true);
    try {
      const localPath = await deleteTrack(song.id);
      if (localPath) {
        await fileCacheManager.deleteCachedFile(localPath).catch(() => {
          // The ledger row is already gone; a missing file should not block the list.
        });
      }
      setMenuSong(null);
      setNonce((value) => value + 1);
    } catch {
      setRemoving(false);
      return;
    }
    setRemoving(false);
  };

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);
    void (async () => {
      try {
        await applyServerGenresToDownloads();
      } catch {
        // Folders still open from the phone if the server tone list is unavailable.
      }
      if (cancelled) {
        return;
      }
      try {
        if (openCategory) {
          const rows = await getTracksByCategory(openCategory);
          if (!cancelled) {
            setTracks(rows);
          }
        } else {
          const rows = await getCategoryFolders();
          if (!cancelled) {
            setFolders(rows);
          }
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setErrorMessage(describeError(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, openCategory, nonce, refreshKey]);

  const songs = tracks.map(trackToSong);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.accentBright} />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <ErrorBlock
        title="Could not open the offline library"
        message={errorMessage}
        onRetry={() => setNonce((value) => value + 1)}
      />
    );
  }

  if (openCategory) {
    return (
      <>
        <FlatList
          key="download-tracks"
          data={songs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Pressable accessibilityRole="button" accessibilityLabel="Back to folders" onPress={() => setOpenCategory(null)} style={styles.folderBack}>
              <Text style={styles.preview}>Folders</Text>
              <Text style={styles.cloudTitle}>{openCategory}</Text>
            </Pressable>
          }
          ListEmptyComponent={<Text style={styles.empty}>Nothing in this folder yet.</Text>}
          renderItem={({ item }) => (
            <SongRow
              song={item}
              active={item.id === activeId}
              onPress={(song) => onPlay(song, songs)}
              onMore={setMenuSong}
            />
          )}
        />
        <Modal visible={menuSong != null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuSong(null)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => {
              if (!removing) {
                setMenuSong(null);
              }
            }}
            style={styles.menuBackdrop}
          >
            <Pressable accessibilityRole="none" onPress={() => undefined} style={styles.menuStack}>
              <View style={styles.menuCard}>
                <Text style={styles.menuTitle} numberOfLines={1}>
                  {menuSong?.title}
                </Text>
                {menuSong?.artist ? (
                  <Text style={styles.menuArtist} numberOfLines={1}>
                    {menuSong.artist}
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove from downloads"
                disabled={removing || menuSong == null}
                onPress={() => {
                  if (menuSong) {
                    void removeDownload(menuSong);
                  }
                }}
                style={({ pressed }) => [styles.menuRemove, pressed && styles.pressed]}
              >
                <Text style={styles.menuRemoveText}>{removing ? 'Removing…' : 'Remove from downloads'}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  return (
    <FlatList
      key="download-folders"
      data={folders}
      keyExtractor={(item) => item.category}
      numColumns={2}
      columnWrapperStyle={styles.folderRow}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <Text style={styles.empty}>
          No downloads yet. Tap the download icon on a song and it will appear here in its genre folder.
        </Text>
      }
      renderItem={({ item }) => {
        const style = GENRE_STYLE[item.category];
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.category}, ${item.trackCount} tracks`}
            onPress={() => setOpenCategory(item.category)}
            style={({ pressed }) => [styles.folderCard, pressed && styles.pressed]}
          >
            <Text style={styles.cloudTitle} numberOfLines={1}>
              {item.category}
            </Text>
            <Text style={[styles.preview, { color: style.color }]}>
              {item.trackCount} {item.trackCount === 1 ? 'track' : 'tracks'}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

function trackToSong(track: Track): CatalogSong {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.automatedCategory,
    artworkUrl: '',
    streamUrl: track.localPath,
    durationMs: 30_000,
  };
}

function CloudPanel({ onSignedOut }: { onSignedOut: () => void }) {
  const styles = useThemedStyles(createLibraryStyles);
  const [songs, setSongs] = useState<CatalogSong[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { playSong } = usePlayback();
  const requestSeq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);

  const loadRecent = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const requestId = ++requestSeq.current;
    const isCurrent = () => requestId === requestSeq.current;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const recent = await loadRecentSongs({ signal: controller.signal });
      if (isCurrent()) {
        setSongs(recent);
      }
    } catch (error) {
      if (isCurrent() && !isAbortError(error)) {
        if (error instanceof ApiSecurityError && error.requiresSignIn) {
          setSongs([]);
          onSignedOut();
        } else {
          setErrorMessage(describeError(error));
        }
      }
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
        inFlight.current = null;
      }
    }
  }, [onSignedOut]);

  useEffect(() => {
    void loadRecent();
    return () => {
      inFlight.current?.abort();
    };
  }, [loadRecent]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={palette.accentBright} />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <ErrorBlock title="Could not load recent plays" message={errorMessage} onRetry={() => void loadRecent()} />
    );
  }

  return (
    <FlatList
      data={songs}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<Text style={styles.empty}>Songs you play from your folder show up here.</Text>}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title} by ${item.artist}`}
          onPress={() => playSong(item, songs)}
          style={({ pressed }) => [styles.cloudRow, pressed && styles.pressed]}
        >
          <View style={styles.cloudCopy}>
            <Text style={styles.cloudTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.cloudArtist} numberOfLines={1}>
              {item.artist}
            </Text>
          </View>
        </Pressable>
      )}
    />
  );
}

function ErrorBlock({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  const styles = useThemedStyles(createLibraryStyles);
  return (
    <View style={styles.list}>
      <View style={styles.errorCard}>
        <Text style={styles.errorTitle}>{title}</Text>
        <Text style={styles.errorBody}>{message}</Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createLibraryStyles(palette: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  back: {
    marginBottom: 4,
  },
  titleCopy: {
    flex: 1,
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '800',
  },
  username: {
    color: palette.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  logout: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  chip: {
    backgroundColor: palette.surfaceRaised,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipSelected: {
    backgroundColor: palette.text,
  },
  chipText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: palette.bg,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  empty: {
    color: palette.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderRow: {
    gap: 12,
    marginBottom: 12,
  },
  folderCard: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  folderBack: {
    marginBottom: 12,
    gap: 4,
  },
  cloudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  cloudCopy: {
    flex: 1,
  },
  cloudTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cloudArtist: {
    color: palette.artist,
    fontSize: 14,
    marginTop: 2,
  },
  preview: {
    color: palette.accentBright,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
  errorCard: {
    backgroundColor: palette.surface,
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    marginTop: 28,
    borderWidth: 1,
    borderColor: palette.danger,
  },
  errorTitle: {
    color: palette.danger,
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
  },
  errorBody: {
    color: palette.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 15,
  },
  retry: {
    backgroundColor: palette.accent,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  retryText: {
    color: palette.onAccent,
    fontWeight: '700',
    fontSize: 12,
  },
  menuBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 48,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  menuStack: {
    gap: 8,
  },
  menuCard: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '800',
  },
  menuArtist: {
    color: palette.artist,
    fontSize: 13,
    marginTop: 2,
  },
  menuRemove: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  menuRemoveText: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: '800',
  },
});
}
