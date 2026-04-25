class Organization < ApplicationRecord
  has_many :org_memberships, dependent: :destroy
  has_many :users, through: :org_memberships
  has_many :repos, dependent: :destroy
  has_many :github_installations, dependent: :destroy
  has_one :gitlab_connection, dependent: :destroy
  has_many :invites, dependent: :destroy
  has_many :teams, dependent: :destroy
  has_one :subscription, dependent: :destroy
  belongs_to :created_by, class_name: "User"

  validates :slug, presence: true, uniqueness: true,
            format: { with: /\A[a-z][a-z0-9-]*[a-z0-9]\z/ },
            length: { in: 3..40 }
  validates :name, presence: true
  validate :slug_not_reserved
  validate :no_consecutive_hyphens

  def plan_service
    @plan_service ||= PlanService.for(self)
  end

  def enforce_free_plan_limits!
    transaction do
      non_owner = org_memberships.where.not(role: "owner")
      removed_user_ids = non_owner.pluck(:user_id)
      non_owner.delete_all
      invites.delete_all
      UserSession.where(user_id: removed_user_ids).delete_all if removed_user_ids.any?
    end
  end

  RESERVED_SLUGS = %w[
    admin api app auth billing dashboard docs help internal
    login logout new null settings status support system
    undefined webhook webhooks www
  ].freeze

  private

  def slug_not_reserved
    errors.add(:slug, "is reserved") if RESERVED_SLUGS.include?(slug)
  end

  def no_consecutive_hyphens
    errors.add(:slug, "cannot contain consecutive hyphens") if slug&.include?("--")
  end
end
