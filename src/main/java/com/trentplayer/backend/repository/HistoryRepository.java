package com.trentplayer.backend.repository;

import com.trentplayer.backend.model.History;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HistoryRepository extends JpaRepository<History, Long> {

    List<History> findByUsername(String username);

    List<History> findByUsernameOrderByPlayedAtDesc(String username);
}
