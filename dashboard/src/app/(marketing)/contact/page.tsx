import { Mail } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[700px] px-6 py-20">
      <div className="mb-12">
        <h1 className="mb-3 font-serif text-[32px] font-semibold text-foreground">
          Contact
        </h1>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Have a question, feature request, or just want to say hello? We&apos;d
          love to hear from you.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-8">
          <div>
            <h2 className="mb-2 text-[15px] font-medium text-foreground">
              Email
            </h2>
            <p className="mb-4 text-[14px] leading-relaxed text-muted-foreground">
              For general inquiries, support, or partnership opportunities.
            </p>
            <Button asChild>
              <a href="mailto:austin@axmetrics.dev">
                <Mail className="mr-2 size-4" />
                austin@axmetrics.dev
              </a>
            </Button>
          </div>

          <div>
            <h2 className="mb-2 text-[15px] font-medium text-foreground">
              GitHub
            </h2>
            <p className="mb-4 text-[14px] leading-relaxed text-muted-foreground">
              Found a bug or have a feature request? Open an issue on GitHub.
            </p>
            <Button variant="outline" asChild>
              <a
                href="https://github.com/acroos/ax"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/acroos/ax
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
