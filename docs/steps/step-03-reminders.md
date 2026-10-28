# Step 3: Follow-up reminders, 🔔 notifications aur scheduler

**Goal:** Agent app na bhi khole, tab bhi reminder taiyaar mile. Follow-up ka time aate hi notification aaye, subah ka summary aaye, aur naye assigned leads ki khabar mile. Yeh sab apne aap, har 5 minute.

**Time:** ~30–45 minute

| Bana hai ✅ | Abhi nahi ❌ |
|---|---|
| 🔔 Bell (unread ginti) + Notifications page | WhatsApp / SMS / email reminders (Version 1.1) |
| "Follow-up due" reminder, assigned agent ko | Phone par push notification (baad mein, PWA) |
| Subah 8:30 IST ke baad din ka summary (due + overdue) | Site visit reminders (Step 5) |
| Naye assigned leads ki ek grouped notification | |
| Background job queue: duplicate rok, retry, failure alert | |
| Dashboard par "Reminder system" health card (Owner/Manager) | |

---

## Pehle samjho: yeh kaise kaam karta hai

```
Supabase Cron (har 5 min)
      │
      ▼
run_scheduler()  ← database ke andar ek function
  1. Naya kaam dhoondho → "jobs" table mein daalo
     (har kaam ki ek unique chaabi, jaise follow_up_due:<lead>:<time>,
      isliye dobara chalne par bhi duplicate nahi banta)
  2. Har job chalao → "notifications" table mein entry
     • fail hua? 1 min, 5 min, 30 min, 2 ghante baad dobara koshish
     • 5 baar fail? "dead" + Owner/Manager ko ⚠️ alert
  3. Purana kachra saaf (14 din purane jobs, 90 din purani padhi hui notifications)
      │
      ▼
🔔 Bell har 1 minute (aur har page change par) unread ginti padhta hai
```

**Teen tarah ki notifications:**
1. **⏰ Follow-up due:** lead ka "next follow-up" time aa gaya. **Assigned agent** ko jaati hai. Sirf pichhle 24 ghante mein due hue leads ke liye, taaki purane imported leads se notifications ki baadh na aa jaaye. Purane overdue leads subah ke summary mein ginte hain.
2. **☀️ Subah ka summary:** 8:30 AM IST ke baad, din mein **ek baar**: "Today: 3 follow-ups, 2 overdue". Kuch due nahi hai to summary nahi aata.
3. **👤 New lead assigned:** jab Owner/Manager kisi aur ko lead de. Ek saath 50 leads diye, to **ek** notification aati hai: "50 new leads assigned to you". Khud ko diya lead ho to koi notification nahi.

**Pehle socha tha Vercel + secret key, ab kyun nahi?**
- Is step ka saara kaam database ke andar hi ho jaata hai. Isliye Cron seedha database function chalata hai.
- Koi secret key nahi, Vercel ki free-plan limit ka jhanjhat nahi, aur aap SQL Editor se khud test kar sakte ho.
- Jab WhatsApp/AI jaise bahar ke kaam aayenge, tab isi job queue mein ek worker jodenge.

**Security:**
- Har user sirf **apni** notifications dekh sakta hai, aur unme sirf "read" mark kar sakta hai.
- Job queue aur scheduler ko app ka koi user na padh sakta hai, na chala sakta hai.
- Health card sirf Owner/Manager dekh sakte hain.

**Nayi files:**
```
supabase/migrations/…_step3_scheduler.sql  ← notifications, jobs, run_scheduler(), scheduler_health()
supabase/cron/schedule.sql                 ← Cron ko "har 5 minute" batana
src/lib/notifications.ts                   ← notifications padhna
src/components/notification-bell.tsx       ← 🔔
src/app/(app)/notifications/…              ← list, "mark all as read"
src/app/(app)/dashboard/page.tsx           ← health card
```

---

## Part A: Naya code lao

`npm run dev` band karo (**Ctrl+C**):
```bash
cd ~/projects/RealEsatate
git pull
npm install
rm -rf .next
npm run test:unit
```
✅ `# pass 53`

---

## Part B: Database migration (pehle yeh)

1. GitHub → branch `claude/realestate-leados-blueprint-cc5zi2` → **`supabase/migrations/20261029000001_step3_scheduler.sql`** → **Copy raw file**.
2. Supabase → **SQL Editor** → **+ New query** → paste → **Run** ("destructive" warning aaye to **Run this query**).
3. ✅ "Success. No rows returned"
4. **Table Editor** mein 3 nayi tables: `notifications`, `jobs`, `scheduler_runs`. Kisi par "Unrestricted" ka label nahi hona chahiye.

⚠️ Vercel naya code apne aap live karega. Migration chalne tak live site par bell khaali dikhega aur Notifications page error dega. Isliye yeh step pehle karo.

---

## Part C: Supabase Cron on karo (har 5 minute)

**C1. Cron extension on karo**
1. Supabase → left menu **Integrations** → **Cron** → **Enable pg_cron** (ya **Enable**) dabao.
   - Integrations mein na dikhe → **Database → Extensions** → search `pg_cron` → toggle **ON**.

**C2. Schedule banao**
1. GitHub se **`supabase/cron/schedule.sql`** → **Copy raw file**.
2. **SQL Editor** → **+ New query** → paste → **Run**.
3. ✅ Result mein ek number aayega (job id, jaise `1`).

