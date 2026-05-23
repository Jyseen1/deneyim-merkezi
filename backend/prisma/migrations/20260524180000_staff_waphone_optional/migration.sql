-- Staff.waPhone artık opsiyonel: Google-only kullanıcılar telefon vermeyebilir.
-- @unique constraint korunur; PostgreSQL NULL'ları unique kontrolünden muaftır.

ALTER TABLE "staff" ALTER COLUMN "waPhone" DROP NOT NULL;
