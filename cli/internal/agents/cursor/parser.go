package cursor

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/austinroos/ax/internal/parsers"
)

type transcriptLine struct {
	Role    string `json:"role"`
	Message struct {
		Content json.RawMessage `json:"content"`
	} `json:"message"`
}

type contentBlock struct {
	Type  string          `json:"type"`
	Text  string          `json:"text,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`
}

var timestampRe = regexp.MustCompile(`<timestamp>([^<]+)</timestamp>`)

// parseTranscript reads a Cursor JSONL transcript and returns a ParsedSession.
// It does NOT extract token usage, sidechain messages, or peak context — Cursor
// does not supply these locally. The capability registry declares them false.
func parseTranscript(path, sessionID string) (*parsers.ParsedSession, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	sess := &parsers.ParsedSession{
		ID:        sessionID,
		ToolCalls: make(map[string]int),
	}

	filesReadSet := make(map[string]bool)
	filesModifiedSet := make(map[string]bool)
	var lastWasUser bool

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	for scanner.Scan() {
		var line transcriptLine
		if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
			continue // skip malformed lines
		}
		var blocks []contentBlock
		if err := json.Unmarshal(line.Message.Content, &blocks); err != nil {
			continue
		}

		switch line.Role {
		case "user":
			sess.HumanMessages++
			lastWasUser = true
			// Timestamps are embedded in user message text as <timestamp>...</timestamp>.
			// Only the first text block is checked — that's where Cursor puts timestamps.
			for _, b := range blocks {
				if b.Type == "text" {
					if ts := extractFirstTimestamp(b.Text); ts > 0 {
						if sess.StartedAt == 0 || ts < sess.StartedAt {
							sess.StartedAt = ts
						}
						if ts > sess.EndedAt {
							sess.EndedAt = ts
						}
					}
					break
				}
			}

		case "assistant":
			sess.AssistantMessages++
			if lastWasUser {
				sess.TurnCount++
				lastWasUser = false
			}
			for _, b := range blocks {
				if b.Type != "tool_use" {
					continue
				}
				sess.ToolCalls[b.Name]++
				applyTool(b, sess, filesReadSet, filesModifiedSet)
			}
		}
	}
	if err := scanner.Err(); err != nil && err != io.EOF {
		return nil, err
	}

	for f := range filesReadSet {
		sess.FilesRead = append(sess.FilesRead, f)
	}
	for f := range filesModifiedSet {
		sess.FilesModified = append(sess.FilesModified, f)
	}

	// Tally total tool calls from the per-name map.
	for _, count := range sess.ToolCalls {
		sess.TotalToolCalls += count
	}

	return sess, nil
}

// extractFirstTimestamp extracts the first <timestamp>...</timestamp> value
// from a user message text and returns it as Unix milliseconds.
// Returns 0 if no valid RFC3339 timestamp is found.
func extractFirstTimestamp(text string) int64 {
	m := timestampRe.FindStringSubmatch(text)
	if len(m) < 2 {
		return 0
	}
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(m[1]))
	if err != nil {
		return 0
	}
	return t.UnixMilli()
}

// applyTool updates sess and the read/modified sets based on a single tool_use block.
func applyTool(b contentBlock, sess *parsers.ParsedSession, reads, mods map[string]bool) {
	switch b.Name {
	case "ReadFile":
		var inp struct {
			Path string `json:"path"`
		}
		if json.Unmarshal(b.Input, &inp) == nil && inp.Path != "" {
			reads[inp.Path] = true
			sess.TotalFileReads++
		}

	case "Glob":
		// Glob doesn't read specific files — not counted toward FilesRead.

	case "ApplyPatch":
		var inp struct {
			Patch string `json:"patch"`
		}
		if json.Unmarshal(b.Input, &inp) == nil {
			for _, p := range ParseApplyPatch(inp.Patch) {
				mods[p] = true
			}
		}

	case "Shell":
		// PR URLs and commit SHAs are NOT extracted from Shell calls.
		// Cursor excludes tool_result lines from the transcript by design,
		// so the command output is not available. See research doc.
	}
}
