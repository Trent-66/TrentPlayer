# TrentPlayer

TrentPlayer is an independent music player. The phone is a React Native app (Expo SDK 57) that streams a catalog you host yourself. The default interface is dark. Settings can switch it to light, and that choice is saved on the device.

There is no third-party streaming provider in the playback path. Audio files stay on the laptop that runs the API. PostgreSQL stores accounts and listening metadata. It does not store the audio.

Two repositories make up the system:

| Piece | Path | Role |
| --- | --- | --- |
| API | `C:\dev\TrentPlayer-Backend` (this repository) | Spring Boot 3.2.5, Java 17 |
| Phone | `C:\dev\TrentPlayer` | Expo Go client, app version 1.0.0 |

This repository also still contains an earlier Expo sketch (`App.tsx`, `src/screens/AuthFlow.tsx`, `src/api/TrentApi.ts`). That sketch is not the player on the phone. The registry below labels it separately.

## 1. Project overview and architecture

### How a request moves

```text
Android phone (Expo Go)
        |
        |  HTTP over the phone's hotspot or LAN
        |  Origin: EXPO_PUBLIC_API_URL, port 8080
        v
Spring Boot API  (default port 8080, stateless JWT)
        |
        +--> PostgreSQL 18 on port 5432
        |      users, tracks, favorites, playback_history
        |
        +--> TrentPlayer-Music folder on the laptop disk
               files named "Artist - Title.mp3"
```

The phone does not open port 5432. That port is the database, on the laptop, and only the API talks to it. The phone talks to the API on **port 8080**.

In development, `apiService.ts` reads `EXPO_PUBLIC_API_URL` and, when that host is localhost or a private LAN address, replaces the host with the computer address Expo Go used to load the bundle. The port stays 8080. A new hotspot address therefore does not require a new env edit as long as Metro and the API are on the same machine.

Authenticated calls send `Authorization: Bearer <access token>`. The access token lasts 15 minutes. The refresh token lasts 30 days and is accepted only by `POST /api/v1/auth/refresh`.

### Local-storage streaming

Commercial catalog APIs cap how a self-built player may stream. TrentPlayer avoids that limit by serving files you already have.

`MediaLibraryService` scans `MEDIA_ROOT` (by default the OneDrive folder `TrentPlayer-Music`). A file named `Artist - Title.mp3` becomes a `tracks` row. `GenreToneClassifier` sets the genre folder (Sadcore, Reggae, Rap, and the rest of that list) from an ID3 genre tag when one exists, otherwise from the title or the artist. `GET /api/v1/audio/tracks` refreshes that catalog. The on-disk path is stored in PostgreSQL and is never returned in JSON (`@JsonIgnore` on `Track.filePath`).

`GET /api/v1/audio/stream/{id}` does not trust a path from the client. `MediaPathResolver` loads the path that was saved for that track id, normalizes it, and refuses anything outside `MEDIA_ROOT`, including null bytes and non-regular files.

`AudioStreamService` then reads that file:

- A request **with** a `Range` header is answered **HTTP 206 Partial Content**. `ByteRangeWindow` clamps every accepted window to **1 MiB** (`1_048_576` bytes) so one range cannot pin the JVM heap. Multi-range headers are rejected.
- A request **without** a `Range` header is answered **HTTP 200** with `Accept-Ranges: bytes`, so a player can still seek by asking for a range on the next call.

That is the streaming proxy: the API is the only process allowed to open the media folder, and a ranged read is a bounded slice of one file.

### What PostgreSQL stores

PostgreSQL is the online ledger for identity and listening state. Hibernate (`ddl-auto=update`) keeps the tables aligned with the entities.

| Table | Entity | What it records |
| --- | --- | --- |
| `users` | `User` | Username and a 60-character BCrypt password hash |
| `tracks` | `Track` | Title, artist, genre, and the server-side file path |
| `favorites` | `Favorite` | A liked song for one username (unique per user and track) |
| `playback_history` | `History` | A username, a track, and `played_at` |

