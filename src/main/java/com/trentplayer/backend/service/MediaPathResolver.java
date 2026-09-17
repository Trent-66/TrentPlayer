package com.trentplayer.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.LinkOption;
import java.nio.file.Path;

/**
 * Resolves stored track paths inside a configured media root. Never concatenates request strings
 * onto the filesystem; the only client input that reaches this class is a repository-backed path.
 */
@Component
public class MediaPathResolver {

    private final Path mediaRoot;

    public MediaPathResolver(@Value("${trentplayer.media.root}") String mediaRoot) {
        if (mediaRoot == null || mediaRoot.isBlank()) {
            throw new IllegalStateException("trentplayer.media.root must be configured");
        }
        this.mediaRoot = Path.of(mediaRoot).toAbsolutePath().normalize();
    }

    public Path getMediaRoot() {
        return mediaRoot;
    }

    public Path resolveSafePath(String storedFilePath) {
        if (storedFilePath == null || storedFilePath.isBlank()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Track file path is missing");
        }
        if (storedFilePath.indexOf('\0') >= 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Path traversal blocked");
        }

        final Path candidate;
        try {
            Path parsed = Path.of(storedFilePath);
            if (!parsed.isAbsolute()) {
                parsed = mediaRoot.resolve(parsed);
            }
            candidate = parsed.toAbsolutePath().normalize();
        } catch (InvalidPathException ex) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Path traversal blocked");
        }

        if (!candidate.startsWith(mediaRoot)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Path traversal blocked");
        }
        if (!Files.isRegularFile(candidate, LinkOption.NOFOLLOW_LINKS)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Audio file not found");
        }
        return candidate;
    }
}
