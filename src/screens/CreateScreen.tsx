import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SongRow } from '../components/SongRow';
import { useCollection } from '../player/CollectionProvider';
import { usePlayback } from '../player/PlaybackProvider';
import { type Palette } from '../theme/palette';
import { usePalette } from '../theme/ThemeProvider';
import { useThemedStyles } from '../theme/useThemedStyles';

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const colors = usePalette();
  const styles = useThemedStyles(createStyles);
  const { current, playSong } = usePlayback();
  const { playlists, createPlaylist, addSongToPlaylist } = useCollection();
  const [name, setName] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const open = playlists.find((playlist) => playlist.id === openId) ?? null;
  const trimmed = name.trim();

  const onCreate = useCallback(() => {
    if (trimmed.length === 0) {
      return;
    }
    const id = createPlaylist(trimmed);
    setName('');
    setOpenId(id);
    setNotice(null);
  }, [createPlaylist, trimmed]);

  useEffect(() => {
    if (openId && !playlists.some((playlist) => playlist.id === openId)) {
      setOpenId(null);
    }
  }, [openId, playlists]);

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {open ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to playlists"
            onPress={() => setOpenId(null)}
            style={styles.backRow}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={styles.backText}>Playlists</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>{open ? open.name : 'Create'}</Text>
      </View>

      {open ? (
        <ScrollView contentContainerStyle={styles.list}>
          <Pressable
            accessibilityRole="button"
            disabled={!current}
            onPress={() => {
              if (!current) {
                return;
              }
              addSongToPlaylist(open.id, current);
              setNotice(`Added ${current.title}.`);
            }}
            style={({ pressed }) => [styles.secondary, !current && styles.disabled, pressed && current && styles.pressed]}
          >
            <Text style={styles.secondaryText}>
              {current ? `Add “${current.title}”` : 'Play a song to add it here'}
            </Text>
          </Pressable>
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {open.songs.length === 0 ? (
            <Text style={styles.empty}>This playlist is empty.</Text>
          ) : (
            open.songs.map((song) => (
              <SongRow
                key={song.id}
                song={song}
                active={current?.id === song.id}
                onPress={(item) => playSong(item, open.songs)}
                onMore={(item) => Alert.alert(item.title, item.artist)}
              />
            ))
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <Text style={styles.lead}>Name a playlist, then add the song that is playing.</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Playlist name"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            accessibilityLabel="Playlist name"
            onSubmitEditing={onCreate}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create playlist"
            disabled={trimmed.length === 0}
            onPress={onCreate}
            style={({ pressed }) => [styles.primary, trimmed.length === 0 && styles.disabled, pressed && trimmed.length > 0 && styles.pressed]}
          >
            <Text style={styles.primaryText}>Create playlist</Text>
          </Pressable>
          {playlists.length === 0 ? (
            <Text style={styles.empty}>You have not created a playlist yet.</Text>
          ) : (
            playlists.map((playlist) => (
              <Pressable
                key={playlist.id}
                accessibilityRole="button"
                onPress={() => {
                  setNotice(null);
                  setOpenId(playlist.id);
                }}
                style={({ pressed }) => [styles.playlistRow, pressed && styles.pressed]}
              >
                <View style={styles.playlistArt}>
                  <Ionicons name="musical-notes" size={18} color={colors.text} />
                </View>
                <View style={styles.playlistCopy}>
                  <Text style={styles.playlistName} numberOfLines={1}>
                    {playlist.name}
                  </Text>
                  <Text style={styles.playlistMeta}>
                    {playlist.songs.length === 1 ? '1 song' : `${playlist.songs.length} songs`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  backText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '800',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  lead: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  input: {
    backgroundColor: palette.surface,
    borderRadius: 8,
    color: palette.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  primary: {
    backgroundColor: palette.accentBright,
    borderRadius: 24,
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 20,
  },
  primaryText: {
    color: palette.black,
    fontWeight: '800',
    fontSize: 15,
  },
  secondary: {
    borderColor: palette.text,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  secondaryText: {
    color: palette.text,
    fontWeight: '700',
    fontSize: 14,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.75,
  },
  notice: {
    color: palette.textMuted,
    fontSize: 13,
    marginBottom: 8,
  },
  empty: {
    color: palette.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  playlistArt: {
    width: 52,
    height: 52,
    borderRadius: 4,
    backgroundColor: palette.header,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistCopy: {
    flex: 1,
  },
  playlistName: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  playlistMeta: {
    color: palette.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
});
}