Playlists created on the phone (`collectionStore.ts`) are a JSON file in the app document directory. They are not a PostgreSQL table. Liked songs also have a server copy through `/api/v1/metadata/**`. Downloads are a separate SQLite ledger plus cached files on the phone.

## 2. File directory and component registry

### Backend core

| File | Purpose |
| --- | --- |
| `src/main/java/com/trentplayer/backend/BackendApplication.java` | Starts the Spring Boot process. |
| `src/main/resources/application.properties` | Wires the database, JWT lifetimes, and `MEDIA_ROOT` to environment variables. |
| `pom.xml` | Declares Java 17, Spring Boot 3.2.5, Security, JPA, PostgreSQL, and jjwt 0.12.6. |
| `.gitignore` | Keeps `.env`, `target/`, and local IDE files out of git. |
| `mvnw.cmd` / `mvnw` | Runs Maven without a global `mvn` install. |
| `.mvn/wrapper/maven-wrapper.properties` | Pins the Maven distribution the wrapper downloads. |

### Backend security

| File | Purpose |
| --- | --- |
| `src/main/java/com/trentplayer/backend/config/SecurityConfig.java` | Stateless filter chain, BCrypt strength 10, and the public auth routes. |
| `src/main/java/com/trentplayer/backend/security/JwtAuthenticationFilter.java` | Reads `Authorization: Bearer`, verifies the access token, and sets the security context. |
| `src/main/java/com/trentplayer/backend/security/JwtService.java` | Signs and checks HS256 access and refresh tokens, including the `typ` claim. |
| `src/main/java/com/trentplayer/backend/security/DatabaseUserDetailsService.java` | Loads the account named by a verified token so the username comes from the server, not the request body. |

### Backend controllers and request bodies

| File | Purpose |
| --- | --- |
| `src/main/java/com/trentplayer/backend/controller/AuthController.java` | Register, login, and refresh; hashes passwords and never echoes them. |
| `src/main/java/com/trentplayer/backend/controller/AudioController.java` | Lists the scanned catalog and streams one track by id. |
| `src/main/java/com/trentplayer/backend/controller/UserMetadataController.java` | Like, unlike, and list favourites for the authenticated username. |
| `src/main/java/com/trentplayer/backend/controller/HistoryController.java` | Appends a playback event and returns that user's recent history. |
| `src/main/java/com/trentplayer/backend/dto/AuthRequest.java` | Username and password body for register and login. |
| `src/main/java/com/trentplayer/backend/dto/RefreshRequest.java` | Refresh-token body for `POST /api/v1/auth/refresh`. |

### Backend data model

| File | Purpose |
| --- | --- |
| `src/main/java/com/trentplayer/backend/model/User.java` | Account row; the password column is write-only JSON and length 60. |
| `src/main/java/com/trentplayer/backend/model/Track.java` | Catalog row; `filePath` is hidden from API responses. |
| `src/main/java/com/trentplayer/backend/model/Favorite.java` | One liked track per username, with a unique constraint. |
| `src/main/java/com/trentplayer/backend/model/History.java` | One playback event with `playedAt`. |
| `src/main/java/com/trentplayer/backend/repository/UserRepository.java` | Lookup and existence checks by username. |
| `src/main/java/com/trentplayer/backend/repository/TrackRepository.java` | Lookup by id, genre, and stored file path. |
| `src/main/java/com/trentplayer/backend/repository/FavoriteRepository.java` | List, existence, and delete of likes for a username. |
| `src/main/java/com/trentplayer/backend/repository/HistoryRepository.java` | History for a username, newest first. |

### Backend streaming and catalog services

| File | Purpose |
| --- | --- |
| `src/main/java/com/trentplayer/backend/service/AudioStreamService.java` | Builds the 200 or 206 response for one resolved file. |
| `src/main/java/com/trentplayer/backend/service/ByteRangeWindow.java` | Parses a single byte range and caps it at 1 MiB. |
| `src/main/java/com/trentplayer/backend/service/MediaPathResolver.java` | Confines stream paths to `MEDIA_ROOT`. |
| `src/main/java/com/trentplayer/backend/service/MediaLibraryService.java` | Registers files from the media folder and refreshes genres. |
| `src/main/java/com/trentplayer/backend/service/GenreToneClassifier.java` | Maps tags, titles, and known artists onto the phone's genre folders. |