**C3. Check karo**
SQL Editor mein:
```sql
select jobname, schedule, active from cron.job;
```
✅ `leados-scheduler | */5 * * * * | true`

5–10 minute baad yeh chalao:
```sql
select status, start_time from cron.job_run_details order by start_time desc limit 5;
```
✅ `succeeded` wali lines.

**Cron band karna ho kabhi:** `select cron.unschedule('leados-scheduler');`

---

## Part D: Test karo

`npm run dev` → `localhost:3000` (ya apna Vercel URL).

| # | Kya karo | Kya hona chahiye |
|---|---|---|
| 1 | **Dashboard** (Owner ho to) | **"✅ Reminder system running"** card, "Last run X min ago". Cron abhi on hi kiya ho to 5 min ruko ya #3 karo |
| 2 | Ek lead kholo → **Assigned to = aap khud** → **Next follow-up = abhi se 2 minute baad** → Save | |
| 3 | 2 minute baad SQL Editor mein `select public.run_scheduler();` (ya Cron ka 5 min wait) | `{"enqueued": …, "succeeded": …}` jaisa result |
| 4 | App mein koi bhi page kholo | 🔔 par **laal ginti**. Click karo → "⏰ Follow-up due: …" |
| 5 | Notification par click | Lead ka page khule; bell ki ginti 1 kam |
| 6 | SQL Editor mein `select public.run_scheduler();` **2 baar aur** | **Koi nayi notification nahi** (duplicate rok) |
| 7 | Lead ka follow-up **dobara** 2 min aage karo, 2 min baad #3 | **Nayi** reminder (naya time = naya reminder) |
| 8 | Agar abhi 8:30 AM IST ke baad hai aur aapke paas due/overdue leads hain | "☀️ Today: N follow-ups, M overdue" (din mein ek hi baar) |
| 9 | Notifications page → **Mark all as read** | Bell ki ginti gayab |
| 10 | **Failure test** (neeche wala SQL) | Dashboard: "Failed for good: 1" + 🔔 mein "⚠️ A background task failed" |
| 11 | Phone par Vercel URL | Bell aur Notifications page theek dikhein |

**Test #10 ka SQL** (jaan-boojh kar ek kharab kaam daalo, jo ek hi koshish mein "dead" ho jaaye):
```sql
insert into public.jobs (agency_id, type, idempotency_key, max_attempts)
select id, 'test_failure', 'test-failure-' || now(), 1
from public.agencies where name = 'Sharma properties';

select public.run_scheduler();
```
(`'Sharma properties'` ki jagah apni agency ka exact naam likho.)

**"New lead assigned" notification abhi haath se test nahi ho sakti,** kyunki iske liye doosra team member chahiye (invite Step 6 mein aayega). Ise maine database tests mein check kiya hai (doc mein neeche).

---

## Part E: Isolation test

```bash
npm run test:isolation -- divijjain25@gmail.com
```
✅ Naya section **[Notifications & scheduler — Step 3]** (7 checks), aur end mein **🎉 ALL ISOLATION CHECKS PASSED**.

---

## Maine pehle se kya test kiya (aapke Supabase se pehle)

Local database mein, "time" ko apni marzi se aage-peeche karke, 33 checks:
- Reminder sirf open, assigned, pichhle 24 ghante mein due leads ke liye; closed/unassigned/purane leads ke liye nahi
- Scheduler 3 baar chalaya → ek bhi duplicate notification nahi
- Follow-up reschedule → naya reminder; beech mein lead "Won" ho gaya → purana reminder chupchaap skip
- Assignment: 4 leads → **ek** notification "4 new leads assigned to you"; khud ko diya → kuch nahi
- Subah ka summary: din mein ek, 8:30 IST se pehle nahi, kuch due nahi to nahi
- Fail hota job: 1m → 5m → 30m → 2h backoff, 5 baar ke baad "dead", Owner ko **ek** alert (agent ko nahi)
- 10 minute se atka job dobara uthaya gaya
- Agent sirf apni notifications dekhe aur sirf "read" badal sake; scheduler/jobs app users ke liye band; doosri agency kuch nahi dekh sakti

---

## ✅ Done check: mujhe yeh bhejo
1. Part C3 ka `cron.job` result (`leados-scheduler … true`)
2. Part D ki 11 checks: "sab theek" ya kaunsa number fail hua
3. Isolation test ka poora output

---

## 🛠 Errors aur fix

| Error | Matlab | Fix |
|---|---|---|
| `schema "cron" does not exist` | pg_cron on nahi hua | Part C1 |
| `function public.run_scheduler() does not exist` | Step 3 migration nahi chala | Part B |
| Notifications page: "Could not load notifications" | Same | Part B, phir `notify pgrst, 'reload schema';` |
| Health card: "⏸ not started" | Cron ne abhi tak ek baar bhi nahi chalaya | Part C2; ya ek baar `select public.run_scheduler();` |
| Health card: "🔴 stopped" | 15 min se Cron nahi chala | `select * from cron.job;` mein `active = true`? `cron.job_run_details` mein error dekho |
| Bell par ginti nahi aati | Follow-up time abhi aaya nahi, lead kisi aur ko assigned hai, ya lead Won/Lost hai | Lead **aapko** assigned ho, time beet chuka ho, phir `select public.run_scheduler();` |
| `permission denied for function run_scheduler` (app se) | Sahi hai, app users ise nahi chala sakte | Sirf SQL Editor / Cron se chalta hai |
