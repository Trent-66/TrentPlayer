package com.trentplayer.backend.service;

import com.trentplayer.backend.model.Track;
import com.trentplayer.backend.repository.TrackRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Stream;

/**
 * Registers audio files that are currently inside the media folder.
 * Called when the library is listed, so a file added to OneDrive shows up
 * on the next request without restarting the server.
 */
@Service
public class MediaLibraryService {

    private static final Logger log = LoggerFactory.getLogger(MediaLibraryService.class);
    private static final int MAX_TITLE = 255;
    private static final int MAX_PATH = 1024;

    private static final Set<String> AUDIO_EXTENSIONS = Set.of(
            "mp3", "m4a", "wav", "flac", "aac", "ogg", "opus");

    private final MediaPathResolver mediaPathResolver;
    private final TrackRepository trackRepository;

    public MediaLibraryService(MediaPathResolver mediaPathResolver, TrackRepository trackRepository) {
        this.mediaPathResolver = mediaPathResolver;
        this.trackRepository = trackRepository;
    }

    public List<Track> syncAndList() {
        Path root = mediaPathResolver.getMediaRoot();
        if (Files.isDirectory(root)) {
            scan(root, root);
        }

        return trackRepository.findAll().stream()
                .filter(this::stillInFolder)
                .sorted(Comparator.comparing(Track::getTitle, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /**
     * One unreadable folder or one file the database rejects must not hide the rest of the library.
     */
    private void scan(Path root, Path dir) {
        final List<Path> children;
        try (Stream<Path> listed = Files.list(dir)) {
            children = listed.toList();
        } catch (IOException ex) {
            log.warn("Skipping folder {}: {}", dir, ex.toString());
            return;
        }

        for (Path child : children) {
            try {
                if (Files.isDirectory(child)) {
                    scan(root, child);
                } else if (isAudioFile(child)) {
                    register(root, child);
                }
            } catch (RuntimeException ex) {
                log.warn("Skipping audio file {}: {}", child, ex.toString());
            }
        }
    }

    private void register(Path root, Path file) {
        String relative = root.relativize(file).toString().replace('\\', '/');
        if (relative.length() > MAX_PATH) {
            log.warn("Skipping audio file {}: path is longer than {} characters", file, MAX_PATH);
            return;
        }
        if (trackRepository.findByFilePath(relative).isPresent()) {
            return;
        }
        String fileName = file.getFileName().toString();
        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String artist = "Unknown";
        String title = base.trim();
        int split = base.indexOf(" - ");
        if (split > 0 && split < base.length() - 3) {
            artist = base.substring(0, split).trim();
            title = base.substring(split + 3).trim();
        }
        if (title.isEmpty()) {
            title = base.trim();
        }
        if (title.isEmpty()) {
            title = "Unknown";
        }
        if (artist.isEmpty()) {
            artist = "Unknown";
        }
        trackRepository.save(new Track(clip(title), clip(artist), "Uncategorized", relative));
    }

    private static String clip(String value) {
        return value.length() <= MAX_TITLE ? value : value.substring(0, MAX_TITLE);
    }

    private boolean isAudioFile(Path path) {
        String name = path.getFileName().toString();
        if (name.startsWith(".")) {
            return false;
        }
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) {
            return false;
        }
        return AUDIO_EXTENSIONS.contains(name.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    private boolean stillInFolder(Track track) {
        try {
            mediaPathResolver.resolveSafePath(track.getFilePath());
            return true;
        } catch (RuntimeException ex) {
            return false;
        }
    }
}
