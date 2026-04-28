package agents

import "sync"

var (
	providersMu sync.RWMutex
	providers   []Provider
)

// Register adds a provider to the global registry. Sub-packages call this
// from their init() functions to avoid an import cycle between the agents
// package and its sub-packages.
func Register(p Provider) {
	providersMu.Lock()
	defer providersMu.Unlock()
	providers = append(providers, p)
}

// RegisteredProviders returns every provider compiled into the binary.
// Order matches registration order (init() call order = import order in init.go).
func RegisteredProviders() []Provider {
	providersMu.RLock()
	defer providersMu.RUnlock()
	out := make([]Provider, len(providers))
	copy(out, providers)
	return out
}

// FindProvider returns the provider for an AgentID, or nil if unknown.
func FindProvider(id AgentID) Provider {
	for _, p := range RegisteredProviders() {
		if p.ID() == id {
			return p
		}
	}
	return nil
}
