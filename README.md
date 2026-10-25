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

## OAuth sign-in

Set `NEXT_PUBLIC_SUPABASE_URL` and either `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your environment. Enable Google and GitHub under Supabase Authentication providers. Email sign-in uses Supabase's default magic-link templates and does not require template customization. Add your app URL with `/auth/callback` to the Supabase redirect URL allow list (for local development: `http://localhost:3000/auth/callback`).

After OAuth sign-in, new users complete onboarding by adding their name and creating a workspace. They can generate a single-use invite link for a teammate; links expire after seven days and can only be accepted by the invited email address.

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
