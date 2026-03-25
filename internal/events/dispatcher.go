package events

import "log"

// Handler processes a normalized event.
type Handler interface {
	// HandleEvent processes a single event. Called by the dispatcher.
	HandleEvent(evt Event) error

	// AcceptsType returns true if this handler should receive the given event type.
	AcceptsType(t EventType) bool
}

// Dispatcher routes events to registered handlers.
type Dispatcher struct {
	handlers []Handler
}

// NewDispatcher creates a new event dispatcher.
func NewDispatcher() *Dispatcher {
	return &Dispatcher{}
}

// Register adds a handler to the dispatcher.
func (d *Dispatcher) Register(h Handler) {
	d.handlers = append(d.handlers, h)
}

// Dispatch sends an event to all handlers that accept its type.
func (d *Dispatcher) Dispatch(evt Event) {
	for _, h := range d.handlers {
		if h.AcceptsType(evt.Type) {
			if err := h.HandleEvent(evt); err != nil {
				log.Printf("Event handler error (%s/%s): %v", evt.Platform, evt.Type, err)
			}
		}
	}
}
