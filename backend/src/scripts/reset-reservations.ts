import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../db/client";

// Tum rezervasyonlari (+ approval token + notification) siler.
// ONCE backend/backups/reservations-<timestamp>.json olarak yedek alir.
// Visitor, Slot, Settings, RecurringBlock TUTULUR (ayrica yonetilir).
//
// Kullanim: npm run reset:reservations
//
// UYARI: DATABASE_URL hangiyse o veritabani uzerinde calisir (prod
// dahil). 5 sn'lik gecikme yanlislikla calismayi azaltir.

const BACKUP_DIR = resolve(process.cwd(), "backups");
const DELAY_MS = 5000;

function ts(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

async function main() {
  console.log("[reset] DATABASE_URL:", maskUrl(process.env.DATABASE_URL));

  // 1) Yedek icin tum veriyi cek (relations dahil).
  const reservations = await prisma.reservation.findMany({
    include: {
      visitor: true,
      approvalToken: true,
      notifications: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (reservations.length === 0) {
    console.log("[reset] Silinecek rezervasyon yok. Cikiliyor.");
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = resolve(BACKUP_DIR, `reservations-${ts()}.json`);
  const backup = {
    exportedAt: new Date().toISOString(),
    count: reservations.length,
    reservations,
  };
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf-8");
  console.log(
    `[reset] Yedek alindi: ${backupPath} (${reservations.length} rezervasyon)`,
  );

  // 2) Uyari + gecikme.
  console.warn(
    `[reset] UYARI: ${reservations.length} rezervasyon (+ approval tokens + notifications) silinecek.\n` +
      `Visitor, Slot, Settings, RecurringBlock dokunulmayacak.\n` +
      `Devam icin ${DELAY_MS / 1000} saniye... (iptal: Ctrl+C)`,
  );
  await sleep(DELAY_MS);

  // 3) Foreign key sirasiyla sil — once cocuklar, sonra Reservation.
  const tokenCount = await prisma.approvalToken.deleteMany({});
  console.log(`[reset] ApprovalToken silindi: ${tokenCount.count}`);

  const notifCount = await prisma.notification.deleteMany({});
  console.log(`[reset] Notification silindi: ${notifCount.count}`);

  const resvCount = await prisma.reservation.deleteMany({});
  console.log(`[reset] Reservation silindi: ${resvCount.count}`);

  console.log(
    `\n[reset] Tamam. Yedek: ${backupPath}\n` +
      `[reset] Visitor sayisi (toplam, dokunulmadi): ` +
      `${await prisma.visitor.count()}`,
  );
}

function maskUrl(url?: string): string {
  if (!url) return "(tanimli degil)";
  return url.replace(/:\/\/[^@]+@/, "://****@");
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

main()
  .catch((err) => {
    console.error("[reset] Hata:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
