# Datamint — Project Guide for Coding Agents

> **Working product name:** Datamint  
> **Tagline:** Synthetic data for developers  
> **Status:** Early-stage MVP  
> **Primary goal:** Help developers generate realistic, relational test data quickly, validate it, and export or access it through an API.

This document is the source of truth for the product direction and implementation constraints. Read it before making architectural or product changes. If existing code conflicts with this guide, inspect the current implementation first and avoid destructive rewrites; explain material conflicts before changing them.

## 1. Product overview

Datamint is a developer tool for creating synthetic datasets for development, testing, demos, and prototypes. Users should be able to define the shape of their data, generate realistic records, preserve relationships between entities, and export the result or retrieve it through an API.

The initial product is **synthetic-data-first**. Licensed or real-world datasets may be added in a later phase, but they are not part of the MVP and must not be mixed into synthetic generation without clear provenance, licensing, and access controls.

### Target users
- Individual software developers
- Developers testing applications and APIs
- Small engineering teams that need repeatable test fixtures
- Product teams preparing safe demo data

### Core value proposition
- Generate useful test data without manually writing fixtures.
- Create consistent data across related tables/entities.
- Reproduce a dataset with a seed.
- Export data or access it programmatically.
- Keep generated data separate from application metadata and user credentials.

## 2. MVP scope

Build a focused, reliable MVP before adding advanced features.

### MVP features
1. **Authentication**
   - Sign up, sign in, sign out, and protected dashboard routes.
   - Use Supabase Auth with the official SSR integration.
2. **Dashboard**
   - Clear overview of recent generation activity, saved schemas, and usage.
   - Useful empty states for new accounts.
3. **Data generator**
   - Generate records for common entities such as users, companies, products, orders, and transactions.
   - Allow users to select fields, field types, record count, and relevant constraints.
   - Support relationships between entities where defined.
   - Support deterministic generation using a seed.
4. **Schema management**
   - Create, edit, save, duplicate, and delete reusable schemas.
   - Validate schemas before generating records.
5. **Export**
   - JSON and CSV are the initial formats.
   - SQL export may be added when it can be generated safely and consistently.
6. **REST API**
   - API endpoint for generating data using a user API key.
   - Validate inputs, authenticate keys, apply quotas/rate limits, and return predictable errors.
7. **Usage and API keys**
   - Show basic usage information.
   - Allow users to create and revoke API keys.
   - Show the full raw API key only at creation time; store only a secure hash.
8. **Documentation**
   - Explain generation requests, schema format, authentication, limits, and response shapes.

### Not in the initial MVP
- Marketplace for third-party or licensed datasets
- Team collaboration and complex workspace permissions
- Billing and paid plans unless explicitly requested
- Arbitrary SQL execution
- Huge, long-running generation jobs without a job/worker architecture
- AI-powered schema design as a dependency for basic generation

Do not add these features speculatively. Keep the design extensible without implementing future scope prematurely.

## 3. Technology stack

Use the existing project setup where possible. Do not replace dependencies or change framework versions without a concrete reason.

- **Framework:** Next.js App Router
- **Language:** TypeScript with strict typing
- **Styling:** Tailwind CSS
- **Backend and metadata database:** Supabase
- **Authentication:** Supabase Auth with `@supabase/ssr`
- **Database client:** `@supabase/supabase-js`
- **Validation:** Zod
- **Synthetic data:** `@faker-js/faker`
- **Animation:** GSAP and `@gsap/react`, only where it improves the experience
- **Icons:** `lucide-react`
- **Class utilities:** `clsx` and `tailwind-merge`
- **Testing:** Vitest; choose compatible versions for the existing Node and Vite setup before installing
- **Deployment target:** Vercel for the initial web application

Potential later integrations:
- OpenAI or Anthropic API for translating natural-language prompts into a structured schema.
- Object storage and a background worker for large exports or long-running jobs.

Do not assume these optional integrations are already configured.

## 4. Product and UX principles

- Keep the interface clean, fast, and developer-oriented.
- Prioritize the generator workflow: **define → preview → generate → export/use via API**.
- Make important limits, validation errors, and generation settings visible.
- Provide sensible defaults and useful examples, but never silently change a user's schema.
- Use accessible controls, keyboard focus states, labels, and semantic HTML.
- Include loading, empty, success, and error states.
- Avoid unnecessary UI complexity, excessive rounded containers, and decorative animation that slows down the workflow.
- Prefer server components by default. Use client components only when interactivity or browser APIs require them.
- Do not redesign unrelated screens or change the existing visual direction unless asked.

