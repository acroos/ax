// Package watch handles system-level scheduling for ax watch via launchd (macOS) and cron (Linux).
package watch

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	launchdLabel = "com.ax.watch"
	cronMarker   = "# ax-watch-auto"
)

// Install sets up a system-level scheduled job to run `ax watch --once`.
func Install(axBinary string, intervalSeconds int) error {
	switch runtime.GOOS {
	case "darwin":
		return installLaunchd(axBinary, intervalSeconds)
	case "linux":
		return installCron(axBinary, intervalSeconds)
	default:
		return fmt.Errorf("unsupported platform: %s (supported: darwin, linux)", runtime.GOOS)
	}
}

// Uninstall removes the system-level scheduled job.
func Uninstall() error {
	switch runtime.GOOS {
	case "darwin":
		return uninstallLaunchd()
	case "linux":
		return uninstallCron()
	default:
		return fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}
}

// IsInstalled returns true if a system-level watch job is configured.
func IsInstalled() bool {
	switch runtime.GOOS {
	case "darwin":
		return isLaunchdInstalled()
	case "linux":
		return isCronInstalled()
	default:
		return false
	}
}

// --- macOS launchd ---

func plistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", launchdLabel+".plist")
}

func installLaunchd(axBinary string, intervalSeconds int) error {
	// Unload existing if present
	if isLaunchdInstalled() {
		exec.Command("launchctl", "unload", plistPath()).Run()
	}

	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>%s</string>
    <key>ProgramArguments</key>
    <array>
        <string>%s</string>
        <string>watch</string>
        <string>--once</string>
    </array>
    <key>StartInterval</key>
    <integer>%d</integer>
    <key>StandardOutPath</key>
    <string>/tmp/ax-watch.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ax-watch.log</string>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`, launchdLabel, axBinary, intervalSeconds)

	dir := filepath.Dir(plistPath())
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("failed to create LaunchAgents directory: %w", err)
	}

	if err := os.WriteFile(plistPath(), []byte(plist), 0o644); err != nil {
		return fmt.Errorf("failed to write plist: %w", err)
	}

	cmd := exec.Command("launchctl", "load", plistPath())
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to load plist: %s: %w", string(out), err)
	}

	return nil
}

func uninstallLaunchd() error {
	if !isLaunchdInstalled() {
		return nil
	}

	exec.Command("launchctl", "unload", plistPath()).Run()

	if err := os.Remove(plistPath()); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove plist: %w", err)
	}

	return nil
}

func isLaunchdInstalled() bool {
	_, err := os.Stat(plistPath())
	return err == nil
}

// --- Linux cron ---

func installCron(axBinary string, intervalSeconds int) error {
	// Convert seconds to minutes (minimum 1)
	intervalMinutes := intervalSeconds / 60
	if intervalMinutes < 1 {
		intervalMinutes = 1
	}

	cronEntry := fmt.Sprintf("*/%d * * * * %s watch --once %s", intervalMinutes, axBinary, cronMarker)

	// Remove existing ax-watch entry, then add the new one
	existing, err := currentCrontab()
	if err != nil {
		return err
	}

	filtered := filterCronEntries(existing, cronMarker)
	filtered = append(filtered, cronEntry)

	return writeCrontab(strings.Join(filtered, "\n") + "\n")
}

func uninstallCron() error {
	existing, err := currentCrontab()
	if err != nil {
		return err
	}

	filtered := filterCronEntries(existing, cronMarker)
	if len(filtered) == 0 {
		return writeCrontab("")
	}

	return writeCrontab(strings.Join(filtered, "\n") + "\n")
}

func isCronInstalled() bool {
	existing, err := currentCrontab()
	if err != nil {
		return false
	}
	for _, line := range existing {
		if strings.Contains(line, cronMarker) {
			return true
		}
	}
	return false
}

func currentCrontab() ([]string, error) {
	out, err := exec.Command("crontab", "-l").Output()
	if err != nil {
		// No crontab for user is normal
		return nil, nil
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 1 && lines[0] == "" {
		return nil, nil
	}
	return lines, nil
}

func filterCronEntries(lines []string, marker string) []string {
	var result []string
	for _, line := range lines {
		if !strings.Contains(line, marker) {
			result = append(result, line)
		}
	}
	return result
}

func writeCrontab(content string) error {
	cmd := exec.Command("crontab", "-")
	cmd.Stdin = strings.NewReader(content)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("failed to write crontab: %s: %w", string(out), err)
	}
	return nil
}
