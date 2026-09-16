import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  type CategoryFolder,
  type Track,
  type TrackCategory,
  TRENT_GENRES,
  deleteTrack,
  getCategoryFolders,
  getFavoriteTracks,
  getTracksByCategory,
  initializeDatabase,
  saveDownloadedTrack,
  toggleFavorite,
} from './src/database/LocalDatabase';
import { fileCacheManager } from './src/utils/FileCacheManager';

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

const palette = {
  bg: '#0A0A0F',
  surface: '#14141C',
  surfaceRaised: '#1C1C27',
  border: '#262633',
  text: '#F4F4F8',
  textMuted: '#8B8B9E',
  accent: '#C7A2FF',
  accentStrong: '#8B5CF6',
  favorite: '#FF4D6D',
  danger: '#FF6B6B',
};

/** Per-genre accent + glyph for folder cards. */
const GENRE_STYLE: Record<TrackCategory, { color: string; glyph: string }> = {
  Rap: { color: '#F97316', glyph: '🎤' },
  'R&B': { color: '#EC4899', glyph: '🎷' },
  Afrobeats: { color: '#22C55E', glyph: '🥁' },
  Highlife: { color: '#EAB308', glyph: '🎺' },
  Reggae: { color: '#10B981', glyph: '🌿' },
  Amapiano: { color: '#06B6D4', glyph: '🎹' },
  Sadcore: { color: '#6366F1', glyph: '🌧️' },
  Gospel: { color: '#F59E0B', glyph: '🙏' },
  Phonk: { color: '#A855F7', glyph: '🏁' },
  Uncategorized: { color: '#64748B', glyph: '📁' },
};

// ---------------------------------------------------------------------------
// Mock catalogue used by "Trigger Download"
// ---------------------------------------------------------------------------

interface MockTrack {
  id: string;
  title: string;
  artist: string;
  /** Deliberately uses aliases so the genre mapper is exercised. */
  rawGenre: string;
}

const MOCK_CATALOGUE: ReadonlyArray<MockTrack> = [
  { id: 'mock-rap-01', title: 'Midnight Cipher', artist: 'Kwame Verse', rawGenre: 'Hip-Hop' },
  { id: 'mock-rnb-01', title: 'Velvet Hours', artist: 'Adjoa Bloom', rawGenre: 'RnB' },
  { id: 'mock-afro-01', title: 'Lagos Sunrise', artist: 'Tolu & The Wave', rawGenre: 'Afro-Pop' },
  { id: 'mock-high-01', title: 'Palm Wine Parade', artist: 'Osei Brass Band', rawGenre: 'Highlife' },
  { id: 'mock-reg-01', title: "Roots Don't Bend", artist: 'Ras Kojo', rawGenre: 'Dancehall' },
  { id: 'mock-ama-01', title: 'Log Drum Theory', artist: 'DJ Sizwe', rawGenre: 'Amapiano' },
  { id: 'mock-sad-01', title: 'Grey Weather Letters', artist: 'Ivory Static', rawGenre: 'Melancholic' },
  { id: 'mock-gos-01', title: 'Higher Than Hills', artist: 'Grace Assembly', rawGenre: 'Worship' },
  { id: 'mock-phonk-01', title: 'Cowbell Drift', artist: 'MEMPHIS//DRIFT', rawGenre: 'Drift Phonk' },
];

const MOCK_STREAM_ORIGIN = 'https://mock.trentplayer.local/stream/';

const CLOUD_STREAMS = [
  { title: 'Trending in Accra', subtitle: 'Live radio · 12.4k listening' },
  { title: 'Late Night Amapiano', subtitle: 'Curated mix · 2h 10m' },
  { title: 'Phonk Drift Radio', subtitle: 'Live radio · 8.1k listening' },
  { title: 'Gospel Sunday', subtitle: 'Curated mix · 1h 45m' },
];

