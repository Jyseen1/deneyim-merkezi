import dayjs from "dayjs";
import type {
  AvailableSlot,
  ReservationWithVisitor,
} from "../types/reservation";

// Telegram Bot API — REST üzerinden harici library olmadan.
// https://core.telegram.org/bots/api

const API_BASE = "https://api.telegram.org";

type TelegramResponse = {
  ok: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
};

function logInfo(msg: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level: "info", scope: "telegram", msg, ...ctx }));
}
function logError(msg: string, ctx: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ level: "error", scope: "telegram", msg, ...ctx }));
}

function token(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  return t && t.length > 0 ? t : null;
}

async function callApi(
  method: string,
  body: unknown,
): Promise<TelegramResponse | null> {
  const t = token();
  if (!t) {
    logError("TELEGRAM_BOT_TOKEN tanimli degil", { method });
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}/bot${t}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as TelegramResponse;
    if (!data.ok) {
      logError("Telegram API hata", {
        method,
        status: res.status,
        description: data.description,
        code: data.error_code,
      });
    }
    return data;
  } catch (err) {
    logError("Telegram API fetch hata", {
      method,
      err: (err as Error).message,
    });
    return null;
  }
}

// ─────────────────────────────────────────────────────────
// Düşük seviye helper'lar (spec'te istenen API yüzeyi)
// ─────────────────────────────────────────────────────────

export type InlineButton = { text: string; callback_data: string };

export async function sendMessage(
  chatId: number | string,
  text: string,
  options: Record<string, unknown> = {},
): Promise<TelegramResponse | null> {
  return callApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    ...options,
  });
}

export async function sendInlineKeyboard(
  chatId: number | string,
  text: string,
  buttons: InlineButton[][],
): Promise<TelegramResponse | null> {
  return sendMessage(chatId, text, {
    reply_markup: { inline_keyboard: buttons },
  });
}

export async function sendWebAppButton(
  chatId: number | string,
  text: string,
  webAppUrl: string,
  buttonText = "🎫 Rezervasyon Yap",
): Promise<TelegramResponse | null> {
  return sendMessage(chatId, text, {
    reply_markup: {
      keyboard: [[{ text: buttonText, web_app: { url: webAppUrl } }]],
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
  showAlert = false,
): Promise<TelegramResponse | null> {
  return callApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  options: Record<string, unknown> = {},
): Promise<TelegramResponse | null> {
  return callApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
    ...options,
  });
}

export async function setWebhook(
  url: string,
  secretToken?: string,
): Promise<TelegramResponse | null> {
  return callApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
  });
}

// Foto gonderme — harici URL'ler dahil Telegram CDN'e cek
export async function sendPhoto(
  chatId: number | string,
  photoUrl: string,
  caption?: string,
): Promise<TelegramResponse | null> {
  return callApi("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "Markdown",
  });
}

// Bot icin sol-alt persistent menu butonu — kullanici /start yazmadan
// dogrudan Web App'i acabilir. scope yoksa default (tum kullanicilar).
// NOT: Buton metninde emoji KULLANMA — Telegram bazi istemcilerde glyph'i
// "??" olarak render ediyor.
export async function setChatMenuButton(
  webAppUrl: string,
  buttonText = "Rezervasyon Yap",
): Promise<TelegramResponse | null> {
  return callApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: buttonText,
      web_app: { url: webAppUrl },
    },
  });
}

// Bot username — getMe ile bir kez cek + cache'le. Env override edebilir.
let cachedBotUsername: string | null = null;
export async function getBotUsername(): Promise<string | null> {
  const fromEnv = process.env.TELEGRAM_BOT_USERNAME;
  if (fromEnv && fromEnv.length > 0) return fromEnv.replace(/^@/, "");
  if (cachedBotUsername) return cachedBotUsername;
  const res = await callApi("getMe", {});
  if (!res?.ok || !res.result) return null;
  const me = res.result as { username?: string };
  if (!me.username) return null;
  cachedBotUsername = me.username;
  return cachedBotUsername;
}

// ─────────────────────────────────────────────────────────
// Yüksek seviye iş akışı
// ─────────────────────────────────────────────────────────

function fmtVisitDate(d: Date | string): string {
  return dayjs(d).format("DD.MM.YYYY");
}

