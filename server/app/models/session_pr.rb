class SessionPr < ApplicationRecord
  belongs_to :coding_session, foreign_key: "session_id"
  belongs_to :pr

  validates :confidence, presence: true
  validates :session_id, uniqueness: { scope: :pr_id }
end
