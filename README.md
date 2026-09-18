# Vibemates

**Find your vibe. Meet your tribe.** Vibemates helps friends plan private social events, record shared expenses and settle fairly without awkward maths. This repository is a mobile-first React pilot with a complete local Demo Mode and an optional secure Supabase data layer.

## Pilot scope

V1 supports private invite-only vibes, manually managed members, equal splits across everyone or selected people, audited expenses and recorded settlements. It deliberately has no public discovery, stranger matching, live location, email login or money transfer. Live accounts use SMS-verified mobile numbers through Supabase Auth. No Google account is required.

## Try the demo

1. Install Node.js 22 and pnpm 10.
2. Run `pnpm install`.
3. Run `pnpm dev` and open the address shown.
4. Enter a name and mobile number, or choose **Explore demo without a number**. Demo mode checks number format only; it never sends SMS or claims ownership verification.

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

Money is always represented as integer cents. The pure calculation engine lives in `src/lib/finance.ts`; it has no UI or database imports. Shared production records live in PostgreSQL. Supabase Auth owns the verified phone identity; memberships reference that user. Local storage caches the session, membership IDs, existing creator invite links, and demo data. Phone numbers are not included in group snapshots.

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
2. Open **SQL Editor**. Run every SQL file in `supabase/migrations/` in numeric order (001 through 009). Later migrations enable live joining, snapshots, settlements, admin expense/member management, phone ownership and optional foreign-currency entry.
3. In **Project Settings → API**, copy the project URL and **anon/public** key. Never copy the service-role key into this app.
4. Copy `.env.example` to `.env.local`.
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`.
6. Enable **Authentication → Providers → Phone** and configure a supported SMS provider. Keep provider credentials in Supabase, never in Vite variables.
7. Restart `pnpm dev`, request an SMS code, and verify it.

The database denies anonymous direct table access. RPC functions require the verified phone account, validate membership ownership, enforce admin checks where required, and perform expense + split + activity changes in one transaction. Review and extend RPC coverage before treating the pilot as a production financial system.

## GitHub and Pages

1. Create an empty GitHub repository (for example `vibemates`).
2. Commit this folder and push it to the `main` branch.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **GitHub Actions**.
5. Push to `main`. The workflow installs from the lockfile, lints, type-checks, tests, builds, then deploys only after everything passes.

Vite uses relative asset paths and hash routing, so a repository URL such as `https://USERNAME.github.io/vibemates/#/` works without server rewrites. For live mode, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Secrets and variables → Actions → Variables**, then run the workflow again.

## Common problems

- **Blank page after deployment:** confirm Pages uses GitHub Actions and the latest workflow succeeded.
- **Demo mode appears unexpectedly:** both Vite Supabase variables must be present at build time; restart after changing `.env.local`.
- **Invite rejected:** it may be revoked, expired, archived, full, or already claimed. Generate a new invite as admin.
- **Permission error:** confirm the migration ran fully. Never “fix” this by granting anonymous table writes.
- **A browser lost access:** sign in with the same verified phone number to recover linked memberships. For pre-migration memberships, sign in on the original browser once to link its bearer access before clearing storage.

## Security and future path

Migration 008 removes anonymous RPC access and binds claimed memberships to a verified Supabase phone identity. Existing bearer secrets are accepted only for one-time linking while signed in; afterwards ownership is enforced by auth.uid(). Private invitations still allow a verified invite-holder to claim a listed, unclaimed name, so share them only with your group. SMS delivery and cross-device account recovery must be checked against the configured provider before launch. Public discovery should only be added with verified identities, moderation, reporting, blocking and location-safety design.

## Screenshots

Add current 375 px and desktop screenshots here after deploying your branded instance. The included UI is responsive at 375, 390, 430 px, tablet and desktop widths.

## Usability update

The local demo now saves changes in this browser, supports adding mates, searching vibes and expenses, editing or deleting expenses, and confirming recorded payments. Expense entry previews exact shares before saving. Navigation is available on both desktop and mobile, including tabs for each vibe. Demo invites explicitly explain that sharing across devices requires a live connection.

Live mode includes existing-member claiming, duplicate-join prevention in the UI, payment confirmation and error handling, searchable expenses, and recoverable loading errors. A configured Supabase project with all migrations is still required to validate real multi-device use. Tests cover mocked SMS flows and execute all migrations in a local PostgreSQL engine (PGlite), including anonymous-access rejection, ownership isolation, legacy linking, joining, claims, and admin checks. They do not send real SMS or verify a deployed project.

## Settlement choices

- **Smart consolidate** nets the group’s balances into a deterministic greedy payment plan. It does not claim a mathematically optimal minimum number of transfers.
- **Direct split** repays original payers, cancelling mutual and circular debts and accounting for previous payments.
- **One coordinator** collects from debtors and redistributes to creditors through a selected mate, in two visible steps.

All methods retain exact integer cents, include prior recorded payments, and reconcile to zero. Whole-dollar rounding is deliberately not applied: dropping cents would change fair shares. The summary’s average is informational; individual shares follow the selected people on each expense. Stored server split shares preserve the same cent allocation for every viewer.

## Phone sign-in deployment

Apply migration 008 only once, after 001–007. It changes access rules, so deploy the updated client with it. Existing users should sign in on their original browser first to link old membership tokens to their phone account. New devices then recover linked memberships after SMS sign-in. The creator’s raw invite is still cached only on the original browser; other devices can access the group but must obtain an invite link from that browser.

Enable Phone Auth, configure an SMS provider, review provider costs and service limits, and configure Supabase rate limits before launch. The client has a 60-second resend cooldown; server limits remain authoritative. The implementation expects the standard six-digit SMS code. Phone-format validation uses libphonenumber-js; only successful server OTP verification marks a live account verified. No phone number appears in group tables or invite previews.

References: [Supabase Phone Auth](https://supabase.com/docs/guides/auth/phone-login), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp).

The old `vibemate-*` storage keys remain intentionally compatible so the Vibemates rebrand does not erase saved data.

## Optional international expenses

AUD remains the ledger and settlement currency. During vibe creation, expand **International trip options** and enable foreign-currency expenses. The regular expense form stays unchanged when this setting is off. When it is on, a user can select a supported currency and load the reference rate for the expense date before saving.

The app uses ECB reference rates through Frankfurter's public API because Google does not provide a supported Google Finance exchange-rate API for application use. Each foreign expense stores its original currency and amount, the AUD conversion, rate, date and provider. The database checks that the stored conversion reconciles to the AUD cents used by balances and settlement. No API key is required for the rate service.

Reference: [Frankfurter API and ECB provider](https://frankfurter.dev/providers/ecb/).
