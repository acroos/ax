import Link from "next/link";
import { Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  { name: "Core metrics (10 metrics)", free: true, pro: true },
  { name: "GitHub integration & webhooks", free: true, pro: true },
  { name: "90-day PR backfill", free: true, pro: true },
  { name: "Team members", free: "1", pro: "Unlimited" },
  { name: "Repositories", free: "2", pro: "Unlimited" },
  { name: "History retention", free: "30 days", pro: "Unlimited" },
  { name: "Data export", free: false, pro: true },
  { name: "Priority support", free: false, pro: true },
];

export default function PlansPage() {
  return (
    <div className="mx-auto max-w-[900px] px-6 py-20">
      <div className="mb-12">
        <h1 className="mb-3 font-serif text-[32px] font-semibold text-foreground">
          Plans
        </h1>
        <p className="max-w-[480px] text-[15px] text-muted-foreground">
          Start free with core metrics for a single developer. Upgrade to Pro
          when your team is ready to measure together.
        </p>
      </div>

      <div className="mb-16 grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-[18px]">Free</CardTitle>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[32px] font-semibold text-foreground">
                $0
              </span>
              <span className="text-[13px] text-muted-foreground">forever</span>
            </div>
            <CardDescription className="mt-2 text-[13px]">
              Core metrics for individual developers. No credit card required.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/login">Get Started</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-[18px]">Pro</CardTitle>
            <CardAction>
              <Badge className="bg-notice text-notice-foreground">
                Recommended
              </Badge>
            </CardAction>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[32px] font-semibold text-foreground">
                $20
              </span>
              <span className="text-[13px] text-muted-foreground">
                / member / month
              </span>
            </div>
            <CardDescription className="mt-2 text-[13px]">
              Unlimited team members, full history, and advanced features.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" asChild>
              <Link href="/login">Get Started</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-[15px] font-medium text-foreground">
          Feature comparison
        </h2>
        <Card className="gap-0 overflow-hidden p-0">
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_120px_120px] border-b border-border">
              <div className="px-5 py-3 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Feature
              </div>
              <div className="px-5 py-3 text-center text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Free
              </div>
              <div className="px-5 py-3 text-center text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                Pro
              </div>
            </div>
            {features.map((f, i) => (
              <div
                key={f.name}
                className={`grid grid-cols-[1fr_120px_120px] ${
                  i < features.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="px-5 py-3 text-[13px] text-muted-foreground">
                  {f.name}
                </div>
                <div className="px-5 py-3 text-center text-[13px]">
                  <FeatureValue value={f.free} />
                </div>
                <div className="px-5 py-3 text-center text-[13px]">
                  <FeatureValue value={f.pro} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureValue({ value }: { value: boolean | string }) {
  if (value === true) {
    return <Check className="inline-block size-4 text-success" />;
  }
  if (value === false) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }
  return <span className="text-foreground">{value}</span>;
}