/**
 * Simulates FileCacheManager.downloadTrack without a network round-trip:
 * writes a tiny placeholder into the real cache directory so the ledger
 * receives a genuine, validated `file://` path.
 */
async function mockDownload(track: MockTrack): Promise<string> {
  await fileCacheManager.ensureCacheDirectory();
  const { localPath } = fileCacheManager.buildLocalPath(
    track.id,
    track.title,
    new URL(`${MOCK_STREAM_ORIGIN}${track.id}.mp3`),
  );
  await FileSystem.writeAsStringAsync(localPath, 'TRENTPLAYER_MOCK_AUDIO', {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return localPath;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type BootState = { status: 'booting' } | { status: 'ready' } | { status: 'error'; message: string };
type LibraryTab = 'cloud' | 'downloads';
type FolderSelection = { kind: 'favorites' } | { kind: 'category'; category: TrackCategory } | null;

export default function App() {
  const [boot, setBoot] = useState<BootState>({ status: 'booting' });
  const [tab, setTab] = useState<LibraryTab>('downloads');
  const [folders, setFolders] = useState<CategoryFolder[]>([]);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selection, setSelection] = useState<FolderSelection>(null);
  const [folderTracks, setFolderTracks] = useState<Track[]>([]);
  const [downloadedCount, setDownloadedCount] = useState(0);

  const downloadedIds = useMemo(() => new Set<string>(), []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  }, []);

  // 1. Initialise the local SQLite schema on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initializeDatabase();
        if (!cancelled) {
          setBoot({ status: 'ready' });
        }
      } catch (error) {
        if (!cancelled) {
          setBoot({ status: 'error', message: describeError(error) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshFolders = useCallback(async () => {
    const [nextFolders, favorites] = await Promise.all([getCategoryFolders(), getFavoriteTracks()]);
    setFolders(nextFolders);
    setFavoriteCount(favorites.length);
  }, []);

  useEffect(() => {
    if (boot.status === 'ready') {
      refreshFolders().catch((error) => showToast(describeError(error)));
    }
  }, [boot.status, refreshFolders, showToast]);

  // 7. Simulated download — picks the next un-downloaded mock track.
  const handleTriggerDownload = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = MOCK_CATALOGUE.find((t) => !downloadedIds.has(t.id)) ?? MOCK_CATALOGUE[0]!;
      const localPath = await mockDownload(next);
      const saved = await saveDownloadedTrack({
        id: next.id,
        title: next.title,
        artist: next.artist,
        localPath,
        rawGenre: next.rawGenre,
      });
      downloadedIds.add(next.id);
      setDownloadedCount(downloadedIds.size);
      await refreshFolders();
      showToast(`Saved "${saved.title}" → ${saved.automatedCategory}`);
    } catch (error) {
      showToast(describeError(error));
    } finally {
      setBusy(false);
    }
  }, [busy, downloadedIds, refreshFolders, showToast]);

  const openFolder = useCallback(
    async (next: FolderSelection) => {
      if (!next) return;
      try {
        const tracks =
          next.kind === 'favorites'
            ? await getFavoriteTracks()
            : await getTracksByCategory(next.category);
        setFolderTracks(tracks);
        setSelection(next);
      } catch (error) {
        showToast(describeError(error));
      }
    },
    [showToast],
  );

  const handleToggleFavorite = useCallback(
    async (track: Track) => {
      try {
        await toggleFavorite(track.id);
        if (selection) {
          await openFolder(selection);
        }
        await refreshFolders();
      } catch (error) {
        showToast(describeError(error));
      }
    },
    [openFolder, refreshFolders, selection, showToast],
  );

  const handleDeleteTrack = useCallback(
    async (track: Track) => {
      try {
        const localPath = await deleteTrack(track.id);
        if (localPath) {
          await fileCacheManager.deleteCachedFile(localPath);
        }
        downloadedIds.delete(track.id);
        setDownloadedCount(downloadedIds.size);
        if (selection) {
          await openFolder(selection);
        }
        await refreshFolders();
        showToast(`Removed "${track.title}"`);
      } catch (error) {
        showToast(describeError(error));
      }
    },
    [downloadedIds, openFolder, refreshFolders, selection, showToast],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (boot.status === 'booting') {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <ActivityIndicator color={palette.accent} size="large" />
        <Text style={styles.bootText}>Opening local library…</Text>
      </SafeAreaView>
    );
  }

  if (boot.status === 'error') {
    return (
      <SafeAreaView style={styles.centered}>
        <StatusBar style="light" />
        <Text style={styles.errorTitle}>Local database unavailable</Text>
        <Text style={styles.errorBody}>{boot.message}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>TrentPlayer</Text>
          <Text style={styles.brandSub}>Offline library</Text>
        </View>
        <View style={styles.lockPill}>
          <Text style={styles.lockPillText}>🧪 Expo Go</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Library</Text>

        {/* 3. Segment control */}
        <View style={styles.segment}>
          <SegmentButton label="Cloud Streams" active={tab === 'cloud'} onPress={() => setTab('cloud')} />
          <SegmentButton label="Downloads" active={tab === 'downloads'} onPress={() => setTab('downloads')} />
        </View>

        {tab === 'cloud' ? (
          <View style={styles.cloudList}>
            {CLOUD_STREAMS.map((s) => (
              <View key={s.title} style={styles.cloudRow}>
                <View style={styles.cloudGlyph}>
                  <Text style={styles.cloudGlyphText}>☁️</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cloudTitle}>{s.title}</Text>
                  <Text style={styles.cloudSub}>{s.subtitle}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            ))}
          </View>
        ) : (
          <>
            {/* 4–6. Downloads grid — first card is the permanent Favorites row */}
            <View style={styles.grid}>
              <FolderCard
                glyph="❤️"
                title="Favorite Songs"
                count={favoriteCount}
                color={palette.favorite}
                onPress={() => openFolder({ kind: 'favorites' })}
                permanent
              />
              {folders.map((f) => (
                <FolderCard
                  key={f.category}
                  glyph={GENRE_STYLE[f.category].glyph}
                  title={f.category}
                  count={f.trackCount}
                  color={GENRE_STYLE[f.category].color}
                  onPress={() => openFolder({ kind: 'category', category: f.category })}
                />
              ))}
            </View>

            {folders.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No downloads yet</Text>
                <Text style={styles.emptyBody}>
                  Trigger a download to watch genre folders appear here. Target spectrum:{' '}
                  {TRENT_GENRES.join(' · ')}.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* 7. Simulated download trigger */}
      <View style={styles.footer}>
        <Pressable
          onPress={handleTriggerDownload}
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || busy) && styles.primaryButtonPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={palette.bg} />
          ) : (
            <Text style={styles.primaryButtonText}>⬇︎  Trigger Download</Text>
          )}
        </Pressable>
        <Text style={styles.footerHint}>
          {downloadedCount}/{MOCK_CATALOGUE.length} mock tracks cached this session
        </Text>
      </View>

      {toast && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <FolderModal
        selection={selection}
        tracks={folderTracks}
        onClose={() => setSelection(null)}
        onToggleFavorite={handleToggleFavorite}
        onDelete={handleDeleteTrack}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active && styles.segmentButtonActive]}>
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function FolderCard({
  glyph,
  title,
  count,
  color,
  onPress,
  permanent = false,
}: {
  glyph: string;
  title: string;
  count: number;
  color: string;
  onPress: () => void;
  permanent?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        permanent && styles.cardPermanent,
        { borderColor: pressed ? color : palette.border },
      ]}
    >
      <View style={[styles.cardGlyphWrap, { backgroundColor: `${color}22` }]}>
        <Text style={styles.cardGlyph}>{glyph}</Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[styles.cardCount, { color }]}>
        {count} {count === 1 ? 'track' : 'tracks'}
      </Text>
    </Pressable>
  );
}

