// Email gonderim servisi. Resend SDK + Notification log + dev console fallback.
//
// IS_LIVE = RESEND_API_KEY tanimli VE NODE_ENV=production. Bu kosullar
// saglanmazsa mail gercek atilmaz, sadece konsola log basilir — dev makinesinde
// musteri/admin mailini yanlislikla gondermeyiz.
//
// Multi-instance guvenligi: bu modul email.job worker'i tarafindan cagrilir,
// queue iste tek bir worker'a deliver edildigi icin duplikasyon riski yok.
import * as fs from "node:fs";
import * as path from "node:path";
import { Resend } from "resend";
import type { Reservation, Visitor } from "@prisma/client";
import { prisma } from "../db/client";

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const EMAIL_FROM = process.env.EMAIL_FROM ?? "GigaX <onboarding@resend.dev>";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO;
const DASHBOARD_URL = (process.env.DASHBOARD_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const NODE_ENV = process.env.NODE_ENV ?? "development";
const IS_LIVE = RESEND_API_KEY.length > 0 && NODE_ENV === "production";

const resend = RESEND_API_KEY.length > 0 ? new Resend(RESEND_API_KEY) : null;

// Template dizini — tsx dev modunda src/templates/email, tsc build sonrasinda
// dist/templates/email (postbuild copy step ile package.json'a yazildi).
const TEMPLATE_DIR = path.join(__dirname, "..", "templates", "email");
const templateCache = new Map<string, string>();
function loadTemplate(name: string): string {
  const cached = templateCache.get(name);
  if (cached !== undefined) return cached;
  const p = path.join(TEMPLATE_DIR, `${name}.html`);
  const html = fs.readFileSync(p, "utf-8");
  templateCache.set(name, html);
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// {{key}} -> escaped, {{!key}} -> raw HTML. Sirayla once raw'lari isle, sonra
// kalan {{key}} pattern'larini escape ederek doldur.
function render(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{!(\w+)\}\}/g, (_, k) => vars[k] ?? "")
    .replace(/\{\{(\w+)\}\}/g, (_, k) =>
      vars[k] !== undefined ? escapeHtml(vars[k]) : "",
    );
}

// Layout + scenario birlesimi. Scenario once kendi vars'i ile render edilir;
// olusan HTML, layout'taki {{!content}} (raw) hedefine yerlestirilir.
function composeEmail(scenarioName: string, vars: Record<string, string>): string {
  const scenarioHtml = render(loadTemplate(scenarioName), vars);
  return render(loadTemplate("layout"), {
    ...vars,
    content: scenarioHtml, // {{!content}} -> raw insert
  });
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

type Direction = "outbound_admin" | "outbound_customer";

async function logNotification(
  reservationId: string,
  status: "sent" | "failed" | "skipped",
  templateName: string,
  direction: Direction,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        reservationId,
        channel: "email",
        direction,
        status,
        templateName,
      },
    });
  } catch {
    // Log yazamadiysak akisi durdurma; gercek mail zaten ya gitti ya gitmedi.
  }
}

export type SendEmailOpts = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  if (!IS_LIVE) {
    console.log(
      JSON.stringify({
        level: "info",
        scope: "email",
        msg: "dev mode — gercek mail gonderilmedi",
        to: opts.to,
        subject: opts.subject,
        liveMode: IS_LIVE,
        hasApiKey: RESEND_API_KEY.length > 0,
      }),
    );
    return;
  }
  const result = await resend!.emails.send({
    from: EMAIL_FROM,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    subject: opts.subject,
    html: opts.html,
    text: opts.text ?? htmlToText(opts.html),
    replyTo: EMAIL_REPLY_TO,
  });
  if (result.error) {
    throw new Error(`Resend: ${result.error.message ?? JSON.stringify(result.error)}`);
  }
}

// ───────── helpers ─────────

async function getAdminEmails(): Promise<string[]> {
  const rows = await prisma.staff.findMany({
    where: { role: "admin", isActive: true },
    select: { email: true },
  });
  return rows.map((r) => r.email).filter((e): e is string => !!e);
}

function formatVisitDate(d: Date): string {
  return d.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
    timeZone: "Europe/Istanbul",
  });
}

function dashboardLink(reservationId: string): string {
  return `${DASHBOARD_URL}/reservations?id=${reservationId}`;
}

function bookingLink(): string {
  return `${DASHBOARD_URL}/rezervasyon`;
}

type ReservationWithVisitor = Reservation & { visitor: Visitor };

async function fetchReservation(id: string): Promise<ReservationWithVisitor | null> {
  return prisma.reservation.findUnique({
    where: { id },
    include: { visitor: true },
  });
}

// ───────── 4 senaryo ─────────

