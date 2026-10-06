package com.trentplayer.backend.repository;

import com.trentplayer.backend.model.Track;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface TrackRepository extends JpaRepository<Track, Long> {

    List<Track> findByGenre(String genre);

    Optional<Track> findByFilePath(String filePath);
}