### Backend tests

| File | Purpose |
| --- | --- |
| `src/test/java/com/trentplayer/backend/service/ByteRangeWindowTest.java` | Checks range parsing and the 1 MiB cap. |
| `src/test/java/com/trentplayer/backend/service/MediaPathResolverTest.java` | Checks that paths outside the media root are rejected. |
| `src/test/java/com/trentplayer/backend/service/GenreToneClassifierTest.java` | Checks tone labels such as Sadcore and Reggae. |
| `src/test/java/com/trentplayer/backend/security/JwtServiceTest.java` | Checks token issue and verify behaviour. |

### Phone client (`C:\dev\TrentPlayer`)

| File | Purpose |
| --- | --- |
| `App.tsx` | Boots the theme and the signed-in or signed-out shell. |
| `index.ts` | Expo entry that registers the root component. |
| `app.json` | Expo config: version 1.0.0, dark UI style, audio and SQLite plugins. |
| `package.json` | Expo 57, React Native 0.86, and the native modules the player uses. |
| `.env` | Gitignored compass; `EXPO_PUBLIC_API_URL` is the API origin. Do not commit it. |
| `src/services/apiService.ts` | Injects the bearer token, refreshes it, and calls auth, audio, likes, and history. |
| `src/services/catalogService.ts` | Turns `/api/v1/audio/tracks` into the songs shown on Home. |
| `src/services/downloadService.ts` | Saves a download into SQLite and classifies its genre folder. |
| `src/services/lyricsService.ts` | Loads synced lyrics and aligns them to the file length. |
| `src/services/artworkService.ts` | Looks up cover art when a file has none. |
| `src/security/AuthSession.ts` | Stores the access token, refresh token, and username in `expo-secure-store`. |
| `src/security/DatabaseKeyVault.ts` | Holds the local database key in the same secure store. |
| `src/database/LocalDatabase.ts` | SQLite ledger for downloaded tracks and genre folders. |
| `src/utils/FileCacheManager.ts` | Writes and deletes cached audio only inside the app cache. |
| `src/navigation/PlayerShell.tsx` | Hosts the tabs, drawer destinations, mini player, and now-playing pane. |
| `src/navigation/tabs.ts` | Names the four tabs: Home, Search, Downloads, Favourites. |
| `src/player/PlaybackProvider.tsx` | Queue, shuffle, repeat, and the expo-audio player. |
| `src/player/CollectionProvider.tsx` | Favourites and playlists held on the device. |
| `src/player/collectionStore.ts` | Persists that collection as JSON in the app documents folder. |
| `src/player/downloadSong.ts` | Download helper used by the player layer. |
| `src/screens/AuthScreen.tsx` | Login and registration form. |
| `src/screens/HomeScreen.tsx` | Avatar, TrentPlayer wordmark, search field, and song rails. |
| `src/screens/SearchScreen.tsx` | Search against the hosted catalog. |
| `src/screens/DownloadsScreen.tsx` | Downloads tab shell. |
| `src/screens/FavouritesScreen.tsx` | Liked songs and shuffle. |
| `src/screens/LibraryScreen.tsx` | Your Library, including genre folders and remove-from-downloads. |
| `src/screens/NowPlayingScreen.tsx` | Full player, lyrics, and the compact song-details row. |
| `src/screens/SettingsScreen.tsx` | Dark or light theme, and the About version. |
| `src/screens/ProfileScreen.tsx` | Account name and log out. |
| `src/screens/CreateScreen.tsx` | Device-local playlist editor. |
| `src/screens/PremiumScreen.tsx` | Static plan copy. |
| `src/components/AccountMenu.tsx` | Left-hand drawer: library, settings, log out. |
| `src/components/BottomNav.tsx` | Tab bar. |
| `src/components/MiniPlayer.tsx` | Bar above the tabs for the current song. |
| `src/components/PlayerControls.tsx` | Previous, play, and next. |
| `src/components/ProgressBar.tsx` | Seek bar. |
| `src/components/LyricsPanel.tsx` | Synced lyric list. |
| `src/components/SongCard.tsx` | Home-rail card with title and artist. |
| `src/components/SongRow.tsx` | List row used in library and search results. |
| `src/components/FavoriteRow.tsx` | Favourites and search row. |
| `src/components/Cover.tsx` | Artwork or a generated initials tile. |
| `src/components/DownloadButton.tsx` | Starts a download for one song. |
| `src/components/DownloadNotice.tsx` | Small top banner for downloads and new favourites. |
| `src/components/SearchPill.tsx` | Search field. |
| `src/components/Avatar.tsx` | Letter avatar that opens the drawer. |
| `src/components/ProfileHeader.tsx` | Search-screen profile row. |
| `src/components/AuthInput.tsx` | Username and password fields. |
| `src/theme/palette.ts` | Dark and light color sets. |
| `src/theme/ThemeProvider.tsx` | Saves `dark` or `light` in SecureStore. |
| `src/theme/useThemedStyles.ts` | Rebuilds styles when the theme changes. |
| `src/theme/formatTime.ts` | Clock formatting for the progress bar. |
| `src/theme/trackLogo.ts` | Colors and initials when a cover is missing. |

