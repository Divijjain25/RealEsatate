# Step 0 — Setup: Chromebook, tools aur accounts

**Goal:** Aapke Chromebook par code chalane ka poora setup ho jaaye, aur Supabase/Vercel accounts ready hon. Is step mein **koi app code nahi** hai.

**Time:** ~1–1.5 ghanta (zyaatar download/install ka wait).

**Is step ke end mein aapke paas hoga:**
- Chromebook par Linux terminal
- Git + Node.js (JavaScript chalane wala engine)
- GitHub se SSH connection + project ki copy
- Supabase dev project (database)
- Vercel account (hosting)

> 🔐 **Secrets rule (abhi se aadat daalo):** Database password, Supabase *secret / service_role* key, ya koi bhi API key **kabhi chat mein paste mat karna, GitHub par mat daalna, screenshot mat bhejna**. Inhe ek password manager mein rakho (Google Password Manager, Bitwarden etc.). Mujhe kabhi inki zaroorat nahi padegi. Main sirf batata hoon ki inhe kahan daalna hai.

---

## Part A — Chromebook par Linux on karo

**Concept:** ChromeOS normal programs (Node.js, Git) seedha nahi chalata. "Linux development environment" Chromebook ke andar ek chhota, alag Linux computer (container) bana deta hai. Developers isi mein kaam karte hain. Isse aapke Chromebook ki baaki files ya settings ko koi khatra nahi hai.

1. Screen ke **neeche right corner** mein time par click karo → **⚙ Settings (gear icon)**.
2. Settings ke upar **search box** mein likho: `Linux`.
3. **"Linux development environment"** par click karo → **Turn on** / **Set up**.
4. **Next** dabao, phir:
   - **Username:** chhote letters mein, jaise `divij`
   - **Disk size:** **Custom → 15 GB** (minimum 10 GB; Node projects jagah lete hain)
5. **Install** dabao. 5–10 minute lagenge.
6. Install hone par ek kaali window khulegi: yahi **Terminal** hai. Baad mein ise launcher (neeche left circle) → **Linux apps → Terminal** se khol sakte ho.

❗ **Agar "Linux development environment" option dikhe hi nahi:** Chromebook school/office ka managed device ho sakta hai, ya bahut purana ho sakta hai. Mujhe batao. Hum **GitHub Codespaces** (browser mein chalne wala terminal) use karenge. Neeche "Fallback" section dekho.

---

## Part B — Terminal mein tools install karo

**Terminal kaise use karein:** Har command copy karo → Terminal mein **right-click** ya **Ctrl+Shift+V** se paste karo → **Enter** dabao. Ek command khatam hone tak ruko (jab tak `divij@penguin:~$` jaisa prompt wapas na aaye). `sudo` wali commands password nahi maangti Chromebook par.

### B1. Linux ko update karo
```bash
sudo apt update && sudo apt upgrade -y
```
*Kya karta hai:* `apt` Linux ka "Play Store" hai. Yeh available updates ki list laata hai aur sab install karta hai.

### B2. Basic tools
```bash
sudo apt install -y git curl build-essential
```
- **git**: code ki history rakhta hai aur GitHub se connect karta hai.
- **curl**: internet se files download karta hai.
- **build-essential**: kuch npm packages ko compile karne ke liye zaroori tools.

