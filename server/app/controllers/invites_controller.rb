class InvitesController < ApplicationController
  def show
    invite = Invite.pending.find_by!(token: params[:token])
    dashboard_url = ENV.fetch("DASHBOARD_URL", "http://localhost:3333")

    # Check if user is logged in via session cookie
    token = cookies.signed[:_ax_session]
    session = UserSession.active.find_by(session_token: token)

    if session
      invite.accept!(session.user)
      redirect_to "#{dashboard_url}/#{invite.organization.slug}", allow_other_host: true
    else
      cookies.signed[:pending_invite] = { value: invite.token, expires: 1.hour }
      redirect_to "/auth/github", allow_other_host: true
    end
  end
end