export async function sendAdminNewReservation(reservationId: string): Promise<void> {
  const r = await fetchReservation(reservationId);
  if (!r) return;
  const admins = await getAdminEmails();
  if (admins.length === 0) {
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "email",
        msg: "aktif admin yok — admin maili atildi",
        reservationId,
      }),
    );
    await logNotification(r.id, "skipped", "admin-new-reservation", "outbound_admin");
    return;
  }
  const html = composeEmail("admin-new-reservation", {
    preheader: `${r.visitor.name} · ${formatVisitDate(r.visitDate)} ${r.startTime}`,
    visitor_name: r.visitor.name,
    visitor_phone: r.visitor.phone,
    visitor_email: r.visitor.email ?? "—",
    group_size: String(r.groupSize),
    visit_date: formatVisitDate(r.visitDate),
    start_time: r.startTime,
    duration: String(r.durationMinutes),
    note: r.note ?? "—",
    source: r.source ?? "web",
    dashboard_url: dashboardLink(r.id),
  });
  try {
    await sendEmail({
      to: admins,
      subject: `Yeni basvuru: ${r.visitor.name} · ${formatVisitDate(r.visitDate)} ${r.startTime}`,
      html,
    });
    await logNotification(r.id, "sent", "admin-new-reservation", "outbound_admin");
  } catch (err) {
    await logNotification(r.id, "failed", "admin-new-reservation", "outbound_admin");
    throw err;
  }
}

export async function sendCustomerApproved(reservationId: string): Promise<void> {
  const r = await fetchReservation(reservationId);
  if (!r) return;
  if (!r.visitor.email) {
    await logNotification(r.id, "skipped", "customer-approved", "outbound_customer");
    return;
  }
  const html = composeEmail("customer-approved", {
    preheader: `Rezervasyonunuz onaylandi · ${formatVisitDate(r.visitDate)} ${r.startTime}`,
    visitor_name: r.visitor.name,
    visit_date: formatVisitDate(r.visitDate),
    start_time: r.startTime,
    duration: String(r.durationMinutes),
    group_size: String(r.groupSize),
  });
  try {
    await sendEmail({
      to: r.visitor.email,
      subject: "Rezervasyonunuz onaylandi",
      html,
    });
    await logNotification(r.id, "sent", "customer-approved", "outbound_customer");
  } catch (err) {
    await logNotification(r.id, "failed", "customer-approved", "outbound_customer");
    throw err;
  }
}

// Alternatif slot — getAvailableSlots() ile ayni format (date alani yok;
// alternatifler reddedilen rezervasyonla AYNI gunde, farkli saatlerde).
export type RejectAlternative = {
  startTime: string; // HH:MM
  endTime: string; // HH:MM
};

export async function sendCustomerRejected(
  reservationId: string,
  alternatives: RejectAlternative[],
): Promise<void> {
  const r = await fetchReservation(reservationId);
  if (!r) return;
  if (!r.visitor.email) {
    await logNotification(r.id, "skipped", "customer-rejected", "outbound_customer");
    return;
  }
  const sameDayLabel = formatVisitDate(r.visitDate);
  const alternativesHtml =
    alternatives.length === 0
      ? ""
      : `<div style="margin:18px 0;padding:14px 18px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.22);border-radius:10px;">
           <div style="font-family:'Space Grotesk',Arial,sans-serif;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#A78BFA;margin-bottom:6px;">Ayni gun · alternatif saatler</div>
           <div style="font-family:'Inter',Arial,sans-serif;font-size:12px;color:#A1A1AA;margin-bottom:10px;">${escapeHtml(sameDayLabel)}</div>
           <ul style="margin:0;padding:0;list-style:none;">${alternatives
             .map(
               (a) =>
                 `<li style="padding:4px 0;font-family:'Space Grotesk',Arial,sans-serif;font-size:15px;color:#E4E4E7;font-weight:300;">${escapeHtml(
                   a.startTime,
                 )} <span style="color:#71717A;font-size:12px;">- ${escapeHtml(
                   a.endTime,
                 )}</span></li>`,
             )
             .join("")}</ul>
         </div>`;

  const html = composeEmail("customer-rejected", {
    preheader: `Talebiniz hakkinda · ${formatVisitDate(r.visitDate)} ${r.startTime}`,
    visitor_name: r.visitor.name,
    visit_date: formatVisitDate(r.visitDate),
    start_time: r.startTime,
    alternatives_html: alternativesHtml,
    book_url: bookingLink(),
  });
  try {
    await sendEmail({
      to: r.visitor.email,
      subject: "Rezervasyon talebiniz hakkinda",
      html,
    });
    await logNotification(r.id, "sent", "customer-rejected", "outbound_customer");
  } catch (err) {
    await logNotification(r.id, "failed", "customer-rejected", "outbound_customer");
    throw err;
  }
}

export type RescheduleDiff = {
  oldDate: Date;
  oldStartTime: string;
};

export async function sendCustomerRescheduled(
  reservationId: string,
  diff: RescheduleDiff,
): Promise<void> {
  const r = await fetchReservation(reservationId);
  if (!r) return;
  if (!r.visitor.email) {
    await logNotification(r.id, "skipped", "customer-rescheduled", "outbound_customer");
    return;
  }
  const html = composeEmail("customer-rescheduled", {
    preheader: `Rezervasyon tarihi guncellendi · ${formatVisitDate(r.visitDate)} ${r.startTime}`,
    visitor_name: r.visitor.name,
    old_date: formatVisitDate(diff.oldDate),
    old_time: diff.oldStartTime,
    new_date: formatVisitDate(r.visitDate),
    new_time: r.startTime,
    duration: String(r.durationMinutes),
    group_size: String(r.groupSize),
  });
  try {
    await sendEmail({
      to: r.visitor.email,
      subject: "Rezervasyon tarihiniz guncellendi",
      html,
    });
    await logNotification(r.id, "sent", "customer-rescheduled", "outbound_customer");
  } catch (err) {
    await logNotification(r.id, "failed", "customer-rescheduled", "outbound_customer");
    throw err;
  }
}
