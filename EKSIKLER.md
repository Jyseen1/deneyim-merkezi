# Eksikler ve Yapılacaklar — Tam Rapor

> Kapsam: `backend/src/**`, `dashboard/{app,components,lib,hooks}/**`, `*.env*`, route ve servis tanımları, production posture.
> Tarih: 2026-05-22 itibarıyla repo durumu.

---

## 1. Özet — En Kritik 5

| # | Konu | Etki | Dosya |
|---|---|---|---|
| 1 | `Settings` tablosu DB'de var ama **slot/reservation servisleri okumuyor** — workStart/workEnd/defaultDuration/reminderHours hardcoded | Ayarlar UI'dan kaydedilen değerler hiçbir şeyi değiştirmiyor | [slot.service.ts](backend/src/services/slot.service.ts), [reservation.service.ts](backend/src/services/reservation.service.ts), [dashboard.ts](backend/src/routes/dashboard.ts) |
| 2 | WA Flow `decryptRequest` / `encryptResponse` **iskelet** (throw) | Meta production'da şifreli istek atınca endpoint çöker | [flow-crypto.ts](backend/src/wa/flow-crypto.ts) |
| 3 | `Settings.tsx` "Test Mesajı Gönder" → `POST /api/v1/whatsapp/test` **backend'de yok** | Tıklama 404 alır (kullanıcıya "mock" toast'u gösteriliyor) | [whatsapp.service.ts](backend/src/services/whatsapp.service.ts) |
| 4 | **İstatistik sayfası tamamen mock** (KPI, bar chart, saat dağılımı, donut) | Yöneticiye yanıltıcı veri | [stats/page.tsx](dashboard/app/(dashboard)/stats/page.tsx) |
| 5 | Railway/Vercel'de production migration **otomatik koşmuyor** + `JWT_SECRET`/`NEXTAUTH_SECRET`/`ADMIN_PASSWORD` placeholder | İlk deploy'da auth çalışmaz; sırlar tahmin edilebilir | `.env` dosyaları, Dockerfile |

---

## 2. TODO / FIXME Yorumları

