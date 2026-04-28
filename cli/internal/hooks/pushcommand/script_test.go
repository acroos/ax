package pushcommand_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/austinroos/ax/internal/hooks/pushcommand"
)

func TestBuild_WithWorktreeMarker(t *testing.T) {
	out := pushcommand.Build(pushcommand.Spec{
		AxBinary:       "/usr/local/bin/ax",
		WorktreeMarker: "/.claude/worktrees/",
	})
	if !strings.Contains(out, `sed -n "s|/\.claude/worktrees/.*||p"`) {
		t.Errorf("expected worktree fallback sed block in output, got:\n%s", out)
	}
	if !strings.Contains(out, "else") {
		t.Errorf("expected 'else' branch for worktree fallback, got:\n%s", out)
	}
}

func TestBuild_WithoutWorktreeMarker(t *testing.T) {
	out := pushcommand.Build(pushcommand.Spec{
		AxBinary:       "/usr/local/bin/ax",
		WorktreeMarker: "",
	})
	if strings.Contains(out, "worktrees") {
		t.Errorf("expected no worktree fallback when WorktreeMarker is empty, got:\n%s", out)
	}
	if strings.Contains(out, "sed") {
		t.Errorf("expected no sed worktree resolution when WorktreeMarker is empty, got:\n%s", out)
	}
}

func TestBuild_CustomLogPath(t *testing.T) {
	out := pushcommand.Build(pushcommand.Spec{
		AxBinary: "/usr/local/bin/ax",
		LogPath:  "/tmp/custom.log",
	})
	if !strings.Contains(out, `/tmp/custom.log`) {
		t.Errorf("expected custom log path in output, got:\n%s", out)
	}
	if strings.Contains(out, `$HOME/.ax/push.log`) {
		t.Errorf("expected default log path to be overridden, got:\n%s", out)
	}
}

func TestBuild_DefaultLogPath(t *testing.T) {
	out := pushcommand.Build(pushcommand.Spec{
		AxBinary: "/usr/local/bin/ax",
	})
	if !strings.Contains(out, `$HOME/.ax/push.log`) {
		t.Errorf("expected default log path when LogPath is empty, got:\n%s", out)
	}
}

func TestBuild_ShellParseable(t *testing.T) {
	for _, tc := range []struct {
		name string
		spec pushcommand.Spec
	}{
		{
			name: "with worktree marker",
			spec: pushcommand.Spec{AxBinary: "/usr/local/bin/ax", WorktreeMarker: "/.claude/worktrees/"},
		},
		{
			name: "without worktree marker",
			spec: pushcommand.Spec{AxBinary: "/usr/local/bin/ax"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			out := pushcommand.Build(tc.spec)
			// bash -n parses the script without executing it.
			cmd := exec.Command("bash", "-n", "-c", out)
			if err := cmd.Run(); err != nil {
				t.Errorf("bash -n failed for %q: %v\nscript:\n%s", tc.name, err, out)
			}
		})
	}
}

func TestBuild_GoldenFileClaude(t *testing.T) {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("could not determine test file path")
	}
	testdataDir := filepath.Join(filepath.Dir(file), "testdata")
	goldenPath := filepath.Join(testdataDir, "expected_claude.sh")

	golden, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("failed to read golden file %s: %v", goldenPath, err)
	}

	got := pushcommand.Build(pushcommand.Spec{
		AxBinary:       "/usr/local/bin/ax",
		WorktreeMarker: "/.claude/worktrees/",
	})

	if got != string(golden) {
		t.Errorf("Build output does not match golden file %s\ngot:\n%s\nwant:\n%s", goldenPath, got, string(golden))
	}
}
