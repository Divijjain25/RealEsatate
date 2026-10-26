#!/usr/bin/env bash
# Creates .env.local by asking for the two public Supabase values, checks
# them, and tests that Supabase accepts them.
#   bash scripts/setup-env.sh
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
ENV_FILE=".env.local"

trim() {
  local v="$1"
  v="${v//$'\r'/}"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  v="${v#\"}"; v="${v%\"}"
  v="${v#\'}"; v="${v%\'}"
  printf '%s' "$v"
}

echo "== .env.local setup (Supabase) =="
echo

if [ -f "$ENV_FILE" ]; then
  read -r -p ".env.local pehle se hai. Nayi values se badalni hai? (y/N): " answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Kuch nahi badla."; exit 0 ;;
  esac
fi

# --- Project URL ---
while true; do
  read -r -p "1) Project URL paste karo (https://....supabase.co): " url
  url="$(trim "$url")"
  url="${url%/}"
  if [[ "$url" =~ ^https://[a-z0-9]+\.supabase\.co$ ]]; then
    break
  fi
  echo "   ❌ Yeh Project URL jaisa nahi lag raha. Aisa hona chahiye: https://abcdefghijkl.supabase.co"
  echo "      (aage /rest/v1 jaisa kuch na ho, aur yeh dashboard ka link nahi hai)"
done

# --- Publishable key ---
while true; do
  read -r -p "2) Publishable key paste karo (sb_publishable_...): " key
  key="$(trim "$key")"

  if [[ "$key" == sb_secret_* ]]; then
    echo "   🔴 Ruko! Yeh SECRET key hai. Ise yahan nahi daalna, aur kisi ko mat bhejna."
    echo "      Publishable key copy karo (sb_publishable_ se shuru hoti hai)."
    continue
  fi
  if [[ "$key" == sb_publishable_* ]] && [ "${#key}" -ge 30 ]; then
    break
  fi
  if [[ "$key" == eyJ* ]]; then
    # Legacy JWT key: allow "anon", refuse "service_role".
    role="$(node -e '
      try {
        const p = process.argv[1].split(".")[1];
        console.log(JSON.parse(Buffer.from(p, "base64url").toString()).role || "");
      } catch { console.log(""); }
    ' "$key")"
    if [ "$role" = "anon" ]; then
      break
    fi
    if [ "$role" = "service_role" ]; then
      echo "   🔴 Ruko! Yeh service_role (SECRET) key hai. Ise yahan nahi daalna."
      echo "      'anon public' key ya Publishable key copy karo."
      continue
    fi
  fi
  echo "   ❌ Yeh key poori nahi lag rahi. Publishable key sb_publishable_ se shuru hoti hai."
  echo "      Copy button se dobara copy karke paste karo."
done

umask 077
cat > "$ENV_FILE" <<EOF
# Created by scripts/setup-env.sh — never commit this file.
NEXT_PUBLIC_SUPABASE_URL=$url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$key
EOF

echo
echo "✅ .env.local ban gayi:"
echo "   NEXT_PUBLIC_SUPABASE_URL=$url"
echo "   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key:0:18}…  (baaki chhupa diya)"
echo

echo "Supabase se connection check kar rahe hain…"
status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -H "apikey: $key" "$url/auth/v1/settings" || true)"
case "$status" in
  200)
    echo "✅ Supabase ne URL aur key dono accept kar li. Ab: npm run dev" ;;
  401|403)
    echo "❌ Supabase ne key reject ki (HTTP $status). Key galat project ki ya adhoori hai."
    echo "   Script dobara chalao: bash scripts/setup-env.sh"
    exit 1 ;;
  000)
    echo "⚠️  Supabase tak pahunch nahi paaye (internet ya URL galat?). URL dobara check karo."
    exit 1 ;;
  *)
    echo "⚠️  Unexpected jawab: HTTP $status. Yeh output Claude ko bhejo."
    exit 1 ;;
esac
