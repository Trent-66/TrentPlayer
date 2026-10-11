import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { canDownload, downloadSong, isSongDownloaded } from '../services/downloadService';
import type { CatalogSong } from '../services/catalogService';
import { usePalette } from '../theme/ThemeProvider';
import { showDownloadNotice } from './DownloadNotice';

interface DownloadButtonProps {
  song: CatalogSong;
  size?: number;
  onDownloaded?: () => void;
}

export function DownloadButton({ song, size = 22, onDownloaded }: DownloadButtonProps) {
  const colors = usePalette();
  const [phase, setPhase] = useState<'checking' | 'ready' | 'busy' | 'saved'>('checking');

  useEffect(() => {
    if (!canDownload(song)) {
      return;
    }
    let cancelled = false;
    setPhase('checking');
    isSongDownloaded(song)
      .then((saved) => {
        if (!cancelled) {
          setPhase(saved ? 'saved' : 'ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPhase('ready');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [song.id, song.streamUrl]);

  const onPress = useCallback(() => {
    if (phase !== 'ready') {
      return;
    }
    setPhase('busy');
    downloadSong(song)
      .then(() => {
        setPhase('saved');
        onDownloaded?.();
        showDownloadNotice({ tone: 'saved', title: song.title, artist: song.artist });
      })
      .catch((error: unknown) => {
        setPhase('ready');
        const detail = error instanceof Error && error.message.trim().length > 0 ? error.message : 'Download failed.';
        showDownloadNotice({ tone: 'error', title: song.title, detail });
      });
  }, [onDownloaded, phase, song]);

  if (!canDownload(song)) {
    return null;
  }

  const saved = phase === 'saved';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={saved ? `${song.title} downloaded` : `Download ${song.title}`}
      disabled={phase !== 'ready'}
      onPress={onPress}
      hitSlop={8}
    >
      {phase === 'busy' || phase === 'checking' ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons
          name={saved ? 'checkmark-circle' : 'download-outline'}
          size={size}
          color={saved ? colors.accent : colors.text}
        />
      )}
    </Pressable>
  );
}
