package com.trentplayer.backend.repository;

import com.trentplayer.backend.model.Favorite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface FavoriteRepository extends JpaRepository<Favorite, Long> {

    List<Favorite> findByUsername(String username);

    boolean existsByUsernameAndTrack_Id(String username, Long trackId);
}
