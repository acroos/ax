package bulk

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/austinroos/ax/internal/api"
	"github.com/austinroos/ax/internal/parsers"
	"github.com/austinroos/ax/internal/push"
	"github.com/austinroos/ax/internal/ui"
	"github.com/mattn/go-isatty"
)

// ChunkSize is the maximum number of sessions per push payload.
const ChunkSize = 100

// DefaultConcurrency is the default number of parallel repo workers.
const DefaultConcurrency = 3

// BulkPushConfig holds configuration for a bulk push operation.
type BulkPushConfig struct {
	Client      *push.Client
	Repos       []DiscoveredRepo
	Concurrency int
	Writer      io.Writer
}

// RepoResult holds the outcome of pushing one repo.
type RepoResult struct {
	OwnerRepo    string
	RepoPath     string // first project path (for retry hint)
	SessionsSent int
	TotalSessions int
	FailedChunks []ChunkFailure
}

// ChunkFailure records a failed chunk push.
type ChunkFailure struct {
	ChunkIndex int
	SessionIDs []string
	Err        error
}

// BulkPushResult holds the aggregate outcome.
type BulkPushResult struct {
	Results     []RepoResult
	TotalSent   int
	TotalFailed int
	ReposPushed int
	ReposFailed int
}

// repoStatus represents the state of a repo in the progress display.
type repoStatus int

const (
	statusPending repoStatus = iota
	statusPushing
	statusDone
	statusFailed
)

// repoProgress tracks the display state for one repo.
type repoProgress struct {
	ownerRepo     string
	status        repoStatus
	sessionsSent  int
	sessionsTotal int
}

// progressState tracks the display state for the bulk push UI.
type progressState struct {
	mu    sync.Mutex
	repos []repoProgress
	isTTY bool
	w     io.Writer
}

func newProgressState(repos []DiscoveredRepo, w io.Writer) *progressState {
	ps := &progressState{
		repos: make([]repoProgress, len(repos)),
		w:     w,
	}

	// Detect if output is a TTY.
	if f, ok := w.(*os.File); ok {
		ps.isTTY = isatty.IsTerminal(f.Fd()) || isatty.IsCygwinTerminal(f.Fd())
	}

	for i, r := range repos {
		ps.repos[i] = repoProgress{
			ownerRepo:     r.OwnerRepo,
			sessionsTotal: len(r.SessionFiles),
		}
	}
	return ps
}

// printInitial prints the initial progress display.
func (ps *progressState) printInitial() {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	for i := range ps.repos {
		ps.printLine(i)
	}
}

// update changes a repo's state and redraws.
func (ps *progressState) update(idx int, status repoStatus, sent int) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	ps.repos[idx].status = status
	ps.repos[idx].sessionsSent = sent

	if ps.isTTY {
		// Move cursor up to the repo's line and redraw.
		linesUp := len(ps.repos) - idx
		fmt.Fprintf(ps.w, "\033[%dA", linesUp)
		ps.printLine(idx)
		// Move cursor back down.
		linesDown := linesUp - 1
		if linesDown > 0 {
			fmt.Fprintf(ps.w, "\033[%dB", linesDown)
		}
	} else {
		// Non-TTY: only print on completion/failure.
		if status == statusDone || status == statusFailed {
			ps.printLine(idx)
		}
	}
}

// printLine prints a single repo line.
func (ps *progressState) printLine(idx int) {
	r := ps.repos[idx]

	// Pad the repo name to align counts.
	name := r.ownerRepo
	if len(name) > 35 {
		name = name[:35]
	}
	padded := fmt.Sprintf("%-35s", name)

	switch r.status {
	case statusPending:
		if ps.isTTY {
			fmt.Fprintf(ps.w, "\r\033[K  %s %s %s\n",
				ui.Faint.Render(" "),
				ui.Faint.Render(padded),
				ui.Faint.Render("pending"))
		}
	case statusPushing:
		fmt.Fprintf(ps.w, "\r\033[K  %s %s %s\n",
			ui.Highlight.Render("⠹"),
			padded,
			ui.Faint.Render(fmt.Sprintf("pushing (%d/%d)...", r.sessionsSent, r.sessionsTotal)))
	case statusDone:
		fmt.Fprintf(ps.w, "\r\033[K  %s %s %s\n",
			ui.SuccessIcon(),
			padded,
			fmt.Sprintf("%d sessions", r.sessionsTotal))
	case statusFailed:
		sent := r.sessionsSent
		total := r.sessionsTotal
		fmt.Fprintf(ps.w, "\r\033[K  %s %s %s\n",
			ui.ErrorIcon(),
			padded,
			ui.Error.Render(fmt.Sprintf("%d/%d sessions failed", total-sent, total)))
	}
}

