# Step 2: Leads, Timeline, Dashboard + pehli baar Vercel par live

**Goal:**
- Leads add, edit, search, filter, assign aur delete kar sako.
- Har lead ki apni timeline ho.
- Dashboard par asli numbers aur "Today's priority list" dikhe.
- App internet par ek asli URL par chale, jise phone par bhi khol sako.

**Time:** ~60–90 minute

| Bana hai ✅ | Abhi nahi ❌ |
|---|---|
| Leads: add / edit / delete (soft), saare fields | CSV import (Step 2b) |
| Search (naam ya phone), filters, sorting, pages | Site visits, deals, properties (Step 4–5) |
| Assign + bulk actions (Owner/Manager) | Team invite (Step 6), isliye abhi agents nahi jod sakte |
| Lead timeline: auto entries + call log + notes | WhatsApp API, AI (baad mein) |
| Dashboard: due today, overdue, hot/warm/cold, priority list | Reminders / notifications (Step 3) |
| WhatsApp button (click-to-chat: aap khud Send dabate ho) | |

---

## Pehle samjho: is step ke naye concepts

1. **`leads` table + RLS (role ke hisaab se):**
   - **Owner/Manager:** agency ke saare leads dekhte hain.
   - **Agent:** sirf apne assigned leads dekhta hai.
   - Agent kisi aur ko lead "de" nahi sakta, aur delete bhi nahi kar sakta.
   - Yeh sab database khud check karta hai, sirf UI par button chhupana kaafi nahi.
2. **Phone normalization:** `98765 43210`, `098765-43210`, `+91 98765 43210` teeno ko app `+919876543210` bana deti hai. Isse ek hi aadmi do baar add nahi hota. Database bhi ek agency mein ek number sirf ek baar allow karta hai.
3. **Budget "80L / 1.2 Cr":** aap waise hi likho jaise bolte ho. App rupees mein store karti hai aur wapas "₹80 L" dikhati hai.
4. **Timeline (`lead_activities`):** status, temperature, assignee ya follow-up badla, to database ka **trigger** khud entry likh deta hai. Isliye history kabhi "bhooli" nahi jaati. Call aur note aap khud jodte ho. Timeline sirf aage badhti hai (append-only): koi entry badli ya mitayi nahi ja sakti.
5. **IST time:** database mein time UTC mein rehta hai, screen par India time (IST) dikhta hai. "Due today" ka matlab India ka aaj hai.
6. **Soft delete:** "Delete" se lead list se hat jaati hai, par database mein `deleted_at` ke saath rehti hai. Galti hone par wapas laayi ja sakti hai (restore button baad mein aayega).

**Nayi files (kaun kya karta hai):**
```
supabase/migrations/…_step2_leads.sql   ← leads + timeline tables, RLS, triggers
src/lib/phone.ts, money.ts, dates.ts    ← phone, ₹ lakh/crore, IST helpers (unit tested)
src/lib/leads/constants.ts              ← status, source, BHK jaise options
src/lib/leads/schema.ts                 ← form validation (Zod)
src/lib/leads/filters.ts                ← URL (?status=hot…) → filters
src/lib/leads/queries.ts                ← database se padhne wale functions
src/app/(app)/layout.tsx                ← upar ka menu (Dashboard, Leads, + Add lead)
src/app/(app)/leads/…                   ← list, new, [id] detail, [id]/edit, actions
src/app/(app)/dashboard/page.tsx        ← asli numbers + priority list
tests/unit/*.test.ts                    ← helper functions ke 41 tests
```

---

## Part A: Naya code lao

`npm run dev` chal raha ho to us terminal mein **Ctrl+C** se band karo. Phir:
```bash
cd ~/projects/RealEsatate
git pull
npm install
npm run test:unit
```
✅ `npm run test:unit` ke end mein **`# pass 41`** aur **`# fail 0`** aana chahiye. Ye tests sirf aapke Chromebook par chalte hain, internet ya Supabase nahi chahiye.

