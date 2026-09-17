package com.trentplayer.backend.service;

import com.trentplayer.backend.model.Track;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.ResourceRegion;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Path;

@Service
public class AudioStreamService {

    private final MediaPathResolver mediaPathResolver;

    public AudioStreamService(MediaPathResolver mediaPathResolver) {
        this.mediaPathResolver = mediaPathResolver;
    }

    public ResponseEntity<ResourceRegion> buildPartialContent(Track track, String rangeHeader) throws IOException {
        Path safePath = mediaPathResolver.resolveSafePath(track.getFilePath());
        FileSystemResource resource = new FileSystemResource(safePath.toFile());
        long fileLength = resource.contentLength();

        final ByteRangeWindow window;
        try {
            window = ByteRangeWindow.from(rangeHeader, fileLength);
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode() == HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */" + fileLength)
                        .build();
            }
            throw ex;
        }

        ResourceRegion region = new ResourceRegion(resource, window.start(), window.length());
        MediaType mediaType = MediaTypeFactory.getMediaType(resource)
                .orElse(MediaType.valueOf("audio/mpeg"));

        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .contentType(mediaType)
                .contentLength(window.length())
                .body(region);
    }
}
