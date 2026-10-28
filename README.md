# RealEstate LeadOS

AI-assisted lead management and follow-up automation for Indian real-estate agents and agencies.

> **Current status: Phase 2, Step 2b done.** Auth, agencies, leads (search, filters, assignment, bulk actions, timeline, CSV import) and a live dashboard are verified on the Supabase dev project and deployed to Vercel (Hobby plan, dev database): https://real-esatate-smoky.vercel.app. Reminders, properties, site visits, WhatsApp API and AI are not built yet.

## Blueprint documents

| # | Document | What it covers |
|---|---|---|
| 01 | [Product, problem & MVP](docs/01-product-and-mvp.md) | The agent's problem, MVP vs. advanced features, demand-validation plan |
| 02 | [Stack, architecture & costs](docs/02-stack-and-costs.md) | Recommended stack, Chromebook setup, architecture, env vars, monthly INR cost estimates |
| 03 | [Screens & flows](docs/03-screens-and-flows.md) | Every page, its buttons, the user flows, and the lead-to-deal state machine |
| 04 | [Database & security](docs/04-database-and-security.md) | Tables, relationships, auth, roles, RLS-based agency isolation |
| 05 | [WhatsApp, AI & scheduler](docs/05-whatsapp-ai-scheduler.md) | Webhooks, consent/opt-out, templates, AI guardrails, job queue with retries and dedupe |
| 06 | [Build roadmap & deployment](docs/06-build-roadmap-and-deployment.md) | Phase 2 build steps with done-checks, the Phase 3 test plan, deployment, and the final checklist |

## Stack

Next.js 16 (App Router, TypeScript, Cache Components) · Tailwind CSS · Supabase (Postgres, Auth; Storage and Cron later) · Zod · planned: Vercel, WhatsApp Business Platform Cloud API, Claude API

## Build steps (Phase 2)

| Step | Guide | Status |
|---|---|---|
| 0 | [Setup: Chromebook, tools, accounts](docs/steps/step-00-setup.md) | ✅ Done (setup check passed; Supabase and Vercel accounts created) |
| 1 | [App skeleton, login, agency, isolation test](docs/steps/step-01-auth-agency.md) | ✅ Done (signup/login/logout/agency verified by hand; live isolation test 12/12 passed) |
| 2 | [Leads, timeline, dashboard, first Vercel deploy](docs/steps/step-02-leads.md) | ✅ Done (41 unit tests, 58 local RLS checks, 14 manual checks, live isolation test 24/24; deployed to Vercel and checked on a phone) |
| 2b | [CSV import from Excel / Google Sheets](docs/steps/step-02b-csv-import.md) | ✅ Done (53 unit tests, local DB import tests, manual import checks, live isolation test 28/28) |
| 3 | Follow-up reminders, notifications, scheduled jobs | Next |

## Running locally

```bash
npm install
bash scripts/setup-env.sh    # creates .env.local (or copy .env.example by hand)
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development mode |
| `npm run build` | Production build (also type-checks) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript checks |
| `npm run test:unit` | Unit tests for phone, money, date, filter, form and CSV import helpers (Node 22.18+) |
| `npm run test:isolation -- you@gmail.com` | Live agency-isolation test against the Supabase dev project (needs "Confirm email" off) |
| `bash scripts/test-db-local.sh` | Applies all migrations to a throwaway local PostgreSQL and runs the RLS tests (needs PostgreSQL server binaries; not needed on the Chromebook) |
| `bash scripts/setup-env.sh` | Asks for the Supabase URL and publishable key, validates them, writes `.env.local` and tests the connection |
| `bash scripts/check-setup.sh` | Checks the machine setup (prints no secrets) |

Database changes live in `supabase/migrations/` and are applied in filename order.
