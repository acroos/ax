# AX — Agentic Coding DX Metrics
# Root Justfile for cross-project commands

# List available recipes
default:
    @just --list

# --- CLI (Go) ---

# Build the CLI
cli-build:
    cd cli && just build

# Run CLI tests
cli-test *args:
    cd cli && just test {{args}}

# Lint the CLI
cli-lint:
    cd cli && just lint

# Format CLI code
cli-fmt:
    cd cli && just fmt

# --- Server (Rails) ---

# Start the Rails dev server
server-dev:
    cd server && bin/dev

# Run server tests
server-test *args:
    cd server && bundle exec rspec {{args}}

# Run server console
server-console:
    cd server && bin/rails console

# Run server linter
server-lint:
    cd server && bin/rubocop

# Run pending migrations
server-migrate:
    cd server && bin/rails db:migrate

# --- Dashboard (Next.js) ---

# Start the dashboard dev server
dashboard-dev:
    cd dashboard && npm run dev

# Build the dashboard
dashboard-build:
    cd dashboard && npm run build

# --- Cross-project ---

# Run all tests across all projects
test:
    just cli-test
    just server-test

# Lint all projects
lint:
    just cli-lint
    just server-lint
