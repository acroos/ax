class Pr < ApplicationRecord
  belongs_to :repo
  has_many :commits, dependent: :destroy
  has_one :pr_metrics, dependent: :destroy
  has_many :session_prs, dependent: :destroy
  has_many :coding_sessions, through: :session_prs
  has_many :pr_files, dependent: :destroy
  has_many :plan_analyses, dependent: :destroy

  validates :number, presence: true, uniqueness: { scope: :repo_id }
end
