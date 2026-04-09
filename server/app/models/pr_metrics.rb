class PrMetrics < ApplicationRecord
  belongs_to :pr

  validates :pr_id, uniqueness: true

  before_update :prevent_finalized_update

  def finalized?
    metrics_finalized?
  end

  private

  def prevent_finalized_update
    if metrics_finalized_was && metrics_finalized
      errors.add(:base, "Finalized metrics cannot be updated")
      throw(:abort)
    end
  end
end
