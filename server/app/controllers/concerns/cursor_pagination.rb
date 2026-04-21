module CursorPagination
  extend ActiveSupport::Concern

  DEFAULT_PER_PAGE = 25
  MAX_PER_PAGE = 100

  private

  # Paginates an ActiveRecord relation using cursor-based pagination.
  # The relation MUST be ordered by (created_at DESC, id DESC) before calling.
  #
  # Accepts query params:
  #   cursor   – opaque cursor from a previous response's next_cursor
  #   per_page – number of records per page (default 25, max 100)
  #
  # Returns a hash:
  #   { data: [...], pagination: { next_cursor:, has_more:, total: } }
  def paginate(relation)
    per_page = parse_per_page
    total = relation.count

    if params[:cursor].present?
      relation = apply_cursor(relation, params[:cursor])
    end

    records = relation.limit(per_page + 1).to_a
    has_more = records.size > per_page
    records = records.first(per_page)

    next_cursor = has_more ? encode_cursor(records.last) : nil

    { records: records, next_cursor: next_cursor, has_more: has_more, total: total }
  end

  def parse_per_page
    requested = params[:per_page].to_i
    requested = DEFAULT_PER_PAGE if requested <= 0
    [ requested, MAX_PER_PAGE ].min
  end

  def encode_cursor(record)
    ts = record.created_at.utc.iso8601(6)
    Base64.urlsafe_encode64("#{ts}_#{record.id}", padding: false)
  end

  def decode_cursor(cursor_string)
    decoded = Base64.urlsafe_decode64(cursor_string)
    last_underscore = decoded.rindex("_")
    raise ActionController::BadRequest, "Invalid cursor" unless last_underscore
    ts_str = decoded[0...last_underscore]
    id_str = decoded[(last_underscore + 1)..]
    [ Time.iso8601(ts_str), id_str.to_i ]
  rescue ArgumentError, TypeError
    raise ActionController::BadRequest, "Invalid cursor"
  end

  def apply_cursor(relation, cursor_string)
    cursor_time, cursor_id = decode_cursor(cursor_string)
    relation.where(
      "(prs.created_at < :ts) OR (prs.created_at = :ts AND prs.id < :id)",
      ts: cursor_time, id: cursor_id
    )
  end
end
