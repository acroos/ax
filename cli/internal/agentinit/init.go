// Package agentinit wires all agent providers and hook installers into their
// respective registries. Import it with a blank import to trigger registration:
//
//	import _ "github.com/austinroos/ax/internal/agentinit"
package agentinit

import (
	_ "github.com/austinroos/ax/internal/agents/claude"
	_ "github.com/austinroos/ax/internal/agents/copilot"
	_ "github.com/austinroos/ax/internal/hooks/claude"
	_ "github.com/austinroos/ax/internal/hooks/copilot"
)
