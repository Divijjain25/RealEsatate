# 01 — Product, Problem aur MVP Scope

> **Status:** Phase 1 (Blueprint). Abhi koi code nahi likha gaya hai. Is document mein jo bhi "feature" likha hai, woh *plan* hai — built/tested nahi.

---

## 1. Problem kya hai? (Real-estate agent ki asli dikkat)

Ek typical Indian real-estate agent / chhoti agency (2–15 log) ka din aisa hota hai:

| Dikkat | Asli zindagi mein kaisa dikhta hai | Paisa kahan doobta hai |
|---|---|---|
| **Leads bikhre hue hain** | 99acres, MagicBricks, Housing.com, Facebook ads, walk-ins, referrals — sab alag jagah. Kuch WhatsApp mein, kuch diary mein, kuch Excel mein. | Lead aaya, kisi ne call hi nahi kiya. |
| **Follow-up bhool jaana** | "Sir, Sunday ko call karna" — aur Sunday ko yaad hi nahi aaya. | Real estate mein deal 5–15 follow-ups ke baad hoti hai. Ek missed follow-up = competitor ko gift. |
| **Hot vs cold pata nahi** | 200 leads mein se aaj kis ko call karein? Agent apne mood se decide karta hai. | Time cold leads par waste, hot leads thande ho jaate hain. |
| **WhatsApp chaos** | Personal number par 500 chats. Lead ka budget/BHK kya tha, scroll karke dhoondhna padta hai. Agent chhod ke gaya to saari chats uske saath gayi. | Data aur relationship agency ka nahi, agent ka ban jaata hai. |
| **Inventory match manually** | Client ne bola "2BHK, Wakad, 80 lakh tak". Agent ko yaad karna padta hai kaunsi properties fit hoti hain. | Slow response = client doosre broker ke paas. |
| **Owner ko visibility nahi** | Agency owner ko nahi pata kaunsa agent kitna kaam kar raha hai, kaunsa lead source paisa la raha hai. | Ad budget galat source par kharch hota hai. |

**RealEstate LeadOS ka one-line promise:**
> *"Har lead ek jagah, har follow-up time par, aur roz subah pata ho ki aaj kis ko call karna hai."*

---

## 2. Target user (pehle kis ke liye banayenge?)

- **Primary:** Chhoti agencies / channel partners (owner + 2–10 agents), resale + new-project dono.
- **Secondary:** Solo agents jo mahine ke 50–300 leads handle karte hain.
- **Not now:** Bade builders / 100+ seat sales teams (unko complex CRM chahiye — Salesforce/LeadSquared jaisa).

> Market mein already Indian real-estate CRMs aur lead tools hain (jaise Sell.Do, LeadSquared, Kylas, Privyr etc.). Validation ke time inko khud try karna aur agents se poochhna ki "aap ye kyun use nahi karte / karte ho" — yeh sabse useful sawaal hai. Humara angle: **simple, WhatsApp-first, AI-assisted, aur chhoti agency ke budget mein.**

---

## 3. MVP vs Advanced — kya pehle banega?

Rule: **MVP itna chhota ho ki aap (beginner) 6–8 hafte mein bana ke 3–5 real agencies ko demo kar sako.**

### ✅ MVP (Version 1) — "Lead + Follow-up machine"

| # | Feature | MVP mein kitna |
|---|---|---|
| 1 | Login / signup | Email + password (Supabase Auth). Forgot password. |
| 2 | Agency (multi-tenant) | Signup ke baad "Create Agency". Har agency ka data dusri se 100% alag (Row Level Security). |
| 3 | Team + roles | Owner, Manager, Agent. Email invite. |
| 4 | Leads | Add/edit/delete, saare fields (name, phone, budget, location, BHK, type, source, status, temperature, notes, next follow-up). Duplicate phone check. |
| 5 | Search / filter / sort / assign | Name/phone search; status, temperature, source, assigned agent, follow-up date filters; sorting; bulk assign. |
| 6 | CSV import | Excel se purane leads laana (bahut zaroori — koi bhi agent zero se start nahi karta). |
| 7 | Follow-ups / tasks | Har lead par next follow-up; Today / Overdue / Upcoming lists; "Done + next date" ek click mein. |
| 8 | Reminders | **In-app** notifications + scheduled job jo overdue mark kare aur roz subah ka summary banaye. |
| 9 | Dashboard | Total leads, hot/warm/cold, aaj ke follow-ups, overdue, site visits, deals, conversion rate. |
| 10 | Property inventory | Price, location, BHK, type, possession, photos (Supabase Storage). |
| 11 | Property matching | **Rule-based** (budget ± 10%, location, BHK, type) — AI nahi, simple aur explainable. |
| 12 | Site visits | Schedule, reschedule, complete + feedback, cancel/no-show. |
| 13 | Deals | Lead "Won" karne par deal value + commission. |
| 14 | Lead source report | Source-wise leads, site visits, won, conversion %. |
| 15 | WhatsApp (MVP version) | **Click-to-chat** (`wa.me` link with pre-filled text). Agent apne phone se bhejta hai. Free, koi Meta approval nahi chahiye. |
| 16 | AI (MVP version) | Lead summary + qualification score + reply suggestion. Agent edit/approve karta hai, phir copy ya click-to-chat. AI kabhi khud kuch nahi bhejta. |
| 17 | "Aaj ki priority list" | Rule-based ranking (overdue hot leads pehle, phir aaj ke, phir stale warm leads). |