### B3. nvm + Node.js
**Concept:** Next.js app **Node.js** par chalti hai. Node ko seedha install karne ki jagah hum **nvm** (Node Version Manager) use karenge. Isse baad mein version badalna ek command ka kaam hai, aur `sudo` ki zaroorat nahi padti.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
```
Ab **Terminal window band karo aur dobara kholo** (zaroori hai, taaki terminal `nvm` ko pehchaan le). Phir:

```bash
nvm install --lts
nvm alias default 'lts/*'
node -v
npm -v
```
`node -v` ko `v22...`, `v24...` ya isse naya number dikhana chahiye. "LTS" ka matlab hai Long Term Support, yaani stable version.

---

## Part C — Git identity + GitHub SSH key

### C1. Git ko apna naam batao
Har code change (commit) par yeh naam/email likha jaata hai. Apni details daalo:
```bash
git config --global user.name "Divij Jain"
git config --global user.email "aapka-github-email@example.com"
git config --global init.defaultBranch main
```
(Wahi email daalo jo GitHub account mein hai.)

### C2. SSH key banao
**Concept:** SSH key ek **digital chaabi ki jodi** hai. **Private key** sirf aapke Chromebook par rehti hai (kabhi share nahi karte). **Public key** (`.pub`) GitHub ko dete hain. Iske baad GitHub bina password maange pehchaan leta hai ki aap ho.

```bash
ssh-keygen -t ed25519 -C "aapka-github-email@example.com"
```
- "Enter file in which to save the key" → bas **Enter** dabao.
- "Enter passphrase" → ek passphrase daalo (recommended) ya khaali chhod ke Enter dabao. Type karte waqt kuch dikhega nahi, yeh normal hai.

Public key dikhao:
```bash
cat ~/.ssh/id_ed25519.pub
```
Jo line `ssh-ed25519 ...` se shuru hoti hai, use poori select karke copy karo (**Ctrl+Shift+C**).

### C3. Public key GitHub par add karo
1. Chrome mein **github.com** kholo → login karo.
2. Upar right **profile photo** → **Settings**.
3. Left menu mein **SSH and GPG keys** → **New SSH key**.
4. **Title:** `HP Chromebook` · **Key type:** Authentication Key · **Key:** copy ki hui line paste karo.
5. **Add SSH key** dabao.

Test karo:
```bash
ssh -T git@github.com
```
Pehli baar "Are you sure you want to continue connecting?" aayega. `yes` likh ke Enter dabao. Agar jawab mein **"Hi Divijjain25! You've successfully authenticated"** aaye, to kaam ho gaya. ("does not provide shell access" wali line normal hai.)

### C4. GitHub par 2FA (strongly recommended)
GitHub → Settings → **Password and authentication** → **Two-factor authentication → Enable** (Google Authenticator app ya SMS). Aapka code yahin rahega, isliye yeh account sabse important hai.

---

## Part D — Project download karo aur check script chalao

```bash
mkdir -p ~/projects
cd ~/projects
git clone git@github.com:Divijjain25/RealEsatate.git
cd RealEsatate
git checkout claude/realestate-leados-blueprint-cc5zi2
ls
```
`ls` mein `README.md  docs  scripts` dikhne chahiye.

**Concept:** `clone` GitHub se project ki poori copy aapke Chromebook par laata hai. Main jo bhi naya code push karunga, use aap `git pull` se le aaoge.

Ab setup check chalao:
```bash
bash scripts/check-setup.sh
```
Yeh script sirf versions aur haan/na checks print karta hai (koi secret nahi). Iska **poora output copy karke mujhe chat mein bhejo**.

---

## Part E — VS Code (optional, par recommended)

Code main likhunga, par files dekhne aur samajhne ke liye ek editor achha rahega.

1. Terminal mein apna CPU type check karo:
   ```bash
   dpkg --print-architecture
   ```
   Output `amd64` (Intel/AMD Chromebook) ya `arm64` (MediaTek/ARM Chromebook) aayega.
2. Chrome mein **code.visualstudio.com/download** kholo → **.deb** button par click karo, apne type ke hisaab se (`amd64` = **x64**, `arm64` = **Arm64**).
3. ChromeOS **Files** app kholo → **Downloads** → `.deb` file par **double-click** → **Install**.
4. Terminal mein test karo:
   ```bash
   cd ~/projects/RealEsatate
   code .
   ```
   VS Code is project ke saath khul jaayega.

Agar Chromebook mein 4 GB RAM hai aur VS Code slow lage, to skip kar do. Files GitHub website par bhi dekh sakte ho.

---

## Part F — Supabase account + dev project

**Concept:** Supabase humara database + login system + file storage hai. Hum do projects rakhenge: abhi **dev** (free, testing ke liye), aur baad mein **prod** (paid, real customers ke liye).

1. Chrome mein **supabase.com** → **Start your project** → **Continue with GitHub** → authorize.
2. **Create organization:** Name `LeadOS` · Type **Personal** · Plan **Free** → Create.
3. **New project:**
   - **Name:** `leados-dev`
   - **Database Password:** **Generate a password** dabao → **copy karke turant password manager mein save karo** (title: "Supabase leados-dev DB password"). Yeh dobara nahi dikhaya jaata.
   - **Region:** **South Asia (Mumbai)**, kyunki users India mein hain aur yeh region fast rahega.
   - **Create new project** → 1–2 minute wait.
4. Project ready hone par: left menu ke neeche **⚙ Project Settings** → **API Keys** (ya **Data API**) dekho. Yahan teen cheezein hain:
   - **Project URL** (`https://xxxx.supabase.co`): public, Step 1 mein chahiye.
   - **Publishable key** (ya legacy **anon** key): public-safe, Step 1 mein chahiye.
   - **Secret key** (ya legacy **service_role**): 🔴 **SECRET**. Abhi copy karne ki zaroorat nahi. Step 3 mein bataunga kahan daalni hai.

   Abhi kuch copy mat karo. Bas confirm karo ki yeh page khul raha hai.
