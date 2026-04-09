class CodingSession < ApplicationRecord
  self.table_name = "sessions"
  self.primary_key = "id"

  belongs_to :repo, optional: true
  has_many :session_prs, foreign_key: "session_id", dependent: :destroy
  has_many :prs, through: :session_prs
  has_many :commits, foreign_key: "session_id", dependent: :nullify
end