### Earlier Expo sketch inside this repository

These files are not the Expo Go build in `C:\dev\TrentPlayer`. They are an older client that still sits next to the Java sources.

| File | Purpose |
| --- | --- |
| `App.tsx` | Earlier root component for that sketch. |
| `index.ts` | Earlier Expo entry. |
| `app.json` | Earlier Expo manifest. |
| `package.json` | Dependencies for that sketch. |
| `src/api/config.ts` | Reads `EXPO_PUBLIC_API_URL` for the sketch. |
| `src/api/TrentApi.ts` | Earlier authenticated fetch helper. |
| `src/auth/AuthContext.tsx` | Earlier session context. |
| `src/security/AuthSession.ts` | Earlier SecureStore session for the sketch. |
| `src/security/DatabaseKeyVault.ts` | Earlier local database key helper. |
| `src/database/LocalDatabase.ts` | Earlier on-device track ledger. |
| `src/utils/FileCacheManager.ts` | Earlier cache writer. |
| `src/screens/AuthFlow.tsx` | Earlier sign-in flow. |
| `src/screens/CloudLibrary.tsx` | Earlier cloud library screen. |
| `src/screens/NowPlayingScreen.tsx` | Earlier now-playing screen. |
| `src/theme.ts` | Earlier color constants. |

## 3. Security implementation

The controls below are mapped to the OWASP Mobile Top 10 (2024) items they were built to answer. They are properties of the code as it stands, not a claim that the whole application has been formally certified.

### M10 — Insufficient cryptography

Passwords are not stored as text. `SecurityConfig` exposes a `BCryptPasswordEncoder` at strength 10. `AuthController.registerUser` calls `passwordEncoder.encode` before `UserRepository.save`. The `users.password` column is `length = 60`, which is the size of a `$2a$10$...` BCrypt string. Login uses `passwordEncoder.matches`. A dummy hash is compared when the username does not exist, so the failure path still does a hash check.

JWTs are HS256. `JwtService` refuses a secret shorter than 32 bytes. Access and refresh tokens carry a `typ` claim so a refresh token cannot be presented as a bearer access token.

### M1 — Improper credential usage

Database URL, database user, database password, and `JWT_SECRET` are not literals in `application.properties`. That file references `${DB_URL}`, `${DB_USERNAME}`, `${DB_PASSWORD}`, and `${JWT_SECRET}`, loaded from a gitignored `.env` via `spring.config.import=optional:file:.env[.properties]`. The same keys can be real environment variables in production. `.gitignore` lists `.env`.

