package ui

import (
	"fmt"
	"sync"
	"time"
)

var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

// Spinner displays an animated spinner with a message.
type Spinner struct {
	msg  string
	stop chan struct{}
	done chan struct{}
	mu   sync.Mutex
}

// NewSpinner creates and starts a spinner with the given message.
func NewSpinner(msg string) *Spinner {
	s := &Spinner{
		msg:  msg,
		stop: make(chan struct{}),
		done: make(chan struct{}),
	}
	go s.run()
	return s
}

func (s *Spinner) run() {
	defer close(s.done)
	i := 0
	ticker := time.NewTicker(80 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-s.stop:
			// Clear the spinner line
			fmt.Printf("\r\033[K")
			return
		case <-ticker.C:
			frame := Highlight.Render(spinnerFrames[i%len(spinnerFrames)])
			fmt.Printf("\r  %s %s", frame, s.msg)
			i++
		}
	}
}

// Stop stops the spinner and prints a completion message.
func (s *Spinner) Stop(msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	select {
	case <-s.stop:
		return // already stopped
	default:
	}

	close(s.stop)
	<-s.done

	if msg != "" {
		StepDone(msg)
	}
}

// StopFail stops the spinner and prints a failure message.
func (s *Spinner) StopFail(msg string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	select {
	case <-s.stop:
		return
	default:
	}

	close(s.stop)
	<-s.done

	if msg != "" {
		StepFail(msg)
	}
}
