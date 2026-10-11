import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '../components/Cover';
import { DownloadButton } from '../components/DownloadButton';
import { LyricsPanel } from '../components/LyricsPanel';
import { PlayerControls } from '../components/PlayerControls';
import { ProgressBar } from '../components/ProgressBar';
import { useCollection } from '../player/CollectionProvider';
import { usePlayback } from '../player/PlaybackProvider';
import { type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

/** Turn a raw filename into a title and artist for the now-playing card. */
function songLabel(title: string, artist: string): { title: string; artist: string } {
  const cleanedTitle = title
    .replace(/_/g, ' ')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanedArtist = artist.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const missingArtist = cleanedArtist.length === 0 || /^unknown$/i.test(cleanedArtist);
  const splitAt = cleanedTitle.indexOf(' - ');
  if (missingArtist && splitAt > 0) {
    return {
      title: cleanedTitle.slice(0, splitAt).trim(),
      artist: cleanedTitle.slice(splitAt + 3).trim(),
    };
  }
  return {
    title: cleanedTitle.length > 0 ? cleanedTitle : title,
    artist: missingArtist ? '' : cleanedArtist,
  };
}

interface NowPlayingScreenProps {
  onClose: () => void;
}

export default function NowPlayingScreen({ onClose }: NowPlayingScreenProps) {
  const insets = useSafeAreaInsets();
  const { current, isPlaying, shuffle, repeat, currentTime, duration, togglePlayback, skipNext, skipPrevious, seekTo, setShuffle, cycleRepeat } =
    usePlayback();
  const { isSaved, toggleSaved } = useCollection();
  const [showLyrics, setShowLyrics] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);

  if (!current) {
    return null;
  }

  const saved = isSaved(current.id);
  const label = songLabel(current.title, current.artist);
  const repeatLabel = repeat === 'one' ? 'Repeat this song' : repeat === 'all' ? 'Repeat queue' : 'Repeat off';

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.kicker}>{showLyrics ? 'LYRICS' : 'NOW PLAYING'}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Song details"
          onPress={() => setInfoOpen(true)}
          hitSlop={10}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
        </Pressable>
      </View>

      {showLyrics ? (
        <View style={styles.lyricsHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="Hide lyrics" onPress={() => setShowLyrics(false)}>
            <Cover uri={current.artworkUrl} title={label.title} artist={label.artist} size={52} radius={26} />
          </Pressable>
          <View style={styles.lyricsCopy}>
            <Text style={styles.lyricsTitle} numberOfLines={1}>
              {label.title}
            </Text>
            {label.artist ? (
              <Text style={styles.artist} numberOfLines={1}>
                {label.artist}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show lyrics"
            onPress={() => setShowLyrics(true)}
            style={styles.artWrap}
          >
            <Cover uri={current.artworkUrl} title={label.title} artist={label.artist} size={260} radius={130} />
          </Pressable>
          <Text style={styles.title} numberOfLines={2}>
            {label.title}
          </Text>
          {label.artist ? (
            <Text style={styles.artist} numberOfLines={1}>
              {label.artist}
            </Text>
          ) : null}
        </>
      )}

      {showLyrics ? (
        <View style={styles.lyricsBody}>
          <LyricsPanel
            title={label.title}
            artist={label.artist}
            currentTime={currentTime}
            duration={duration}
            onSeek={seekTo}
          />
        </View>
      ) : (
        <View style={styles.progress}>
          <ProgressBar currentTime={currentTime} duration={duration} onSeek={seekTo} />
        </View>
      )}

      {showLyrics ? (
        <View style={styles.progressCompact}>
          <ProgressBar currentTime={currentTime} duration={duration} onSeek={seekTo} />
        </View>
      ) : null}

      <PlayerControls isPlaying={isPlaying} onPrevious={skipPrevious} onToggle={togglePlayback} onNext={skipNext} />

      <View style={[styles.extras, showLyrics && styles.extrasCompact]}>
        <DownloadButton song={current} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Remove from Favourites' : 'Add to Favourites'}
          onPress={() => toggleSaved(current)}
          hitSlop={10}
        >
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={24} color={saved ? colors.accent : colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shuffle ? 'Shuffle on' : 'Shuffle off'}
          onPress={() => setShuffle(!shuffle)}
          hitSlop={10}
        >
          <Ionicons name="shuffle" size={24} color={shuffle ? colors.accent : colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={repeatLabel} onPress={cycleRepeat} hitSlop={10}>
          <View style={styles.repeatWrap}>
            <Ionicons name={repeat === 'off' ? 'repeat-outline' : 'repeat'} size={24} color={repeat === 'off' ? colors.text : colors.accent} />
            {repeat === 'one' ? <Text style={styles.repeatBadge}>1</Text> : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
          onPress={() => setShowLyrics((open) => !open)}
          hitSlop={10}
        >
          <Ionicons name="mic-outline" size={24} color={showLyrics ? colors.accent : colors.text} />
        </Pressable>
      </View>

      <Modal visible={infoOpen} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setInfoOpen(false)}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => setInfoOpen(false)} style={styles.infoBackdrop}>
          <Pressable accessibilityRole="none" onPress={() => undefined} style={styles.infoCard}>
            <Cover uri={current.artworkUrl} title={label.title} artist={label.artist} size={40} radius={20} />
            <View style={styles.infoCopy}>
              <Text style={styles.infoTitle} numberOfLines={1}>
                {label.title}
              </Text>
              {label.artist ? (
                <Text style={styles.infoArtist} numberOfLines={1}>
                  {label.artist}
                </Text>
              ) : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="OK" onPress={() => setInfoOpen(false)} hitSlop={8}>
              <Text style={styles.infoButtonText}>OK</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    zIndex: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  artWrap: {
    alignItems: 'center',
    marginTop: 36,
    marginBottom: 28,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  artist: {
    color: colors.artist,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  lyricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 8,
  },
  lyricsCopy: {
    flex: 1,
  },
  lyricsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  lyricsBody: {
    flex: 1,
    minHeight: 120,
    marginTop: 8,
  },
  progress: {
    marginTop: 28,
    marginBottom: 28,
  },
  progressCompact: {
    marginTop: 8,
    marginBottom: 16,
  },
  extras: {
    marginTop: 36,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
  },
  extrasCompact: {
    marginTop: 16,
  },
  repeatWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatBadge: {
    position: 'absolute',
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  infoBackdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 16,
  },
  infoCopy: {
    flex: 1,
  },
  infoTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  infoArtist: {
    color: colors.artist,
    fontSize: 13,
    marginTop: 2,
  },
  infoButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '800',
  },
});
}
