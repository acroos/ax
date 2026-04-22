module MetricDetailAction
  extend ActiveSupport::Concern

  private

  def render_metric_detail(pr_scope:, session_scope:)
    slug = params[:metric_slug]
    unless MetricDetailComputer::ALL_SLUGS.include?(slug)
      return render json: { error: "Unknown metric: #{slug}" }, status: :not_found
    end

    result = MetricDetailComputer.new(
      slug,
      pr_scope: pr_scope,
      session_scope: session_scope,
      window_days: parsed_range
    ).call

    render json: result
  end
end
