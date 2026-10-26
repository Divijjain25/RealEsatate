#!/usr/bin/env bash
# Step 0 setup checker for RealEstate LeadOS.
# Run:  bash scripts/check-setup.sh
# Prints only tool versions and yes/no checks — never any keys or passwords,
# so the output is safe to paste into chat.

PASS=0
FAIL=0
WARN=0

ok()   { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  ⚠️  $1"; WARN=$((WARN + 1)); }

echo "== RealEstate LeadOS — Step 0 setup check =="
echo

echo "[1] System"
if [ -r /etc/os-release ]; then
  . /etc/os-release
  ok "OS: ${PRETTY_NAME:-unknown}"
else
  warn "OS: /etc/os-release nahi mila"
fi
echo "     CPU architecture: $(uname -m)"
free_kb=$(df -Pk "$HOME" | awk 'NR==2 {print $4}')
free_gb=$((free_kb / 1024 / 1024))
if [ "$free_gb" -ge 5 ]; then
  ok "Free disk space in home: ${free_gb} GB"
else
  bad "Free disk space sirf ${free_gb} GB — kam se kam 5 GB chahiye (Settings → Linux → Disk size → Change; guide ka 'Disk space' section dekho)"
fi
echo

echo "[2] Git"
if command -v git >/dev/null 2>&1; then
  ok "$(git --version)"
  name=$(git config --global user.name)
  email=$(git config --global user.email)
  if [ -n "$name" ]; then ok "git user.name set hai ($name)"; else bad "git user.name set nahi hai"; fi
  if [ -n "$email" ]; then ok "git user.email set hai"; else bad "git user.email set nahi hai"; fi
else
  bad "git install nahi hai  →  sudo apt install -y git"
fi
echo

echo "[3] Node.js"
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ] || [ -s "$HOME/.config/nvm/nvm.sh" ]; then
  ok "nvm installed hai"
else
  warn "nvm nahi mila — agar Node kisi aur tareeke se install kiya hai to theek hai"
fi
if command -v node >/dev/null 2>&1; then
  node_version=$(node -v)
  node_major=${node_version#v}
  node_major=${node_major%%.*}
  if [ "$node_major" -ge 20 ]; then
    ok "Node $node_version"
  else
    bad "Node $node_version bahut purana hai — 20 ya usse naya chahiye  →  nvm install --lts"
  fi
else
  bad "node nahi mila  →  terminal band karke dobara kholo, phir: nvm install --lts"
fi
if command -v npm >/dev/null 2>&1; then
  ok "npm $(npm -v)"
else
  bad "npm nahi mila (Node ke saath aata hai)"
fi
echo

echo "[4] GitHub SSH access"
if ls "$HOME"/.ssh/id_*.pub >/dev/null 2>&1; then
  ok "SSH public key mili"
else
  bad "SSH key nahi mili  →  ssh-keygen -t ed25519 -C \"aapka-email\""
fi
ssh_out=$(ssh -T -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new git@github.com 2>&1)
if echo "$ssh_out" | grep -q "successfully authenticated"; then
  ok "GitHub SSH login kaam kar raha hai"
else
  bad "GitHub SSH login fail — key GitHub par add karo (guide Part C)"
fi
echo

echo "[5] Project repo"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  ok "Repo folder: $(basename "$(git rev-parse --show-toplevel)")"
  ok "Current branch: $(git rev-parse --abbrev-ref HEAD)"
else
  warn "Yeh script repo folder ke bahar chala hai — pehle: cd ~/projects/RealEsatate"
fi
echo

echo "[6] Editor (optional)"
if command -v code >/dev/null 2>&1; then
  ok "VS Code installed"
else
  warn "VS Code nahi mila — optional hai, Step 1 se pehle install kar lena achha rahega"
fi
echo

echo "== Result: $PASS passed, $FAIL failed, $WARN warnings =="
if [ "$FAIL" -eq 0 ]; then
  echo "Step 0 machine setup ready hai. Ab guide ka Part F/G (Supabase, Vercel) check karo."
else
  echo "Jo ❌ hain unhe theek karo, phir script dobara chalao."
  exit 1
fi
