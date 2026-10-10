package com.trentplayer.backend.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;

/**
 * Suggests one TrentPlayer folder from a file's genre tag, title, or the artist's usual tone.
 * The names match the folders the phone renders: Sadcore, Reggae, and the rest of that list.
 */
public final class GenreToneClassifier {

    static final String UNCATEGORIZED = "Uncategorized";

    private static final Map<String, String> ALIASES = Map.ofEntries(
            Map.entry("rap", "Rap"),
            Map.entry("hiphop", "Rap"),
            Map.entry("trap", "Rap"),
            Map.entry("drill", "Rap"),
            Map.entry("grime", "Rap"),
            Map.entry("rb", "R&B"),
            Map.entry("rnb", "R&B"),
            Map.entry("randb", "R&B"),
            Map.entry("rhythmandblues", "R&B"),
            Map.entry("soul", "R&B"),
            Map.entry("neosoul", "R&B"),
            Map.entry("afrobeats", "Afrobeats"),
            Map.entry("afrobeat", "Afrobeats"),
            Map.entry("afropop", "Afrobeats"),
            Map.entry("afrofusion", "Afrobeats"),
            Map.entry("highlife", "Highlife"),
            Map.entry("hiplife", "Highlife"),
            Map.entry("reggae", "Reggae"),
            Map.entry("dancehall", "Reggae"),
            Map.entry("dub", "Reggae"),
            Map.entry("amapiano", "Amapiano"),
            Map.entry("sadcore", "Sadcore"),
            Map.entry("sad", "Sadcore"),
            Map.entry("slowcore", "Sadcore"),
            Map.entry("melancholic", "Sadcore"),
            Map.entry("melancholy", "Sadcore"),
            Map.entry("dreampop", "Sadcore"),
            Map.entry("bedroompop", "Sadcore"),
            Map.entry("gospel", "Gospel"),
            Map.entry("worship", "Gospel"),
            Map.entry("praise", "Gospel"),
            Map.entry("phonk", "Phonk"),
            Map.entry("driftphonk", "Phonk")
    );

    /** Artists whose names do not contain the tone word. */
    private static final Map<String, String> ARTIST_TONE = Map.ofEntries(
            Map.entry("lana del rey", "Sadcore"),
            Map.entry("cigarettes after sex", "Sadcore"),
            Map.entry("arctic monkeys", "Sadcore"),
            Map.entry("neighbourhood", "Sadcore"),
            Map.entry("tv girl", "Sadcore"),
            Map.entry("radiohead", "Sadcore"),
            Map.entry("billie eilish", "Sadcore"),
            Map.entry("phoebe bridgers", "Sadcore"),
            Map.entry("clairo", "Sadcore"),
            Map.entry("mazzy star", "Sadcore"),
            Map.entry("joji", "Sadcore"),
            Map.entry("the smiths", "Sadcore"),
            Map.entry("bob marley", "Reggae"),
            Map.entry("bob marley the wailers", "Reggae"),
            Map.entry("chronixx", "Reggae"),
            Map.entry("protoje", "Reggae"),
            Map.entry("peter tosh", "Reggae"),
            Map.entry("damian marley", "Reggae"),
            Map.entry("burna boy", "Afrobeats"),
            Map.entry("wizkid", "Afrobeats"),
            Map.entry("davido", "Afrobeats"),
            Map.entry("rema", "Afrobeats"),
            Map.entry("tems", "Afrobeats"),
            Map.entry("asake", "Afrobeats"),
            Map.entry("ayra starr", "Afrobeats"),
            Map.entry("sza", "R&B"),
            Map.entry("weeknd", "R&B"),
            Map.entry("brent faiyaz", "R&B"),
            Map.entry("giveon", "R&B"),
            Map.entry("daniel caesar", "R&B"),
            Map.entry("kendrick lamar", "Rap"),
            Map.entry("drake", "Rap"),
            Map.entry("travis scott", "Rap"),
            Map.entry("j cole", "Rap"),
            Map.entry("eminem", "Rap"),
            Map.entry("kirk franklin", "Gospel"),
            Map.entry("sinach", "Gospel"),
            Map.entry("kabza de small", "Amapiano"),
            Map.entry("maphorisa", "Amapiano"),
            Map.entry("uncle waffles", "Amapiano"),
            Map.entry("daddy lumba", "Highlife"),
            Map.entry("kojo antwi", "Highlife"),
            Map.entry("kordhell", "Phonk")
    );

