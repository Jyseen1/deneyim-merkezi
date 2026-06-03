#!/usr/bin/env bash
# ============================================================
# GigaX — CloudPanel tek-komut deploy script'i
# Sunucuda (CloudPanel site kullanıcısı olarak) çalıştır:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/Jyseen1/deneyim-merkezi/main/deploy/cloudpanel-setup.sh)
#
# veya repoyu klonladıktan sonra:  bash deploy/cloudpanel-setup.sh
#
# Idempotent: tekrar tekrar çalıştırılabilir (clone yoksa klonlar, varsa pull'lar).
# İlk çalıştırmada .env dosyaları yoksa örnekten oluşturup DURUR; sen doldurursun,
# sonra script'i tekrar çalıştırırsın.
# ============================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Jyseen1/deneyim-merkezi.git}"
APP_DIR="${APP_DIR:-$HOME/app}"
DASH_PORT="${DASH_PORT:-3000}"
API_PORT="${API_PORT:-3001}"

say() { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
die() { printf "\n\033[1;31m✖ %s\033[0m\n" "$*" >&2; exit 1; }

# --- 0. Araç kontrolü -------------------------------------------------
command -v node >/dev/null || die "node bulunamadı. CloudPanel sitesinde Node 20+ seç."
command -v git  >/dev/null || die "git bulunamadı."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR < 20. CloudPanel'de Node sürümünü yükselt."
command -v pm2 >/dev/null || { say "pm2 kuruluyor (global)"; npm i -g pm2; }

# --- 1. Kodu çek ------------------------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  say "Repo mevcut, güncelleniyor ($APP_DIR)"
  git -C "$APP_DIR" pull --ff-only
else
  say "Repo klonlanıyor → $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# --- 2. .env dosyaları -------------------------------------------------
MISSING=0
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  say "backend/.env oluşturuldu — DOLDUR: DATABASE_URL, REDIS_URL, JWT_SECRET, ADMIN_*, RESEND_API_KEY, TELEGRAM_*, DASHBOARD_URL=https://gigax.cloud, PORT=$API_PORT"
  MISSING=1
fi
if [ ! -f dashboard/.env.production ]; then
  cp dashboard/.env.production.example dashboard/.env.production
  say "dashboard/.env.production oluşturuldu — DOLDUR: NEXTAUTH_SECRET, GOOGLE_*, NEXT_PUBLIC_BACKEND_URL=https://api.gigax.cloud"
  MISSING=1
fi
if [ "$MISSING" -eq 1 ]; then
  die ".env dosyalarını doldurup script'i TEKRAR çalıştır."
fi

# --- 3. Backend build + migrate ---------------------------------------
say "Backend kuruluyor"
( cd backend && npm ci && npm run build:prod && npx prisma migrate deploy )

# --- 4. Dashboard build (NEXT_PUBLIC_* build anında gömülür) -----------
say "Dashboard kuruluyor"
( cd dashboard && npm ci && npm run build )

# --- 5. PM2 ile başlat / yeniden başlat -------------------------------
say "PM2 ile servisler başlatılıyor"
pm2 start deploy/ecosystem.config.js --update-env || pm2 restart deploy/ecosystem.config.js --update-env
pm2 save
say "pm2 startup (reboot kalıcılığı) — gerekiyorsa çıktıdaki sudo komutunu çalıştır:"
pm2 startup || true

# --- 6. Sağlık kontrolü ------------------------------------------------
sleep 3
say "Health kontrolü"
curl -fsS "http://127.0.0.1:$API_PORT/health" && echo "  → backend OK" || echo "  ✖ backend health FAIL (pm2 logs gigax-backend)"
curl -fsS -o /dev/null -w "dashboard HTTP %{http_code}\n" "http://127.0.0.1:$DASH_PORT/" || echo "  ✖ dashboard FAIL (pm2 logs gigax-dashboard)"

say "Bitti. CloudPanel'de gigax.cloud→$DASH_PORT, api.gigax.cloud→$API_PORT reverse proxy + SSL ayarlı olmalı."
say "Telegram webhook:  ( cd $APP_DIR/backend && npm run telegram:webhook -- https://api.gigax.cloud )"
