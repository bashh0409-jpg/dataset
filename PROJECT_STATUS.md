# Synthetic — Project Status

**Review snapshot:** 2026-11-01  
**Repository:** `bashh0409-jpg/dataset`  
**Scope:** Read-only codebase review. Environment files and secret values were excluded.

## 1. Overview

- Synthetic generates synthetic relational test data for developers, small engineering teams, and product teams building demos or test fixtures.
- The app also provides shared workspaces, schema/chat history, billing, and team collaboration.
- **State:** Early MVP/prototype. The repository does not establish whether a production deployment is live.
- The worktree contains uncommitted changes; reviewers should decide whether to include them.

## 2. Stack

- **Framework/language:** Next.js App Router 16.4.3; React 19.3.0; TypeScript 5.9.3.
- **Database/auth/storage:** Supabase Postgres, Supabase Auth and Supabase Storage; `@supabase/ssr` 0.12.7 and `@supabase/supabase-js` 2.118.0.
- **Hosting:** Vercel is the documented target; deployment status is unverified.
- **Key libraries:** Faker 10.6.0, Zod 4.6.7, Tailwind CSS 4.3.3, Vitest 4.1.12, ESLint 9.39.5, Polar Next.js SDK 1.1.0, GSAP 3.15.0.
- **Local runtime:** Node.js 24.18.0.

## 3. Structure

```text
app/
  actions/       Server actions for generation and workspace features
  api/           Billing and webhook HTTP routes
  components/    Landing, sign-in, onboarding and invitation UI
  workspace/     Generator, workspace, schemas, settings and support UI
lib/
  ai/            Conversation titles, provider credentials and link reading
  billing/       Polar helpers
  generator/     Engine, schema parsers, packs and export helpers
  supabase/      Browser, server and admin clients
supabase/
  migrations/    Postgres schema, RLS policies and RPC migrations
tests/            Vitest and k6 smoke tests
public/           Fonts and static assets
```

## 4. Features

- **Implemented in the repository:** Supabase sign-in/callback, onboarding, workspace invites and mentions; manual and AI-assisted generation; shared conversation history and generated artifacts; saved schemas; CSV/JSON preview and export; public HTTPS link reading for schema context; bug-report submissions; Polar subscription and workspace-credit flows.
- **External setup required:** Supabase migrations/configuration, AI providers, Polar, Resend invitations, Turnstile verification and private storage policies.
- **Partial or unavailable:** API-key creation exists, but API-key revocation/authentication and a public generation API are not implemented. Workspace Activity, Plugins and Apps are marked “Coming soon.” SQL export supports generated relational tables.
- Relevant code: [`app/workspace/WorkspaceShell.tsx`](app/workspace/WorkspaceShell.tsx), [`app/actions/api-keys.ts`](app/actions/api-keys.ts), [`README.md`](README.md).

## 5. Data generator engine

- **Implementation:** [`lib/generator/engine.ts`](lib/generator/engine.ts); locale and industry data in [`lib/generator/packs.ts`](lib/generator/packs.ts); SQL and AI schema inference in [`lib/generator/sql-schema.ts`](lib/generator/sql-schema.ts) and [`lib/generator/ai-schema.ts`](lib/generator/ai-schema.ts).
- **Field types:** UUID, synthetic ID number, first/last/full name, email, company, product, carrier, tracking number, temperature, precipitation, coordinates, country, URL, postal code, integer, price, boolean, date, phone, city, address, text and enum.
- **Primary keys:** Relational primary keys accept integer, UUID, synthetic ID number, email, company and product. Company/product keys use seeded shuffled pack values and deterministic suffixes after the pack is exhausted.
- **Packs:** Locale inference supports US English (fallback), UK English and South African English. Industry inference supports general, e-commerce, healthcare, finance, logistics and SaaS. Selection is heuristic, based on prompt and schema terms.
- **Outputs:** Table preview, JSON, CSV and relational SQL export.
- **Relationships:** Multi-table generation supports declared foreign-key references and seeded repeatability. SQL `CREATE TABLE` input can be parsed locally. Manual generation currently generates one table.
- **Limits:** Manual generation supports up to 500 records. Standard/free Agent generation: 10 tables, up to 500 records/table and 2,000 total. Pro-access generation: 80 tables, up to 100 records/table and 8,000 total.

## 6. API, routes and server actions

### HTTP routes

| Route | Purpose | Authentication |
|---|---|---|
| `POST /api/billing/checkout` | Start or resume Pro checkout | Signed-in user |
| `GET /api/billing/portal` | Open billing portal | Signed-in user with active Pro |
| `POST /api/billing/workspace-credits/checkout` | Purchase workspace credits | Signed-in workspace owner |
| `POST /api/webhooks/polar` | Process signed billing events | Provider signature; no user session |
| `GET /auth/callback` | Exchange Supabase OAuth code for a session | Public callback; validates exchange |

There is **no** `/api/v1/generate` route.

### Server actions

All actions require a signed-in user; workspace-scoped actions also check membership or role as appropriate.

