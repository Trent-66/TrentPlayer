package com.trentplayer.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BackendApplication {

    public static void main(String[] args) {
        // This is the ignition switch that boots the entire server framework
        SpringApplication.run(BackendApplication.class, args);
    }
}
