// Package agentinit wires all agent providers into the agents registry.
// Import it with a blank import to trigger provider registration:
//
//	import _ "github.com/austinroos/ax/internal/agentinit"
package agentinit

import (
	_ "github.com/austinroos/ax/internal/agents/claude"
	_ "github.com/austinroos/ax/internal/agents/copilot"
)
