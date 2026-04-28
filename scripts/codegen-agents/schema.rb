module Schema
  class Error < StandardError; end

  VALID_ID_RE = /\A[a-z][a-z0-9_]*\z/
  HEX_COLOR_RE = /\A#[0-9a-fA-F]{6}\z/
  VALID_SCOPES = %w[user repo].freeze

  def self.validate!(raw)
    raise Error, "top-level must be a Hash" unless raw.is_a?(Hash)
    raise Error, "missing schema_version" unless raw.key?("schema_version")
    raise Error, "missing field_keys" unless raw.key?("field_keys")
    raise Error, "missing metric_slugs" unless raw.key?("metric_slugs")
    raise Error, "missing agents" unless raw.key?("agents")

    field_keys = raw["field_keys"]
    metric_slugs = raw["metric_slugs"]
    agents = raw["agents"]

    raise Error, "field_keys must be an Array" unless field_keys.is_a?(Array)
    raise Error, "metric_slugs must be an Array" unless metric_slugs.is_a?(Array)
    raise Error, "agents must be a Hash" unless agents.is_a?(Hash)
    raise Error, "agents must not be empty" if agents.empty?

    agents.each do |id, meta|
      validate_id!(id)
      validate_agent!(id, meta, field_keys, metric_slugs)
    end
  end

  def self.validate_id!(id)
    unless id.is_a?(String) && id.match?(VALID_ID_RE)
      raise Error, "agent id #{id.inspect} must be lowercase snake_case matching #{VALID_ID_RE.source}"
    end
  end

  def self.validate_agent!(id, meta, field_keys, metric_slugs)
    raise Error, "agent #{id}: meta must be a Hash" unless meta.is_a?(Hash)

    %w[label color home_dir_env home_dir_default hook_scopes fields metrics].each do |key|
      raise Error, "agent #{id}: missing required key #{key.inspect}" unless meta.key?(key)
    end

    unless meta["color"].is_a?(String) && meta["color"].match?(HEX_COLOR_RE)
      raise Error, "agent #{id}: color #{meta["color"].inspect} must be a 7-char hex string like \"#rrggbb\""
    end

    scopes = meta["hook_scopes"]
    raise Error, "agent #{id}: hook_scopes must be a non-empty Array" unless scopes.is_a?(Array) && !scopes.empty?
    invalid_scopes = scopes - VALID_SCOPES
    unless invalid_scopes.empty?
      raise Error, "agent #{id}: hook_scopes contains unknown values: #{invalid_scopes.inspect}; valid: #{VALID_SCOPES.inspect}"
    end

    validate_fields_map!(id, meta["fields"], field_keys)
    validate_metrics_map!(id, meta["metrics"], metric_slugs)
  end

  def self.validate_fields_map!(id, fields, field_keys)
    raise Error, "agent #{id}: fields must be a Hash" unless fields.is_a?(Hash)

    missing = field_keys - fields.keys
    unknown = fields.keys - field_keys

    unless missing.empty?
      raise Error, "agent #{id}: fields is missing keys: #{missing.inspect}"
    end
    unless unknown.empty?
      raise Error, "agent #{id}: fields has unknown keys: #{unknown.inspect}"
    end

    fields.each do |k, v|
      raise Error, "agent #{id}: fields[#{k.inspect}] must be true or false, got #{v.inspect}" unless v == true || v == false
    end
  end

  def self.validate_metrics_map!(id, metrics, metric_slugs)
    raise Error, "agent #{id}: metrics must be a Hash" unless metrics.is_a?(Hash)

    missing = metric_slugs - metrics.keys
    unknown = metrics.keys - metric_slugs

    unless missing.empty?
      raise Error, "agent #{id}: metrics is missing slugs: #{missing.inspect}"
    end
    unless unknown.empty?
      raise Error, "agent #{id}: metrics has unknown slugs: #{unknown.inspect}"
    end

    metrics.each do |k, v|
      raise Error, "agent #{id}: metrics[#{k.inspect}] must be true or false, got #{v.inspect}" unless v == true || v == false
    end
  end
end
