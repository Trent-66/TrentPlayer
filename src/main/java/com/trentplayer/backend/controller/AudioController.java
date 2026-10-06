package com.trentplayer.backend.controller;

import com.trentplayer.backend.model.Track;
import com.trentplayer.backend.repository.TrackRepository;
import com.trentplayer.backend.service.AudioStreamService;
import com.trentplayer.backend.service.MediaLibraryService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/v1/audio")
public class AudioController {

    private final TrackRepository trackRepository;
    private final AudioStreamService audioStreamService;
    private final MediaLibraryService mediaLibraryService;

    public AudioController(
            TrackRepository trackRepository,
            AudioStreamService audioStreamService,
            MediaLibraryService mediaLibraryService) {
        this.trackRepository = trackRepository;
        this.audioStreamService = audioStreamService;
        this.mediaLibraryService = mediaLibraryService;
    }

    /**
     * Scans the media folder and returns every audio file that is there now.
     * Adding or removing a file in OneDrive is visible on the next call.
     */
    @GetMapping("/tracks")
    public List<Track> listTracks() {
        return mediaLibraryService.syncAndList();
    }

    @GetMapping("/stream/{id}")
    public ResponseEntity<?> streamAudioSecure(
            @PathVariable("id") Long trackId,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader) throws IOException {

        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Track not found"));

        return audioStreamService.buildPartialContent(track, rangeHeader);
    }
}
