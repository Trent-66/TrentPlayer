package com.trentplayer.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Inclusive byte-range window capped at 1 MiB so range requests cannot pin the JVM heap.
 */
public final class ByteRangeWindow {

    public static final long MAX_CHUNK_BYTES = 1_048_576L;

    private final long start;
    private final long endInclusive;

    private ByteRangeWindow(long start, long endInclusive) {
        this.start = start;
        this.endInclusive = endInclusive;
    }

    public long start() {
        return start;
    }

    public long endInclusive() {
        return endInclusive;
    }

    public long length() {
        return endInclusive - start + 1L;
    }

    public static ByteRangeWindow from(String rangeHeader, long fileLength) {
        if (fileLength <= 0L) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Audio file is empty or missing");
        }

        long start = 0L;
        long end = Math.min(fileLength, MAX_CHUNK_BYTES) - 1L;

        if (rangeHeader == null || rangeHeader.isBlank()) {
            return new ByteRangeWindow(start, end);
        }

        String header = rangeHeader.trim();
        if (!header.regionMatches(true, 0, "bytes=", 0, 6)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Range header");
        }

        String spec = header.substring(6).trim();
        if (spec.isEmpty() || spec.indexOf(',') >= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid or multi-range request");
        }

        try {
            if (spec.charAt(0) == '-') {
                long suffix = Long.parseLong(spec.substring(1));
                if (suffix <= 0L) {
                    throw unsatisfiable();
                }
                long suffixLength = Math.min(suffix, MAX_CHUNK_BYTES);
                start = Math.max(0L, fileLength - suffixLength);
                end = fileLength - 1L;
            } else {
                int dash = spec.indexOf('-');
                if (dash < 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Range header");
                }
                start = Long.parseLong(spec.substring(0, dash));
                String endToken = spec.substring(dash + 1);
                if (endToken.isEmpty()) {
                    end = start + MAX_CHUNK_BYTES - 1L;
                } else {
                    if (endToken.indexOf('-') >= 0) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Range header");
                    }
                    end = Long.parseLong(endToken);
                }
            }
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Range header");
        }

        if (start < 0L || end < start || start >= fileLength) {
            throw unsatisfiable();
        }

        long maxEnd = start + MAX_CHUNK_BYTES - 1L;
        if (maxEnd < start) {
            maxEnd = Long.MAX_VALUE;
        }
        end = Math.min(end, maxEnd);
        end = Math.min(end, fileLength - 1L);
        return new ByteRangeWindow(start, end);
    }

    private static ResponseStatusException unsatisfiable() {
        return new ResponseStatusException(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE, "Requested range is not satisfiable");
    }
}
