# Step 2b: Excel / Google Sheets se leads import (CSV)

**Goal:** Agent ke purane leads (Excel ya Google Sheet mein pade hue) ek baar mein LeadOS mein aa jaayein, bina duplicate ke. Galat rows ki saaf list bhi mile, jise Excel mein theek karke dobara import kiya ja sake.

**Time:** ~20–30 minute

**Kaun kar sakta hai:** sirf Owner / Manager. Agents ko button nahi dikhega, aur server bhi mana karega.

---

## Pehle samjho: kaise kaam karta hai

1. **CSV kya hai?** Spreadsheet ka sabse simple format: har line ek row, aur columns comma se alag. Excel aur Google Sheets dono CSV mein save kar sakte hain. `.xlsx` file seedhe nahi chalegi; app khud bata degi ki CSV mein kaise save karna hai.
2. **File aapke browser mein padhi jaati hai.** Poori file server par upload nahi hoti. Sirf woh rows jaati hain jo aap import karte ho.
3. **Column matching:** app header dekh ke khud andaaza lagati hai, jaise "Mobile No" → Mobile, "Area" → Locations, "Remarks" → Notes. Galat ho to dropdown se badal do.
4. **Samajhdaar conversions:**
   - **Budget:** "60-80L", "1-1.5 Cr", "45L" sab samajh aata hai.
   - **BHK:** "2,3 BHK" se 2BHK aur 3BHK dono ban jaate hain.
   - **Source:** "99 Acres" → 99acres, "FB" → Facebook, "Walk in" → Walk-in.
   - **Status:** "Interested" → Qualified, "Not interested" → Lost.
   - **Date:** India wala format **DD/MM/YYYY** (time na ho to 10:00 AM IST maana jaata hai).
5. **Preview:** import se pehle har row ka result dikhta hai:
   - ✓ **Ready**
   - laal: **problem** (jaise galat number)
   - narangi: **file mein repeat** number
6. **Duplicate rok (database ke level par):** jo number pehle se LeadOS mein hai, woh dobara nahi banega. Summary mein "Already in LeadOS" ginti dikhegi.
7. **Server dobara check karta hai:** browser ka preview sirf madad ke liye hai. Server har row ko phir se validate karta hai. Phir database function `import_leads` har row alag se daalta hai, taaki ek kharab row poore import ko na roke. RLS yahan bhi lagu hai.
8. **Problem rows ki file:** import ke baad "Download rows that were not imported" dabao. Aapki original rows ek extra column **"Why not imported"** ke saath milengi. Excel mein theek karo aur dobara import karo.

**Nayi files:**
```
supabase/migrations/…_step2b_import.sql      ← import_leads() database function
src/lib/leads/import.ts                      ← CSV padhna, columns guess karna, values samajhna (unit tested)
src/app/(app)/leads/import/page.tsx          ← /leads/import page
src/app/(app)/leads/import/lead-importer.tsx  ← 4 steps wala screen
src/app/(app)/leads/import/actions.ts        ← server par dobara check + database call
public/sample-leads.csv                      ← sample file
```

---

## Part A: Naya code lao

`npm run dev` band karo (**Ctrl+C**), phir:
```bash
cd ~/projects/RealEsatate
git pull
npm install
rm -rf .next
npm run test:unit
```
✅ `# pass 53` aur `# fail 0`

---

## Part B: Database function banao (zaroori, pehle yeh karo)

1. GitHub par branch `claude/realestate-leados-blueprint-cc5zi2` → **`supabase/migrations/20261028000001_step2b_import.sql`** → **Copy raw file**.
2. Supabase → **SQL Editor** → **+ New query** → paste karo → **Run**.
3. ✅ "Success. No rows returned"

⚠️ Vercel naya code apne aap live kar dega. Jab tak yeh SQL nahi chalta, live site par import "The database refused this batch" error dega. Baaki app pe asar nahi padega.

---

## Part C: Test karo

```bash
npm run dev
```
`localhost:3000` → **Leads** → **Import CSV**.

| # | Kya karo | Kya hona chahiye |
|---|---|---|
| 1 | **Download a sample CSV** dabao, phir wahi file chuno | Columns apne aap match ho jaayein, preview mein 3 rows "✓ Ready" |
| 2 | **Import 3 leads** | Summary: Imported 3 |
| 3 | Wahi sample file **dobara** import karo | Summary: **Already in LeadOS 3**, aur kuch bhi duplicate na bane |
| 4 | Apni ek asli Excel file lo → **File → Save As → CSV UTF-8** → import | Columns check karo, galat match ho to dropdown se badlo |
| 5 | Kisi row mein jaan-boojh kar galat number (`12345`) daal ke import karo | Woh row laal; import ke baad **Download rows that were not imported** se "Why not imported" column wali file mile |
| 6 | Koi `.xlsx` file seedhe chuno | Message: "This is an Excel file… Save As CSV UTF-8" |
| 7 | **Leads** list aur **Dashboard** | Import hue leads dikhein, ginti badhe |

**Google Sheets se:** File → Download → **Comma-separated values (.csv)**.

**Excel tips:**
- Phone numbers `9.88E+09` jaise dikh rahe hon to Excel mein us column ko **Text** format karke dobara save karo.
- Dates DD/MM/YYYY mein rakho.

---

## Part D: Isolation test (import ke checks ke saath)

```bash
npm run test:isolation -- divijjain25@gmail.com
```
✅ Naya section **[CSV import — Step 2b]** (4 checks) aur end mein **`🎉 ALL ISOLATION CHECKS PASSED`**.

---

## ✅ Done check: mujhe yeh bhejo
1. `npm run test:unit` ka `# pass / # fail`
2. Part C ki 7 checks: "sab theek" ya kaunsa number fail hua
3. Isolation test ka poora output
4. (Optional) Live site par bhi ek baar sample import try karo

Sab theek → **Step 3: Follow-up reminders + notifications**.

---

## 🛠 Errors aur fix

| Error | Matlab | Fix |
|---|---|---|
| "The database refused this batch" | Step 2b SQL nahi chala | Part B |
| `Could not find the function public.import_leads` | Same | Part B. Chala chuke ho to SQL Editor mein `notify pgrst, 'reload schema';` |
| Saari rows "not a valid mobile number" | Galat column Mobile se match hua, ya Excel ne number ko `9.88E+09` bana diya | Dropdown check karo; Excel mein column Text format karke save karo |
| Hindi naam `????` ya ajeeb characters | File "CSV UTF-8" mein save nahi hui | Excel: Save As → **CSV UTF-8 (Comma delimited)** |
| "The file has N rows. Import at most 2000" | File badi hai | Do files mein baanto |
| Date wali rows fail | Date MM/DD format mein hai | DD/MM/YYYY karo |
