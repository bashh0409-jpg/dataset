This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## k6 smoke test

With the app running locally, run a small public-route smoke test:

```bash
npm run test:load:smoke
```

The test uses one virtual user for three iterations and checks the landing, terms, and privacy pages. To target another environment, set `BASE_URL` explicitly (for example, `BASE_URL=https://staging.example.com npm run test:load:smoke`). This is a smoke test, not a capacity or stress test.

To smoke-test the protected workspace and API route guards:

```bash
npm run test:load:workspace
```

By default this verifies that `/workspace` redirects signed-out visitors, including Next.js streamed redirects, and that billing and webhook routes reject unauthenticated or invalid requests without creating checkouts or webhook events. Expected auth/validation error statuses are treated as normal responses, while route-specific checks still fail on unexpected statuses. To also verify a signed-in workspace page, set `AUTH_COOKIE` to the browser's current cookie header for a dedicated test account; the cookie is used only for the workspace page request. Never use a production session cookie. The current app has no public `/api/v1` data-generation endpoint, so this test does not exercise a generation API or trigger AI usage.

## OAuth sign-in

Set `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your environment. Enable Google and GitHub under Supabase Authentication providers. Email sign-in uses Supabase's default magic-link templates and does not require template customization.

In Supabase **Authentication → URL Configuration**, set the Site URL to your deployed app URL and add each app callback to the Redirect URLs allow list. For local development, add `http://localhost:3000/**` (and `http://127.0.0.1:3000/**` if you use that address). If a callback URL is not allowlisted, Supabase can redirect to the Site URL instead, which may send a local sign-in back to production. The Google/GitHub provider callback URL remains the Supabase Auth callback URL shown in the provider settings; it is separate from your app's `/auth/callback`.

### Local email testing with Supabase

For local development, run the Supabase stack locally and use Supabase's built-in mail catcher so emails can be tested without a production SMTP setup:

```bash
npm run supabase -- start
```

This starts the local Supabase services, including the local auth API and the email capture UI. You can then:

- Use `http://localhost:54321` as the local Supabase URL.
- Set `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321` in your `.env.local` file.
- The local Supabase Auth configuration allows callbacks on `http://localhost:3000` and `http://127.0.0.1:3000`.
- View captured emails at `http://localhost:54324` (Inbucket / mail catcher UI).

The local Supabase project also exposes the anon/service-role keys in the terminal output from `supabase start`; copy those into your local environment file so the app and auth flows work on localhost.

After OAuth sign-in, new users complete onboarding by adding their name and creating a workspace. They can send a single-use workspace invitation by email; the invitation expires after seven days and can only be accepted by the invited email address. Workspace members can post short messages while mentioning one or more teammates; all members can see the shared feed, and mentioned users see unread counts until they open it.

Signed-in workspace users can submit bug reports with one combined problem/steps/expected-result description, up to five images (3 MiB each), and an optional voice note (up to 90 seconds). Cloudflare Turnstile runs invisibly when a report is submitted and is verified on the server; Cloudflare may still present a challenge when needed. Create a Turnstile widget in Cloudflare, allow the app's production hostname (and `localhost` for development), and set its site key as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and secret as the server-only `TURNSTILE_SECRET_KEY`. Attachments are stored in a private Supabase Storage bucket. Browser/device and page diagnostics are included by default and can be removed before sending. Apply `20261029000000_create_bug_reports.sql`, `20261029001000_add_bug_report_attachments.sql`, `20261029002000_harden_bug_reports.sql`, `20261029003000_fix_bug_report_upload_policy.sql`, and `20261029004000_limit_bug_report_images.sql` to enable submissions, private attachment uploads, and abuse limits. Each user may submit up to five reports per hour and upload up to 30 attachments / 100 MiB per rolling 24 hours.

## Data generator

Agent mode can infer and generate up to 10 related tables from SQL `CREATE TABLE` definitions, including declared foreign keys. Supported uploaded SQL schemas are parsed locally to avoid an AI round trip; other code and schema formats continue through AI schema inference. All tables use the requested row count (up to 2,000 total rows per request); select a table in the Data panel to preview or export its records. The `idNumber` field type creates clearly synthetic `TEST-` prefixed values, not valid government identifiers. SQL is treated as schema text only and is never executed.

