"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [rotatingKey, setRotatingKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function handleRotateKey() {
    setRotatingKey(true);
    try {
      const res = await fetch("/api/v1/api_key/rotate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
      }
    } finally {
      setRotatingKey(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">Manage your account and API key</p>
      </div>

      <div className="bg-surface-1 rounded-xl border border-border-subtle p-6 space-y-4">
        <h2 className="text-sm font-medium text-text-primary">API Key</h2>
        <p className="text-xs text-text-tertiary">
          Your API key is used by the CLI to push data. Rotating it will immediately invalidate the old key.
        </p>

        {newKey && (
          <div className="bg-surface-0 rounded-lg p-3 space-y-2">
            <p className="text-xs text-amber font-medium">
              Copy this key now — you won&apos;t be able to see it again.
            </p>
            <code className="block text-xs text-text-primary font-mono break-all select-all">
              {newKey}
            </code>
          </div>
        )}

        <button
          onClick={handleRotateKey}
          disabled={rotatingKey}
          className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-surface-3 text-text-primary text-xs font-medium transition-colors disabled:opacity-50"
        >
          {rotatingKey ? "Rotating..." : "Rotate API Key"}
        </button>
      </div>
    </div>
  );
}
