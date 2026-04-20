class AccountDeletionService
  class SoleOwnerError < StandardError
    attr_reader :organizations

    def initialize(organizations)
      @organizations = organizations
      super("User is the sole owner of: #{organizations.map(&:name).join(', ')}")
    end
  end

  def initialize(user)
    @user = user
  end

  def call!
    validate_no_sole_ownership!

    ActiveRecord::Base.transaction do
      anonymize_authored_data!
      reassign_created_by_references!
      destroy_personal_org!
      @user.destroy!
    end
  end

  def sole_owned_orgs
    @sole_owned_orgs ||= find_sole_owned_orgs
  end

  private

  def validate_no_sole_ownership!
    orgs = sole_owned_orgs
    raise SoleOwnerError, orgs if orgs.any?
  end

  def find_sole_owned_orgs
    owned_memberships = @user.org_memberships.where(role: "owner")
    owned_memberships.filter_map do |membership|
      org = membership.organization
      next if org.is_personal
      other_owners = org.org_memberships.where(role: "owner").where.not(user: @user)
      org unless other_owners.exists?
    end
  end

  def anonymize_authored_data!
    username = @user.github_username
    placeholder = "deleted-user"

    Pr.where(author: username).update_all(author: placeholder)
    Commit.where(author: username).update_all(author: placeholder)
    CodingSession.where(pushed_by: username).update_all(pushed_by: placeholder)
  end

  def reassign_created_by_references!
    Organization.where(created_by: @user).where.not(is_personal: true).find_each do |org|
      new_owner = org.org_memberships.where(role: "owner").where.not(user: @user).first&.user
      new_owner ||= org.org_memberships.where.not(user: @user).first&.user
      org.update_columns(created_by_id: new_owner.id) if new_owner
    end
  end

  def destroy_personal_org!
    personal_org = @user.organizations.find_by(is_personal: true)
    personal_org&.destroy!
  end
end
