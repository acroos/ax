"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ExportDataSection() {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/v1/account/export");
      if (!res.ok) throw new Error("Export failed");

      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ax-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="p-6">
      <CardContent className="space-y-4 p-0">
        <h2 className="text-sm font-medium text-foreground">Data Export</h2>
        <p className="text-xs text-muted-foreground">
          Download a copy of your personal data including your profile,
          organization memberships, pull requests, and coding sessions.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? "Exporting..." : "Export my data"}
        </Button>
      </CardContent>
    </Card>
  );
}
