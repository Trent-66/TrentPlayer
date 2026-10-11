package com.trentplayer.backend.controller;

import com.trentplayer.backend.dto.AuthRequest;
import com.trentplayer.backend.dto.RefreshRequest;
import com.trentplayer.backend.model.User;
import com.trentplayer.backend.repository.UserRepository;
import com.trentplayer.backend.security.JwtAuthenticationFilter;
import com.trentplayer.backend.security.JwtService;
import com.trentplayer.backend.security.JwtService.TokenStatus;
import com.trentplayer.backend.security.JwtService.TokenType;
import com.trentplayer.backend.security.JwtService.TokenVerification;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private static final int MIN_PASSWORD_LENGTH = 8;

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final String dummyPasswordHash;

    public AuthController(
            UserRepository userRepository,
            JwtService jwtService,
            PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.passwordEncoder = passwordEncoder;
        this.dummyPasswordHash = passwordEncoder.encode("invalid-timing-placeholder");
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> registerUser(@RequestBody AuthRequest request) {
        if (request == null || isBlank(request.username()) || isBlank(request.password())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username and password are required"));
        }
        if (request.password().length() < MIN_PASSWORD_LENGTH) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Password must be at least 8 characters"));
        }

        String username = request.username().trim();
        if (userRepository.existsByUsername(username)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Username is already taken"));
        }

        User user = new User();
        user.setUsername(username);
        user.setPassword(passwordEncoder.encode(request.password()));

        try {
            userRepository.save(user);
        } catch (DataIntegrityViolationException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Username is already taken"));
        }

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("message", "Account created"));
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> loginUser(@RequestBody AuthRequest request) {
        if (request == null || isBlank(request.username()) || isBlank(request.password())) {
            return ResponseEntity.badRequest().body(Map.of("error", "Username and password are required"));
        }

        User existingUser = userRepository.findByUsername(request.username().trim()).orElse(null);
        String storedHash = existingUser != null ? existingUser.getPassword() : dummyPasswordHash;
        if (existingUser == null || !passwordEncoder.matches(request.password(), storedHash)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid username or password"));
        }

        return ResponseEntity.ok(issueTokenPair(existingUser.getUsername()));
    }

    /**
     * Exchanges a valid refresh token for a brand-new access + refresh pair (rotation).
     * Returns 401 with {@code error=token_expired} or {@code error=invalid_token} so the client can
     * tell "refresh token is also stale, log in again" from "someone sent garbage".
     */
    @PostMapping("/refresh")
    public ResponseEntity<Map<String, Object>> refreshToken(@RequestBody(required = false) RefreshRequest request) {
        if (request == null || isBlank(request.refreshToken())) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "bad_request", "message", "refreshToken is required"));
        }

        TokenVerification verification = jwtService.verify(request.refreshToken().trim());
        if (verification.status() == TokenStatus.EXPIRED) {
            return unauthorized(JwtAuthenticationFilter.ERROR_TOKEN_EXPIRED,
                    "Refresh token has expired. Sign in again.");
        }
        if (!verification.isValid() || verification.type() != TokenType.REFRESH) {
            return unauthorized(JwtAuthenticationFilter.ERROR_INVALID_TOKEN,
                    "Refresh token is invalid. Sign in again.");
        }
        if (!userRepository.existsByUsername(verification.username())) {
            return unauthorized(JwtAuthenticationFilter.ERROR_INVALID_TOKEN,
                    "Account no longer exists. Sign in again.");
        }

        return ResponseEntity.ok(issueTokenPair(verification.username()));
    }

    private Map<String, Object> issueTokenPair(String username) {
        String accessToken = jwtService.generateAccessToken(username);
        String refreshToken = jwtService.generateRefreshToken(username);
        Map<String, Object> body = new LinkedHashMap<>();
        // "token" is kept for older clients that only read that field.
        body.put("token", accessToken);
        body.put("accessToken", accessToken);
        body.put("refreshToken", refreshToken);
        body.put("tokenType", "Bearer");
        body.put("expiresIn", jwtService.getAccessExpirationMs() / 1000);
        body.put("refreshExpiresIn", jwtService.getRefreshExpirationMs() / 1000);
        body.put("username", username);
        return body;
    }

    private static ResponseEntity<Map<String, Object>> unauthorized(String error, String message) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .header(HttpHeaders.WWW_AUTHENTICATE, "Bearer realm=\"trentplayer\", error=\"" + error + "\"")
                .body(Map.of("error", error, "message", message));
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
