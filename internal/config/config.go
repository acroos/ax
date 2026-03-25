// Package config manages AX configuration for local and team modes.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Config holds AX configuration settings.
type Config struct {
	Mode      string `json:"mode"`                 // "local" or "team"
	ServerURL string `json:"server_url,omitempty"`  // team server URL (e.g. "https://ax.internal.company.com:8080")
	APIKey    string `json:"api_key,omitempty"`     // API key for team server
	UserName  string `json:"user_name,omitempty"`   // developer name for attribution
}

// DefaultConfigPath returns the path to the config file (~/.ax/config.json).
func DefaultConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to get home directory: %w", err)
	}
	return filepath.Join(home, ".ax", "config.json"), nil
}

// LoadConfig reads the config file. Returns a local-mode config if the file doesn't exist.
func LoadConfig() (*Config, error) {
	path, err := DefaultConfigPath()
	if err != nil {
		return defaultConfig(), nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultConfig(), nil
		}
		return nil, fmt.Errorf("failed to read config: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	if cfg.Mode == "" {
		cfg.Mode = "local"
	}

	return &cfg, nil
}

// SaveConfig writes the config to disk.
func SaveConfig(cfg *Config) error {
	path, err := DefaultConfigPath()
	if err != nil {
		return err
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

// IsTeamMode returns true if the config is set to team mode.
func (c *Config) IsTeamMode() bool {
	return c.Mode == "team"
}

func defaultConfig() *Config {
	return &Config{Mode: "local"}
}
