"use client";

import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ApiKeySection() {
  const [rotatingKey, setRotatingKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/api_key/reveal")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.key) setNewKey(data.key);
      })
      .catch(() => {});
  }, []);

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
    <Card className="p-6">
      <CardContent className="space-y-4 p-0">
        <h2 className="text-sm font-medium text-foreground">API Key</h2>
        <p className="text-xs text-muted-foreground">
          Your API key is used by the CLI to push data. Rotating it will
          immediately invalidate the old key.
        </p>

        {newKey && (
          <div className="space-y-2 rounded-lg bg-muted p-3">
            <p className="text-xs font-medium text-notice">
              Copy this key now — you won&apos;t be able to see it again.
            </p>
            <code className="block select-all break-all font-mono text-xs text-foreground">
              {newKey}
            </code>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleRotateKey}
          disabled={rotatingKey}
        >
          {rotatingKey ? "Rotating..." : "Rotate API Key"}
        </Button>
      </CardContent>
    </Card>
  );
}
