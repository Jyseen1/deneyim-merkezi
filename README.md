# Deneyim Merkezi - Rezervasyon Sistemi

WhatsApp Business API entegrasyonlu online rezervasyon yönetim sistemi. Müşteriler herkese açık formdan ziyaret talebi açar, yetkili WhatsApp üzerinden onaylar, sistem otomatik hatırlatma + timeout iptali yönetir.

## Stack

- **Backend**: Node.js 20 + Fastify + Prisma + BullMQ + @fastify/jwt
- **Dashboard**: Next.js 14 (App Router) + NextAuth (Google) + Tailwind
- **Veritabanı**: Neon PostgreSQL
- **Cache / Queue**: Upstash Redis
- **Bildirim**: WhatsApp Business Cloud API (v19.0)

## Kurulum

### Gereksinimler
- Node.js 20+
- PostgreSQL (Neon önerilir)
- Redis (Upstash önerilir)
- Google OAuth uygulaması (Cloud Console)
- WhatsApp Business API erişim token'ı (deploy sonrası)

### Backend
```bash
cd backend
cp .env.example .env
# .env dosyasını doldur (DATABASE_URL, REDIS_URL, JWT_SECRET, ADMIN_PASSWORD, ADMIN_EMAIL, WA_*)
npm install
npx prisma migrate deploy
npm run dev
```
Sunucu varsayılan olarak `http://localhost:3001` adresinde çalışır.

### Dashboard
```bash
cd dashboard
cp .env.example .env.local
# .env.local dosyasını doldur (NEXTAUTH_*, GOOGLE_*, BACKEND_URL, ADMIN_PASSWORD)
npm install
npm run dev
```
Panel `http://localhost:3000` adresinde açılır. Public rezervasyon formu: `http://localhost:3000/rezervasyon`.

## Servisler

| Servis | URL |
| --- | --- |
| Backend API | http://localhost:3001 |
| Health | http://localhost:3001/health |
| Dashboard | http://localhost:3000 |
| Public form | http://localhost:3000/rezervasyon |
| DB Studio | http://localhost:5555 (`npm run db:studio`) |

## Mimari

- `POST /api/v1/reservations` — public, ziyaretçi talebi
- `GET /api/v1/slots/available` — public, müsait saatler
- `POST /api/v1/auth/login` — staff login (JWT döner)
- `GET /api/v1/dashboard/*`, `GET/PATCH /api/v1/reservations`, `POST /api/v1/slots/block` — JWT zorunlu
- `POST /api/v1/webhooks/whatsapp` — Meta webhook (X-Hub-Signature-256 ile HMAC doğrulaması)

Auth akışı: Dashboard'da kullanıcı Google ile NextAuth'a giriş yapar → NextAuth `jwt` callback'i backend `/auth/login`'a istek atar → backend JWT'sini session içine yerleştirir → tüm korumalı `apiFetch` çağrılarında `Authorization: Bearer …` taşınır.

İş akışı (BullMQ):
- `reservation-timeouts` — onay süresi dolan rezervasyonları `CANCELLED`'a çeker
- `reservation-reminders` — ziyaretten 24 saat önce ziyaretçiye WhatsApp hatırlatma

## WhatsApp Webhook (lokal test)

```bash
ngrok http 3001
# Üretilen URL'i Meta Developer Console > WhatsApp > Configuration kısmına Callback URL olarak yazın
# Verify Token: WA_WEBHOOK_VERIFY_TOKEN değeri
```

## Deploy

| Bileşen | Servis |
| --- | --- |
| Backend | Railway (`Dockerfile` + `railway.toml` hazır) |
| Dashboard | Vercel (`vercel.json` + `next.config.js` standalone) |
| Veritabanı | Neon PostgreSQL |
| Cache / Queue | Upstash Redis |

Backend production build:
```bash
cd backend
npm run build:prod   # tsc + prisma generate
```

Dashboard production build:
```bash
cd dashboard
npm run build
```

`backend/Dockerfile` tek aşamalı; image build edilmeden önce yerelde (ya da Railway build adımında) `npm run build:prod` çalışmış olmalı. `next.config.js` BACKEND_URL eksikse production build'ini durdurur.

## Ortam Değişkenleri

Tam liste için: `backend/.env.example` ve `dashboard/.env.example`. Üretim sırrları kod içine commit edilmez; Railway / Vercel proje paneline girilir.

## Geliştirme Notları

- WhatsApp tokenı yoksa kod axios hatasını sessizce loglar; rezervasyon akışı bozulmaz.
- `ADMIN_EMAIL` fallback'i Staff tablosu henüz seed edilmemişken dashboard'un bootstrap olabilmesi için tasarlandı.
- BullMQ Upstash Redis ile çalışabilmek için ioredis seçeneklerinde `maxRetriesPerRequest: null` zorunludur.