---

## Part B: Database mein Step 2 tables banao

Step 1 jaisa hi tareeka hai:
1. GitHub par branch `claude/realestate-leados-blueprint-cc5zi2` kholo → **`supabase` → `migrations` → `20261027000001_step2_leads.sql`** → **Copy raw file**.
2. Supabase → **SQL Editor** → **+ New query** → paste karo → **Run**. "Destructive operations" warning aaye to **Run this query** dabao.
3. ✅ **"Success. No rows returned"**
4. **Table Editor** mein 2 nayi tables dikhni chahiye: `leads` aur `lead_activities`. Kisi par "RLS disabled" ya "Unrestricted" ka label nahi hona chahiye.

⚠️ Sirf **ek baar** chalana hai. Dobara chalaoge to `already exists` error aayega.

---

## Part C: Apne Chromebook par test karo

```bash
npm run dev
```
Chrome mein **http://localhost:3000** kholo aur login karo.

| # | Kya karo | Kya hona chahiye |
|---|---|---|
| 1 | Upar **+ Add lead** | Form khulega |
| 2 | Naam, phone `98765 43210`, budget from **`lots`** likho → **Save lead** | Laal error: "Budget from: write it like 80L…". **Baaki bhara hua data waise hi rahe** (status, BHK bhi) |
| 3 | Budget `60L` aur `80L`, BHK 2BHK, locations `Wakad, Baner`, temperature Hot, aaj ki koi time → **Save lead** | Lead page khulega: budget **₹60 L – ₹80 L**, phone **+91 98765 43210** |
| 4 | **Update** box mein Status → *Contacted* → **Save changes** | "Saved." aur timeline mein "Status: New → Contacted" |
| 5 | **Log a call** → "Connected" → kuch likho → **Save call** | Timeline mein 📞 entry; "Last contacted" bhar jaayega |
| 6 | **+ Add lead** se dobara wahi number `+91 98765-43210` daalo | Error: "already exists…" + **Open existing lead** link |
| 7 | 2–3 aur leads add karo (alag numbers) | |
| 8 | **Leads** page: search box mein naam ka hissa → **Apply** | Sirf matching leads |
| 9 | Filter **Hot** / **Due today** / **Overdue** try karo | List badalni chahiye |
| 10 | Checkbox lagao → **With selected… → Set temperature → Cold** → **Apply** | "Updated N leads." |
| 11 | Ek lead → **Edit** → naam badlo → **Save changes** | Naya naam dikhe |
| 12 | Ek lead → **Delete lead** → OK | List se gayab |
| 13 | **Dashboard** | Due today / Overdue / Hot… ke numbers aapke leads se match karein, aur "Today's priority list" mein aaj ke leads dikhein |
| 14 | Lead page par **WhatsApp** | Naya tab mein WhatsApp khulega, message pehle se likha hua. Bhejna aapko khud hai |

Neeche-left "N" ke paas laal **Issues** badge dikhe to click karke screenshot bhejo.

---

## Part D: Isolation test (ab leads ke saath)

Naye terminal tab mein (**Ctrl+Shift+T**):
```bash
cd ~/projects/RealEsatate
npm run test:isolation -- divijjain25@gmail.com
```
✅ End mein **`🎉 ALL ISOLATION CHECKS PASSED`**. Naye **[Leads — Step 2]** section mein 11 checks hain: B, A ke leads na padh sakta hai, na badal sakta hai, na delete kar sakta hai, na note jod sakta hai, na A ki agency mein lead bana sakta hai, na A ke phone number dhoondh sakta hai.

---

## Part E: Vercel par live karo 🚀

**Concept:** Vercel aapke GitHub code se app **build** karta hai aur ek public URL deta hai (jaise `realesatate.vercel.app`). Aage se har `git push` par app apne aap update hogi.

