# 06 — Build Roadmap (Phase 2), Testing aur Deployment Plan (Phase 3)

Har step ke end mein ek **"Done check"** hai. Jab tak woh pass nahi hota, next step shuru nahi karenge.

---

## Phase 2 — Build steps

| Step | Kya banega | Aapko kya karna hoga (manual) | Done check |
|---|---|---|---|
| **0. Setup** | Accounts + tools | GitHub, Supabase (dev project), Vercel accounts; Chromebook Linux on; Node.js (nvm), Git, VS Code install | `node -v`, `git --version` chalte hain; Supabase project dashboard khulta hai |
| **1. Skeleton + Auth + Agency** | Next.js app, Tailwind/shadcn, Supabase auth, `/login` `/signup` `/onboarding`, tables: agencies, profiles, memberships + RLS | Supabase keys `.env.local` + Vercel mein daalna; email confirm test | Signup → agency create → dashboard (khaali). **2 agencies ke users ek doosre ka data nahi dekh sakte** (pehla isolation test) |
| **2. Leads** | Leads CRUD, search/filter/sort, assign, timeline, duplicate check, CSV import | Test data daalna, apni Excel file import karke dekhna | 50 leads import, filter/sort sahi, agent ko sirf assigned leads |
| **3. Follow-ups + Dashboard + Jobs** | follow_ups, tasks page, dashboard cards, priority list, notifications, `jobs` table, `/api/cron/tick`, Supabase Cron setup | Supabase SQL editor mein cron schedule run karna; `CRON_SECRET` set karna | Follow-up 5 min baad ka set → notification aata hai; cron 2 baar manually hit → **1 hi notification** |
| **4. Properties + Matching** | Inventory CRUD, photo upload (private storage), rule-based matching, share via wa.me | Kuch real/sample properties daalna | Lead kholo → sahi matches + reasons; doosri agency ki photo URL access → denied |
| **5. Site visits + Deals + Reports** | Visits (schedule/complete/no-show), deals, reports page | — | Lead full journey new → won; reports numbers manually verify |
| **6. Team & roles hardening** | Invites, role change, deactivate + reassign, audit logs, export | Doosre email se invite accept karna | Permissions matrix (doc 04) ka har row test |
| **7. AI** | Summary, qualification, reply suggestion (approve flow), usage logging + limits | Anthropic Console account, prepaid credit, spend limit, `ANTHROPIC_API_KEY` | 10 real-type leads par outputs check; usage table mein tokens; limit cross par message |
| **🎯 MVP demo** | — | **3–5 agents ko demo + pilot shuru** | Pilot feedback notes |
| **8. WhatsApp Cloud API** | Webhook (verify + signature), inbox, outbound with window/consent rules, opt-out, templates sync | Meta Business + Developer App, test number, webhook URL configure, templates submit | Test number se: incoming → lead banta hai; reply jaata hai; STOP → block; same webhook 2 baar → 1 message |
| **9. AI daily assistant + WhatsApp reminders** | `ai.daily_plan`, lead visit reminders via template | Templates approved hone ka wait | Subah plan dikhta hai; reminder 24h pehle test number par aata hai |

**Kaam karne ka tareeka har step mein:**
1. Main batata hoon kya banayenge aur kyun (Hinglish mein concept).
2. Main code likh ke branch par push karta hoon (complete files, sahi paths).
3. Aap terminal commands chalate ho / Vercel preview kholte ho.
4. Main test steps deta hoon; aap result / **exact error message** bhejte ho.
5. Fix → re-test → "Done check" pass → next step.

**Mock data rule:** Jahan bhi sample/demo data hoga, UI mein **"Demo data"** badge aur code mein `seed` folder — real data se mix nahi hoga. Jo feature abhi connected nahi (e.g. WhatsApp API MVP mein), uska button **"Coming soon / not connected"** dikhayega — fake success kabhi nahi.

---

## Phase 3 — Test plan

