package hooks

import "sync"

var (
	installersMu sync.RWMutex
	installers   []Installer
)

// Register adds an installer to the global registry. Per-agent installer
// packages call this from their init() functions to avoid import cycles
// between the hooks package and its sub-packages.
func Register(i Installer) {
	installersMu.Lock()
	defer installersMu.Unlock()
	installers = append(installers, i)
}

// RegisteredInstallers returns every installer compiled into the binary.
// Order matches registration order (init() call order = import order).
func RegisteredInstallers() []Installer {
	installersMu.RLock()
	defer installersMu.RUnlock()
	out := make([]Installer, len(installers))
	copy(out, installers)
	return out
}
