# Step 1: App ka dhaancha, Login, Agency aur pehla Isolation Test

**Goal:** Aapke Chromebook par app chale, aap signup → agency create → dashboard tak pahunch sako, aur ek test se prove ho ki **ek agency doosri agency ka data nahi dekh sakti**.

**Time:** ~45–60 minute

**Is step mein kya bana hai (aur kya nahi):**

| Bana hai ✅ | Abhi nahi ❌ |
|---|---|
| Landing page, Signup, Login, Logout, Forgot/Reset password | Leads, follow-ups (Step 2–3) |
| "Create your agency" (aap Owner banoge) | Team invite (Step 6) |
| Dashboard, jo aapki agency ka naam aur role dikhata hai | Vercel par live deploy (Step 2 ki shuruaat mein) |
| Database: `agencies`, `profiles`, `memberships` + RLS | WhatsApp, AI |

Dashboard par "Coming next (not connected yet)" box jaan-boojh kar hai, taaki koi fake button na dikhe.

---

## Pehle samjho: kaun si file kya karti hai

```
src/
├── proxy.ts                     ← har request se pehle chalta hai: login session refresh + redirect
├── lib/
│   ├── supabase/env.ts          ← .env.local se Supabase URL + key padhta hai
│   ├── supabase/server.ts       ← server par Supabase se baat karne wala "client"
│   ├── supabase/proxy.ts        ← proxy ka asli logic (kaunse pages login maangte hain)
│   ├── auth.ts                  ← "kaun logged in hai? kis agency ka hai?" (ek hi jagah)
│   └── auth-errors.ts           ← Supabase ke error codes → samajh aane wale messages
├── components/form.tsx          ← input box, button, error/success message (reusable)
└── app/                         ← har folder = website ka ek page (URL)
    ├── page.tsx                 ← "/"  landing page
    ├── (auth)/login, signup, forgot-password, reset-password   ← forms
    ├── (auth)/actions.ts        ← forms submit hone par server par chalne wala code
    ├── auth/callback/route.ts   ← email link (confirm/reset) yahan aata hai
    ├── onboarding/              ← "Create your agency"
    └── dashboard/               ← login ke baad ka page
supabase/migrations/…_step1_tenancy.sql   ← database tables + security rules
scripts/test-isolation.mjs                ← agency isolation ka live test
```

**4 concepts jo is step mein aaye:**

1. **Server Component vs Client Component:** Normal page files server par chalti hain. Wahan secret cheezein safe rehti hain, aur browser ko sirf HTML jaata hai. Jis file ke upar `"use client"` likha hai (jaise forms), woh browser mein bhi chalti hai, kyunki button dabana aur loading dikhana browser ka kaam hai.
2. **Server Action (`"use server"`):** Jab aap form submit karte ho, `actions.ts` ka function **server par** chalta hai: input check (Zod) → Supabase → redirect. Browser ko password check karne ka code dikhta hi nahi.
3. **RLS (Row Level Security):** Database ka security guard. Har query par Postgres khud check karta hai, "kya yeh user is agency ka member hai?". Isliye agar app ke code mein galti bhi ho, tab bhi doosri agency ka data nahi milega.
4. **`create_agency` function:** Agency aur aapki "Owner" membership dono **ek saath** banti hain. Seedha `agencies` table mein insert karna mana hai; sirf yeh function kar sakta hai.

> Next.js 16 ka naya rule: jo hissa login/cookies padhta hai, woh `<Suspense>` ke andar hota hai. Isliye page ka bahari dhaancha turant dikhta hai aur aapka data ek pal baad aata hai ("Loading your dashboard…"). Yeh normal hai.

---

## Part A: Naya code apne Chromebook par lao

Terminal kholo:
```bash
cd ~/projects/RealEsatate
git pull
npm install
```
- `git pull`: GitHub se mera naya code laata hai.
- `npm install`: `package.json` mein likhi libraries (Next.js, Supabase, Zod…) download karta hai `node_modules` folder mein (~300–400 MB, 1–3 minute).

✅ End mein `found 0 vulnerabilities` jaisa kuch aana chahiye. `npm warn deprecated …` wali lines warnings hain, error nahi.

---

## Part B: Database tables banao (Supabase SQL Editor)

