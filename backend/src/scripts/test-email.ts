// Tek seferlik smoke test scripti — Resend entegrasyonu calisiyor mu?
// Kullanim:
//   cd backend && npx tsx src/scripts/test-email.ts
//
// Gerekenler (backend/.env'de):
//   RESEND_API_KEY=re_xxxxxxxxxxxx     (Resend dashboard)
//   EMAIL_FROM="GigaX <test@verified-domain.com>"
//   GMAIL_USER=poyrazyapayzeka@gmail.com  (alici — kendine gondersin)
//
// Bu script email.service'in IS_LIVE check'ini bypass'lar: NODE_ENV=production
// olarak ayarlanir, sonra dinamik import ile email.service yuklenir. Boylece
// dev makinesinde de gercek mail atilabilir.

import "dotenv/config";

async function main() {
  // 1) Env validasyonu
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.GMAIL_USER;
  const from = process.env.EMAIL_FROM;

  console.log("─".repeat(50));
  console.log("GigaX Email Smoke Test");
  console.log("─".repeat(50));
  console.log("RESEND_API_KEY:", apiKey ? `set (${apiKey.slice(0, 6)}…)` : "MISSING");
  console.log("EMAIL_FROM:    ", from ?? "MISSING");
  console.log("GMAIL_USER:    ", to ?? "MISSING");
  console.log("─".repeat(50));

  if (!apiKey) {
    console.error("✗ RESEND_API_KEY tanimli degil. backend/.env'e ekle.");
    process.exit(1);
  }
  if (!to) {
    console.error("✗ GMAIL_USER tanimli degil. backend/.env'e ekle.");
    process.exit(1);
  }
  if (!from) {
    console.error("✗ EMAIL_FROM tanimli degil. backend/.env'e ekle.");
    process.exit(1);
  }

  // 2) Force live mode — email.service IS_LIVE'i true olsun diye NODE_ENV'i
  //    production'a cek, sonra dinamik import. Bu sayede dev makinede gercek
  //    mail atabiliriz (normalde dev'de console fallback).
  process.env.NODE_ENV = "production";

  const { sendEmail } = await import("../services/email.service");

  // 3) Mail icerigi
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:30px;background:#0A0A0F;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:28px;background:#16161D;border:1px solid rgba(124,58,237,0.3);border-radius:14px;color:#E4E4E7;">
    <div style="height:2px;background:linear-gradient(90deg,transparent,#7C3AED,transparent);margin:-28px -28px 24px;"></div>
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:300;color:#FFFFFF;">Test <span style="font-style:italic;color:#C4B5FD;font-family:Georgia,serif;">basarili</span></h1>
    <p style="margin:0;font-size:14px;color:#A1A1AA;line-height:1.6;">GigaX email servisi calisiyor. Bu mail Resend SDK uzerinden gonderildi.</p>
    <div style="margin-top:20px;padding:12px 16px;background:rgba(124,58,237,0.10);border:1px solid rgba(124,58,237,0.25);border-radius:8px;font-size:12px;color:#A78BFA;font-family:monospace;">
      Timestamp: ${new Date().toISOString()}
    </div>
  </div>
</body></html>`;

  console.log(`Gonderiliyor → ${to} …`);
  try {
    await sendEmail({
      to,
      subject: "GigaX Email Test",
      html,
    });
    console.log("✓ Mail gonderildi. Inbox'i (ve Spam'i) kontrol et.");
    process.exit(0);
  } catch (err) {
    console.error("✗ Gonderim hatasi:", (err as Error).message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Beklenmeyen hata:", err);
  process.exit(1);
});