5. **2FA:** Supabase → profile (upar right) → **Account preferences / Security** → Multi-factor authentication enable karo.

⚠️ **Free tier limitation:** Agar 7 din tak project use nahi hua to Supabase use **pause** kar deta hai. Data safe rehta hai, bas dashboard mein **Restore** dabana padta hai. Development ke liye yeh theek hai.

---

## Part G — Vercel account

**Concept:** Vercel humari app ko internet par live karega. GitHub se connect hoga, aur har push par automatic naya version deploy karega.

1. Chrome mein **vercel.com/signup** kholo.
2. Plan: **Hobby** (free; abhi building/testing ke liye theek hai. Paying customers se pehle Pro lenge, doc 02 dekho).
3. **Continue with GitHub** → authorize.
4. Naam daalo → dashboard khulega. **Abhi koi project import mat karo.** Step 1 mein jab app ka code hoga tab karenge.
5. **2FA:** Vercel → Account Settings → **Authentication** → enable.

---

## ✅ Done check: mujhe yeh bhejo

1. `bash scripts/check-setup.sh` ka **poora output**. Saari lines ✅ honi chahiye; VS Code / nvm wali ⚠️ chal jaayegi.
2. Ek line mein confirm karo:
   - "Supabase `leados-dev` project Mumbai region mein ban gaya, DB password password manager mein save hai"
   - "Vercel account ban gaya (GitHub se)"

Jab yeh sab ho jaayega, tab **Step 1** shuru karenge: Next.js app + login + agency create + data isolation ka pehla test.

---

## 🛠 Common errors aur fix

| Error / problem | Matlab | Fix |
|---|---|---|
| Settings mein "Linux" option nahi | Managed ya purana Chromebook | Mujhe batao, Codespaces use karenge |
| `nvm: command not found` | Terminal ne nvm abhi load nahi kiya | Terminal band karke dobara kholo; ya `source ~/.bashrc` |
| `node: command not found` | Node install nahi hua | `nvm install --lts` dobara chalao |
| `Permission denied (publickey)` | GitHub ko aapki key nahi mili | Part C3 dobara karo; `cat ~/.ssh/id_ed25519.pub` wali **poori** line paste ki ho |
| `E: Unable to locate package` | Package list purani hai | Pehle `sudo apt update` chalao |
| `No space left on device` | Linux disk bhar gayi | Settings → Linux → **Disk size** badhao |
| `fatal: destination path 'RealEsatate' already exists` | Pehle se clone ho chuka hai | `cd ~/projects/RealEsatate && git pull` |
| Clone par `Repository not found` | Galat account se login, ya repo private hai aur key us account ki nahi | `ssh -T git@github.com` se check karo kaunse username se login hai |

Koi aur error aaye to **terminal ka exact error text** copy karke bhejo, andaaze se mat likhna.

---

## Fallback: GitHub Codespaces (agar Linux on nahi ho sakta)

1. github.com par apna repo `RealEsatate` kholo.
2. Green **Code** button → **Codespaces** tab → **Create codespace on claude/realestate-leados-blueprint-cc5zi2**.
3. Browser mein VS Code + terminal khul jaayega. Isme Git aur Node pehle se hote hain, to Parts A, B, C, D, E skip karo.
4. Terminal mein `bash scripts/check-setup.sh` chalao. SSH wala ❌ Codespaces mein ignore karo, kyunki wahan GitHub login automatic hota hai.
5. ⚠️ Codespaces ka free usage har mahine limited hai. GitHub → Settings → **Billing** mein usage dekhte rehna, aur kaam ke baad codespace **Stop** karna.
