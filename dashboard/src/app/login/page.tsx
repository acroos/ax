import Link from "next/link";

import { Mark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const apiUrl = process.env.AX_API_URL || "http://localhost:3000";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Mark className="mb-2 size-10 text-foreground" title="" />
          <CardTitle className="font-serif text-2xl font-semibold">
            Sign in to AX
          </CardTitle>
          <CardDescription>
            Measure how effectively you work with AI coding agents.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button size="lg" className="w-full" asChild>
            <a href={`${apiUrl}/users/auth/github`}>
              <GitHubMark />
              Sign in with GitHub
            </a>
          </Button>
          <Button size="lg" variant="outline" className="w-full" asChild>
            <a href={`${apiUrl}/users/auth/gitlab`}>
              <GitLabFox />
              Sign in with GitLab
            </a>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            By signing in, you agree to our{" "}
            <Link
              href="/terms"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              terms of service
            </Link>
            .
            <br />
            <Link
              href="/docs/data-collection"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              What data does AX collect?
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// GitHub's brand mark. Lucide removed branded logos due to trademark policies,
// so we inline the SVG. Color follows currentColor so it pairs with any Button
// variant.
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

// GitLab's fox mark. Inline SVG for the same reason as GitHub above.
function GitLabFox() {
  return (
    <svg viewBox="0 0 380 380" fill="currentColor" aria-hidden="true">
      <path
        d="m190.08 349.44 69.87-215.14H120.2z"
        fill="#E24329"
      />
      <path
        d="m190.08 349.44-69.87-215.14H30.22z"
        fill="#FC6D26"
      />
      <path
        d="M30.22 134.3 4.33 213.84a17.66 17.66 0 0 0 6.42 19.75l179.33 130.27z"
        fill="#FCA326"
      />
      <path
        d="M30.22 134.3h89.99L83.15 11.73a8.88 8.88 0 0 0-16.89 0z"
        fill="#E24329"
      />
      <path
        d="m190.08 349.44 69.87-215.14h89.99z"
        fill="#FC6D26"
      />
      <path
        d="M349.94 134.3 375.83 213.84a17.66 17.66 0 0 1-6.42 19.75L190.08 363.86z"
        fill="#FCA326"
      />
      <path
        d="M349.94 134.3h-89.99l37.06-122.57a8.88 8.88 0 0 1 16.89 0z"
        fill="#E24329"
      />
    </svg>
  );
}
