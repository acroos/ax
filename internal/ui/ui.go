// Package ui provides styled CLI output for the ax tool.
package ui

import (
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Colors
var (
	Green   = lipgloss.Color("#34D399")
	Red     = lipgloss.Color("#F87171")
	Yellow  = lipgloss.Color("#FBBF24")
	Blue    = lipgloss.Color("#60A5FA")
	Purple  = lipgloss.Color("#A78BFA")
	Cyan    = lipgloss.Color("#22D3EE")
	Gray    = lipgloss.Color("#6B7280")
	DimGray = lipgloss.Color("#4B5563")
)

// Text styles
var (
	Bold      = lipgloss.NewStyle().Bold(true)
	Faint     = lipgloss.NewStyle().Foreground(Gray)
	Dim       = lipgloss.NewStyle().Foreground(DimGray)
	Success   = lipgloss.NewStyle().Foreground(Green)
	Error     = lipgloss.NewStyle().Foreground(Red)
	Warning   = lipgloss.NewStyle().Foreground(Yellow)
	Info      = lipgloss.NewStyle().Foreground(Blue)
	Highlight = lipgloss.NewStyle().Foreground(Cyan)
	Accent    = lipgloss.NewStyle().Foreground(Purple)
)

// Composite styles
var (
	Header    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#E5E7EB"))
	SubHeader = lipgloss.NewStyle().Bold(true).Foreground(Gray)
	Label     = lipgloss.NewStyle().Foreground(Gray).Width(26)
	Value     = lipgloss.NewStyle().Foreground(lipgloss.Color("#E5E7EB"))
	Code      = lipgloss.NewStyle().Foreground(Cyan)
	URL       = lipgloss.NewStyle().Foreground(Blue).Underline(true)
	Key       = lipgloss.NewStyle().Foreground(Yellow).Bold(true)
)

// Status indicators
func SuccessIcon() string { return Success.Render("✓") }
func ErrorIcon() string   { return Error.Render("✗") }
func WarningIcon() string { return Warning.Render("!") }
func InfoIcon() string    { return Info.Render("•") }
func ArrowIcon() string   { return Faint.Render("→") }

// Println prints styled text to stdout.
func Println(a ...interface{}) {
	fmt.Println(a...)
}

// Printf prints formatted styled text to stdout.
func Printf(format string, a ...interface{}) {
	fmt.Printf(format, a...)
}

// Warnf prints a warning to stderr.
func Warnf(format string, a ...interface{}) {
	fmt.Fprintf(os.Stderr, "  %s %s\n", WarningIcon(), Warning.Render(fmt.Sprintf(format, a...)))
}

// Errorf prints an error to stderr.
func Errorf(format string, a ...interface{}) {
	fmt.Fprintf(os.Stderr, "  %s %s\n", ErrorIcon(), Error.Render(fmt.Sprintf(format, a...)))
}

// Step prints a progress step.
func Step(msg string) {
	fmt.Printf("  %s %s\n", InfoIcon(), msg)
}

// StepDone prints a completed step.
func StepDone(msg string) {
	fmt.Printf("  %s %s\n", SuccessIcon(), msg)
}

// StepFail prints a failed step.
func StepFail(msg string) {
	fmt.Printf("  %s %s\n", ErrorIcon(), msg)
}

// SectionHeader prints a section header with optional subtitle.
func SectionHeader(title string, subtitle ...string) {
	fmt.Println()
	fmt.Printf("  %s", Header.Render(title))
	if len(subtitle) > 0 && subtitle[0] != "" {
		fmt.Printf("  %s", Faint.Render(subtitle[0]))
	}
	fmt.Println()
}

// MetricRow prints a label-value pair for metric display.
func MetricRow(label string, value string) {
	fmt.Printf("  %s %s\n", Label.Render(label), Value.Render(value))
}

// MetricRowColored prints a label-value pair with a colored value.
func MetricRowColored(label string, value string, color lipgloss.Color) {
	styled := lipgloss.NewStyle().Foreground(color)
	fmt.Printf("  %s %s\n", Label.Render(label), styled.Render(value))
}

// TableSep prints a horizontal separator line.
func TableSep(width int) {
	fmt.Printf("  %s\n", Dim.Render(strings.Repeat("─", width)))
}

// NumberedStep prints a numbered step in a multi-step process.
func NumberedStep(current, total int, msg string) {
	step := Faint.Render(fmt.Sprintf("[%d/%d]", current, total))
	fmt.Printf("  %s %s\n", step, msg)
}

// CompleteBanner prints a success banner for completed operations.
func CompleteBanner(msg string) {
	fmt.Printf("\n  %s %s\n", SuccessIcon(), Bold.Render(msg))
}

// FormatCost formats a dollar amount.
func FormatCost(n float64) string {
	if n < 0.01 {
		return "<$0.01"
	}
	return fmt.Sprintf("$%.2f", n)
}

// FormatPct formats a ratio as a percentage.
func FormatPct(n float64) string {
	return fmt.Sprintf("%.0f%%", n*100)
}

// GoodBad returns green for good values, red for bad.
func GoodBad(value float64, threshold float64, higherIsGood bool) lipgloss.Color {
	if higherIsGood {
		if value >= threshold {
			return Green
		}
		return Red
	}
	if value <= threshold {
		return Green
	}
	return Red
}

// YesNo returns a styled yes/no indicator.
func YesNo(val bool) string {
	if val {
		return Success.Render("yes")
	}
	return Faint.Render("no")
}

// Muted returns a muted/gray styled string.
func Muted(s string) string {
	return Faint.Render(s)
}