The workspace **Generate** section supports AI-assisted generation through OpenRouter's `qwen/qwen3.7-plus` model for free users and Claude Sonnet 5.5 or OpenAI GPT-4.1 for Pro workspaces. An active Pro subscription owned by the workspace owner grants Pro models to all workspace members; a member's own active Pro subscription also grants access. A positive workspace credit balance unlocks premium models, and one shared workspace credit is spent on every AI generation request, including requests using the Standard/Free model. Pro premium usage is tracked per member, not shared: each member gets 50 premium requests, with a full allowance restored four hours after using the 50th request. There is no monthly premium request cap, and one member reaching the limit does not affect teammates. Until their allowance refreshes, that member's requests fall back to the Free model. Free-model requests are limited to 50 per user in a rolling 24-hour window. Auto uses atomic in-flight reservations to route requests to whichever configured provider currently has fewer active requests, alternating when load is tied. Reservations are released when the provider responds and expire automatically after two minutes if a request is interrupted. Workspace credit purchases are available only to workspace owners, add 500 credits after Polar confirms payment, and are shared by workspace members. Free users are restricted to the Free model on the server, regardless of client input. In manual mode, configure the dataset name, fields, field types, enum options, and record count; up to 500 records are generated locally. In Agent mode, describe the data and the AI asks for a record count if one is missing. Agent conversations and generated datasets are shared with workspace members. Dragged and auto-cleaned schema layouts are saved with their generated tables; apply `20261030000000_add_ai_generated_artifact_canvas_positions.sql` after the generated-artifacts migration to enable this. Apply the conversation, artifact, workspace-sharing, workspace-credit, and workspace-Pro-access migrations to enable these features. Add a server-only `OPENROUTER_API_KEY` to enable Qwen. OpenRouter account credits, model availability, and pricing may apply. Results can be viewed as a table, JSON, or CSV, and JSON/CSV can be copied or downloaded.

### Pro plans and AI providers

The **Go Pro** button in the workspace toolbar starts a Polar subscription checkout. The starter Polar product is intended to be a **$10/month recurring subscription**. An active Pro subscription owned by a workspace owner enables Free, Auto, Claude Sonnet 5.5, and OpenAI GPT-4.1 for all workspace members; personal Pro subscribers also retain access. A positive workspace credit balance unlocks premium models, and each AI generation request (including Standard/Free requests) spends one shared workspace credit when available. Auto balances concurrent provider load across the configured providers using database-backed in-flight reservations. Set both server provider keys if you want Auto to choose between both; if only one is configured, Auto uses that provider. Premium usage is limited to 50 requests per member, then that member's full allowance resets four hours after their 50th request. There is no monthly premium cap, and members have independent allowances. Requests made while an allowance is exhausted fall back to the Free model; workspace credits do not bypass this wait. Provider credentials are encrypted at rest with AES-256-GCM and are never returned to the browser after saving.

To enable Pro:

