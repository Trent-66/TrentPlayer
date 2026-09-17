package com.trentplayer.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MediaPathResolverTest {

    @TempDir
    Path tempDir;

    @Test
    void resolvesRelativePathInsideMediaRoot() throws IOException {
        Path mediaRoot = tempDir.resolve("media");
        Files.createDirectories(mediaRoot);
        Path audio = mediaRoot.resolve("song.mp3");
        Files.writeString(audio, "test-bytes");

        MediaPathResolver resolver = new MediaPathResolver(mediaRoot.toString());
        Path resolved = resolver.resolveSafePath("song.mp3");

        assertEquals(audio.toAbsolutePath().normalize(), resolved);
    }

    @Test
    void blocksParentDirectoryTraversal() throws IOException {
        Path mediaRoot = tempDir.resolve("media");
        Files.createDirectories(mediaRoot);
        Files.writeString(tempDir.resolve("secret.txt"), "nope");

        MediaPathResolver resolver = new MediaPathResolver(mediaRoot.toString());
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> resolver.resolveSafePath("../secret.txt"));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void blocksAbsolutePathOutsideMediaRoot() throws IOException {
        Path mediaRoot = tempDir.resolve("media");
        Files.createDirectories(mediaRoot);
        Path outside = Files.writeString(tempDir.resolve("outside.mp3"), "nope");

        MediaPathResolver resolver = new MediaPathResolver(mediaRoot.toString());
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> resolver.resolveSafePath(outside.toString()));

        assertEquals(HttpStatus.FORBIDDEN, ex.getStatusCode());
    }

    @Test
    void blocksNullByteInjection() {
        MediaPathResolver resolver = new MediaPathResolver(tempDir.toString());
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> resolver.resolveSafePath("song.mp3\0.pdf"));

        assertTrue(ex.getStatusCode() == HttpStatus.FORBIDDEN || ex.getStatusCode() == HttpStatus.NOT_FOUND);
    }
}
