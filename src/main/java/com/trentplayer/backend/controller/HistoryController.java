package com.trentplayer.backend.controller;

import com.trentplayer.backend.model.History;
import com.trentplayer.backend.model.Track;
import com.trentplayer.backend.repository.HistoryRepository;
import com.trentplayer.backend.repository.TrackRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/history")
public class HistoryController {

    private final HistoryRepository historyRepository;
    private final TrackRepository trackRepository;

    public HistoryController(HistoryRepository historyRepository, TrackRepository trackRepository) {
        this.historyRepository = historyRepository;
        this.trackRepository = trackRepository;
    }

    @PostMapping("/log")
    public ResponseEntity<?> logPlaybackActivity(@RequestParam("trackId") Long trackId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String authenticatedUser = authentication != null ? authentication.getName() : null;
        if (!isAuthenticatedIdentity(authentication, authenticatedUser)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Unauthorized"));
        }

        Track track = trackRepository.findById(trackId).orElse(null);
        if (track == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Track not found"));
        }

        historyRepository.save(new History(authenticatedUser, track));
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("message", "Playback event logged"));
    }

    @GetMapping("/recent")
    public ResponseEntity<?> getRecentPlaybackQueue() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String authenticatedUser = authentication != null ? authentication.getName() : null;
        if (!isAuthenticatedIdentity(authentication, authenticatedUser)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Unauthorized"));
        }

        List<History> recentHistoryList = historyRepository.findByUsernameOrderByPlayedAtDesc(authenticatedUser);
        return ResponseEntity.ok(recentHistoryList);
    }

    private static boolean isAuthenticatedIdentity(Authentication authentication, String username) {
        return authentication != null
                && authentication.isAuthenticated()
                && username != null
                && !username.isBlank()
                && !"anonymousUser".equals(username);
    }
}