// BulkPush executes the bulk push with parallel workers and progress display.
func BulkPush(cfg *BulkPushConfig) *BulkPushResult {
	progress := newProgressState(cfg.Repos, cfg.Writer)
	progress.printInitial()

	results := make([]RepoResult, len(cfg.Repos))

	concurrency := cfg.Concurrency
	if concurrency <= 0 {
		concurrency = DefaultConcurrency
	}
	if concurrency > len(cfg.Repos) {
		concurrency = len(cfg.Repos)
	}

	work := make(chan int, len(cfg.Repos))
	for i := range cfg.Repos {
		work <- i
	}
	close(work)

	var wg sync.WaitGroup
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range work {
				results[idx] = pushRepo(cfg.Client, cfg.Repos[idx], idx, progress)
			}
		}()
	}
	wg.Wait()

	// Compute aggregates.
	result := &BulkPushResult{Results: results}
	for _, r := range results {
		result.TotalSent += r.SessionsSent
		failed := r.TotalSessions - r.SessionsSent
		result.TotalFailed += failed
		if len(r.FailedChunks) > 0 {
			result.ReposFailed++
		} else {
			result.ReposPushed++
		}
	}
	return result
}

// pushRepo handles pushing all sessions for a single repo in chunks.
func pushRepo(client *push.Client, repo DiscoveredRepo, idx int, progress *progressState) RepoResult {
	result := RepoResult{
		OwnerRepo: repo.OwnerRepo,
		RepoPath:  repo.ProjectPaths[0],
	}

	// Parse all sessions.
	var sessions []api.SessionData
	for _, sf := range repo.SessionFiles {
		session, err := parsers.ParseSession(sf)
		if err != nil {
			continue
		}
		sessions = append(sessions, api.SessionData{
			ID:                       session.ID,
			Branch:                   session.Branch,
			StartedAt:                session.StartedAt,
			EndedAt:                  session.EndedAt,
			MessageCount:             session.HumanMessages,
			TurnCount:                session.TurnCount,
			InputTokens:              session.InputTokens,
			OutputTokens:             session.OutputTokens,
			CacheCreationInputTokens: session.CacheCreationInputTokens,
			CacheReadInputTokens:     session.CacheReadInputTokens,
			TotalCostUSD:             session.TotalCostUSD,
			PrimaryModel:             session.PrimaryModel,
		})
	}

	result.TotalSessions = len(sessions)
	progress.update(idx, statusPushing, 0)

	if len(sessions) == 0 {
		progress.update(idx, statusDone, 0)
		return result
	}

	chunks := ChunkSessions(sessions)
	sent := 0

	for ci, chunk := range chunks {
		payload := &api.PushPayload{
			RepoPath: repo.ProjectPaths[0],
			Owner:    repo.Owner,
			Repo:     repo.Repo,
			Sessions: chunk,
		}

		_, err := client.Push(payload)
		if err != nil {
			ids := make([]string, len(chunk))
			for i, s := range chunk {
				ids[i] = s.ID
			}
			result.FailedChunks = append(result.FailedChunks, ChunkFailure{
				ChunkIndex: ci + 1,
				SessionIDs: ids,
				Err:        err,
			})
		} else {
			sent += len(chunk)
		}
		progress.update(idx, statusPushing, sent)
	}

	result.SessionsSent = sent
	if len(result.FailedChunks) > 0 {
		progress.update(idx, statusFailed, sent)
	} else {
		progress.update(idx, statusDone, sent)
	}

	return result
}

// ChunkSessions splits sessions into batches of ChunkSize.
func ChunkSessions(sessions []api.SessionData) [][]api.SessionData {
	if len(sessions) == 0 {
		return nil
	}

	var chunks [][]api.SessionData
	for i := 0; i < len(sessions); i += ChunkSize {
		end := i + ChunkSize
		if end > len(sessions) {
			end = len(sessions)
		}
		chunks = append(chunks, sessions[i:end])
	}
	return chunks
}

// WriteErrorLog writes failure details to ~/.ax/logs/bulk-push-<timestamp>.log.
// Returns the path to the log file.
func WriteErrorLog(result *BulkPushResult) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("could not find home directory: %w", err)
	}

	logDir := filepath.Join(home, ".ax", "logs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return "", fmt.Errorf("could not create log directory: %w", err)
	}

	timestamp := time.Now().Format("2006-01-02T15-04-05")
	logPath := filepath.Join(logDir, fmt.Sprintf("bulk-push-%s.log", timestamp))

	var b strings.Builder
	fmt.Fprintf(&b, "AX Bulk Push Error Log — %s\n\n", time.Now().Format("2006-01-02T15:04:05"))

	for _, r := range result.Results {
		if len(r.FailedChunks) == 0 {
			continue
		}

		fmt.Fprintf(&b, "FAILED: %s\n", r.OwnerRepo)
		fmt.Fprintf(&b, "  Repo path: %s\n", r.RepoPath)
		fmt.Fprintf(&b, "  Sessions sent: %d/%d\n", r.SessionsSent, r.TotalSessions)

		for _, cf := range r.FailedChunks {
			fmt.Fprintf(&b, "  Chunk %d failed (%d sessions): %v\n", cf.ChunkIndex, len(cf.SessionIDs), cf.Err)
		}

		fmt.Fprintf(&b, "\n  Retry with: ax push --repo %s\n\n", r.RepoPath)
	}

	if err := os.WriteFile(logPath, []byte(b.String()), 0o644); err != nil {
		return "", fmt.Errorf("could not write error log: %w", err)
	}

	return logPath, nil
}
