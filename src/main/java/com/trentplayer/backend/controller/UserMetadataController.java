package com.trentplayer.backend.controller;

import com.trentplayer.backend.model.Favorite;
import com.trentplayer.backend.model.Track;
import com.trentplayer.backend.repository.FavoriteRepository;
import com.trentplayer.backend.repository.TrackRepository;
import org.springframework.dao.DataIntegrityViolationException;
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
@RequestMapping("/api/v1/metadata")
public class UserMetadataController {

    private final FavoriteRepository favoriteRepository;
    private final TrackRepository trackRepository;

    public UserMetadataController(FavoriteRepository favoriteRepository, TrackRepository trackRepository) {
        this.favoriteRepository = favoriteRepository;
        this.trackRepository = trackRepository;
    }

    @PostMapping("/like")
    public ResponseEntity<?> likeTrack(@RequestParam("trackId") Long trackId) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String authenticatedUser = authentication != null ? authentication.getName() : null;
        if (!isAuthenticatedIdentity(authentication, authenticatedUser)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Unauthorized"));
        }

        Track track = trackRepository.findById(trackId).orElse(null);
        if (track == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Track not found"));
        }

        if (favoriteRepository.existsByUsernameAndTrack_Id(authenticatedUser, trackId)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Track is already in liked songs"));
        }

        try {
            favoriteRepository.save(new Favorite(authenticatedUser, track));
        } catch (DataIntegrityViolationException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Track is already in liked songs"));
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("message", "Track added to liked songs"));
    }

    @GetMapping("/favorites")
    public ResponseEntity<?> getUserFavorites() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        String authenticatedUser = authentication != null ? authentication.getName() : null;
        if (!isAuthenticatedIdentity(authentication, authenticatedUser)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Unauthorized"));
        }

        List<Favorite> userFavoritesList = favoriteRepository.findByUsername(authenticatedUser);
        return ResponseEntity.ok(userFavoritesList);
    }

    private static boolean isAuthenticatedIdentity(Authentication authentication, String username) {
        return authentication != null
                && authentication.isAuthenticated()
                && username != null
                && !username.isBlank()
                && !"anonymousUser".equals(username);
    }
}
