#!/usr/bin/env bash
# GigaX interaktif kurulum (SSH'ta çalıştır): build + migrate + pm2
# Önkoşul: backend/.env ve dashboard/.env.production dolu olmalı.
set -e
cd "$(dirname "$0")/.."
APP="$PWD"; echo "App: $APP"
export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
for p in $HOME/.nvm/versions/node/*/bin /usr/local/bin /usr/bin; do [ -d "$p" ] && PATH="$p:$PATH"; done
export PATH
command -v node >/dev/null || { echo "HATA: node bulunamadi. CloudPanel Admin Area > Node.js'ten Node 20 kur, tekrar dene."; exit 1; }
echo "node $(node -v) | npm $(npm -v)"
[ -f backend/.env ] || { echo "HATA: backend/.env yok"; exit 1; }
[ -f dashboard/.env.production ] || { echo "HATA: dashboard/.env.production yok"; exit 1; }
echo "==== BACKEND ===="; ( cd backend && npm ci && npm run build:prod && npx prisma migrate deploy )
echo "==== DASHBOARD ===="; ( cd dashboard && npm ci && npm run build )
echo "==== PM2 ===="; npm i pm2 --no-save --silent
PM2="$APP/node_modules/.bin/pm2"
"$PM2" start deploy/ecosystem.config.js --update-env || "$PM2" restart deploy/ecosystem.config.js --update-env
"$PM2" save || true
"$PM2" startup 2>/dev/null | grep -E '^sudo ' || true
echo "==== HEALTH ===="; sleep 5
curl -fsS http://127.0.0.1:3001/health && echo "  <= BACKEND OK" || echo "  BACKEND HEALTH FAIL (pm2 logs gigax-backend)"
curl -fsS -o /dev/null -w "  dashboard HTTP %{http_code}\n" http://127.0.0.1:3000/ || echo "  DASHBOARD FAIL"
echo "==== TELEGRAM WEBHOOK ===="; ( cd backend && npm run telegram:webhook -- https://gigax.cloud ) || echo "  webhook sonra elle: npm run telegram:webhook -- https://gigax.cloud"
echo ""; echo "BITTI. Claude'a 'hazir' de — vhost'u proxy yapip canli dogrulayacak."
