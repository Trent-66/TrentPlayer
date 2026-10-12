package com.trentplayer.backend.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class GenreToneClassifierTest {

    @Test
    void sadArtistsLandInSadcore() {
        assertEquals("Sadcore", GenreToneClassifier.classify("Lana Del Rey", "White Mustang"));
        assertEquals("Sadcore", GenreToneClassifier.classify("Cigarettes After Sex", "Apocalypse"));
        assertEquals("Sadcore", GenreToneClassifier.classify("Arctic Monkeys", "505"));
        assertEquals("Sadcore", GenreToneClassifier.classify("The Neighbourhood", "Daddy Issues"));
        assertEquals("Sadcore", GenreToneClassifier.classify("TV Girl", "Lovers Rock"));
    }

    @Test
    void toneWordsPickTheMatchingFolder() {
        assertEquals("Reggae", GenreToneClassifier.classify("Unknown", "Kingston Reggae Dub"));
        assertEquals("Gospel", GenreToneClassifier.classify("Choir", "Worship Night"));
        assertEquals("Afrobeats", GenreToneClassifier.classify("Unknown", "Afrobeats / Pop"));
        assertEquals("Hiplife", GenreToneClassifier.classify("Sarkodie", "Adonai"));
        assertEquals("Asakaa", GenreToneClassifier.classify("Black Sherif", "Second Sermon"));
        assertEquals("Asakaa", GenreToneClassifier.classify("O'Kenneth", "King"));
        assertEquals("Uncategorized", GenreToneClassifier.classify("Unknown", "Untitled Take"));
    }
}
