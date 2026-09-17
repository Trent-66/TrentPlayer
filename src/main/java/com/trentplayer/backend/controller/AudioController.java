package com.trentplayer.backend.controller;

import com.trentplayer.backend.model.Track;
import com.trentplayer.backend.repository.TrackRepository;
import com.trentplayer.backend.service.AudioStreamService;
import org.springframework.core.io.support.ResourceRegion;
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

@RestController
@RequestMapping("/api/v1/audio")
public class AudioController {

    private final TrackRepository trackRepository;
    private final AudioStreamService audioStreamService;

    public AudioController(TrackRepository trackRepository, AudioStreamService audioStreamService) {
        this.trackRepository = trackRepository;
        this.audioStreamService = audioStreamService;
    }

    @GetMapping("/stream/{id}")
    public ResponseEntity<ResourceRegion> streamAudioSecure(
            @PathVariable("id") Long trackId,
            @RequestHeader(value = HttpHeaders.RANGE, required = false) String rangeHeader) throws IOException {

        Track track = trackRepository.findById(trackId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Track not found"));

        return audioStreamService.buildPartialContent(track, rangeHeader);
    }
}
