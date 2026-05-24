// Smoke test — 4 email template'i mock veriyle render edip Resend uzerinden
// gonderir. Production'a deploy etmeden gercek inbox'ta gormek icin.
//
// Kullanim:
//   cd backend && npm run test:email
//
// Gerekenler (backend/.env'de):
//   RESEND_API_KEY=re_xxxxxxxxxxxx
//   EMAIL_FROM="GigaX <test@verified-domain.com>"  (test modunda onboarding@resend.dev)
//   GMAIL_USER=poyrazyapayzeka@gmail.com           (alici — Resend hesabinin email'i)

import "dotenv/config";

// Mock veri — 4 senaryonun gerektirdigi tum degiskenler. String'e cevirilir
// cunku composeEmail Record<string, string> bekliyor.
const MOCK_VISITOR = {
  name: "Ahmet Yılmaz",
  phone: "+90 555 123 45 67",
  email: "ahmet@test.com",
};

type Scenario = {
  template: "admin-new-reservation" | "customer-approved" | "customer-rejected" | "customer-rescheduled";
  subject: string;
  vars: Record<string, string>;
};

const SCENARIOS: Scenario[] = [
  {
    template: "admin-new-reservation",
    subject: `[TEST] Yeni başvuru: ${MOCK_VISITOR.name} · 31 Mayıs 2026, Pazar 14:00`,
    vars: {
      preheader: `${MOCK_VISITOR.name} · 31 Mayıs 2026 14:00`,
      visitor_name: MOCK_VISITOR.name,
      visitor_phone: MOCK_VISITOR.phone,
      visitor_email: MOCK_VISITOR.email,
      group_size: "3",
      visit_date: "31 Mayıs 2026, Pazar",
      start_time: "14:00",
      duration: "60",
      note: "Doğum günü sürprizi",
      source: "web",
      dashboard_url: "https://deneyim-merkezi.vercel.app",
    },
  },
  {
    template: "customer-approved",
    subject: "[TEST] Rezervasyonunuz onaylandı",
    vars: {
      preheader: "Rezervasyonunuz onaylandı · 31 Mayıs 2026 14:00",
      visitor_name: MOCK_VISITOR.name,
      visit_date: "31 Mayıs 2026, Pazar",
      start_time: "14:00",
      duration: "60",
      group_size: "3",
    },
  },
  {
    template: "customer-rejected",
    subject: "[TEST] Rezervasyon talebiniz hakkında",
    vars: {
      preheader: "Talebiniz hakkında · 31 Mayıs 2026 14:00",
      visitor_name: MOCK_VISITOR.name,
      visit_date: "31 Mayıs 2026, Pazar",
      start_time: "14:00",
      book_url: "https://gigax.tech/rezervasyon",
      alternatives_html:
        '<p style="color:#A1A1AA;font-family:Arial,sans-serif;font-size:14px;margin:12px 0;">Alternatif saatler: 16:00, 17:00</p>',
    },
  },
  {
    template: "customer-rescheduled",
    subject: "[TEST] Rezervasyon tarihiniz güncellendi",
    vars: {
      preheader: "Tarih güncellendi · 1 Haziran 2026 11:00",
      visitor_name: MOCK_VISITOR.name,
      old_date: "31 Mayıs 2026",
      old_time: "14:00",
      new_date: "1 Haziran 2026, Pazartesi",
      new_time: "11:00",
      duration: "60",
      group_size: "3",
    },
  },
];

async function main() {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.GMAIL_USER;
  const from = process.env.EMAIL_FROM;

  console.log("─".repeat(50));
  console.log("GigaX Email Template Smoke Test (4 senaryo)");
  console.log("─".repeat(50));
  console.log("RESEND_API_KEY:", apiKey ? `set (${apiKey.slice(0, 6)}…)` : "MISSING");
  console.log("EMAIL_FROM:    ", from ?? "MISSING");
  console.log("GMAIL_USER:    ", to ?? "MISSING");
  console.log("─".repeat(50));

  if (!apiKey) {
    console.error("✗ RESEND_API_KEY tanımlı değil. backend/.env'e ekle.");
    process.exit(1);
  }
  if (!to) {
    console.error("✗ GMAIL_USER tanımlı değil. backend/.env'e ekle.");
    process.exit(1);
  }
  if (!from) {
    console.error("✗ EMAIL_FROM tanımlı değil. backend/.env'e ekle.");
    process.exit(1);
  }

  // Force live mode → IS_LIVE = true (normalde dev'de console fallback).
  process.env.NODE_ENV = "production";

  const { sendEmail, composeEmail } = await import("../services/email.service");

  let okCount = 0;
  for (const sc of SCENARIOS) {
    const html = composeEmail(sc.template, sc.vars);
    process.stdout.write(`→ ${sc.template.padEnd(24)} ... `);
    try {
      await sendEmail({
        to,
        subject: sc.subject,
        html,
      });
      console.log("✓");
      okCount += 1;
    } catch (err) {
      console.log("✗");
      console.error("   Hata:", (err as Error).message);
    }
  }

  console.log("─".repeat(50));
  console.log(`Sonuç: ${okCount}/${SCENARIOS.length} mail gönderildi → ${to}`);
  console.log("Inbox'ı (ve Spam'i) kontrol et.");
  console.log("─".repeat(50));

  process.exit(okCount === SCENARIOS.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Beklenmeyen hata:", err);
  process.exit(1);
});
