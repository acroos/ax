// Package server implements the AX team server HTTP API.
// It accepts pushed data from developers, serves metrics to the dashboard,
// and manages API keys for authentication.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/austinroos/ax/internal/db"
	"github.com/austinroos/ax/internal/events"
	"github.com/austinroos/ax/internal/events/adapters"
)

// Server is the AX team HTTP server.
type Server struct {
	store  *db.Store
	mux    *http.ServeMux
	addr   string
}

// New creates a new Server.
func New(store *db.Store, addr string) *Server {
	s := &Server{
		store: store,
		mux:   http.NewServeMux(),
		addr:  addr,
	}
	s.routes()
	return s
}

func (s *Server) routes() {
	// Health (no auth)
	s.mux.HandleFunc("GET /api/v1/health", s.handleHealth)

	// Push (requires auth)
	s.mux.Handle("POST /api/v1/push", s.requireAuth(http.HandlerFunc(s.handlePush)))

	// Read endpoints (require auth)
	s.mux.Handle("GET /api/v1/repos", s.requireAuth(http.HandlerFunc(s.handleListRepos)))
	s.mux.Handle("GET /api/v1/repos/{id}/prs", s.requireAuth(http.HandlerFunc(s.handleListPRs)))
	s.mux.Handle("GET /api/v1/repos/{id}/metrics", s.requireAuth(http.HandlerFunc(s.handleAggregateMetrics)))
	s.mux.Handle("GET /api/v1/repos/{id}/timeline", s.requireAuth(http.HandlerFunc(s.handleTimeline)))
	s.mux.Handle("GET /api/v1/watch-status", s.requireAuth(http.HandlerFunc(s.handleWatchStatus)))

	// Webhook receiver (validated by adapter-specific signatures, not API keys)
	s.mountWebhooks()
}

func (s *Server) mountWebhooks() {
	// Read webhook secrets from environment
	secrets := map[events.Platform]string{}
	if v := os.Getenv("AX_WEBHOOK_GITHUB_SECRET"); v != "" {
		secrets[events.PlatformGitHub] = v
	}

	dispatcher := events.NewDispatcher()
	dispatcher.Register(&events.PRHandler{DB: s.store.DB})

	receiver := events.NewReceiver(events.ReceiverConfig{Secrets: secrets}, dispatcher)
	receiver.RegisterAdapter(&adapters.GitHubAdapter{})

	receiver.Mount(s.mux)
	log.Printf("Webhook receiver mounted at /webhooks/{platform}")
}

// ListenAndServe starts the server with graceful shutdown.
func (s *Server) ListenAndServe() error {
	srv := &http.Server{
		Addr:         s.addr,
		Handler:      s.logging(s.mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("AX server listening on %s", s.addr)
		errCh <- srv.ListenAndServe()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		return err
	case sig := <-sigCh:
		log.Printf("Received %s, shutting down...", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(ctx)
	}
}

// --- Middleware ---

// logging logs each request.
func (s *Server) logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}

type contextKey string

const apiKeyNameKey contextKey = "api_key_name"

// requireAuth validates the API key from the Authorization header.
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing or invalid Authorization header"})
			return
		}

		rawKey := strings.TrimPrefix(auth, "Bearer ")
		keyName, err := db.ValidateAPIKey(s.store.DB, rawKey)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid API key"})
			return
		}

		ctx := context.WithValue(r.Context(), apiKeyNameKey, keyName)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// --- Handlers ---

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func getAPIKeyName(r *http.Request) string {
	if name, ok := r.Context().Value(apiKeyNameKey).(string); ok {
		return name
	}
	return ""
}

func parseIntParam(r *http.Request, name string) (int64, error) {
	s := r.PathValue(name)
	if s == "" {
		return 0, fmt.Errorf("missing path parameter: %s", name)
	}
	var id int64
	_, err := fmt.Sscanf(s, "%d", &id)
	return id, err
}