### Backend
| Dosya | Satır | Açıklama |
|---|---|---|
| [wa/flow-crypto.ts](backend/src/wa/flow-crypto.ts) | 9 | Production'da Meta public key + WA_FLOW_PRIVATE_KEY çifti gerekli |
| [wa/flow-crypto.ts](backend/src/wa/flow-crypto.ts) | 37, 54 | `decryptRequest` / `encryptResponse` implementasyon eksik |
| [wa/flow-crypto.ts](backend/src/wa/flow-crypto.ts) | 51, 67 | İki fonksiyon **throw new Error** ediyor |
| [wa/templates.ts](backend/src/wa/templates.ts) | 1+ | Sadece yorum — Meta'da onaylanacak 4 template tanımı yapılmadı |
| [wa/webhook-handler.ts](backend/src/wa/webhook-handler.ts) | 161 | `SlotUnavailableError`'da ziyaretçiye "alternatif" WA mesajı gönderilmiyor |
| [wa/webhook-handler.ts](backend/src/wa/webhook-handler.ts) | 262 | `statuses[]` (delivered/read) sadece loglanıyor, notifications tablosuna yazılmıyor |
| [services/notification.service.ts](backend/src/services/notification.service.ts) | 1+ | Tamamen TODO — bildirim kayıt servisi yok |
| [services/reservation.service.ts](backend/src/services/reservation.service.ts) | ~85 | "Approval timeout job" yorumu (aslında BullMQ'ya eklendi; yorum güncel değil) |

### Dashboard
| Dosya | Satır | Açıklama |
|---|---|---|
| [app/(dashboard)/stats/page.tsx](dashboard/app/(dashboard)/stats/page.tsx) | 26 | "Backend'e baglandiginda donem filtreli stats endpoint'i eklenecek" |
| [app/(dashboard)/reservations/[id]/page.tsx](dashboard/app/(dashboard)/reservations/[id]/page.tsx) | 1 | Stub sayfa (drawer üzerinden açılıyor; dedicated route eksik) |
| [hooks/useRealtime.ts](dashboard/hooks/useRealtime.ts) | 1+ | Tamamen TODO — SSE/Socket.io ile real-time bildirim yok |
| [hooks/useReservations.ts](dashboard/hooks/useReservations.ts) | 1+ | Tamamen TODO — react-query entegrasyonu yapılmadı |
| [components/ApprovalDrawer.tsx](dashboard/components/ApprovalDrawer.tsx) | 1 | Stub (ReservationDrawer tarafından ezildi) |
| [components/CalendarView.tsx](dashboard/components/CalendarView.tsx) | 1 | Stub (calendar/page.tsx içinde inline) |
| [components/ReservationCard.tsx](dashboard/components/ReservationCard.tsx) | 1 | Stub |
| [components/SlotGrid.tsx](dashboard/components/SlotGrid.tsx) | 1 | Stub (slots/page.tsx içinde inline) |
| [components/StatsChart.tsx](dashboard/components/StatsChart.tsx) | 1 | Stub (charts/ klasöründe yenisi var) |

---

## 3. Mock / Sahte Veri Kullanan Yerler

| Dosya | Detay |
|---|---|
| [dashboard/app/(dashboard)/stats/page.tsx](dashboard/app/(dashboard)/stats/page.tsx) | `MOCK_KPI`, `MOCK_BAR`, `MOCK_HOURS`, `MOCK_STATUS` — KPI, bar chart, saat dağılımı ve donut **tamamen sabit** (yalnız "Son Rezervasyonlar" tablosu gerçek) |
| [dashboard/app/(dashboard)/slots/page.tsx](dashboard/app/(dashboard)/slots/page.tsx) | "Gün Kapat", "Tekrarlayan Kural", "Tatil Ekle" butonları sadece toast (`...yakında, error`); "Detay" satır butonu `alert("Detay yakında")` |
| [dashboard/app/(dashboard)/settings/page.tsx](dashboard/app/(dashboard)/settings/page.tsx) | Test mesajı 404 alınca "Test endpoint'i henüz hazır değil (mock)" diyor |
| [backend/src/server.ts:37](backend/src/server.ts#L37) | CORS else dalı `cb(null, true)` — bilinmeyen origin'i de kabul ediyor (yorum: "şimdilik tüm origin'lere izin ver") |

---

## 4. Dead Code (Hiçbir Yerden Çağrılmayan)

Grep ile import edildiği hiçbir dosya bulunamayan dosyalar — silinebilir veya tamamlanabilir.

- [backend/src/services/notification.service.ts](backend/src/services/notification.service.ts) — sadece yorum
- [backend/src/wa/templates.ts](backend/src/wa/templates.ts) — sadece yorum
- [dashboard/hooks/useRealtime.ts](dashboard/hooks/useRealtime.ts)
- [dashboard/hooks/useReservations.ts](dashboard/hooks/useReservations.ts)
- [dashboard/components/ApprovalDrawer.tsx](dashboard/components/ApprovalDrawer.tsx) → `ReservationDrawer.tsx` aktif
- [dashboard/components/CalendarView.tsx](dashboard/components/CalendarView.tsx) → `calendar/page.tsx` inline
- [dashboard/components/ReservationCard.tsx](dashboard/components/ReservationCard.tsx)
- [dashboard/components/SlotGrid.tsx](dashboard/components/SlotGrid.tsx)
- [dashboard/components/StatsChart.tsx](dashboard/components/StatsChart.tsx) → `components/charts/{BarChart,Donut}.tsx` aktif
- [dashboard/app/(dashboard)/reservations/[id]/page.tsx](dashboard/app/(dashboard)/reservations/[id]/page.tsx) — drawer pattern'e geçildiği için kullanılmıyor

**Karar:** ya tamamla ya sil. Şu hâlleriyle bundle'a giriyorlar (component'lar tree-shake olsa da hooks dosyaları statik analizi karıştırıyor).

---

## 5. Ortam Değişkenleri

### backend/.env — Boş veya Placeholder
| Anahtar | Durum | Önem |
|---|---|---|
| `WA_ACCESS_TOKEN` | Boş | KRITIK (WhatsApp olmadan rezervasyon çalışmaz; şu an no-op) |
| `WA_PHONE_NUMBER_ID` | Boş | KRITIK |
| `WA_APP_SECRET` | Boş | KRITIK (webhook HMAC doğrulanmıyor) |
| `WA_BUSINESS_ACCOUNT_ID` | Boş | İYİLEŞTİRME (şu an kullanılmıyor) |
| `WA_WEBHOOK_VERIFY_TOKEN` | `deneyim_merkezi_webhook_2026` | Dolu ama default — Meta'da aynısını yazmak gerek |
| `JWT_SECRET` | `dm_jwt_secret_DEGISTIR_guclu_yap_2026` | GÜVENLİK — production'da değiştirilmeli |
| `ADMIN_PASSWORD` | `admin123` | GÜVENLİK — değiştirilmeli |
| `GOOGLE_CALENDAR_ID` | Boş | İYİLEŞTİRME (kod tabanında kullanılmıyor) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Boş | İYİLEŞTİRME |
| `WA_FLOW_ID` | **`.env`'de yok**, sadece `.env.example` | KRITIK (Flow tetiklemesi için şart) |
| `WA_FLOW_PRIVATE_KEY` | **`.env`'de yok** | WHATSAPP (encryption aktive edilince) |

### dashboard/.env.local — Tüm Anahtarlar Dolu
- Google credentials gerçek değerlerle.
- `BACKEND_URL` lokal, production değil.

### Production envler

**Railway (backend) — set edilmesi gereken:**
- `DATABASE_URL` (Neon)
- `REDIS_URL` (Upstash)
- `JWT_SECRET` (256-bit yeni)
- `ADMIN_PASSWORD` (güçlü)
- `ADMIN_EMAIL`
- `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_WEBHOOK_VERIFY_TOKEN`, `WA_APP_SECRET`, `WA_BUSINESS_ACCOUNT_ID`, `STAFF_WA_PHONE`
- `WA_FLOW_ID`, `WA_FLOW_PRIVATE_KEY`
- `PORT` (Railway otomatik atar, override gerekmez)
- `NODE_ENV=production`
- `DASHBOARD_URL` (Vercel domain)
- `APPROVAL_TIMEOUT_HOURS`, `REMINDER_HOURS_BEFORE`, `DEFAULT_DURATION_MINUTES` (opsiyonel; default'lar var)

**Vercel (dashboard) — set edilmesi gereken:**
- `NEXTAUTH_URL` (Vercel domain)
- `NEXTAUTH_SECRET` (`openssl rand -base64 32`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `ALLOWED_EMAILS`
- `BACKEND_URL`, `BACKEND_INTERNAL_URL`, `NEXT_PUBLIC_BACKEND_URL` (üçü de Railway domain)
- `ADMIN_PASSWORD` (Railway ile aynı)

---

## 6. Eksiklikler — Kategoriye Göre

### 🔴 KRITIK (sistemin çalışması için şart)

- [ ] **Settings tablosu okunmuyor.** [slot.service.ts](backend/src/services/slot.service.ts)'deki `WORK_START_MIN=540`, `WORK_END_MIN=1140` ve [reservation.service.ts](backend/src/services/reservation.service.ts)'deki `DEFAULT_DURATION_MIN`/`APPROVAL_TIMEOUT_HOURS`/`REMINDER_HOURS_BEFORE` env'den alınıyor; **dashboard'dan kaydedilen** `Settings` satırı kullanılmıyor. Efor: **orta**.
- [ ] **Production migration koşumu yok.** `prisma/migrations/` repo'da var ama Railway'de `npx prisma migrate deploy` otomatik çalışmıyor. Dockerfile'a runtime başlangıcına eklemek veya Railway "release command" tanımlamak gerek. Efor: **kolay**.
- [ ] **Settings sayfası "Test Mesajı Gönder" çağrısı** → `POST /api/v1/whatsapp/test` backend'de yok. 404'ü "mock" toast'a çevirdik ama gerçek bir test endpoint'i (`sendApprovalRequest` benzeri bir dry-run) yazılmalı. Efor: **kolay**.
- [ ] **`.env`'de `WA_FLOW_ID` ve `WA_FLOW_PRIVATE_KEY` satırları yok.** `.env.example`'da var; canlıda eklenmesi unutulmasın. Efor: **kolay** (Railway env paneli).

### 📱 WHATSAPP (Meta credentials bekliyor)

- [ ] WhatsApp Business hesabı + telefon numarası kaydı + Meta App
- [ ] `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_APP_SECRET`, `WA_BUSINESS_ACCOUNT_ID` üretilmesi
- [ ] Meta Developer Console → WhatsApp → Configuration:
  - Callback URL: `https://<railway>/api/v1/webhooks/whatsapp`
  - Verify token: `WA_WEBHOOK_VERIFY_TOKEN` değeri
- [ ] **4 mesaj template'i** ([wa/templates.ts](backend/src/wa/templates.ts) yorumları): `reservation_approval_request`, `reservation_confirmed`, `reservation_rejected`, `reservation_reminder` → Meta'da onaylanmalı. WA üretim modunda template olmadan mesaj gönderilemez. Efor: **orta** (Meta approval süresi 24-48 saat)
- [ ] **Flow upload**: [backend/flow-definition.json](backend/flow-definition.json) → Meta Flow Builder → published → dönen Flow ID → `WA_FLOW_ID` env
- [ ] **Flow encryption**: Public/private RSA-2048 anahtar çifti üret, public key'i Meta'ya pin'le, private key `WA_FLOW_PRIVATE_KEY` env'e
- [ ] [flow-crypto.ts](backend/src/wa/flow-crypto.ts) içindeki 2 fonksiyonu implement et (AES-128-GCM + RSA-OAEP/SHA-256, response IV bit-flip)

### 🟡 İYİLEŞTİRME

- [ ] **İstatistik sayfası gerçek backend.** Mock yerine `GET /api/v1/dashboard/stats/period?range=week|month|3m`. Efor: **orta**.
- [ ] **Notifications tablosu**: WA gönderdiğimiz her mesaj + Meta'dan dönen sent/delivered/read [webhook-handler.ts:262](backend/src/wa/webhook-handler.ts#L262) kaydedilmeli. Efor: **kolay**.
- [ ] **SlotUnavailable** webhook'tan geldiğinde ziyaretçiye "şu saat dolu, alternatifler" WA mesajı [webhook-handler.ts:161](backend/src/wa/webhook-handler.ts#L161). Efor: **kolay**.
- [ ] **Slots sayfası "Gün Kapat / Tekrarlayan Kural / Tatil Ekle"** butonları gerçek backend (toplu blok ekleme endpoint'i). Efor: **orta-zor** (tekrarlayan kural recurrence patterni).
- [ ] **Slots "Detay" butonu** → ReservationDrawer açılsın. Efor: **kolay**.
- [ ] **Dead code temizliği** (#4'teki 9 dosya). Efor: **kolay**.
- [ ] **Real-time bildirim** ([useRealtime.ts](dashboard/hooks/useRealtime.ts) TODO) — dashboard yeni rezervasyonu görmek için 30sn poll'a bağlı. SSE/WebSocket. Efor: **orta**.
- [ ] **Stats endpoint dönem filtresi** [stats/page.tsx:26](dashboard/app/(dashboard)/stats/page.tsx#L26). Efor: **orta**.
- [ ] **react-query** ([useReservations.ts](dashboard/hooks/useReservations.ts) TODO) — bundle'da `@tanstack/react-query` var ama kullanılmıyor; cache + revalidation. Efor: **orta**.

### 🛡 GÜVENLİK

- [ ] **CORS bypass** [server.ts:37](backend/src/server.ts#L37) — bilinmeyen origin için de `cb(null, true)`. Production'da whitelist + public form için ayrı route veya boş `Origin` (server-to-server) toleransı yeterli. Efor: **kolay**.
- [ ] **JWT_SECRET production'da değiştirilmemiş** (placeholder). `openssl rand -base64 64`. Efor: **kolay**.
- [ ] **NEXTAUTH_SECRET production'da değiştirilmemiş**. Efor: **kolay**.
- [ ] **ADMIN_PASSWORD `admin123`** — bcrypt korumalı olsa da brute force riskine açık. Güçlü parola + login endpoint'i için ayrı rate-limit (örn. `/auth/login` 5 req/dk). Efor: **kolay**.
- [ ] **Public `POST /api/v1/reservations`** spam edilebilir — phone başına saatlik N talep limiti veya CAPTCHA. Efor: **orta**.
- [ ] **WA_APP_SECRET boş** → webhook HMAC doğrulamasız çalışıyor (kod 500 dönüyor secret yoksa). Meta canlı modunda secret zorunlu. Efor: **kolay** (Railway env).
- [ ] **`NEXT_PUBLIC_BACKEND_URL` bundle'a gömülüyor** — bilinçli bir tasarım kararı; production domain'i public görünür (zaten public bilgi). Sorun yok ama dokümante edilmeli.
- [ ] **CSRF**: NextAuth kendi CSRF token'ı var; ayrı endpoint yok. ✓
- [ ] **Helmet** aktif. ✓
- [ ] **Rate limit** 100/dk global. Login için ayrıca düşürülmeli.

---

## 7. Hata Yönetimi Eksik / Tutarsız Endpoint'ler

| Endpoint | Durum | Eksik |
|---|---|---|
| `POST /api/v1/reservations` | try/catch + SlotUnavailableError + P2002 yok | Aynı telefon spam'i için 429 koruması |
| `GET /api/v1/reservations` | Pagination + filter ✓ | Sayfalama sınırı 100, max kontrolü var ✓ |
| `PATCH /api/v1/reservations/:id/status` | P2025 → 404 ✓ | "approve" için staffId zorunlu kontrolü ✓ |
| `POST /api/v1/staff` | P2002 → 409 ✓ | — |
| `POST /api/v1/slots/block` | P2002 → 409 ✓ | endTime > startTime validasyonu yok |
| `GET /api/v1/webhooks/whatsapp` | mode/token/challenge ✓ | — |
| `POST /api/v1/webhooks/whatsapp` | HMAC ✓, handler try/catch ✓ | WA_APP_SECRET yoksa 500 (intentional) |
| `POST /api/v1/webhooks/flow-data` | Encrypted/plain ayrımı ✓ | `WA_FLOW_PRIVATE_KEY` yoksa 421 — Meta retry yapacak |
| `POST /api/v1/auth/login` | bcrypt + fallback ✓ | Brute force ayrı limit yok |
| `GET /api/v1/dashboard/*` | preHandler verifyJWT ✓ | — |

---

## 8. Validasyon Boşlukları

- [ ] [routes/slots.ts](backend/src/routes/slots.ts) `POST /block`: `endTime > startTime` kontrolü yok; Prisma INSERT geçerli bir satır oluştursa da mantıksal hata
- [ ] [routes/reservations.ts](backend/src/routes/reservations.ts): `visitDate` geçmiş tarih reddi yok (ziyaretçi 2020'ye rezervasyon açabilir)
- [ ] [services/slot.service.ts](backend/src/services/slot.service.ts): `isSlotAvailable` startTime çalışma saatleri içinde mi? Var (`WORK_START_MIN/END`). ✓
- [ ] [routes/reservations.ts](backend/src/routes/reservations.ts) Zod `phone`: format validasyonu min/max uzunluk; gerçek E.164 regex yok. Sınırlı yanlış veri ihtimali.
- [ ] [routes/staff.ts](backend/src/routes/staff.ts) `PATCH`: email değiştirilirken Staff modeli unique ✓; isActive=false yaparken aktif rezervasyonları sahipsiz bırakma riski (approvedBy artık geçersiz id) — soft delete OK ama referential integrity için ek not.

---

## 9. Production Hazırlık Checklist

### Backend (Railway)
- [ ] Tüm env'ler set (yukarıdaki liste)
- [ ] `prisma migrate deploy` koşturulmuş (Neon production şeması güncel)
- [ ] `npm run db:seed` koşturulmuş (admin + settings singleton)
- [ ] `NODE_ENV=production`
- [ ] Health check (Railway zaten kullanıyor `/health`)
- [ ] Domain: HTTPS otomatik

### Dashboard (Vercel)
- [ ] Tüm env'ler set (yukarıdaki liste)
- [ ] `NEXTAUTH_URL` = Vercel domain
- [ ] Google Cloud Console → OAuth → Authorized redirect URI: `https://<vercel>/api/auth/callback/google`
- [ ] Build hatasız geçiyor (✓ doğrulandı)

### Meta WhatsApp
- [ ] Webhook callback URL bağlı
- [ ] 4 template approval
- [ ] Flow upload + Flow ID alındı
- [ ] Flow Endpoint URL bağlı
- [ ] Private key Railway env'e

### Genel
- [ ] CORS whitelist sıkıştırıldı
- [ ] JWT_SECRET / NEXTAUTH_SECRET üretilmiş
- [ ] ADMIN_PASSWORD güçlü
- [ ] Sentry/Logtail/benzer log toplama (şu an stdout)
- [ ] DB yedek planı (Neon auto-backup ✓)
- [ ] Domain DNS

---

## 10. Önerilen Sıra

1. **Hemen (deploy öncesi):**
   - JWT_SECRET, NEXTAUTH_SECRET, ADMIN_PASSWORD üretimi
   - CORS whitelist sıkıştırma
   - `prisma migrate deploy` Railway release command'e
   - WA_APP_SECRET boş olunca login akışını test (şu an 500 dönüyor — kabul edilebilir)

2. **WhatsApp aktive edildikten sonra:**
   - Template approval başlat (paralel)
   - Flow upload + WA_FLOW_ID
   - flow-crypto implementi
   - Notifications tablosu yazımı

3. **Settings entegrasyonu:**
   - slot.service & reservation.service'i Settings'ten oku
   - Dashboard'da kaydedilen değerler artık etkili olsun

4. **İstatistik sayfası gerçek veriye geç**
5. **Slot Yönetimi toplu eylemler** (Gün Kapat, Tatil, Tekrarlayan)
6. **Real-time bildirim (SSE)** + react-query entegrasyonu
7. **Dead code temizliği**
