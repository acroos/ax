# Configures CodingSession with the registry-driven inclusion validator.
# We use a Rails validation rather than a CHECK constraint so the valid set
# is derived from agents.yaml (one source of truth).
Rails.application.config.to_prepare do
  CodingSession.validates :agent_type, inclusion: { in: AgentRegistry::VALID_IDS }
end
