class AuthService
  class ForbiddenError < StandardError; end

  def self.find_or_create_from_github(auth_hash)
    user = User.find_or_initialize_by(github_id: auth_hash.uid)
    user.update!(
      github_username: auth_hash.info.nickname,
      email: auth_hash.info.email,
      display_name: auth_hash.info.name,
      avatar_url: auth_hash.info.image,
      last_login_at: Time.current
    )

    if user.previously_new_record?
      create_personal_org(user)
      ApiKey.generate_for(user)
    end

    process_pending_invites(user)
    user
  end

  def self.find_or_create_from_gitlab(auth_hash)
    # First try to find by gitlab_id (returning user)
    user = User.find_by(gitlab_id: auth_hash.uid)

    # If not found, try to link to an existing user by email
    if user.nil? && auth_hash.info.email.present?
      user = User.find_by(email: auth_hash.info.email)
    end

    user ||= User.new

    user.update!(
      gitlab_id: auth_hash.uid,
      gitlab_username: auth_hash.info.nickname,
      email: auth_hash.info.email,
      display_name: auth_hash.info.name,
      avatar_url: auth_hash.info.image,
      last_login_at: Time.current
    )

    if user.previously_new_record?
      create_personal_org(user)
      ApiKey.generate_for(user)
    end

    process_pending_invites(user)
    user
  end

  def self.ensure_can_create_org!(user)
    username = user.github_username || user.gitlab_username
    entry = WaitlistEntry.find_by(github_username: username, status: "approved")
    raise ForbiddenError, "Not approved to create organizations" unless entry
  end

  def self.create_personal_org(user)
    username = user.github_username || user.gitlab_username
    slug = username.downcase
    slug = "#{slug}-ax" if Organization::RESERVED_SLUGS.include?(slug)

    org = Organization.create!(
      slug: slug,
      name: user.display_name || username,
      created_by: user,
      is_personal: true
    )

    OrgMembership.create!(
      organization: org,
      user: user,
      role: "owner"
    )
  end

  def self.process_pending_invites(user)
    invites = Invite.none

    if user.github_username.present?
      invites = invites.or(Invite.pending.where(github_username: user.github_username))
    end

    if user.gitlab_username.present?
      invites = invites.or(Invite.pending.where(gitlab_username: user.gitlab_username))
    end

    invites.find_each do |invite|
      invite.accept!(user)
    rescue Invite::MemberLimitReached
      Rails.logger.info("Skipping invite #{invite.id} for #{user.platform_username}: org member limit reached")
    rescue StripeService::Error, Stripe::StripeError => e
      Rails.logger.error("Skipping invite #{invite.id} for #{user.platform_username}: Stripe error: #{e.message}")
    end
  end
end