**E1. Project import karo**
1. **vercel.com** → login (GitHub se) → **Add New…** → **Project**.
2. **Import Git Repository** list mein **RealEsatate** dhoondho → **Import**.
   - Repo list mein nahi dikhe → **Adjust GitHub App Permissions** → RealEsatate repo ko access do → wapas aao.
3. **Configure Project** screen par:
   - **Framework Preset:** Next.js (apne aap aana chahiye)
   - **Root Directory:** `./` (jaisa hai waisa)
   - **Environment Variables** kholo aur yeh **2** add karo. Values wahi hain jo aapki `.env.local` mein hain:

     | Key | Value |
     |---|---|
     | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
     | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |

     `.env.local` ki values dekhni ho to terminal mein `cat .env.local` chalao. Isme sirf public values hain.
4. **Deploy** dabao. 1–3 minute ruko.

✅ "Congratulations!" screen aur ek URL milega. Use kholo, landing page dikhna chahiye.

**E2. Supabase ko naya address batao** (password reset links ke liye)
Supabase → **Authentication → URL Configuration → Redirect URLs → Add URL**:
`https://AAPKA-PROJECT.vercel.app/**` → **Save**. Site URL abhi `http://localhost:3000` hi rehne do.

**E3. Phone par test karo**
Apne mobile ke Chrome mein Vercel URL kholo → login → **Leads** → ek lead → **Call** aur **WhatsApp** buttons dabao. Phone par yeh seedhe dialer aur WhatsApp app kholte hain.

⚠️ **Zaroori baatein:**
- **Vercel Hobby plan sirf personal/non-commercial use** ke liye hai. Testing aur demo ke liye theek hai. Pehla paying customer aane se pehle Pro lena hoga (doc 02).
- Agar Vercel kahe ki branch mein code nahi hai, ya build purane code se ho: Vercel project → **Settings → Git → Production Branch** = `claude/realestate-leados-blueprint-cc5zi2` → Save → **Deployments** → **Redeploy**.
- Abhi live app aur local app **dono ek hi Supabase dev project** use karte hain, to data dono jagah same dikhega. Production ke liye alag Supabase project Phase 3 mein banega.

---

## ✅ Done check: mujhe yeh bhejo

1. `npm run test:unit` ki last 8 lines (`# pass 41` wali)
2. Part C ki 14 checks: "sab theek" ya kaunsa number fail hua aur kya dikha
3. Part D isolation test ka **poora output**
4. Aapka **Vercel URL**, aur kya phone par login + leads khule

Sab theek → **Step 3: Follow-up reminders, notifications aur scheduled jobs**.

---

## 🛠 Errors aur fix

| Error | Matlab | Fix |
|---|---|---|
| `Could not load leads: … relation "public.leads" does not exist` / `Could not find the table 'public.leads'` | Step 2 SQL nahi chala | Part B; chala chuke ho to SQL Editor mein `notify pgrst, 'reload schema';` aur 1 minute ruko |
| `Could not find a relationship between 'leads' and 'profiles'` | Same | Same |
| `type "lead_status" already exists` | SQL dobara chala diya | Kuch nahi karna, pehli baar wala kaam ho chuka hai |
| `npm run test:unit` → `Cannot find module` / syntax error | Node purana hai | `node -v` 22.18+ hona chahiye; `nvm install --lts` |
| Isolation test: "did you run the Step 2 migration?" | Same | Part B |
| Vercel build: `Supabase settings missing` | Vercel mein env variables nahi daale | Project → Settings → Environment Variables → dono add karo → Deployments → Redeploy |
| Vercel par login ke baad wapas login page | Galat key/URL Vercel mein | Values `.env.local` se dobara copy karo (space nahi) → Redeploy |
| Live par password reset link "didn't work" | Redirect URL add nahi kiya | Part E2 |
| Dashboard par numbers 0 jabki leads hain | Follow-up date set nahi, ya leads Won/Lost hain | Lead mein next follow-up set karo; "Open leads" mein Won/Lost nahi gine jaate |

Koi bhi error aaye to **exact text ya screenshot** bhejo.
