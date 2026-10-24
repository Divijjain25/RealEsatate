# RealEstate LeadOS

AI-assisted lead management and follow-up automation for Indian real-estate agents and agencies.

> **Current status: Phase 1 — Blueprint only.** No application code exists yet. Nothing described in these docs is built, deployed, or tested until a later commit says so.

## Blueprint documents

| # | Document | What it covers |
|---|---|---|
| 01 | [Product, problem & MVP](docs/01-product-and-mvp.md) | The agent's problem, MVP vs. advanced features, demand-validation plan |
| 02 | [Stack, architecture & costs](docs/02-stack-and-costs.md) | Recommended stack, Chromebook setup, architecture, env vars, monthly INR cost estimates |
| 03 | [Screens & flows](docs/03-screens-and-flows.md) | Every page, its buttons, the user flows, and the lead-to-deal state machine |
| 04 | [Database & security](docs/04-database-and-security.md) | Tables, relationships, auth, roles, RLS-based agency isolation |
| 05 | [WhatsApp, AI & scheduler](docs/05-whatsapp-ai-scheduler.md) | Webhooks, consent/opt-out, templates, AI guardrails, job queue with retries and dedupe |
| 06 | [Build roadmap & deployment](docs/06-build-roadmap-and-deployment.md) | Phase 2 build steps with done-checks, the Phase 3 test plan, deployment, and the final checklist |

## Planned stack

Next.js (App Router, TypeScript) · Tailwind CSS + shadcn/ui · Supabase (Postgres, Auth, Storage, Cron) · Vercel · WhatsApp Business Platform Cloud API · Claude API

## Build steps (Phase 2)

| Step | Guide | Status |
|---|---|---|
| 0 | [Setup: Chromebook, tools, accounts](docs/steps/step-00-setup.md) | In progress — waiting on setup-check output |

Check your machine setup with `bash scripts/check-setup.sh` (prints versions and yes/no checks only, no secrets).