## 5. Suggested application structure

Adapt this to the existing repository rather than forcing a restructure.

```text
app/
  (marketing)/
    page.tsx
    docs/
  (auth)/
    sign-in/
    sign-up/
  (dashboard)/
    dashboard/
    generate/
    schemas/
    api-keys/
    usage/
    settings/
  api/
    v1/
      generate/
        route.ts
      schemas/
        route.ts
components/
  dashboard/
  generator/
  schemas/
  ui/
lib/
  auth/
  database/
  api-keys/
  validation/
  rate-limit/
  usage/
modules/
  generator/
    engine.ts
    seed.ts
    registry.ts
    types.ts
    generators/
      users.ts
      companies.ts
      products.ts
      orders.ts
      transactions.ts
    exporters/
      json.ts
      csv.ts
      sql.ts
supabase/
  migrations/
tests/
```

The structure is a guide, not a mandate. Keep modules cohesive and avoid unnecessary abstraction.

## 6. Data generation architecture

Keep generation logic deterministic, testable, and independent of the UI.

### Recommended flow

```text
Dashboard or API request
        ↓
Validate request with Zod
        ↓
Authenticate user or API key
        ↓
Check limits and rate limits
        ↓
Resolve and validate schema
        ↓
Run deterministic generation engine
        ↓
Validate output and relationships
        ↓
Return JSON or export CSV
        ↓
Record usage metadata
```

### Engine requirements
- Use a registry of supported field types and entity generators.
- Keep the core engine independent from React and Next.js request/response objects.
- Support a seed so the same configuration and seed can reproduce the same dataset. Confirm the chosen Faker seeding strategy is deterministic for the supported generators.
- Validate record counts, field types, required values, enum options, and relationship references.
- Enforce maximum record counts and response-size limits at the server boundary.
- Do not trust client-provided schema definitions.
- Avoid storing generated records by default. Store generated data only when a feature explicitly requires persistence, such as a saved job result.
- Do not use real personal data as sample output. Use synthetic values only.
- Ensure related records refer to valid generated parent records and that foreign-key-like values remain consistent.
- Keep export formatting in separate modules rather than embedding it in UI components.

### AI schema design (later enhancement)
If natural-language schema design is added:
1. Use the model only to propose a structured schema.
2. Validate the model output with Zod.
3. Reject unsupported field types, excessive counts, unsafe options, and malformed relationships.
4. Show the proposed schema to the user for review before generation.
5. Never execute arbitrary SQL or model-produced code.
6. Basic data generation must continue working when the AI provider is unavailable.

## 7. API conventions

The initial public endpoint can be:

`POST /api/v1/generate`

Use a versioned API and document the exact request/response contract. A possible request shape is:

```json
{
  "schema": {
    "name": "users",
    "fields": {
      "id": { "type": "uuid" },
      "name": { "type": "fullName" },
      "email": { "type": "email" }
    }
  },
  "count": 100,
  "seed": 42,
  "format": "json"
}
```

This is an illustrative starting point, not a finalized contract. Align it with the actual schema types in the codebase and keep it consistent across the UI, API, tests, and docs.

### API requirements
- Authenticate API requests with a dedicated API key, not a Supabase service-role key.
- Store only a cryptographic hash of each API key. Never log or expose raw keys after creation.
- Compare secrets safely and revoke keys immediately when requested.
- Validate all inputs on the server.
- Add rate limits and per-user quotas before exposing the API publicly.
- Set reasonable maximum record counts and response sizes.
- Return consistent status codes and error objects without leaking stack traces, secrets, or database internals.
- Do not allow a request to choose arbitrary database tables or run arbitrary SQL.
- Add request IDs and safe operational logs where useful, without logging generated sensitive content or credentials.

## 8. Database and Supabase guidance

Supabase stores application metadata, not every generated row by default.

Potential tables (finalize only as features require them):
- `profiles`
- `workspaces` and `workspace_members` if workspace support is introduced
- `projects` if projects are needed for grouping schemas
- `schemas`
- `api_keys`
- `generation_jobs` for asynchronous jobs
- `usage_events`

Use migrations for schema changes and keep them version-controlled.