function tgEscape(s: string): string {
  // Markdown V1: yıldız, alt çizgi, tırnak, köşeli parantezi escape et
  return s.replace(/([*_`[\]])/g, "\\$1");
}

export function statusLabel(status: string): string {
  switch (status) {
    case "APPROVED":
      return "✅ Onaylandı";
    case "REJECTED":
      return "❌ Reddedildi";
    case "CANCELLED":
      return "⛔ İptal edildi";
    case "NO_SHOW":
      return "👻 Gelmedi (no-show)";
    case "COMPLETED":
      return "🎉 Tamamlandı";
    case "PENDING_APPROVAL":
      return "⏳ Beklemede";
    default:
      return status;
  }
}

function buildStaffApprovalText(
  reservation: ReservationWithVisitor,
  statusSuffix?: string,
): string {
  const lines = [
    "*Yeni rezervasyon talebi*",
    "",
    `👤 *Ziyaretçi:* ${tgEscape(reservation.visitor.name)}`,
    `📱 *Telefon:* ${tgEscape(reservation.visitor.phone)}`,
    `📅 *Tarih:* ${fmtVisitDate(reservation.visitDate)}`,
    `🕒 *Saat:* ${reservation.startTime}`,
    `⏱ *Süre:* ${reservation.durationMinutes} dk`,
    `👥 *Kişi:* ${reservation.groupSize}`,
  ];
  if (reservation.note) {
    lines.push(`📝 *Not:* ${tgEscape(reservation.note)}`);
  }
  if (reservation.source) {
    lines.push("", `_Kanal: ${reservation.source}_`);
  }
  if (statusSuffix) {
    lines.push("", `*${statusSuffix}*`);
  }
  return lines.join("\n");
}

export async function sendStaffApprovalRequest(
  reservation: ReservationWithVisitor,
): Promise<{ messageId: number; chatId: string } | null> {
  const chatId = process.env.TELEGRAM_STAFF_CHAT_ID;
  if (!chatId) {
    logError("TELEGRAM_STAFF_CHAT_ID tanimli degil");
    return null;
  }
  const text = buildStaffApprovalText(reservation);
  const result = await sendInlineKeyboard(chatId, text, [
    [
      { text: "✅ Onayla", callback_data: `approve_${reservation.id}` },
      { text: "❌ Reddet", callback_data: `reject_${reservation.id}` },
    ],
  ]);
  if (!result?.ok || !result.result) return null;
  const res = result.result as { message_id?: number };
  if (typeof res.message_id !== "number") return null;
  return { messageId: res.message_id, chatId };
}

// Yetkili onay mesajini guncelle: durum satiri ekle, inline butonlari kaldir.
// Hem callback handler hem site/Telegram/WhatsApp status degisikliklerinde
// stale buton durumunu temizler.
export async function editStaffMessage(
  chatId: number | string,
  messageId: number,
  reservation: ReservationWithVisitor,
  statusOverride?: string,
): Promise<TelegramResponse | null> {
  const status = statusOverride ?? reservation.status;
  const text = buildStaffApprovalText(reservation, statusLabel(status));
  return editMessageText(chatId, messageId, text, {
    reply_markup: { inline_keyboard: [] },
  });
}

export async function sendVisitorConfirmation(
  chatId: number | string,
  reservation: ReservationWithVisitor,
): Promise<string | null> {
  const text = [
    `Merhaba ${tgEscape(reservation.visitor.name)},`,
    "",
    "✅ Rezervasyonunuz *onaylandı*!",
    `📅 Tarih: ${fmtVisitDate(reservation.visitDate)}`,
    `🕒 Saat: ${reservation.startTime}`,
    "",
    "Görüşmek üzere!",
  ].join("\n");
  const r = await sendMessage(chatId, text);
  return r?.ok ? "sent" : null;
}

export async function sendVisitorRejection(
  chatId: number | string,
  reservation: ReservationWithVisitor,
  alternatives: AvailableSlot[],
): Promise<string | null> {
  const altLines = alternatives.length
    ? alternatives
        .map((s, i) => `${i + 1}\\. ${s.startTime} - ${s.endTime}`)
        .join("\n")
    : "_(Bu gün için uygun saat kalmadı)_";

  const text = [
    `Merhaba ${tgEscape(reservation.visitor.name)},`,
    "",
    `❌ ${fmtVisitDate(reservation.visitDate)} ${reservation.startTime} için talebiniz maalesef karşılanamadı.`,
    "",
    "*Alternatif saatler:*",
    altLines,
    "",
    "Yeni rezervasyon için /start yazabilirsiniz.",
  ].join("\n");
  const r = await sendMessage(chatId, text);
  return r?.ok ? "sent" : null;
}
