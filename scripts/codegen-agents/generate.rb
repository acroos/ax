#!/usr/bin/env ruby
# Usage:
#   ruby scripts/codegen-agents/generate.rb           # writes outputs
#   ruby scripts/codegen-agents/generate.rb --check   # exits non-zero if outputs differ from disk

require "yaml"
require "erb"
require "fileutils"
require "ostruct"
require_relative "schema"

ROOT = File.expand_path("../..", __dir__)
SOURCE = File.join(ROOT, "config/agents.yaml")
TEMPLATES = File.join(__dir__, "templates")

OUTPUTS = {
  "registry.go.erb"        => "cli/internal/agents/registry.gen.go",
  "agent_registry.rb.erb"  => "server/app/models/agent_registry.rb",
  "agents.ts.erb"          => "dashboard/src/lib/agents.gen.ts"
}

def render(template_name, binding_obj)
  template = File.read(File.join(TEMPLATES, template_name))
  ERB.new(template, trim_mode: "-").result(binding_obj)
end

check_only = ARGV.include?("--check")

raw = YAML.safe_load_file(SOURCE)
Schema.validate!(raw)

agents = raw["agents"]
field_keys = raw["field_keys"]
metric_slugs = raw["metric_slugs"]
schema_version = raw["schema_version"]

binding_obj = OpenStruct.new(
  agents: agents,
  raw: raw,
  field_keys: field_keys,
  metric_slugs: metric_slugs,
  schema_version: schema_version,
  source_path: "config/agents.yaml"
).instance_eval { binding }

drift = []
OUTPUTS.each do |template, target|
  rendered = render(template, binding_obj)
  abs = File.join(ROOT, target)
  existing = File.exist?(abs) ? File.read(abs) : nil
  if check_only
    drift << target if existing != rendered
  else
    FileUtils.mkdir_p(File.dirname(abs))
    File.write(abs, rendered)
    puts "wrote #{target}"
  end
end

if check_only && drift.any?
  warn "Generated files are out of date:"
  drift.each { |t| warn "  - #{t}" }
  warn "Run: just codegen-agents"
  exit 1
end
