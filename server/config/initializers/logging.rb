# Collapse multi-line log messages (e.g. stack traces) into single lines
# so Railway treats each log entry as one record.
#
# Newlines within a message are replaced with the literal string "\n".
# This keeps stack traces readable in Railway's log viewer when you expand
# a single entry, while preventing them from scattering across many entries.

if Rails.env.production?
  class SingleLineFormatter < Logger::Formatter
    include ActiveSupport::TaggedLogging::Formatter

    def call(severity, timestamp, progname, msg)
      message = msg.is_a?(String) ? msg : msg.inspect
      # Replace newlines with literal \n so the entire message stays on one line
      message = message.gsub("\n", '\n')
      "#{severity} [#{timestamp.utc.iso8601}] #{tags_text}#{message}\n"
    end
  end

  Rails.application.configure do
    config.after_initialize do
      Rails.logger.formatter = SingleLineFormatter.new
    end
  end
end
