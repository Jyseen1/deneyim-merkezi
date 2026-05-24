-- Rezervasyona "product" alani — hangi urun icin gelindi.
-- gigax | sangfor | gigabyte | diger (slug; label sozluku kod tarafinda).
-- Form gonderiminde Zod zorunlu kilar; eski rezervasyonlar null kalir.

ALTER TABLE "reservations" ADD COLUMN "product" TEXT;
