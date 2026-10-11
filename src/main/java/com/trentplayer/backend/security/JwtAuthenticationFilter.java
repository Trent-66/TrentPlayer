package com.trentplayer.backend.security;

import com.trentplayer.backend.security.JwtService.TokenType;
import com.trentplayer.backend.security.JwtService.TokenVerification;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    /**
     * Request attribute set when a bearer token was presented but rejected. The value is one of
     * {@link #ERROR_TOKEN_EXPIRED} / {@link #ERROR_INVALID_TOKEN} and is surfaced by the
     * authentication entry point so the client can decide between "refresh" and "log in again".
     */
    public static final String JWT_ERROR_ATTRIBUTE = JwtAuthenticationFilter.class.getName() + ".error";
    public static final String ERROR_TOKEN_EXPIRED = "token_expired";
    public static final String ERROR_INVALID_TOKEN = "invalid_token";

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final UserDetailsService userDetailsService;

    public JwtAuthenticationFilter(JwtService jwtService, UserDetailsService userDetailsService) {
        this.jwtService = jwtService;
        this.userDetailsService = userDetailsService;
    }

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.regionMatches(true, 0, BEARER_PREFIX, 0, BEARER_PREFIX.length())) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = header.substring(BEARER_PREFIX.length()).trim();
        if (token.isEmpty() || SecurityContextHolder.getContext().getAuthentication() != null) {
            filterChain.doFilter(request, response);
            return;
        }

        TokenVerification verification = jwtService.verify(token);
        switch (verification.status()) {
            case EXPIRED -> request.setAttribute(JWT_ERROR_ATTRIBUTE, ERROR_TOKEN_EXPIRED);
            case INVALID -> request.setAttribute(JWT_ERROR_ATTRIBUTE, ERROR_INVALID_TOKEN);
            case VALID -> authenticate(request, verification);
        }

        filterChain.doFilter(request, response);
    }

    private void authenticate(HttpServletRequest request, TokenVerification verification) {
        if (verification.type() != TokenType.ACCESS) {
            // A refresh token is not a bearer credential; only /auth/refresh may consume it.
            request.setAttribute(JWT_ERROR_ATTRIBUTE, ERROR_INVALID_TOKEN);
            return;
        }
        try {
            UserDetails userDetails = userDetailsService.loadUserByUsername(verification.username());
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            userDetails, null, userDetails.getAuthorities());
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authentication);
        } catch (UsernameNotFoundException ex) {
            // Account deleted after the token was issued: the token is signed but unusable.
            SecurityContextHolder.clearContext();
            request.setAttribute(JWT_ERROR_ATTRIBUTE, ERROR_INVALID_TOKEN);
        }
    }
}
