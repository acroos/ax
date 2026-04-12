class PrFile < ApplicationRecord
  belongs_to :pr

  validates :filename, presence: true, uniqueness: { scope: :pr_id }
end
