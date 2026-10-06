package com.trentplayer.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * Issues and verifies the two HS256 tokens the mobile client holds:
 *
 * <ul>
 *   <li><b>access</b> — short-lived, sent as {@code Authorization: Bearer} on every API call.</li>
 *   <li><b>refresh</b> — long-lived, only ever sent to {@code POST /api/v1/auth/refresh} to mint a
 *       fresh access token once the old one expires. It is rejected as a bearer credential.</li>
 * </ul>
 *
 * Both carry a {@code typ} claim so one can never be substituted for the other.
 */
@Service
public class JwtService {

    public enum TokenType {
        ACCESS("access"),
        REFRESH("refresh");

        private final String claimValue;

        TokenType(String claimValue) {
            this.claimValue = claimValue;
        }

        static TokenType fromClaim(Object raw) {
            if (raw == null) {
                // Tokens minted before the typ claim existed are treated as access tokens.
                return ACCESS;
            }
            for (TokenType type : values()) {
                if (type.claimValue.equals(raw)) {
                    return type;
                }
            }
            return null;
        }
    }

    public enum TokenStatus {
        VALID,
        EXPIRED,
        INVALID
    }

    /** Result of {@link #verify(String)}. {@code username}/{@code type} are null unless VALID. */
    public record TokenVerification(TokenStatus status, String username, TokenType type) {
        static TokenVerification expired() {
            return new TokenVerification(TokenStatus.EXPIRED, null, null);
        }

        static TokenVerification invalid() {
            return new TokenVerification(TokenStatus.INVALID, null, null);
        }

        public boolean isValid() {
            return status == TokenStatus.VALID;
        }
    }

    private static final int MIN_SECRET_BYTES = 32;
    private static final String TYPE_CLAIM = "typ";

    private final SecretKey secretKey;
    private final long accessExpirationMs;
    private final long refreshExpirationMs;

    public JwtService(
            @Value("${trentplayer.jwt.secret}") String secret,
            @Value("${trentplayer.jwt.expiration-ms}") long accessExpirationMs,
            @Value("${trentplayer.jwt.refresh-expiration-ms}") long refreshExpirationMs) {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "trentplayer.jwt.secret must be at least 256 bits (32 UTF-8 bytes) for HS256");
        }
        if (accessExpirationMs <= 0 || refreshExpirationMs <= 0) {
            throw new IllegalStateException("JWT expiration values must be positive");
        }
        if (refreshExpirationMs <= accessExpirationMs) {
            throw new IllegalStateException(
                    "trentplayer.jwt.refresh-expiration-ms must be longer than trentplayer.jwt.expiration-ms");
        }
        this.secretKey = Keys.hmacShaKeyFor(keyBytes);
        this.accessExpirationMs = accessExpirationMs;
        this.refreshExpirationMs = refreshExpirationMs;
    }

    public long getAccessExpirationMs() {
        return accessExpirationMs;
    }

    public long getRefreshExpirationMs() {
        return refreshExpirationMs;
    }

    public String generateAccessToken(String username) {
        return generate(username, TokenType.ACCESS, accessExpirationMs);
    }

    public String generateRefreshToken(String username) {
        return generate(username, TokenType.REFRESH, refreshExpirationMs);
    }

    /** @deprecated kept for callers that predate refresh tokens; same as {@link #generateAccessToken}. */
    @Deprecated
    public String generateToken(String username) {
        return generateAccessToken(username);
    }

    private String generate(String username, TokenType type, long ttlMs) {
        Date issuedAt = new Date();
        Date expiresAt = new Date(issuedAt.getTime() + ttlMs);
        return Jwts.builder()
                .subject(username)
                .claim(TYPE_CLAIM, type.claimValue)
                .issuedAt(issuedAt)
                .expiration(expiresAt)
                .signWith(secretKey, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * Verifies signature + expiry and distinguishes an <em>expired</em> token (the client should
     * refresh) from a structurally <em>invalid</em> one (the client must log in again).
     */
    public TokenVerification verify(String token) {
        if (token == null || token.isBlank()) {
            return TokenVerification.invalid();
        }
        try {
            Claims claims = parseClaims(token);
            String username = claims.getSubject();
            TokenType type = TokenType.fromClaim(claims.get(TYPE_CLAIM));
            Date expiration = claims.getExpiration();
            if (username == null || username.isBlank() || type == null || expiration == null) {
                return TokenVerification.invalid();
            }
            if (expiration.before(new Date())) {
                return TokenVerification.expired();
            }
            return new TokenVerification(TokenStatus.VALID, username, type);
        } catch (ExpiredJwtException ex) {
            return TokenVerification.expired();
        } catch (JwtException | IllegalArgumentException ex) {
            return TokenVerification.invalid();
        }
    }

    public String extractUsername(String token) {
        return verify(token).username();
    }

    public boolean isTokenValid(String token, String username) {
        TokenVerification verification = verify(token);
        return verification.isValid()
                && verification.type() == TokenType.ACCESS
                && verification.username().equals(username);
    }

    private Claims parseClaims(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