    private GenreToneClassifier() {
    }

    public static String classify(Path file, String artist, String title) {
        String fromTag = map(readId3Genre(file));
        if (fromTag != null) {
            return fromTag;
        }
        return classify(artist, title);
    }

    static String classify(String artist, String title) {
        String fromWords = map(artist + " " + title);
        if (fromWords != null) {
            return fromWords;
        }
        String tone = ARTIST_TONE.get(artistKey(artist));
        return tone != null ? tone : UNCATEGORIZED;
    }

    private static String map(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        String whole = ALIASES.get(normalise(trimmed));
        if (whole != null) {
            return whole;
        }
        for (String segment : trimmed.split("[/,;|]")) {
            String hit = ALIASES.get(normalise(segment));
            if (hit != null) {
                return hit;
            }
        }
        for (String word : trimmed.toLowerCase(Locale.ROOT).split("[^a-z0-9]+")) {
            String hit = ALIASES.get(word);
            if (hit != null) {
                return hit;
            }
        }
        return null;
    }

    private static String artistKey(String artist) {
        String key = artist == null ? "" : artist.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
        if (key.startsWith("the ")) {
            key = key.substring(4);
        }
        return key;
    }

    private static String normalise(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static String readId3Genre(Path file) {
        if (file == null || !Files.isRegularFile(file)) {
            return null;
        }
        try (InputStream input = Files.newInputStream(file)) {
            byte[] header = input.readNBytes(10);
            if (header.length < 10 || header[0] != 'I' || header[1] != 'D' || header[2] != '3' || header[3] < 3) {
                return null;
            }
            int size = synchsafe(header, 6);
            if (size <= 0) {
                return null;
            }
            byte[] tag = input.readNBytes(Math.min(size, 262_144));
            int index = 0;
            while (index + 10 <= tag.length) {
                String id = new String(tag, index, 4, StandardCharsets.ISO_8859_1);
                if (!id.chars().allMatch(ch -> (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9'))) {
                    break;
                }
                int frameSize = ((tag[index + 4] & 0xff) << 24)
                        | ((tag[index + 5] & 0xff) << 16)
                        | ((tag[index + 6] & 0xff) << 8)
                        | (tag[index + 7] & 0xff);
                if (header[3] == 4) {
                    frameSize = synchsafe(tag, index + 4);
                }
                int body = index + 10;
                if (frameSize <= 0 || body + frameSize > tag.length) {
                    break;
                }
                if ("TCON".equals(id)) {
                    return cleanGenreTag(decodeText(tag, body, frameSize));
                }
                index = body + frameSize;
            }
        } catch (IOException ex) {
            return null;
        }
        return null;
    }

    private static String cleanGenreTag(String raw) {
        if (raw == null) {
            return null;
        }
        String text = raw.replaceAll("\\(\\d+\\)", " ").replace('\0', ' ').trim();
        return text.isEmpty() ? null : text;
    }

    private static String decodeText(byte[] tag, int offset, int length) {
        if (length <= 1) {
            return "";
        }
        int encoding = tag[offset] & 0xff;
        byte[] body = new byte[length - 1];
        System.arraycopy(tag, offset + 1, body, 0, body.length);
        Charset charset = switch (encoding) {
            case 1, 2 -> StandardCharsets.UTF_16;
            case 3 -> StandardCharsets.UTF_8;
            default -> StandardCharsets.ISO_8859_1;
        };
        return new String(body, charset);
    }

    private static int synchsafe(byte[] bytes, int offset) {
        return ((bytes[offset] & 0x7f) << 21)
                | ((bytes[offset + 1] & 0x7f) << 14)
                | ((bytes[offset + 2] & 0x7f) << 7)
                | (bytes[offset + 3] & 0x7f);
    }
}
