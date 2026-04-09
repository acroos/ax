class WaitlistController < ApplicationController
  def create
    WaitlistEntry.create!(waitlist_params)
    head :created
  end

  private

  def waitlist_params
    params.permit(:email, :github_username)
  end
end
