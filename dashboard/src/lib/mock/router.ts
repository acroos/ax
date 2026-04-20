/**
 * URL routers for mock mode.
 * - mockFetchAPI: intercepts server-side fetchAPI() calls
 * - mockApiRoute: intercepts client-side /api/v1/* proxy calls
 */

import { NextResponse } from "next/server";
import {
  MOCK_PRS,
  MOCK_REPOS,
  MOCK_AGGREGATES,
  MOCK_TIMELINE,
  MOCK_BILLING,
  MOCK_INSTALLATION,
  MOCK_MEMBERS,
  MOCK_INVITES,
  MOCK_TEAMS,
  getMockAggregatesForRepo,
  getMockAggregatesForDays,
  getMockTeamDetail,
  getMockTeamPRs,
  getMockTeamMetrics,
} from "./data";

const RANGE_TO_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

function parseRangeDays(urlPath: string): number {
  const match = urlPath.match(/[?&]range=(\w+)/);
  return match ? (RANGE_TO_DAYS[match[1]] ?? 30) : 30;
}

function stripQueryString(urlPath: string): string {
  return urlPath.split("?")[0];
}

// ---------------------------------------------------------------------------
// Server-side router (used by fetchAPI in db.ts)
// ---------------------------------------------------------------------------

export function mockFetchAPI<T>(
  urlPath: string,
  init?: { method?: string; revalidate?: number | false },
): T {
  // Mutations: return stub success
  if (init?.method && init.method !== "GET") {
    return mockMutationResponse(urlPath, init.method) as T;
  }

  const days = parseRangeDays(urlPath);
  const cleanPath = stripQueryString(urlPath);

  // --- Repo-scoped routes: /api/v1/orgs/:slug/repos/:id/*
  const repoScoped = cleanPath.match(
    /^\/api\/v1\/orgs\/[^/]+\/repos\/(\d+)\/(.+)$/,
  );
  if (repoScoped) {
    const repoId = parseInt(repoScoped[1], 10);
    const sub = repoScoped[2];
    if (sub === "prs") return MOCK_PRS.filter((p) => p.repo_id === repoId) as T;
    if (sub === "metrics") return getMockAggregatesForRepo(repoId, days) as T;
    if (sub === "timeline")
      return MOCK_TIMELINE.filter((t) => {
        const pr = MOCK_PRS.find((p) => p.number === t.prNumber);
        return pr && pr.repo_id === repoId;
      }) as T;
  }

  // --- Team-scoped routes: /api/v1/orgs/:slug/teams/:team_slug/*
  const teamScoped = cleanPath.match(
    /^\/api\/v1\/orgs\/[^/]+\/teams\/([^/]+)\/(.+)$/,
  );
  if (teamScoped) {
    const teamSlug = teamScoped[1];
    const sub = teamScoped[2];
    if (sub === "prs") return getMockTeamPRs(teamSlug) as T;
    if (sub === "metrics") return getMockTeamMetrics(teamSlug, days) as T;
    if (sub === "members") {
      const detail = getMockTeamDetail(teamSlug);
      return (detail?.members ?? []) as T;
    }
  }

  // --- Team detail or list: /api/v1/orgs/:slug/teams[/:team_slug]
  const teamMatch = cleanPath.match(
    /^\/api\/v1\/orgs\/[^/]+\/teams(?:\/([^/]+))?$/,
  );
  if (teamMatch) {
    const teamSlug = teamMatch[1];
    if (teamSlug) {
      return (getMockTeamDetail(teamSlug) ?? {}) as T;
    }
    return MOCK_TEAMS as T;
  }

  // --- Org-scoped routes: /api/v1/orgs/:slug/*
  const orgScoped = cleanPath.match(/^\/api\/v1\/orgs\/[^/]+\/(.+)$/);
  if (orgScoped) {
    const sub = orgScoped[1];
    if (sub === "repos") return MOCK_REPOS as T;
    if (sub === "prs") return MOCK_PRS as T;
    if (sub === "metrics") return getMockAggregatesForDays(days) as T;
    if (sub === "billing") return MOCK_BILLING as T;
    if (sub === "github_installation") return MOCK_INSTALLATION as T;
    if (sub === "github_installation/install_url") return { install_url: "#" } as T;
    if (sub === "members") return MOCK_MEMBERS as T;
    if (sub === "invites") return MOCK_INVITES as T;
  }

  // --- Global routes
  if (urlPath === "/api/v1/repos") return MOCK_REPOS as T;

  const prMatch = urlPath.match(/^\/api\/v1\/prs\/(\d+)$/);
  if (prMatch) {
    const prId = parseInt(prMatch[1], 10);
    const pr = MOCK_PRS.find((p) => p.id === prId);
    if (pr) return pr as T;
  }

  if (urlPath === "/api/v1/api_key/reveal")
    return { key: "ax_mock_key_0xdeadbeef1234567890" } as T;

  // Fallback
  console.warn(`[mock] unhandled GET route: ${urlPath}`);
  return {} as T;
}

function mockMutationResponse(urlPath: string, method: string): unknown {
  if (urlPath.includes("/billing/checkout")) return { url: "#" };
  if (urlPath.includes("/billing/portal")) return { url: "#" };
  if (urlPath.includes("/api_key/rotate"))
    return { key: "ax_mock_rotated_0xfeedface" };
  if (urlPath.includes("/invites") && method === "POST")
    return { link: "http://localhost:3333/invite/mock-token" };
  if (urlPath.includes("/github_installation/install_url"))
    return { install_url: "#" };
  if (urlPath.match(/\/teams\/[^/]+\/members/) && method === "POST")
    return { id: 99, org_membership_id: 1, user: { id: 1, github_username: "austinroos", display_name: "Austin Roos", avatar_url: null } };
  if (urlPath.match(/\/teams\/[^/]+\/members\/\d+/) && method === "DELETE")
    return {};
  if (urlPath.match(/\/teams\/[^/]+$/) && method === "DELETE")
    return { deleted_count: 1 };
  if (urlPath.match(/\/teams\/[^/]+$/) && method === "PUT")
    return { id: 1, slug: "platform", name: "Platform", parent_team_slug: null, member_count: 2, child_team_count: 1 };
  if (urlPath.match(/\/teams$/) && method === "POST")
    return { id: 99, slug: "new-team", name: "New Team", parent_team_slug: null, member_count: 0, child_team_count: 0 };
  return {};
}

// ---------------------------------------------------------------------------
// Client-side API proxy router (used by /api/v1/[...path]/route.ts)
// ---------------------------------------------------------------------------

export function mockApiRoute(
  method: string,
  path: string,
  _request: Request,
): NextResponse {
  const urlPath = `/api/v1/${path}`;

  if (method !== "GET") {
    const body = mockMutationResponse(urlPath, method);
    return NextResponse.json(body);
  }

  // Re-use the same router logic
  const data = mockFetchAPI(urlPath);
  return NextResponse.json(data);
}