1. Apply the conversation migrations, including `20261026210000_create_ai_generated_artifacts.sql`, `20261030000000_add_ai_generated_artifact_canvas_positions.sql`, `20261027230000_share_conversations_with_workspace.sql`, and `20261027233000_add_workspace_ai_credits.sql`, to enable workspace-shared chats, generated-data previews, saved schema layouts, and workspace credits.
2. Apply `20261026180000_add_pro_subscriptions_and_ai_credentials.sql` after the existing migrations, then apply `20261026203000_create_pro_ai_provider_balancing.sql` for balanced Auto routing, `20261026204000_add_pro_ai_rolling_limit.sql` for Pro request tracking, `20261026224000_add_polar_billing_idempotency.sql` for subscription checkout and webhook idempotency, `20261026225000_harden_pro_ai_provider_rpcs.sql` to restrict provider-balancing RPCs to trusted server code, `20261026230000_add_free_ai_rolling_limit.sql` for the rolling Free model cap, `20261027230000_share_conversations_with_workspace.sql` for shared conversations, `20261027233000_add_workspace_ai_credits.sql` for workspace credits, `20261028003000_workspace_pro_access_and_allowances.sql` for owner-funded workspace Pro access and per-member allowances, `20261028004000_workspace_credits_unlock_premium_models.sql` to allow credits to unlock premium requests, `20261028005000_charge_workspace_credits_for_premium_requests.sql` to charge an available workspace credit for each premium request, `20261028006000_charge_workspace_credits_for_standard_requests.sql` to charge available credits for Standard/Free generation too, `20261028007000_add_workspace_mentions.sql` for shared workspace mentions, `20261028183000_prevent_self_workspace_mentions.sql` to prevent self-mentions, and `20261028203000_add_workspace_member_avatars.sql` to return workspace member avatar URLs.
3. Create a monthly Pro product in Polar and configure its product ID as `POLAR_PRO_PRODUCT_ID`. Create a separate one-time product for a single 500-credit workspace top-up and configure it as `POLAR_WORKSPACE_CREDITS_PRODUCT_ID`. Create an organization access token and webhook secret.
4. Register `https://<your-app-host>/api/webhooks/polar` in Polar for subscription created, updated, active, canceled, cycled, past-due, paused, resumed, revoked, and uncanceled events, as well as `order.paid` for workspace credit purchases.
5. Set `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRO_PRODUCT_ID`, `POLAR_WORKSPACE_CREDITS_PRODUCT_ID`, `POLAR_ENVIRONMENT` (`sandbox` while testing, `production` for live billing), and `NEXT_PUBLIC_SITE_URL`.
6. Configure server-only `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` to fund the included requests. Users who choose their own keys do not require these server provider keys.
7. Set `AI_CREDENTIALS_ENCRYPTION_KEY` to a securely generated base64url-encoded 32-byte key (for example, generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`). Keep it private and back it up securely; changing it makes existing saved provider keys unreadable, so users would need to save them again.

Apply the same Polar environment (sandbox or production) to both products, the access token, and the webhook. Provider prices and usage are variable; included request caps and workspace credit balances limit app-funded usage but do not guarantee a fixed provider cost. For current token pricing, see [Anthropic's pricing](https://platform.claude.com/docs/en/about-claude/pricing) and [OpenAI's pricing](https://developers.openai.com/api/docs/pricing).

Checkout requests are protected by a database-backed per-user claim and reuse an existing open Polar checkout session. If a request fails after Polar created the session, a retry checks Polar for that session before creating another. Signed subscription webhooks are deduplicated by Polar's webhook event ID in the same database transaction as the subscription update. These controls protect against repeated checkout requests and webhook deliveries; they do not block legitimate recurring subscription renewals. The installed Polar SDK does not expose a checkout idempotency-key option, so this is database-backed request deduplication and recovery, not a provider-level exactly-once guarantee for ambiguous network failures.

Pro AI provider reservations are only callable by the server's service-role client. The generation action verifies the signed-in user and Pro subscription first, then passes that user ID to the restricted reservation functions; clients cannot directly create or release provider reservations.

### Workspace invitation emails

Workspace invitations are sent with Resend. Set `RESEND_API_KEY` to a server-only Resend API key and `RESEND_FROM_EMAIL` to a sender address verified by Resend. Set `NEXT_PUBLIC_SITE_URL` to the app's public origin (`http://localhost:3000` for local development) so the emailed invitation points to the correct app. In production, use your deployed HTTPS URL and a verified sending domain. The invite URL is only sent to the recipient; the raw token is not returned to the browser.

## Supabase CLI in VS Code

The Supabase CLI is installed as a project dependency. Use the VS Code integrated terminal to authenticate and link this checkout to your hosted project:

```bash
npm run supabase -- login
npm run supabase -- link
```

The CLI prompts you to authenticate and choose a project. You can also link directly with `npm run supabase -- link --project-ref <project-ref>`. Once linked, send SQL to the hosted database from the terminal:

```bash
npm run supabase -- db query --linked "select now();"
```

Linked queries use your Supabase CLI access token and may require `database_read` permission; write queries require `database_write`. Treat `--linked` queries as production operations and review SQL carefully before running it. Keep schema changes in migration files so they can be reviewed and reproduced.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
