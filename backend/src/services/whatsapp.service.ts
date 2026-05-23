import axios, { AxiosError, type AxiosResponse } from "axios";
import dayjs from "dayjs";
import { prisma } from "../db/client";
import { logNotification } from "./notification.service";
import type {
  AvailableSlot,
  ReservationWithVisitor,
} from "../types/reservation";

const GRAPH_VERSION = "v19.0";

type WAResponse = {
  messaging_product?: string;
  messages?: Array<{ id?: string; message_status?: string }>;
};

function messagesUrl(): string {
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    throw new Error("WA_PHONE_NUMBER_ID tanimli degil");
  }
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN ?? ""}`,
    "Content-Type": "application/json",
  };
}

// WA Cloud "to" alani uluslararasi formatta '+' ve bosluksuz bekler: "905551234567"
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function logInfo(msg: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level: "info", scope: "wa", msg, ...ctx }));
}

function logError(msg: string, ctx: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ level: "error", scope: "wa", msg, ...ctx }));
}

async function postMessage(payload: unknown): Promise<string | null> {
  let url: string;
  try {
    url = messagesUrl();
  } catch (err) {
    logError("WA URL olusturulamadi", { err: (err as Error).message });
    return null;
  }

  if (!process.env.WA_ACCESS_TOKEN) {
    logError("WA_ACCESS_TOKEN bos - mesaj gonderilmiyor", { payload });
    return null;
  }

  try {
    const res: AxiosResponse<WAResponse> = await axios.post(url, payload, {
      headers: authHeaders(),
      timeout: 10_000,
    });
    const waMessageId = res.data?.messages?.[0]?.id ?? null;
    logInfo("WA mesaj gonderildi", { waMessageId });
    return waMessageId;
  } catch (err) {
    const ax = err as AxiosError<unknown>;
    logError("WA mesaj gonderim hatasi", {
      status: ax.response?.status,
      data: ax.response?.data,
      message: ax.message,
    });
    return null;
  }
}

function formatDate(d: Date): string {
  return dayjs(d).format("DD.MM.YYYY");
}

export async function sendApprovalRequest(
  reservation: ReservationWithVisitor,
): Promise<string | null> {
  const staffPhone = process.env.STAFF_WA_PHONE;
  if (!staffPhone || staffPhone.includes("X")) {
    logError("STAFF_WA_PHONE yapilandirilmamis", { staffPhone });
    return null;
  }

  const lines = [
    "Yeni rezervasyon talebi:",
    "",
    `Ziyaretci: ${reservation.visitor.name}`,
    `Telefon: ${reservation.visitor.phone}`,
    `Tarih: ${formatDate(reservation.visitDate)}`,
    `Saat: ${reservation.startTime}`,
    `Sure: ${reservation.durationMinutes} dk`,
    `Kisi sayisi: ${reservation.groupSize}`,
  ];
  if (reservation.note) lines.push(`Not: ${reservation.note}`);

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(staffPhone),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: lines.join("\n") },
      action: {
        buttons: [
          {
            type: "reply",
            reply: { id: `approve_${reservation.id}`, title: "Onayla" },
          },
          {
            type: "reply",
            reply: { id: `reject_${reservation.id}`, title: "Reddet" },
          },
          {
            type: "reply",
            reply: { id: `alt_${reservation.id}`, title: "Alternatif Oner" },
          },
        ],
      },
    },
  };

  const waMessageId = await postMessage(payload);
  if (waMessageId) {
    try {
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { waMessageId },
      });
    } catch (err) {
      logError("waMessageId update hatasi", {
        reservationId: reservation.id,
        err: (err as Error).message,
      });
    }
  }
  await logNotification({
    reservationId: reservation.id,
    channel: "whatsapp",
    direction: "outbound",
    templateName: "reservation_approval_request",
    waMessageId,
    status: waMessageId ? "sent" : "failed",
  });
  return waMessageId;
}

// Reschedule (saat/tarih degisiklik) bildirimi - 24h pencere icindeki
// ziyaretciler icin free-form text. Acik pencere yoksa Meta reddeder ve
// null doner; sessiz logla.
export async function sendVisitorReschedule(
  reservation: ReservationWithVisitor,
): Promise<string | null> {
  const phone = reservation.visitor.phone;
  if (!phone) return null;
  const body = [
    `Merhaba ${reservation.visitor.name},`,
    "",
    "Rezervasyonunuz güncellendi:",
    `Yeni tarih: ${formatDate(reservation.visitDate)}`,
    `Yeni saat: ${reservation.startTime}`,
    `Süre: ${reservation.durationMinutes} dk`,
    "",
    "Herhangi bir sorunuz olursa cevap verebilirsiniz.",
  ].join("\n");
  return postMessage({
    messaging_product: "whatsapp",
    to: normalizePhone(phone),
    type: "text",
    text: { body },
  });
}

export async function sendTestMessage(
  toPhone: string,
): Promise<{ ok: boolean; waMessageId: string | null; reason?: string }> {
  if (!process.env.WA_ACCESS_TOKEN || !process.env.WA_PHONE_NUMBER_ID) {
    return {
      ok: false,
      waMessageId: null,
      reason: "WhatsApp henüz yapılandırılmamış",
    };
  }
  const id = await postMessage({
    messaging_product: "whatsapp",
    to: normalizePhone(toPhone),
    type: "text",
    text: {
      body:
        "Bu bir test mesajıdır. Deneyim Merkezi WhatsApp entegrasyonu çalışıyor ✓",
    },
  });
  return { ok: id !== null, waMessageId: id };
}

export async function sendFlowMessage(
  toPhone: string,
): Promise<string | null> {
  const flowId = process.env.WA_FLOW_ID;
  if (!flowId) {
    logError("WA_FLOW_ID tanimli degil — flow mesaji gonderilmedi");
    return null;
  }
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizePhone(toPhone),
    type: "interactive",
    interactive: {
      type: "flow",
      header: { type: "text", text: "Deneyim Merkezi" },
      body: {
        text:
          "Rezervasyon yapmak için aşağıdaki butona tıklayın. " +
          "Tarih ve saat seçimini WhatsApp içinden tamamlayabilirsiniz.",
      },
      footer: { text: "Form WhatsApp üzerinden gönderilir." },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: `${Date.now()}_${normalizePhone(toPhone)}`,
          flow_id: flowId,
          flow_cta: "Rezervasyon Yap",
          flow_action: "navigate",
          flow_action_payload: {
            screen: "TARIH_SAAT",
            data: {},
          },
        },
      },
    },
  };
  return postMessage(payload);
}

async function sendAndLog(
  reservation: ReservationWithVisitor,
  templateName: string,
  payload: unknown,
): Promise<string | null> {
  const waMessageId = await postMessage(payload);
  await logNotification({
    reservationId: reservation.id,
    channel: "whatsapp",
    direction: "outbound",
    templateName,
    waMessageId,
    status: waMessageId ? "sent" : "failed",
  });
  return waMessageId;
}

export async function sendConfirmation(
  reservation: ReservationWithVisitor,
): Promise<string | null> {
  const to = normalizePhone(reservation.visitor.phone);
  const date = formatDate(reservation.visitDate);

  // Template Meta'da onaylandiginda WA_USE_TEMPLATES=true ile asagiya gec.
  if (process.env.WA_USE_TEMPLATES === "true") {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: "reservation_confirmed",
        language: { code: "tr" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: reservation.visitor.name },
              { type: "text", text: date },
              { type: "text", text: reservation.startTime },
            ],
          },
        ],
      },
    };
    return sendAndLog(reservation, "reservation_confirmed", payload);
  }

  const text =
    `Merhaba ${reservation.visitor.name},\n\n` +
    `Rezervasyonunuz onaylanmistir.\n` +
    `Tarih: ${date}\n` +
    `Saat: ${reservation.startTime}\n\n` +
    `Goruşmek uzere!`;

  return sendAndLog(reservation, "reservation_confirmed", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

export async function sendRejection(
  reservation: ReservationWithVisitor,
  alternativeSlots: AvailableSlot[],
): Promise<string | null> {
  const to = normalizePhone(reservation.visitor.phone);
  const date = formatDate(reservation.visitDate);

  const altLines = alternativeSlots.length
    ? alternativeSlots
        .map((s, i) => `${i + 1}. ${s.startTime} - ${s.endTime}`)
        .join("\n")
    : "(Bu gun icin uygun saat kalmadi)";

  const text =
    `Merhaba ${reservation.visitor.name},\n\n` +
    `${date} ${reservation.startTime} icin talebiniz maalesef karsilanamadi.\n\n` +
    `Alternatif saatler:\n${altLines}\n\n` +
    `Yeni rezervasyon icin tekrar form gondermeniz yeterli.`;

  return sendAndLog(reservation, "reservation_rejected", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

export async function sendApprovalTimeout(
  reservation: ReservationWithVisitor,
): Promise<string | null> {
  const to = normalizePhone(reservation.visitor.phone);
  const date = formatDate(reservation.visitDate);

  const text =
    `Merhaba ${reservation.visitor.name},\n\n` +
    `${date} ${reservation.startTime} icin rezervasyon talebiniz onaylanmadi.\n\n` +
    `Tekrar denemek isterseniz formu yeniden gonderebilirsiniz.`;

  return sendAndLog(reservation, "reservation_timeout", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}

export async function sendReminder(
  reservation: ReservationWithVisitor,
): Promise<string | null> {
  const to = normalizePhone(reservation.visitor.phone);
  const date = formatDate(reservation.visitDate);

  const text =
    `Merhaba ${reservation.visitor.name},\n\n` +
    `Yarinki ziyaretinizi hatirlatmak isteriz.\n` +
    `Tarih: ${date}\n` +
    `Saat: ${reservation.startTime}\n\n` +
    `Sizi bekliyoruz!`;

  return sendAndLog(reservation, "reservation_reminder", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text },
  });
}
