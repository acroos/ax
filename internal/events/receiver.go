package events

import (
	"fmt"
	"io"
	"log"
	"net/http"
)

// ReceiverConfig holds webhook configuration.
type ReceiverConfig struct {
	Secrets map[Platform]string // webhook secrets per platform
}

// Receiver handles incoming webhook requests, validates them,
// normalizes events, and dispatches to handlers.
type Receiver struct {
	adapters   map[Platform]Adapter
	dispatcher *Dispatcher
	config     ReceiverConfig
}

// NewReceiver creates a webhook receiver.
func NewReceiver(config ReceiverConfig, dispatcher *Dispatcher) *Receiver {
	return &Receiver{
		adapters:   make(map[Platform]Adapter),
		dispatcher: dispatcher,
		config:     config,
	}
}

// RegisterAdapter adds a platform adapter to the receiver.
func (recv *Receiver) RegisterAdapter(a Adapter) {
	recv.adapters[a.Platform()] = a
}

// Mount registers webhook routes on the given mux.
func (recv *Receiver) Mount(mux *http.ServeMux) {
	mux.HandleFunc("POST /webhooks/{platform}", recv.handleWebhook)
}

func (recv *Receiver) handleWebhook(w http.ResponseWriter, r *http.Request) {
	platformStr := r.PathValue("platform")
	platform := Platform(platformStr)

	adapter, ok := recv.adapters[platform]
	if !ok {
		http.Error(w, fmt.Sprintf("unsupported platform: %s", platformStr), http.StatusNotFound)
		return
	}

	// Read body once for both validation and parsing
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	// Validate signature
	secret := recv.config.Secrets[platform]
	if secret != "" {
		if err := adapter.ValidateRequest(r, body, secret); err != nil {
			log.Printf("Webhook signature validation failed for %s: %v", platform, err)
			http.Error(w, "signature validation failed", http.StatusUnauthorized)
			return
		}
	}

	// Parse events
	events, err := adapter.ParseEvents(r, body)
	if err != nil {
		log.Printf("Failed to parse %s webhook: %v", platform, err)
		http.Error(w, "failed to parse webhook", http.StatusBadRequest)
		return
	}

	// Dispatch events
	for _, evt := range events {
		evt.RawPayload = body
		log.Printf("Webhook event: %s/%s for %s/%s PR#%d", evt.Platform, evt.Type, evt.RepoOwner, evt.RepoName, evt.PRNumber)
		recv.dispatcher.Dispatch(evt)
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"ok":true,"events":%d}`, len(events))
}
