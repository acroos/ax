package parsers

import (
	"bufio"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// PlanAnalysis contains extracted data from a plan file.
type PlanAnalysis struct {
	FilePath     string   // path to the plan file
	PlannedFiles []string // file paths mentioned in the plan
}

// filePathPattern matches strings that look like file paths.
// Captures paths like: src/main.go, internal/db/db.go, app/page.tsx
var filePathPattern = regexp.MustCompile(`(?:^|[\s\x60(])([a-zA-Z][\w\-./]*\.(?:go|ts|tsx|js|jsx|py|rb|rs|java|css|html|json|yaml|yml|toml|md|sql|sh))\b`)

// dirPathPattern matches directory references like: internal/db/, src/app/
var dirPathPattern = regexp.MustCompile(`(?:^|[\s\x60(])([a-zA-Z][\w\-./]*/)(?:\s|$|\x60|\))`)

// ParsePlanFile reads a markdown plan file and extracts mentioned file paths.
func ParsePlanFile(planPath string) (*PlanAnalysis, error) {
	f, err := os.Open(planPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	analysis := &PlanAnalysis{
		FilePath: planPath,
	}

	seen := make(map[string]bool)
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()

		// Extract file paths
		matches := filePathPattern.FindAllStringSubmatch(line, -1)
		for _, m := range matches {
			path := m[1]
			// Filter out version-like strings (0.75, 2.7, etc.) and URLs
			if isVersionNumber(path) || strings.Contains(path, "://") {
				continue
			}
			if !seen[path] {
				analysis.PlannedFiles = append(analysis.PlannedFiles, path)
				seen[path] = true
			}
		}
	}

	return analysis, scanner.Err()
}

// FindPlanFiles finds all markdown files in a plans/ directory.
func FindPlanFiles(repoPath string) ([]string, error) {
	plansDir := filepath.Join(repoPath, "plans")
	if _, err := os.Stat(plansDir); os.IsNotExist(err) {
		return nil, nil
	}

	var files []string
	entries, err := os.ReadDir(plansDir)
	if err != nil {
		return nil, err
	}

	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			files = append(files, filepath.Join(plansDir, e.Name()))
		}
	}
	return files, nil
}

// FindPlanFilesForSession returns plan files that were written or edited
// during a session, resolving relative paths against the project root.
func FindPlanFilesForSession(session *ParsedSession, projectRoot string) []string {
	var plans []string
	seen := make(map[string]bool)
	for _, p := range session.PlanFiles {
		// Try absolute path first
		if _, err := os.Stat(p); err == nil {
			if !seen[p] {
				plans = append(plans, p)
				seen[p] = true
			}
			continue
		}
		// Try relative to project root
		abs := filepath.Join(projectRoot, p)
		if _, err := os.Stat(abs); err == nil {
			if !seen[abs] {
				plans = append(plans, abs)
				seen[abs] = true
			}
		}
	}
	return plans
}

// isVersionNumber returns true for strings like "0.75", "2.7", "3.14.1"
func isVersionNumber(s string) bool {
	if len(s) == 0 {
		return false
	}
	if s[0] >= '0' && s[0] <= '9' {
		return true
	}
	return false
}
