class OrgService
  def self.create_org(user, params)
    org = Organization.create!(
      slug: params[:slug],
      name: params[:name],
      created_by: user
    )

    OrgMembership.create!(
      organization: org,
      user: user,
      role: "owner"
    )

    WaitlistEntry
      .where(github_username: user.github_username, status: "approved")
      .update_all(status: "joined")

    org
  end
end
