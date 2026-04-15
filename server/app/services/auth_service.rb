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

  def self.ensure_can_create_org!(user)
    entry = WaitlistEntry.find_by(github_username: user.github_username, status: "approved")
    raise ForbiddenError, "Not approved to create organizations" unless entry
  end

  def self.create_personal_org(user)
    slug = user.github_username.downcase
    slug = "#{slug}-ax" if Organization::RESERVED_SLUGS.include?(slug)

    org = Organization.create!(
      slug: slug,
      name: user.display_name || user.github_username,
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
    Invite.pending.where(github_username: user.github_username).find_each do |invite|
      invite.accept!(user)
    rescue Invite::MemberLimitReached
      Rails.logger.info("Skipping invite #{invite.id} for #{user.github_username}: org member limit reached")
    end
  end
end
