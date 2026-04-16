import fs from "fs";
import path from "path";

import { Markdown } from "@/components/markdown";
import { Card, CardContent } from "@/components/ui/card";

import { BackToDocsLink } from "../back-to-docs-link";

export default function DataCollectionPage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), "..", "docs", "data-collection.md"),
    "utf-8",
  );

  return (
    <div className="mx-auto max-w-[760px] px-6 py-12">
      <div className="mb-6">
        <BackToDocsLink />
      </div>
      <Card>
        <CardContent>
          <Markdown content={content} />
        </CardContent>
      </Card>
    </div>
  );
}
