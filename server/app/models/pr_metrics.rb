class PrMetrics < ApplicationRecord
  belongs_to :pr

  validates :pr_id, uniqueness: true

  before_update :prevent_settled_github_update

  GITHUB_DERIVED_FIELDS = %w[
    post_open_commits first_pass_accepted ci_success_rate
    diff_churn_lines has_tests line_revisit_rate
  ].freeze

  SESSION_DERIVED_FIELDS = %w[
    messages_per_pr iteration_depth token_cost_usd
    self_correction_rate context_efficiency error_recovery_attempts
    plan_coverage_score plan_deviation_score scope_creep_detected
  ].freeze

  def finalized?
    metrics_finalized?
  end

  # Update session-derived metrics, safe to call on settled PRs.
  def update_session_metrics!(attrs)
    safe_attrs = attrs.slice(*SESSION_DERIVED_FIELDS.map(&:to_sym))
    update!(safe_attrs)
  end

  private

  def prevent_settled_github_update
    return unless metrics_finalized_was && metrics_finalized

    github_changes = changed & GITHUB_DERIVED_FIELDS
    if github_changes.any?
      errors.add(:base, "Settled GitHub metrics cannot be updated: #{github_changes.join(', ')}")
      throw(:abort)
    end
  end
end
