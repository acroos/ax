import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { fetchAPI, orgApiPath } from "@/lib/db";

// Stripe Checkout success landing route.
//
// Stripe redirects here after a successful upgrade with the
// {CHECKOUT_SESSION_ID} template substituted into the success_url. We:
//   1. Synchronously POST to the Rails reconcile endpoint, which retrieves
//      the Checkout Session from Stripe and upserts the local Subscription /
//      org plan. This eliminates the race window where the user lands on
//      the billing page before the (async) checkout.session.completed
//      webhook has been processed.
//   2. Bust the org's layout cache so other routes don't render with the
//      stale pre-upgrade plan.
//   3. Forward to /{slug}/billing?billing=success for the confirmation
//      banner.
//
// If reconcile fails we still redirect — the webhook is the source of
// truth and will catch up — but the page may briefly show the old plan.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const sessionId = req.nextUrl.searchParams.get("session_id");

  if (sessionId) {
    try {
      await fetchAPI(
        orgApiPath(slug, `/billing/reconcile?session_id=${encodeURIComponent(sessionId)}`),
        { method: "POST" }
      );
    } catch (err) {
      console.error("Billing reconcile failed:", err);
    }
  }

  revalidatePath(`/${slug}`, "layout");
  return NextResponse.redirect(
    new URL(`/${slug}/billing?billing=success`, req.url)
  );
}
