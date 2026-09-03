# VibeMate

**Find your vibe. Meet your tribe.** VibeMate helps friends plan private social events, record shared expenses and settle fairly without awkward maths. This repository is a mobile-first React pilot with a complete local Demo Mode and an optional secure Supabase data layer.

## Pilot scope

V1 supports private invite-only vibes, manually managed members, equal splits across everyone or selected people, audited expenses and recorded settlements. It deliberately has no public discovery, stranger matching, live location, email login or money transfer. Browser-held membership tokens are convenient for a friends pilot, but they are not a replacement for a verified account.

## Try the demo

1. Install Node.js 22 and pnpm 10.
2. Run `pnpm install`.
3. Run `pnpm dev` and open the address shown.
4. Choose **View Demo**. No Supabase account is needed.

Try: open Goa Getaway, add an expense paid by any participant, inspect balances, then open Settle up. Other people do not need to join for the maths to work.

## Architecture

```text
Friends’ phones
      ↓
GitHub Pages — static React/Vite app
      ↓
Supabase JS client (anon key only)
      ↓
PostgreSQL + RLS + narrow SECURITY DEFINER RPCs
```

Money is always represented as integer cents. The pure calculation engine lives in `src/lib/finance.ts`; it has no UI or database imports. Shared production records live in PostgreSQL. Local storage remembers only which membership this browser owns.

## Technology

React 19, strict TypeScript, Vite, Lucide, Recharts, Supabase JS, Vitest, React Hook Form/Zod-ready form architecture, PostgreSQL/RLS, and GitHub Pages Actions.

## Project map

```text
src/components       reusable UI
src/lib              money, splitting, settlement, routing, storage
src/services         demo fixture and Supabase client
src/types            domain types
supabase/migrations  versioned schema and secure RPCs
tests                pure financial tests
public               PWA manifest and icons
.github/workflows    validation and Pages deployment
```

## Commands

```bash
pnpm dev        # local app
pnpm lint       # code quality
pnpm typecheck  # strict TypeScript
pnpm test       # unit tests
pnpm build      # production bundle in dist/
```

## Connect a free Supabase project

1. Create a project at Supabase and wait for it to finish provisioning.
2. Open **SQL Editor**. Paste and run `supabase/migrations/001_initial_schema.sql`.
3. In **Project Settings → API**, copy the project URL and **anon/public** key. Never copy the service-role key into this app.
4. Copy `.env.example` to `.env.local`.
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
6. Restart `pnpm dev`.

The database denies anonymous direct table access. RPC functions hash invite/member tokens, validate vibe membership, enforce admin checks where required, and perform expense + split + activity changes in one transaction. Review and extend RPC coverage before treating the pilot as a production financial system.

## GitHub and Pages

1. Create an empty GitHub repository (for example `vibemate`).
2. Commit this folder and push it to the `main` branch.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **GitHub Actions**.
5. Push to `main`. The workflow installs from the lockfile, lints, type-checks, tests, builds, then deploys only after everything passes.

Vite uses relative asset paths and hash routing, so a repository URL such as `https://USERNAME.github.io/vibemate/#/` works without server rewrites. Add Supabase values as GitHub Actions variables if enabling live mode in the hosted build.

## Common problems

- **Blank page after deployment:** confirm Pages uses GitHub Actions and the latest workflow succeeded.
- **Demo mode appears unexpectedly:** both Vite Supabase variables must be present at build time; restart after changing `.env.local`.
- **Invite rejected:** it may be revoked, expired, archived, full, or already claimed. Generate a new invite as admin.
- **Permission error:** confirm the migration ran fully. Never “fix” this by granting anonymous table writes.
- **A browser lost access:** clearing site data removes its local bearer token. In Pilot V1, an admin must provide a fresh invite/claim path.

## Security and future path

Anyone who obtains a raw browser membership token can act as that member. Keep invite links private, use HTTPS, never log raw tokens, and rotate revoked invites. Supabase Auth can later replace the browser-token identity boundary while keeping member IDs, expense calculations and UI components intact. Public discovery should only be added with verified identities, moderation, reporting, blocking and location-safety design.

## Screenshots

Add current 375 px and desktop screenshots here after deploying your branded instance. The included UI is responsive at 375, 390, 430 px, tablet and desktop widths.
