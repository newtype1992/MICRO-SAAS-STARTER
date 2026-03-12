# Micro SaaS Starter Template

This repository is a backend-first starter template for building micro SaaS applications using:

- Supabase for database, auth, storage, and local infrastructure
- Next.js for the first authenticated application shell
- Codex CLI for implementation and iteration
- migrations-first schema management with RLS enabled by default

## Current Milestone

The starter now supports the first real SaaS workflow:

- sign up or sign in with Supabase Auth
- land in a protected dashboard
- create an organization through the `create_organization` RPC
- switch between organizations with a persisted active workspace
- initialize a canonical subscription row for every organization
- display workspace billing state and entitlement usage
- log billing lifecycle events into the workspace activity feed
- apply plan-based retention windows to historical activity and invite history
- invite members through server-owned actions
- resend or revoke invites from the owner dashboard
- accept invites through a dedicated onboarding link
- read back profile, membership, and invite data through RLS-protected queries

## Local Development Setup

1. Run `npm install`
2. Copy `.env.example` to `.env.local`
3. Fill `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `supabase status -o env`
4. Optional: set `RESEND_API_KEY` and `EMAIL_FROM` to enable invite email delivery
5. Optional: set Stripe keys to enable paid checkout and portal flows
6. In Stripe, create recurring prices with lookup keys:
   - `micro-saas-starter-pro-monthly`
   - `micro-saas-starter-business-monthly`
7. Point your Stripe webhook to `/api/stripe/webhooks`
8. Run `supabase start`
9. Run `npm run dev`
10. Open `http://localhost:3000`

## Verification

- Run `npm run test:backend` to verify the sensitive local flows:
  - org and membership RPCs
  - entitlement limits and retention windows
  - Stripe webhook sync and billing activity logs
- Run `npm run build` before shipping template changes
- GitHub Actions now runs the same verification flow automatically on pull requests and pushes to `main`

## Production Deployment

This template is designed for:

- local Supabase during development
- hosted Supabase in preview and production
- Vercel for app hosting

### Recommended path

Use Vercel's native GitHub integration as the default deployment path.

1. Import this GitHub repository into Vercel
2. Let Vercel detect the Next.js app
3. Create a hosted Supabase project
4. Push this repo's migrations to the hosted Supabase project
5. Add the hosted Supabase environment variables to Vercel
6. Deploy Preview and Production from Vercel

### Promote local Supabase to hosted Supabase

Your local Supabase Docker stack is for development only. To make the backend live:

1. Create a hosted Supabase project in the Supabase dashboard
2. Run `supabase login`
3. Run `supabase link --project-ref <your-project-ref>`
4. Run `supabase db push`
5. Copy the hosted project values into Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` only if you want webhook/service-role features live

Do not use local values like `http://127.0.0.1:54321` in Vercel.

### Minimum Vercel environment variables

Required for the app to function:

- `APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional until you want those features live:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`

### Auth and redirect configuration

When you move to hosted Supabase, update Supabase Auth settings to allow your deployed URLs.

At minimum, configure:

- your Vercel production domain
- your Vercel preview domain pattern if you want preview auth flows to work
- any local development URL you still use, such as `http://localhost:3000`

### Deployment ownership

This template assumes Vercel native Git integration as the default deployment model.
That keeps deployment simple and avoids extra GitHub deployment secrets.

## Local URLs

- App: `http://localhost:3000`
- Supabase Studio: `http://127.0.0.1:54323`
- Local inbox: `http://127.0.0.1:54324`

## Development Philosophy

- Backend first
- Migrations only, no direct schema edits
- RLS enabled on user data
- server-owned writes for billing and audit-sensitive records
- server-owned invite and membership changes
- Local development before production deployment
