package cursor

import (
	"bufio"
	"strings"
)

// ParseApplyPatch extracts file paths modified by a Cursor ApplyPatch tool call.
//
// The patch format is text-based:
//
//	*** Begin Patch
//	*** Update File: <path>   (or "Add File:", "Delete File:")
//	@@ ...
//	<diff lines>
//	*** End Patch
//
// Multiple file sections per patch are common. All three marker types
// (Update, Add, Delete) are treated as modifications for the purpose of
// counting FilesModified — we don't distinguish create vs. update vs. delete.
func ParseApplyPatch(patch string) []string {
	var paths []string
	scanner := bufio.NewScanner(strings.NewReader(patch))
	for scanner.Scan() {
		line := scanner.Text()
		for _, prefix := range []string{
			"*** Update File: ",
			"*** Add File: ",
			"*** Delete File: ",
		} {
			if strings.HasPrefix(line, prefix) {
				path := strings.TrimSpace(strings.TrimPrefix(line, prefix))
				if path != "" {
					paths = append(paths, path)
				}
				break
			}
		}
	}
	return paths
}
