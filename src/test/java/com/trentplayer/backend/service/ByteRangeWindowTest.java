package com.trentplayer.backend.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ByteRangeWindowTest {

    private static final long FIVE_MEGABYTES = 5L * 1024L * 1024L;

    @Test
    void defaultsToFirstMegabyteWhenRangeHeaderMissing() {
        ByteRangeWindow window = ByteRangeWindow.from(null, FIVE_MEGABYTES);
        assertEquals(0L, window.start());
        assertEquals(ByteRangeWindow.MAX_CHUNK_BYTES - 1L, window.endInclusive());
        assertEquals(ByteRangeWindow.MAX_CHUNK_BYTES, window.length());
    }

    @Test
    void capsOversizedClientRangeToOneMegabyte() {
        ByteRangeWindow window = ByteRangeWindow.from("bytes=0-999999999", FIVE_MEGABYTES);
        assertEquals(0L, window.start());
        assertEquals(ByteRangeWindow.MAX_CHUNK_BYTES - 1L, window.endInclusive());
        assertEquals(ByteRangeWindow.MAX_CHUNK_BYTES, window.length());
    }

    @Test
    void honorsOpenEndedRangeWithOneMegabyteCap() {
        ByteRangeWindow window = ByteRangeWindow.from("bytes=2000000-", FIVE_MEGABYTES);
        assertEquals(2_000_000L, window.start());
        assertEquals(2_000_000L + ByteRangeWindow.MAX_CHUNK_BYTES - 1L, window.endInclusive());
    }

    @Test
    void rejectsRangePastEndOfFile() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> ByteRangeWindow.from("bytes=9999999-", FIVE_MEGABYTES));
        assertEquals(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE, ex.getStatusCode());
    }

    @Test
    void rejectsMalformedRangeHeader() {
        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> ByteRangeWindow.from("bytes=abc-def", FIVE_MEGABYTES));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }
}