On the phone, the API origin is `EXPO_PUBLIC_API_URL`. That value is public by Expo's rule: anything with the `EXPO_PUBLIC_` prefix is embedded in the bundle. It is an address, not a password. The JWT secret never ships in the app.

### M9 — Insecure data storage

The phone does not write the JWT into AsyncStorage, SQLite, or a world-readable file. `AuthSession.ts` uses `expo-secure-store` for the access token (`jwt_access_token`), the refresh token, and the username. On Android, SecureStore keeps those values in EncryptedSharedPreferences. The values are AES-256-GCM, the key names are AES-256-SIV, and the master key is held in the Android Keystore. Hardware backing (TEE or StrongBox) depends on the device; the app asks for the platform store rather than implementing its own cipher.

The local SQLCipher-style database key, when used, goes through `DatabaseKeyVault.ts` and the same store. Track file paths are omitted from JSON so a client cannot learn the laptop filesystem layout.

### M3 — Insecure authentication and authorization

`SecurityConfig` is stateless. CSRF, HTTP Basic, and form login are off because the client is a bearer-token app, not a browser session. These routes are public:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`

Every other route requires a valid **access** token. That includes `/api/v1/audio/**`, `/api/v1/metadata/**`, and `/api/v1/history/**`.

`JwtAuthenticationFilter` reads only the `Authorization` header. On success it loads `UserDetails` for the username inside the verified token and puts that identity on the security context. `UserMetadataController` and `HistoryController` then call `authentication.getName()`. They do not accept a username parameter from the client. A missing or bad token becomes HTTP 401 with `unauthorized`, `token_expired`, or `invalid_token`, so the phone can refresh or send the user back to sign-in.

`MediaPathResolver` is the authorization boundary for files: a track id may open only a regular file inside `MEDIA_ROOT`.

### Related choices worth keeping in view

- Login requires a password of at least 8 characters at registration.
- Rotating `JWT_SECRET` invalidates every access and refresh token.
- `spring.jpa.show-sql=true` prints SQL in the API console. That is useful while building and noisy on a shared server.
- This document does not paste `.env` values. Those stay on the machine that runs the API.

## 4. What the build had to get through

**Self-hosted catalog.** A provider API would have licensed the stream and capped it. The catalog is the `TrentPlayer-Music` folder. The API scans it, hides the real path, and serves bytes itself. Files are named `Artist - Title`, because that is how `MediaLibraryService` splits artist and title.

**Expo Go instead of a custom dev client.** A custom native build was getting in the way of day-to-day work. The phone runs in Expo Go and uses Expo's own modules, including `expo-secure-store`, `expo-audio`, `expo-sqlite`, and `expo-file-system`.

**Maven on Windows.** A global `mvn` command was not on `PATH`. The wrapper in this repository is the build tool: `.\mvnw.cmd -q spring-boot:run` from `C:\dev\TrentPlayer-Backend`.

**Hotspot addresses.** The laptop's hotspot IP changes. The phone does not hardcode that IP. `EXPO_PUBLIC_API_URL` is the configured origin, and in dev the client rewrites a local host to the machine Expo used to serve the bundle, still on port 8080.

**From "make it work" to "who is allowed to see this".** The first cut of a player can pass a username in the body and store a password beside it. This codebase does the opposite on purpose: hash the password before insert, sign a short-lived token, ignore client-supplied identity on metadata routes, and refuse filesystem paths that escape the media root. Function came first. The gates were then placed on the storage and on the parameters that cross the network.

## Run

API, from this repository:

```powershell
.\mvnw.cmd -q spring-boot:run
```

The process expects a reachable PostgreSQL on the URL in `.env` and a `JWT_SECRET` of at least 32 bytes. Audio is read from `MEDIA_ROOT`.

Phone, from `C:\dev\TrentPlayer`:

```powershell
npx expo start
```

Open the project in Expo Go on the Android device that shares a network with the laptop. Sign in, then pull to refresh Your Music after files are added to the media folder.