### 🟡 Version 1.1 — "WhatsApp + AI assistant" (MVP ke real users milne ke baad)

- WhatsApp Business Platform (Cloud API): incoming messages webhook, shared team inbox, outbound replies (24-hour window ke andar free-form, bahar sirf approved templates).
- Consent (opt-in) tracking + opt-out (STOP) handling.
- Template-based reminders: site visit reminder lead ko (utility template), agent ko follow-up alerts.
- AI daily sales assistant: roz subah har agent ke liye "Top 10 leads + kya bolna hai".
- Incoming WhatsApp message se lead auto-create + AI se budget/BHK/location extract.

### 🔵 Advanced (Version 2+) — abhi mat banao

- WhatsApp Embedded Signup (har agency khud 1-click mein apna number connect kare — iske liye Meta Tech Provider banna padta hai).
- Portal integrations (99acres / MagicBricks / Housing.com lead pull, Facebook Lead Ads webhook).
- Subscription billing (Razorpay), plans, invoices.
- Broadcast campaigns, drip sequences.
- Mobile app / PWA push notifications.
- Call recording / call notes transcription.
- AI property matching (semantic), AI-generated property descriptions.
- Custom fields, multi-branch, advanced analytics, Hindi/regional UI.
- Commission splits, payouts, document management (agreements, KYC).

> **Kyun aisa split?** WhatsApp Cloud API ke liye Meta Business verification, app review, templates approval — sab mein time lagta hai aur yeh aapke control mein nahi hai. Agar MVP isi par depend karega to demo atak jaayega. Isliye MVP `wa.me` links se kaam chalayega (100% kaam karta hai, aaj se), aur official API 1.1 mein aayega.

---

## 4. Demand validation — code se pehle aur saath-saath

Code likhna sasta lagta hai, par galat cheez banana sabse mehenga hai. Yeh plan **Week 0–2 mein, code ke saath parallel** chalao:

### Step 1 — 15–20 conversations (Week 0–1)
Apne shehar ke agents/brokers se milo (office visit, WhatsApp, LinkedIn, local broker groups). **Product pitch mat karo — unki problem suno.**

Poochhne wale sawaal:
1. "Pichhle mahine kitne leads aaye? Kahan se?"
2. "Leads abhi kahan rakhte ho? Excel, diary, koi app?"
3. "Pichhli baar kab koi lead follow-up bhoolne ki wajah se gaya? Kya hua tha?"
4. "Kaunsa CRM/app try kiya? Kyun chhoda?"
5. "WhatsApp par client se kaise baat karte ho — personal ya business number?"
6. "Agar koi tool roz subah bataye ki aaj kis ko call karna hai, uske liye mahine ka kitna doge?"
7. "Team mein agents ka kaam kaise track karte ho?"

Har interview ke notes ek Google Sheet mein: naam, agency size, leads/month, current tool, top pain, willingness to pay.

### Step 2 — Concierge test (Week 1–2)
2–3 agents ke liye **manually** service do: unke leads ek Google Sheet mein daalo, roz subah unhe WhatsApp par "aaj ke follow-ups" bhejo. Agar 2 hafte baad woh bolein "yeh band mat karna" — strong signal.

### Step 3 — Landing page + price test
Simple page: problem, 3 features, price (example: **₹999/month solo, ₹2,499/month up to 5 users**), "Join pilot" form. Dekho kitne log form bharte hain.

### Step 4 — Pilot commitment
MVP ready hone par 5 agencies ko 30-day pilot. Ideal: chhota refundable deposit ya pehle mahine ka discounted payment. **Free users jhooth bolte hain, paying users sach.**

### Success criteria (MVP ko "validated" kab maanenge?)
- 5 agencies 4 hafte tak **har hafte** login karke follow-ups complete kar rahi hain.
- Kam se kam 3 bolti hain "main pay karunga" (ya kar deti hain).
- Overdue follow-ups pilot ke dauran kam ho rahe hain (yeh dashboard se measure hoga).

Agar yeh nahi hota → features add mat karo; interviews dobara karo aur problem samjho.