function FolderModal({
  selection,
  tracks,
  onClose,
  onToggleFavorite,
  onDelete,
}: {
  selection: FolderSelection;
  tracks: Track[];
  onClose: () => void;
  onToggleFavorite: (track: Track) => void;
  onDelete: (track: Track) => void;
}) {
  const title =
    selection?.kind === 'favorites'
      ? '❤️ Favorite Songs'
      : selection?.kind === 'category'
        ? `${GENRE_STYLE[selection.category].glyph} ${selection.category}`
        : '';

  return (
    <Modal visible={selection !== null} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.modalClose}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={tracks}
            keyExtractor={(t) => t.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={<Text style={styles.emptyBody}>Nothing here yet.</Text>}
            renderItem={({ item }) => (
              <View style={styles.trackRow}>
                <View style={styles.flex}>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.trackSub} numberOfLines={1}>
                    {item.artist} · {item.automatedCategory}
                  </Text>
                </View>
                <Pressable onPress={() => onToggleFavorite(item)} hitSlop={10} style={styles.iconButton}>
                  <Text style={styles.iconText}>{item.isFavorite ? '❤️' : '🤍'}</Text>
                </Pressable>
                <Pressable onPress={() => onDelete(item)} hitSlop={10} style={styles.iconButton}>
                  <Text style={styles.iconText}>🗑</Text>
                </Pressable>
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.bg,
    paddingTop: Platform.OS === 'android' ? 32 : 0,
  },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  bootText: { color: palette.textMuted, fontSize: 14 },
  errorTitle: { color: palette.danger, fontSize: 18, fontWeight: '700' },
  errorBody: { color: palette.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { color: palette.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  brandSub: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  lockPill: {
    backgroundColor: palette.surfaceRaised,
    borderColor: palette.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  lockPillText: { color: palette.accent, fontSize: 11, fontWeight: '700' },

  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  sectionTitle: { color: palette.text, fontSize: 20, fontWeight: '700', marginTop: 12, marginBottom: 12 },

  segment: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 18,
  },
  segmentButton: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segmentButtonActive: { backgroundColor: palette.accentStrong },
  segmentLabel: { color: palette.textMuted, fontSize: 14, fontWeight: '600' },
  segmentLabelActive: { color: palette.text },

  cloudList: { gap: 10 },
  cloudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  cloudGlyph: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: palette.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudGlyphText: { fontSize: 20 },
  cloudTitle: { color: palette.text, fontSize: 15, fontWeight: '600' },
  cloudSub: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  chevron: { color: palette.textMuted, fontSize: 22 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  card: {
    width: '48%',
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 10,
  },
  cardPermanent: { backgroundColor: palette.surfaceRaised },
  cardGlyphWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGlyph: { fontSize: 22 },
  cardTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
  cardCount: { fontSize: 12, fontWeight: '600' },

  emptyState: {
    marginTop: 20,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.border,
    gap: 6,
  },
  emptyTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
  emptyBody: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.bg,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: palette.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: { opacity: 0.7 },
  primaryButtonText: { color: palette.bg, fontSize: 16, fontWeight: '800' },
  footerHint: { color: palette.textMuted, fontSize: 12, textAlign: 'center' },

  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 110,
    backgroundColor: palette.surfaceRaised,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  toastText: { color: palette.text, fontSize: 13, textAlign: 'center' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '75%',
    borderWidth: 1,
    borderColor: palette.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { color: palette.text, fontSize: 18, fontWeight: '700' },
  modalClose: { color: palette.accent, fontSize: 15, fontWeight: '700' },
  separator: { height: 1, backgroundColor: palette.border },
  trackRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  trackTitle: { color: palette.text, fontSize: 15, fontWeight: '600' },
  trackSub: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
  iconButton: { padding: 6 },
  iconText: { fontSize: 18 },
});
