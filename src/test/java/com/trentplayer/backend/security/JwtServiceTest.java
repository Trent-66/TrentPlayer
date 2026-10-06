package com.trentplayer.backend.security;

import com.trentplayer.backend.security.JwtService.TokenStatus;
import com.trentplayer.backend.security.JwtService.TokenType;
import com.trentplayer.backend.security.JwtService.TokenVerification;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JwtServiceTest {

    private static final String SECRET = "unit-test-secret-that-is-definitely-32-bytes-long";
    private static final String OTHER_SECRET = "another-secret-that-is-also-at-least-32-bytes!!";

    private final JwtService service = new JwtService(SECRET, 60_000, 3_600_000);

    @Test
    void accessTokenVerifiesAsAccess() {
        String token = service.generateAccessToken("gideon");

        TokenVerification result = service.verify(token);

        assertEquals(TokenStatus.VALID, result.status());
        assertEquals("gideon", result.username());
        assertEquals(TokenType.ACCESS, result.type());
        assertTrue(service.isTokenValid(token, "gideon"));
    }

    @Test
    void refreshTokenVerifiesAsRefreshAndIsNotABearerCredential() {
        String token = service.generateRefreshToken("gideon");

        TokenVerification result = service.verify(token);

        assertEquals(TokenStatus.VALID, result.status());
        assertEquals(TokenType.REFRESH, result.type());
        assertFalse(service.isTokenValid(token, "gideon"), "refresh tokens must not authenticate API calls");
    }

    @Test
    void expiredTokenIsReportedAsExpiredNotInvalid() {
        // Refresh TTL must exceed access TTL, so pick 1ms / 2ms and let both lapse.
        JwtService shortLived = new JwtService(SECRET, 1, 2);
        String token = shortLived.generateAccessToken("gideon");

        // JJWT rounds exp to whole seconds; a token issued with a 1ms TTL is expired within ~1s.
        TokenVerification result = waitUntilNotValid(shortLived, token);

        assertEquals(TokenStatus.EXPIRED, result.status());
        assertNull(result.username());
        assertNull(shortLived.extractUsername(token));
    }

    @Test
    void tokenSignedWithDifferentSecretIsInvalid() {
        JwtService other = new JwtService(OTHER_SECRET, 60_000, 3_600_000);
        String token = other.generateAccessToken("gideon");

        assertEquals(TokenStatus.INVALID, service.verify(token).status());
    }

    @Test
    void garbageIsInvalid() {
        assertEquals(TokenStatus.INVALID, service.verify("not.a.jwt").status());
        assertEquals(TokenStatus.INVALID, service.verify("").status());
        assertEquals(TokenStatus.INVALID, service.verify(null).status());
    }

    @Test
    void rejectsShortSecretAndInvertedLifetimes() {
        assertThrows(IllegalStateException.class, () -> new JwtService("too-short", 60_000, 3_600_000));
        assertThrows(IllegalStateException.class, () -> new JwtService(SECRET, 3_600_000, 60_000));
    }

    private static TokenVerification waitUntilNotValid(JwtService svc, String token) {
        long deadline = System.currentTimeMillis() + 3_000;
        TokenVerification result = svc.verify(token);
        while (result.status() == TokenStatus.VALID && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            result = svc.verify(token);
        }
        return result;
    }
}