**B1. SQL copy karo (GitHub website se, sabse aasaan):**
1. Chrome mein `github.com/Divijjain25/RealEsatate` kholo.
2. Upar left mein branch dropdown (likha hoga `main` ya kuch aur) → **`claude/realestate-leados-blueprint-cc5zi2`** chuno.
3. Folders kholo: **`supabase` → `migrations` → `20261026000001_step1_tenancy.sql`**.
4. File ke upar right side **"Copy raw file"** icon (do overlapping squares) par click karo. Poori file copy ho jaayegi.

**B2. Supabase mein chalao:**
1. **supabase.com** → apna **`leados-dev`** project kholo.
2. Left menu mein **SQL Editor** (`>_` icon).
3. **+ New query** (ya "New SQL snippet").
4. Khaali box mein click → **Ctrl+V** (paste).
5. Neeche right **Run** button (ya **Ctrl+Enter**).
6. Agar warning aaye "This query has destructive operations" → **Run this query** (yeh `revoke` ki wajah se aata hai, data delete nahi hota).

✅ Neeche **"Success. No rows returned"** aana chahiye.

**B3. Check karo:** Left menu → **Table Editor**. Teen tables dikhni chahiye: `agencies`, `memberships`, `profiles`. Kisi par bhi **"RLS disabled"** ya **"Unrestricted"** ka laal/peela label **nahi** hona chahiye.

⚠️ Yeh SQL **sirf ek baar** chalana hai. Dobara chalaoge to `type "member_role" already exists` error aayega. Iska matlab pehle se ho chuka hai, ghabrao mat.

---

## Part C: Supabase Auth settings (sirf dev project ke liye)

**C1. Email confirmation band karo (dev ke liye):**
Left menu **Authentication** → **Sign In / Providers** (ya "Providers") → **Email** → **"Confirm email"** ko **OFF** karo → **Save**.

*Kyun?* Supabase ka built-in email service ghante mein sirf kuch hi emails bhejta hai. Testing mein hum baar-baar signup karenge, aur isolation test bhi naye users banata hai. **Production project mein yeh ON rahega** (Phase 3 checklist mein likha hai).

**C2. Website ka address batao:**
**Authentication** → **URL Configuration**:
- **Site URL:** `http://localhost:3000`
- **Redirect URLs** → **Add URL** → `http://localhost:3000/**` → Save

*Kyun?* Password reset email ka link sirf in addresses par wapas aa sakta hai. Yeh security ke liye hai, taaki koi aur website aapke login link ka galat use na kar sake.

---

## Part D: `.env.local` file banao (Supabase ka address + public key)

Sirf **2 cheezein** chahiye: **Project URL** aur **Publishable key**.

**D1. Project URL nikalo:** Chrome mein apna Supabase project kholo. Address bar mein link aisa hoga:
`supabase.com/dashboard/project/abcdefghijklmnop`. Aakhri hissa (`abcdefghijklmnop`) aapka **project ID** hai. Project URL hai:
`https://abcdefghijklmnop.supabase.co`
(Yahi URL Supabase mein ⚙ **Project Settings → Data API** par bhi likha hota hai.)

**D2. Publishable key copy karo:** Left menu ke neeche ⚙ **Project Settings** → **API Keys** → **Publishable key** wale box ke saath **Copy** button. Key `sb_publishable_…` se shuru hoti hai. Agar yeh nahi dikhe, to **"Legacy API Keys"** tab mein **`anon` `public`** key copy karo.

🔴 **`secret` / `service_role` key mat copy karna.** Woh is file mein nahi jaati.

**D3. Aasaan tareeka: helper script.** Terminal mein:
```bash
cd ~/projects/RealEsatate
git pull
bash scripts/setup-env.sh
```
Script do sawaal poochhegi. Har sawaal par value paste karo (**Ctrl+Shift+V**) aur **Enter** dabao. Galat cheez paste ki (jaise secret key) to script rok degi. End mein woh Supabase se check karti hai, aur **"✅ Supabase ne URL aur key dono accept kar li"** aana chahiye.

**D4. Manual tareeka (agar script na chale):** Terminal mein:
```bash
cd ~/projects/RealEsatate
cp .env.example .env.local
nano .env.local
```
`nano` ek simple text editor hai jo terminal ke andar khulta hai:
1. Arrow keys se `NEXT_PUBLIC_SUPABASE_URL=` line ke end par jao → **Ctrl+Shift+V** se Project URL paste karo.
2. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` line ke end par → publishable key paste karo.
3. `=` ke baad **koi space ya quotes nahi**. Aisa dikhna chahiye:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdxyz.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
   ```
