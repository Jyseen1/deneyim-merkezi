# GigaX — CloudPanel'e Self-Host Deploy (Vercel'siz)

Hedef: `gigax.cloud` → dashboard, `gigax.cloud/rezervasyon` → rezervasyon formu,
backend `api.gigax.cloud`. Veritabanı (Neon) ve Redis (Upstash) dışarıda kalır.

```
Tarayıcı ──► gigax.cloud        (CloudPanel nginx) ──► 127.0.0.1:3000  Next.js dashboard
Tarayıcı ──► api.gigax.cloud    (CloudPanel nginx) ──► 127.0.0.1:3001  Fastify backend
                                                          │
                                              Neon Postgres + Upstash Redis
```

Süreçler **PM2** ile yönetilir (`deploy/ecosystem.config.js`).

---

## 0. Ön koşullar
- CloudPanel kurulu sunucu (qps ile aynı kurulum).
- DNS: `gigax.cloud` ve `api.gigax.cloud` A kayıtları sunucu IP'sine bakmalı.
- Node.js 20+ (CloudPanel site oluştururken seçilir).

---

## 1. CloudPanel'de iki "Node.js" site oluştur

**Site 1 — Dashboard**
- Sites → Add Site → **Create a Node.js Site**
- Domain: `gigax.cloud`
- Node version: 20 (veya 22)
- App Port: **3000**
- (CloudPanel otomatik olarak `proxy_pass http://127.0.0.1:3000` reverse proxy vhost'u oluşturur.)

**Site 2 — Backend API**
- Sites → Add Site → **Create a Node.js Site**
- Domain: `api.gigax.cloud`
- App Port: **3001**

> Not: gigax.cloud şu an "Vavien" sitesini gösteriyor. O siteyi CloudPanel'de
> silmeden önce domaini buraya taşıyacaksan, eski site/vhost'u kaldır veya
> domaini bu yeni Node.js sitesine bağla.

İki site için de **SSL** ver: site → SSL/TLS → **Let's Encrypt** (Actions → New Certificate).

---

## 2. Kodu sunucuya çek

Her sitenin kendi kullanıcısı + `htdocs` dizini olur. Dashboard site kullanıcısı
ile SSH'a gir (CloudPanel → Site → ... → SSH bilgileri).

Tek repo iki servisi de içeriyor; repoyu bir kez klonlayıp her iki siteden de
kullanabilir ya da her site dizinine ayrı klonlayabilirsin. **Önerilen: tek klon.**

```bash
# Örn. dashboard site kullanıcısının home'una klonla
cd ~
git clone https://github.com/Jyseen1/deneyim-merkezi.git app
cd app
```
> Private repo → GitHub kullanıcı adı + Personal Access Token (classic, `repo`
> scope) iste. Token'ı `https://<user>:<token>@github.com/...` şeklinde de verebilirsin.

---

## 3. Backend'i kur ve derle

```bash
cd ~/app/backend
cp .env.example .env
nano .env          # aşağıdaki anahtarları doldur
npm ci
npm run build:prod          # tsc + prisma generate
npx prisma migrate deploy   # Neon şemasını uygula (8/8 migration)
```

**backend/.env — doldurulacak kritik anahtarlar:**
```
DATABASE_URL=...            # Neon (mevcut)
REDIS_URL=...               # Upstash (mevcut)
PORT=3001
NODE_ENV=production
JWT_SECRET=...              # openssl rand -base64 32
ADMIN_PASSWORD=...          # dashboard ile AYNI
ADMIN_EMAIL=poyrazyapayzeka@gmail.com
RESEND_API_KEY=...          # mail gönderimi
EMAIL_FROM=...
EMAIL_PROVIDER=resend
TELEGRAM_BOT_TOKEN=...
TELEGRAM_STAFF_CHAT_ID=...
TELEGRAM_WEBHOOK_SECRET=...
DASHBOARD_URL=https://gigax.cloud   # CORS için ŞART
```

---

## 4. Dashboard'ı kur ve derle

```bash
cd ~/app/dashboard
cp .env.production.example .env.production
nano .env.production        # NEXTAUTH_*, GOOGLE_*, NEXT_PUBLIC_BACKEND_URL=https://api.gigax.cloud
npm ci
npm run build               # NEXT_PUBLIC_* build anında gömülür
```

> Google Cloud Console → OAuth → Authorized redirect URI ekle:
> `https://gigax.cloud/api/auth/callback/google`

---

## 5. PM2 ile çalıştır

```bash
cd ~/app
npm i -g pm2                      # yoksa
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup                       # çıktıdaki komutu (sudo) çalıştır → reboot'ta otomatik

pm2 status                        # gigax-backend + gigax-dashboard → online olmalı
pm2 logs gigax-backend --lines 50
```

Sağlık kontrolü:
```bash
curl -s http://127.0.0.1:3001/health      # {"status":"ok"...}
curl -s http://127.0.0.1:3000 | head       # HTML dönmeli
```

---

## 6. Reverse proxy'yi doğrula (CloudPanel)

CloudPanel Node.js sitesi vhost'u zaten App Port'a proxy yapar. Yine de kontrol:
- `gigax.cloud` site → Vhost → `proxy_pass http://127.0.0.1:3000;`
- `api.gigax.cloud` site → Vhost → `proxy_pass http://127.0.0.1:3001;`

Tarayıcıdan:
- `https://gigax.cloud` → login / dashboard
- `https://gigax.cloud/rezervasyon` → rezervasyon formu
- `https://api.gigax.cloud/health` → ok

---

## 7. Telegram webhook'unu yeni domaine ayarla

```bash
cd ~/app/backend
# public api domainini argüman olarak ver; script /api/v1/webhooks/... yolunu ekler
npm run telegram:webhook -- https://api.gigax.cloud
npm run telegram:menu                 # menü / persistent button
```
> Webhook prefix'i backend'de `/api/v1/webhooks`. Script TELEGRAM_BOT_TOKEN'ı
> backend/.env'den okur, dolu olmalı.

---

## 8. Güncelleme akışı (sonraki deploylar)

```bash
cd ~/app
git pull
# backend değiştiyse:
cd backend && npm ci && npm run build:prod && npx prisma migrate deploy && cd ..
# dashboard değiştiyse:
cd dashboard && npm ci && npm run build && cd ..
pm2 restart all
```

---

## Sorun giderme
- **502 Bad Gateway** → PM2 servisi düşmüş; `pm2 logs`. Port eşleşmesini kontrol et.
- **Login sonsuz döngü / 401** → `NEXTAUTH_URL` yanlış ya da backend `DASHBOARD_URL`
  CORS'a `https://gigax.cloud` eklenmemiş.
- **Tarayıcıda "Backend'e baglanilamadi"** → `NEXT_PUBLIC_BACKEND_URL` yanlış build
  edilmiş; `.env.production`'ı düzeltip `npm run build` + `pm2 restart gigax-dashboard`.
- **api.gigax.cloud SSL hatası** → Let's Encrypt sertifikası ver.