### 3.1 Agency isolation tests (sabse important)
Setup: Agency A (owner A1, agent A2), Agency B (owner B1).
| Test | Expected |
|---|---|
| A1 session se `select * from leads` | Sirf A ke leads |
| A1 B ke lead ki id se direct fetch | 0 rows / 404 |
| A1 insert lead with `agency_id = B` | RLS error |
| A1 update A ke lead ka `agency_id` → B | Blocked (trigger) |
| A2 (agent) doosre agent ka lead | Nahi dikhta (setting off) |
| A1 B ki property photo signed URL / storage path | Denied |
| Deactivated member login | Koi data nahi |
| Har public table par RLS on hai? | SQL check script pass |

### 3.2 Functional tests
- Lead create/edit/delete, duplicate phone, invalid phone, budget min > max error.
- Filters + sorting + search combinations; URL refresh par filters bane rehte hain.
- Follow-up: create → due → notification → done + next → overdue scenario (past date).
- CSV import: sahi file, galat columns, duplicates, 1,000 rows.
- Playwright e2e: signup → agency → lead → follow-up → visit → won.

### 3.3 WhatsApp tests (Meta test number / sandbox)
- GET verify galat token → 403; sahi → challenge.
- POST galat signature → 401.
- Same payload 2 baar (duplicate) → 1 message row.
- Out-of-order statuses (`read` phir `delivered`) → final `read`.
- 24h window ke bahar free text → server block.
- STOP → opt-out, pending reminders cancel; START → re-opt-in.
- Token invalid simulate → job dead + Owner notification.

### 3.4 Scheduler tests
- Cron endpoint bina secret → 401.
- Tick 2 baar parallel → har job ek hi baar.
- Forced failure (fake error) → retries backoff ke saath → 5th par dead + notification.
- Stuck `running` job → reaper requeue.
- Quiet hours mein lead-facing job → 09:00 IST par shift.

---

## Deployment plan

| Environment | Supabase | Vercel | Kab |
|---|---|---|---|
| **Local** | Dev project (Free) | `npm run dev` | Development |
| **Preview** | Dev project (Free) | Har branch push ka preview URL | Har step ka test |
| **Production** | **Alag Prod project (Pro)** | `main` branch → custom domain (Vercel Pro) | Pehle paying pilot se pehle |

Steps (Phase 3 mein detail mein):
1. GitHub repo → Vercel import → framework auto-detect (Next.js).
2. Vercel → Project → Settings → **Environment Variables** — Production aur Preview ke alag values (prod Supabase keys sirf Production mein).
3. Supabase migrations: `supabase link` → `supabase db push` (dev pe pehle, phir prod).
4. Supabase Auth → URL configuration: Site URL + redirect URLs (Vercel domain).
5. Supabase Cron → prod URL + prod `CRON_SECRET` (Vault mein store).
6. Meta → webhook URL = `https://<domain>/api/webhooks/whatsapp`.
7. Custom SMTP (invite/reset emails) configure.
8. Smoke test checklist production par.

**Deployment "successful" tab maanenge jab:** production URL par signup → lead → follow-up → notification flow chal jaaye aur isolation test production par bhi pass ho. Usse pehle nahi.

---

## Final checklist (preview — Phase 3 mein tick karenge)

**Security:** RLS sab tables par · service-role key sirf server · secrets Vercel env mein · `.env*` gitignored · webhook signature · cron secret · rate limits · spend caps (Supabase, Vercel, Anthropic) · 2FA on GitHub/Vercel/Supabase/Meta/Anthropic accounts · privacy policy + terms page.

**Backups:** Supabase Pro daily backups on · weekly `pg_dump` download (ya GitHub Action se encrypted backup) · ek baar **restore test** dev project mein.

**Monitoring:** Vercel logs · Sentry (errors) · System health panel (cron last run, dead jobs) · Supabase usage alerts · uptime monitor (free tier, e.g. UptimeRobot/Better Stack) on `/api/health`.

**Maintenance:** Har mahine dependencies update (`npm outdated`) · Meta Graph API version deprecation notices · WhatsApp template status sync · AI usage vs budget review · Supabase/Vercel bill review · pilot users se monthly feedback call.
