class Commit < ApplicationRecord
  self.primary_key = "sha"

  belongs_to :repo
  belongs_to :pr, optional: true
  belongs_to :coding_session, foreign_key: "session_id", optional: true

  validates :sha, presence: true, uniqueness: true
end
