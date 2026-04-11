# Allow GET requests to the OmniAuth authorize endpoint (/users/auth/github).
#
# OmniAuth 2.0 disabled GET by default to mitigate CVE-2015-9284, where an
# attacker could embed an <img> tag pointing at the authorize URL to silently
# initiate an OAuth flow for a logged-in victim — dangerous when the callback
# links a new identity to an existing session.
#
# We accept GET here because:
#   1. The dashboard (Next.js) and this Rails API live on different origins,
#      so a POST form would require cross-origin CSRF token plumbing.
#   2. GitHub OAuth is currently the only way to create a session — there is
#      no "link additional identity to existing account" flow, so the CVE's
#      attack scenario does not apply today.
#
# Revisit this if/when we add additional identity providers or any flow that
# links a new identity to an already-authenticated user.
OmniAuth.config.allowed_request_methods = [:post, :get]
OmniAuth.config.silence_get_warning = true