| File | Exported actions and purpose |
|---|---|
| [`app/actions/generate-with-ai.ts`](app/actions/generate-with-ai.ts) | `generateWithAi` — validate plan/access, infer schemas and generate data |
| [`app/actions/ai-conversations.ts`](app/actions/ai-conversations.ts) | `listAiConversations`, `getAiConversation`, `saveAiGeneratedArtifact`, `saveAiGeneratedArtifactPositions`, `saveAiConversation`, `editAiConversationAfterMessage`, `setAiConversationPinned`, `setAiConversationArchived`, `renameAiConversation`, `updateAiConversationMetadata`, `deleteAiConversation` |
| [`app/actions/workspace-schemas.ts`](app/actions/workspace-schemas.ts) | `listWorkspaceSchemas`, `saveWorkspaceSchema`, `duplicateWorkspaceSchema`, `deleteWorkspaceSchema` |
| [`app/actions/onboarding.ts`](app/actions/onboarding.ts) | `createOnboardingWorkspace`, `completeInvitedUserOnboarding`, `createWorkspaceInvite`, `acceptWorkspaceInvite` |
| [`app/actions/pro-settings.ts`](app/actions/pro-settings.ts) | `getProAiSettings`, `getWorkspaceProAiUsage`, `saveAiProviderKey`, `removeAiProviderKey` |
| [`app/actions/workspace-credits.ts`](app/actions/workspace-credits.ts) | `getWorkspaceCreditBalance`, `getWorkspaceDoublePremiumCreditCost`, `setWorkspaceDoublePremiumCreditCost` |
| [`app/actions/workspace-mentions.ts`](app/actions/workspace-mentions.ts) | `getWorkspaceMentions`, `createWorkspaceMention`, `markWorkspaceMentionsRead` |
| [`app/actions/workspaces.ts`](app/actions/workspaces.ts) | `getWorkspaceMembers` |
| [`app/actions/api-keys.ts`](app/actions/api-keys.ts) | `createApiKey` — create a key, returning its raw value only once |
| [`app/actions/bug-reports.ts`](app/actions/bug-reports.ts) | `submitBugReport` |

## 7. Database and RLS

- The migrations define **26 public tables**. RLS is enabled on each; application tables have user- or workspace-scoped policies, while operational tables generally reserve access for trusted server RPCs.
- **Profiles/workspace:** `profiles`, `workspaces`, `workspace_members`, `workspace_invites`.
- **Schemas/data/API metadata:** `schemas`, `workspace_saved_schemas`, `api_keys`, `generation_jobs`, `usage_events`.
- **AI history/data:** `ai_conversations`, `ai_generated_artifacts`.
- **Plans and limits:** `plan_subscriptions`, `ai_provider_credentials`, `pro_ai_provider_routing_state`, `pro_ai_provider_reservations`, `pro_ai_premium_requests`, `free_ai_requests`, `pro_ai_workspace_allowances`.
- **Credits/billing:** `workspace_credit_balances`, `workspace_credit_purchases`, `workspace_credit_ledger`, `polar_checkout_attempts`, `polar_webhook_events`.
- **Collaboration/support:** `workspace_mentions`, `workspace_mention_recipients`, `bug_reports`.
- Key relations include workspace owners/members/invites; user-owned credentials, subscriptions and keys; conversations to workspaces and generated artifacts; schemas to workspaces/creators; and credit purchases/ledger entries to workspace/payment records. Attachment access uses policies on Supabase `storage.objects`.
- Source: [`supabase/migrations/`](supabase/migrations/).

## 8. Plans and limits

- `generateWithAi` checks workspace access server-side and chooses standard or Pro generation caps. Free users are restricted to Qwen; premium providers require Pro access. Owner-funded Pro access and workspace credits are handled through database RPCs.
- Documented limits: 50 free-model requests per user per rolling 24 hours; Pro premium allowance of 50 requests/member, followed by a four-hour cooldown that starts on request 50. A workspace credit purchase adds 500 credits; generation requests can spend shared credits.
- Enforcement lives in [`app/actions/generate-with-ai.ts`](app/actions/generate-with-ai.ts) and the quota, credit and billing functions in [`supabase/migrations/`](supabase/migrations/).
- Pro usage settings and the workspace usage UI both read `get_workspace_pro_ai_usage`, reporting the enforced 50-request allowance, current usage, remaining requests and cooldown reset time.

## 9. Quality

- **Tests:** 85 tests passed across six suites covering generator behavior, SQL parsing and relationships, AI-schema parsing, saved-schema grouping, link fetching, Pro usage reporting and conversation titles.
- The empty Prisma seed test file was removed so unfiltered Vitest discovery does not fail on a file with no test suite.
- **TypeScript:** `npx tsc --noEmit` passed.
- **Lint:** `npm run lint` completed with 0 errors and 3 unused-import warnings (`Navbar`, `Link`, `Key`).
- **Build:** Production build passed in the last observed run; it was not rerun for this snapshot.
- k6 public/workspace smoke tests exist but were not run for this report.

## 10. Known issues and risks

- No TODO/FIXME/XXX markers were found in app, library or test source; several workspace navigation areas are explicitly unfinished.
- API-key UI suggests API use, but generation API, key authentication, key revocation, API quotas and request contract are not implemented.
- Locale/industry inference is heuristic and limited. It may miss ambiguous regions, currencies, units and formats; manual mode only has the dataset and field names as context.
- Generation uses semantic heuristics rather than comprehensive per-field format/constraint validation from JSON Schema or OpenAPI.
- The Prisma seed plugin panel remains empty.
- The worktree has uncommitted changes; report snapshot reflects files present during this review, not only the latest commit.

## 11. Recommended next steps

1. Implement the documented public generation API end-to-end: API-key verification and revocation, authorization, quotas, predictable errors and contract tests.
2. Align Pro usage reporting with the actual rolling allowance enforcement.
3. Support richer field formats and constraints, such as JSON Schema/OpenAPI, and validate generated records against them.
4. Expand locale/industry inference and show inferred context in preview so users can catch misclassification.
5. Add integration/security tests for RLS boundaries, billing/webhooks and quota enforcement; complete or remove the empty Prisma-seed stub.