### Security requirements
- Enable Row Level Security (RLS) on tables exposed through Supabase APIs.
- Write explicit policies so users can access only their own records or records shared through authorized membership.
- Never expose the Supabase service-role key to the browser.
- Keep secrets in environment variables and document required variables in `.env.example` using placeholder values only.
- Validate ownership on the server for every resource ID supplied by a client.
- Do not rely on hidden UI elements as authorization.
- Never commit `.env`, access tokens, private keys, or production credentials.

Use the Supabase server/browser client patterns correctly for the installed version of `@supabase/ssr`. Do not copy outdated auth middleware examples without checking compatibility with the current Next.js version.

## 9. Performance and scale

For the MVP:
- Generate moderate datasets in the request lifecycle with strict limits.
- Stream output or use background jobs only when needed and supported by the architecture.
- Avoid sending unnecessarily large JSON payloads to the browser.
- Keep generated data in memory only for the duration required.
- Add a worker and object storage if large exports exceed serverless request or response limits.
- Do not claim support for millions of rows until the implementation has been load-tested.

## 10. Testing and quality

Add tests for important behavior, especially:
- Schema validation and invalid input rejection
- Supported field generators
- Seeded reproducibility
- Relationship integrity
- JSON/CSV export correctness
- Record-count and payload-size limits
- API-key hashing, authentication, and revocation
- Authorization and cross-user data isolation
- Consistent API error responses

Before adding or upgrading test tooling, check the project's Node version and installed package versions. Avoid `--force` and `--legacy-peer-deps` as a first response to dependency conflicts. Prefer compatible versions and a clean dependency tree.

Run the relevant checks after changes, such as:
- `npm run lint`
- `npx tsc --noEmit`
- `npm test` (once configured)
- `npm run build`

If a check cannot run, report the exact blocker rather than claiming it passed.

## 11. Environment variables

Create or maintain `.env.example` with placeholder values only. Likely variables include:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Only add provider keys or other variables when the related feature is actually implemented. The service-role key must be server-only and must never use a `NEXT_PUBLIC_` prefix.

## 12. Implementation rules for the coding agent

1. Read the existing files and package configuration before editing.
2. Make the smallest complete change that solves the task.
3. Preserve existing UI and working behavior unless the task explicitly asks for a redesign or replacement.
4. Use TypeScript types that reflect real data; avoid `any` unless there is a documented reason.
5. Validate untrusted input at server boundaries with Zod.
6. Keep generation logic, validation, persistence, API handlers, and presentation separated.
7. Handle errors explicitly and provide actionable messages to users.
8. Do not add a dependency for a problem that can be solved cleanly with the current stack.
9. Do not invent environment variables, database tables, API routes, or provider configuration; inspect the project and document any required setup.
10. Do not claim a feature is complete unless it is implemented and verified.
11. Update tests and docs when changing a public API or schema format.
12. Never expose secrets, bypass RLS, or disable security checks to make a feature work.
13. If requirements are ambiguous and materially affect architecture or data integrity, ask one focused question; otherwise choose the simplest safe implementation and state the assumption.
14. At the end of a task, summarize what changed, which checks ran, their results, and any manual setup still required.

## 13. Suggested roadmap

### Phase 1 — Foundation
- Establish project conventions and environment setup.
- Implement Supabase authentication and protected dashboard routes.
- Add base layout, navigation, and useful empty states.

### Phase 2 — Generator
- Define schema types and Zod validation.
- Implement the deterministic generation engine and core generators.
- Add preview, count/seed controls, and JSON/CSV export.

### Phase 3 — Saved schemas
- Persist user-owned schemas securely.
- Support edit, duplicate, delete, and relationships.
- Add authorization and RLS tests.

### Phase 4 — Public API
- Implement API-key creation, hashing, revocation, and authentication.
- Add `/api/v1/generate`, quotas, rate limits, and API docs.
- Test request validation and error behavior.

### Phase 5 — Beta readiness
- Improve usage reporting, observability, accessibility, and error states.
- Review RLS policies and secret handling.
- Run production build and security checks.
- Invite a small group of developers and use feedback to prioritize the next iteration.

## 14. Naming note

**Datamint** is the current working name, not a confirmed legal or trademark clearance. Before public launch, check domain availability, package-name conflicts, and relevant trademarks. Keep the brand name centralized where practical so it can be changed without editing many unrelated components.

---

## Definition of done

A task is complete when:
- The requested behavior works in the actual app.
- Types, validation, authorization, and error handling are appropriate.
- Relevant tests and checks pass, or any blocker is stated accurately.
- Existing functionality and design have not been unintentionally broken.
- Required environment setup and user-facing documentation are updated.
