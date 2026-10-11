package com.trentplayer.backend.config;

import com.trentplayer.backend.security.JwtAuthenticationFilter;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    /**
     * Strength 10 produces hashes of the form {@code $2a$10$...}. The encoder is the only
     * component allowed to scramble raw passwords before they reach PostgreSQL.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    @Bean
    public FilterRegistrationBean<JwtAuthenticationFilter> jwtFilterRegistration(
            JwtAuthenticationFilter jwtAuthenticationFilter) {
        FilterRegistrationBean<JwtAuthenticationFilter> registration =
                new FilterRegistrationBean<>(jwtAuthenticationFilter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtAuthenticationFilter) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // A controller failure is forwarded as an ERROR dispatch without the
                        // bearer token. If that dispatch requires auth, the phone sees 401
                        // and throws away a valid login.
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.POST,
                                "/api/v1/auth/register",
                                "/api/v1/auth/login",
                                "/api/v1/auth/refresh")
                        .permitAll()
                        .anyRequest()
                        .authenticated())
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(SecurityConfig::writeUnauthorized))
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /**
     * Emits a machine-readable 401. {@code error} is one of:
     * <ul>
     *   <li>{@code token_expired} — signature fine, {@code exp} in the past: call {@code /auth/refresh}.</li>
     *   <li>{@code invalid_token} — bad signature / malformed / wrong type / unknown user: log in again.</li>
     *   <li>{@code unauthorized} — no bearer token was sent at all.</li>
     * </ul>
     */
    private static void writeUnauthorized(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException) throws IOException {
        Object attribute = request.getAttribute(JwtAuthenticationFilter.JWT_ERROR_ATTRIBUTE);
        String error;
        String message;
        if (JwtAuthenticationFilter.ERROR_TOKEN_EXPIRED.equals(attribute)) {
            error = JwtAuthenticationFilter.ERROR_TOKEN_EXPIRED;
            message = "Access token has expired. Use the refresh token to obtain a new one.";
        } else if (JwtAuthenticationFilter.ERROR_INVALID_TOKEN.equals(attribute)) {
            error = JwtAuthenticationFilter.ERROR_INVALID_TOKEN;
            message = "Access token is invalid. Sign in again.";
        } else {
            error = "unauthorized";
            message = "Authentication required.";
        }

        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE,
                "Bearer realm=\"trentplayer\", error=\"" + error + "\"");
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"error\":\"" + error + "\",\"message\":\"" + message + "\"}");
    }
}
