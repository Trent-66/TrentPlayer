import React, { useState } from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, SafeAreaView, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

/**
 * NowPlayingScreen
 * ----------------
 * Static "Now Playing" mock-up. This was accidentally pasted over `app.json`
 * (which must stay valid JSON for Expo to boot); it now lives here instead.
 * Not wired into navigation yet.
 */
export default function NowPlayingScreen() {
  const [isPlaying, setIsPlaying] = useState(false);

  // Toggle play/pause state simulation
  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Top Header Navigation Line */}
      <View style={styles.headerRow}>
        <Text style={styles.headerSubtitle}>PLAYING FROM GENRE</Text>
        <Text style={styles.headerTitle}>Amapiano Hits</Text>
      </View>

      {/* Main Centered Album Art Image Section */}
      <View style={styles.albumArtContainer}>
        <Image 
          source={{ uri: 'https://unsplash.com' }} 
          style={styles.albumArt}
          resizeMode="cover"
        />
      </View>

      {/* Track Metadata Info Details Block (Left-Aligned Spotify Typography Stack) */}
      <View style={styles.metaContainer}>
        <View style={styles.trackTextColumn}>
          <Text style={styles.trackTitle} numberOfLines={1}>Amapiano Vibes</Text>
          <Text style={styles.artistName} numberOfLines={1}>Trent Producer</Text>
        </View>
        <TouchableOpacity style={styles.heartButton}>
          <Text style={styles.heartIcon}>♡</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Playback Progress Tracker Track lane */}
      <View style={styles.progressSection}>
        <View style={styles.progressBarBackground}>
          <View style={[styles.progressBarFill, { width: '35%' }]} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>1:14</Text>
          <Text style={styles.timeText}>3:24</Text>
        </View>
      </View>

      {/* Media Controller Row Button Groups */}
      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.secondaryControl}>
          <Text style={styles.shuffleIcon}>🔀</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.primaryControl}>
          <Text style={styles.skipIcon}>⏮</Text>
        </TouchableOpacity>

        {/* Oversized Solid White Circular Play/Pause Toggle Switch Container */}
        <TouchableOpacity style={styles.mainPlayButton} onPress={handlePlayPause}>
          <Text style={styles.playPauseText}>{isPlaying ? '⏸' : '▶️'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.primaryControl}>
          <Text style={styles.skipIcon}>⏭</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryControl}>
          <Text style={styles.repeatIcon}>🔁</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// 🎨 NATIVE STYLESHEET OPTIMIZATION RULES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212', // True premium Spotify dark-mode matte black background base
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 30,
  },
  headerRow: {
    alignItems: 'center',
    marginTop: 20,
  },
  headerSubtitle: {
    color: '#A7A7A7',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  albumArtContainer: {
    width: width * 0.85,
    height: width * 0.85,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 12, // Native Android surface card drop-shadow depth index configuration
    marginVertical: 20,
  },
  albumArt: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  metaContainer: {
    width: width * 0.85,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  trackTextColumn: {
    flex: 1,
    paddingRight: 10,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: -0.5,
  },
  artistName: {
    color: '#A7A7A7', // Muted low-contrast text matching Spotify design definitions
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  heartButton: {
    padding: 5,
  },
  heartIcon: {
    color: '#1DB954', // Signature Spotify neon green accent layer highlight color
    fontSize: 26,
  },
  progressSection: {
    width: width * 0.85,
    marginTop: 15,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)', // Semi-transparent grey track lane slider window
    borderRadius: 2,
    width: '100%',
  },
  progressBarFill: {
    height: 4,
    backgroundColor: '#FFFFFF', // Crisp white progression tracking indicator line
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: '#A7A7A7',
    fontSize: 12,
    fontWeight: '500',
  },
  controlsRow: {
    flexDirection: 'row',
    width: width * 0.9,
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 20,
  },
  primaryControl: {
    padding: 10,
  },
  secondaryControl: {
    padding: 10,
    opacity: 0.7,
  },
  shuffleIcon: { fontSize: 22 },
  repeatIcon: { fontSize: 22 },
  skipIcon: {
    color: '#FFFFFF',
    fontSize: 28,
  },
  mainPlayButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FFFFFF', // Clean standalone solid white playback action circle container wrapper
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  playPauseText: {
    fontSize: 26,
    textAlign: 'center',
  },
});
