import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-[700px] px-6 py-20">
      <div className="mb-12">
        <h1 className="mb-3 font-serif text-[32px] font-semibold text-foreground">
          Terms of Service
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Last updated: April 2026
        </p>
      </div>

      <Card>
        <CardContent className="space-y-8">
          <Section title="1. Acceptance of Terms">
            <p>
              By accessing or using AX (&quot;the Service&quot;), you agree to
              be bound by these Terms of Service. If you are using the Service
              on behalf of an organization, you represent that you have
              authority to bind that organization to these terms.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              AX is a developer experience analytics service that measures
              coding workflow metrics by analyzing GitHub pull request data and
              Claude Code session metadata. The Service consists of a
              command-line tool, an API, and a web dashboard.
            </p>
          </Section>

          <Section title="3. Accounts and Access">
            <p>
              You must authenticate via GitHub OAuth to use the Service. You are
              responsible for maintaining the security of your API keys and
              session tokens. You must notify us promptly if you believe your
              credentials have been compromised.
            </p>
          </Section>

          <Section title="4. Data Collection and Privacy">
            <p>
              AX collects aggregated session metadata — token counts, cost
              estimates, timestamps, and tool usage counts. We do not collect
              conversation content, source code, file names, or file contents.
              For full details, see our{" "}
              <Link
                href="/docs/data-collection"
                className="text-primary hover:underline"
              >
                Data Collection &amp; Privacy
              </Link>{" "}
              page.
            </p>
          </Section>

          <Section title="5. Acceptable Use">
            <p>
              You agree not to misuse the Service, including but not limited to:
              attempting to gain unauthorized access, interfering with other
              users, reverse-engineering the Service, or using the Service for
              any unlawful purpose.
            </p>
          </Section>

          <Section title="6. Plans and Billing">
            <p>
              The Service offers free and paid plans. Paid subscriptions are
              billed monthly through Stripe. You may cancel at any time; access
              continues through the end of the current billing period.
              Downgrades may result in loss of access to certain features and
              removal of team members exceeding the free plan limits.
            </p>
          </Section>

          <Section title="7. Service Availability">
            <p>
              We strive to maintain high availability but do not guarantee
              uninterrupted access. The Service is provided &quot;as is&quot;
              without warranties of any kind, express or implied.
            </p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, AX and its operators shall
              not be liable for any indirect, incidental, special,
              consequential, or punitive damages arising from your use of the
              Service.
            </p>
          </Section>

          <Section title="9. Changes to Terms">
            <p>
              We may update these terms from time to time. Continued use of the
              Service after changes constitutes acceptance. We will notify users
              of material changes via the dashboard or email.
            </p>
          </Section>

          <Section title="10. Contact">
            <p>
              Questions about these terms? Visit our{" "}
              <Link
                href="/contact"
                className="text-primary hover:underline"
              >
                contact page
              </Link>{" "}
              or open an issue on{" "}
              <a
                href="https://github.com/acroos/ax"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GitHub
              </a>
              .
            </p>
          </Section>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 text-[15px] font-medium text-foreground">{title}</h2>
      <div className="space-y-2 text-[14px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}
