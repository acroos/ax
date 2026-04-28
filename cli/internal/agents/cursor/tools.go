package cursor

// Cursor's tool taxonomy. Categories match AX's internal taxonomy:
//
//	Read:   ReadFile, Glob
//	Modify: ApplyPatch (unified create + edit + delete)
//	Shell:  Shell
//
// Cursor has no subagent or skill tool as of April 2026.
// MCP naming TBD; if observed in real transcripts, add prefix-detection in parser.go.
//
// Categorization is applied inline in parser.go's applyTool function.
// This file documents the mapping for maintainability; there is no runtime
// lookup table (categorization is baked into the applyTool switch).
