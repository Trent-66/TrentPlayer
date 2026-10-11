import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { activeLyricIndex, alignLyricLines, fetchLyrics, type LyricLine, type TrackLyrics } from '../services/lyricsService';
import { type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

interface LyricsPanelProps {
  title: string;
  artist: string;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
}

export function LyricsPanel({ title, artist, currentTime, duration, onSeek }: LyricsPanelProps) {
  const [lyrics, setLyrics] = useState<TrackLyrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lineY = useRef<number[]>([]);
  const lastIndex = useRef(-1);
  const userScrolling = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);
  const trackKey = `${artist}|${title}`;
  const [lookup, setLookup] = useState({ key: trackKey, seconds: duration > 1 ? Math.round(duration) : 0 });
  if (lookup.key !== trackKey) {
    setLookup({ key: trackKey, seconds: duration > 1 ? Math.round(duration) : 0 });
  }
  const lines = useMemo(
    () => (lyrics?.synced ? alignLyricLines(lyrics.lines, duration, lyrics.durationSec) : []),
    [duration, lyrics],
  );
  const activeIndex = lines.length > 0 ? activeLyricIndex(lines, currentTime) : -1;

  useEffect(() => {
    if (lookup.key === trackKey && lookup.seconds === 0 && duration > 1) {
      setLookup({ key: trackKey, seconds: Math.round(duration) });
    }
  }, [duration, lookup, trackKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setLyrics(null);
    lineY.current = [];
    lastIndex.current = -1;
    void fetchLyrics(title, artist, lookup.seconds)
      .then((result) => {
        if (!cancelled) {
          setLyrics(result);
          setFailed(result === null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLyrics(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      if (resumeTimer.current) {
        clearTimeout(resumeTimer.current);
      }
    };
  }, [artist, lookup.seconds, title]);

  useEffect(() => {
    if (activeIndex < 0 || activeIndex === lastIndex.current || userScrolling.current) {
      return;
    }
    const y = lineY.current[activeIndex];
    if (y == null) {
      return;
    }
    lastIndex.current = activeIndex;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: true });
  }, [activeIndex]);

  const onUserScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (event.nativeEvent.contentOffset.y < 0) {
      return;
    }
    userScrolling.current = true;
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current);
    }
    resumeTimer.current = setTimeout(() => {
      userScrolling.current = false;
      lastIndex.current = -1;
    }, 2500);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.hint}>Looking up lyrics…</Text>
      </View>
    );
  }

  if (failed || !lyrics) {
    return (
      <View style={styles.centered}>
        <Text style={styles.hint}>No lyrics found for this track.</Text>
      </View>
    );
  }

  if (lyrics.instrumental) {
    return (
      <View style={styles.centered}>
        <Text style={styles.hint}>This track is instrumental.</Text>
      </View>
    );
  }

  if (lines.length > 0) {
    return (
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.syncedContent}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={onUserScroll}
        onMomentumScrollBegin={onUserScroll}
      >
        {lines.map((line, index) => (
          <SyncedLine
            key={`${line.timeMs}-${index}`}
            line={line}
            active={index === activeIndex}
            onLayoutY={(y) => {
              lineY.current[index] = y;
            }}
            onPress={() => onSeek(line.timeMs / 1000)}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.plainContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.plain}>{lyrics.plain}</Text>
    </ScrollView>
  );
}

function SyncedLine({
  line,
  active,
  onLayoutY,
  onPress,
}: {
  line: LyricLine;
  active: boolean;
  onLayoutY: (y: number) => void;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onLayout={(event) => onLayoutY(event.nativeEvent.layout.y)}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={line.text}
    >
      <Text style={[styles.line, active && styles.lineActive]}>{line.text}</Text>
    </Pressable>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  scroll: {
    flex: 1,
  },
  syncedContent: {
    paddingVertical: 12,
    paddingBottom: 32,
  },
  plainContent: {
    paddingVertical: 12,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  hint: {
    color: palette.textMuted,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 12,
  },
  line: {
    color: palette.textMuted,
    fontSize: 20,
    lineHeight: 32,
    fontWeight: '600',
    marginBottom: 10,
  },
  lineActive: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '800',
  },
  plain: {
    color: palette.text,
    fontSize: 18,
    lineHeight: 30,
    fontWeight: '600',
  },
});
}