4. Save: **Ctrl+O** → **Enter**. Bahar niklo: **Ctrl+X**.

*Kyun safe hai?* `.env.local` file `.gitignore` mein hai, to yeh **kabhi GitHub par nahi jaayegi**. Aur yeh dono values waise bhi public hain; asli suraksha RLS se hai.

---

## Part E: App chalao aur haath se test karo

```bash
npm run dev
```
✅ Terminal mein `Local: http://localhost:3000` aur `✓ Ready` dikhega. **Yeh terminal khula chhodo** (app isi mein chal rahi hai).

Chrome mein **http://localhost:3000** kholo aur yeh karo:

| # | Kya karo | Kya hona chahiye |
|---|---|---|
| 1 | Landing page → **Start free pilot** | Signup form |
| 2 | Apna naam, email, password (8+ characters) → **Create account** | "Create your agency" page |
| 3 | Agency name (jaise "Jain Realty"), city → **Create agency** | Dashboard: agency ka naam, **Your role: Owner** |
| 4 | **Log out** | Login page |
| 5 | Address bar mein `localhost:3000/dashboard` type karo | Wapas **Login** par bhej dega (bina login dashboard nahi) |
| 6 | Galat password se login | "Email or password is incorrect." |
| 7 | Sahi password se login | Seedha Dashboard (agency dobara nahi maangega) |

App band karni ho to terminal mein **Ctrl+C**.

---

## Part F: Isolation test (sabse important)

App band karke (Ctrl+C), ya ek **naya terminal tab** (Ctrl+Shift+T) kholke:
```bash
cd ~/projects/RealEsatate
npm run test:isolation -- divijjain25@gmail.com
```
(Apna koi bhi asli email de sakte ho. Script `divijjain25+leadosA…@gmail.com` jaise do test users banati hai. Confirm email OFF hai, to koi email nahi jaayega.)

Script kya karti hai: do test users **A** aur **B**, dono ki alag agency. Phir **A, B ka data padhne, badalne aur B ki agency mein ghusne ki koshish karta hai**, bilkul ek chalaak user ki tarah.

✅ Expected end: **`🎉 ALL ISOLATION CHECKS PASSED`**

Cleanup (optional): Supabase → **Authentication → Users** → `+leados…` wale 2 users delete karo. Phir SQL Editor mein:
```sql
delete from agencies where name like 'Isolation Test Agency %';
```

---

## ✅ Done check: mujhe yeh bhejo

1. Part E ke 7 tests mein se koi fail hua? (Sab theek hai to bas "sab pass" likho; nahi to us step ka number aur jo dikha.)
2. Part F ka **poora output** copy karke bhejo. Isme koi secret nahi hai, sirf test emails aur ✅/❌.

Dono theek → **Step 2: Leads** (aur app pehli baar Vercel par live).

---

## 🛠 Errors aur unke fix

| Error (terminal ya browser mein) | Matlab | Fix |
|---|---|---|
| `Supabase settings missing…` | `.env.local` nahi mili ya khaali hai | Part D dobara; phir `npm run dev` **band karke dobara** chalao |
| `Invalid API key` / `No API key found` | Galat key copy hui (adhoori, ya secret key) | Publishable key dobara copy karo, `=` ke baad space nahi |
| `Could not find the table 'public.memberships'` / `function public.create_agency … not found` | SQL migration nahi chala | Part B karo. Chala chuke ho to SQL Editor mein `notify pgrst, 'reload schema';` chalao aur 1 minute ruko |
| `Please confirm your email first` | Confirm email abhi bhi ON hai | Part C1 |
| Test script: `"Confirm email" is still ON` | Same | Part C1 |
| `Too many attempts…` / `email rate limit exceeded` | Supabase ki email limit | 1 ghanta ruko, ya Confirm email OFF karo |
| `Port 3000 is in use` | App pehle se kisi aur terminal mein chal rahi hai | Purana terminal dhoondh ke Ctrl+C, ya Chromebook restart |
| Reset link kholne par "That link didn't work" | Link purana hai, ya doosre browser mein khola | Same browser (Chrome) mein naya reset link mangao |
| `Could not create the agency` | Database ne mana kiya | `npm run dev` wale terminal ki laal line copy karke bhejo |
| `npm ERR!` during install | Internet / disk | Error ki last 20 lines bhejo |

Koi bhi error aaye to **exact text** copy karke bhejo (screenshot bhi chalega). Andaaze se mat batana.
