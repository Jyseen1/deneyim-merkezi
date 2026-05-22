import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import {
  approveReservation,
  createReservation,
  rejectReservation,
} from "../services/reservation.service";
import { sendFlowMessage } from "../services/whatsapp.service";
import {
  SlotUnavailableError,
  type CreateReservationInput,
} from "../types/reservation";

// Meta WhatsApp Flow nfm_reply payload yapisi (flows.ts ile uyumlu snake_case).
// duration ve group_size Flow icinde TextInput type="number" oldugu icin
// string olarak gelir; toIntOptional ile coerce ediyoruz.
const flowReplySchema = z.object({
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.union([z.string(), z.number()]).optional(),
  visitor_name: z.string().min(1),
  visitor_phone: z.string().min(5),
  group_size: z.union([z.string(), z.number()]),
  note: z.string().optional(),
  email: z.string().email().optional(),
});

function toIntOptional(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function toIntRequired(v: unknown, fallback: number): number {
  return toIntOptional(v) ?? fallback;
}

function normalizePhone(p?: string | null): string {
  return (p ?? "").replace(/\D/g, "");
}

// Meta Cloud API webhook gövdesinin ilgili alanlari.
// https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
export type WAWebhookPayload = {
  object?: string;
  entry?: WAEntry[];
};

type WAEntry = {
  id?: string;
  changes?: Array<{
    field?: string;
    value?: WAValue;
  }>;
};

type WAValue = {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: WAMessage[];
  statuses?: WAStatus[];
};

type WAMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  interactive?: WAInteractive;
};

type WAInteractive = {
  type: "nfm_reply" | "button_reply" | "list_reply" | string;
  nfm_reply?: { response_json?: string; body?: string; name?: string };
  button_reply?: { id?: string; title?: string };
  list_reply?: { id?: string; title?: string; description?: string };
};

type WAStatus = {
  id?: string;
  status?: "sent" | "delivered" | "read" | "failed" | string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};

type DecisionKind = "approve" | "reject";

export async function handleWebhook(
  payload: WAWebhookPayload,
  log: FastifyBaseLogger,
) {
  if (!payload || payload.object !== "whatsapp_business_account") {
    log.warn({ payload }, "WA webhook: beklenmeyen object tipi");
    return;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      for (const msg of value.messages ?? []) {
        await routeMessage(msg, log);
      }

      for (const status of value.statuses ?? []) {
        logStatus(status, log);
      }
    }
  }
}

async function routeMessage(msg: WAMessage, log: FastifyBaseLogger) {
  const base = { from: msg.from, id: msg.id, type: msg.type };

  if (msg.type === "interactive" && msg.interactive) {
    const it = msg.interactive;

    if (it.type === "nfm_reply" && it.nfm_reply) {
      const parsed = safeParseJson(it.nfm_reply.response_json);
      log.info(
        { ...base, interactiveType: "nfm_reply", flow: parsed },
        "WA Flow form verisi alindi (yeni rezervasyon)",
      );

      const validated = flowReplySchema.safeParse(parsed);
      if (!validated.success) {
        log.warn(
          { ...base, issues: validated.error.flatten() },
          "Flow form verisi sema ile uyusmuyor",
        );
        return;
      }

      const input: CreateReservationInput = {
        name: validated.data.visitor_name,
        phone: validated.data.visitor_phone,
        email: validated.data.email,
        visitDate: validated.data.visit_date,
        startTime: validated.data.start_time,
        durationMinutes: toIntOptional(validated.data.duration),
        groupSize: toIntRequired(validated.data.group_size, 1),
        note: validated.data.note?.trim() || undefined,
      };

      try {
        const res = await createReservation(input);
        log.info(
          { ...base, reservationId: res.reservation.id },
          "Webhook'tan rezervasyon olusturuldu",
        );
      } catch (err) {
        if (err instanceof SlotUnavailableError) {
          log.info(
            { ...base, alternatives: err.alternatives },
            "Flow form: slot doluydu",
          );
          // TODO: ziyaretciye 'slot dolu, alternatif sun' WA mesaji
        } else {
          log.error({ ...base, err }, "createReservation webhook hata");
        }
      }
      return;
    }

    if (it.type === "button_reply" && it.button_reply) {
      const decision = parseDecisionButtonId(it.button_reply.id ?? "");
      if (decision) {
        log.info(
          {
            ...base,
            interactiveType: "button_reply",
            decision: decision.kind,
            reservationId: decision.reservationId,
          },
          `Rezervasyon ${decision.kind} butonu`,
        );

        try {
          if (decision.kind === "approve") {
            await approveReservation(decision.reservationId, "whatsapp");
          } else {
            await rejectReservation(decision.reservationId);
          }
        } catch (err) {
          log.error(
            { ...base, reservationId: decision.reservationId, err },
            `${decision.kind}Reservation webhook hata`,
          );
        }
        return;
      }

      log.info(
        { ...base, interactiveType: "button_reply", buttonId: it.button_reply.id },
        "Taninmayan button_reply id",
      );
      return;
    }

    log.info(
      { ...base, interactiveType: it.type },
      "Islenmeyen interactive tipi",
    );
    return;
  }

  if (msg.type === "text") {
    log.info({ ...base, text: msg.text?.body }, "WA text mesaji");

    // Ziyaretci (yetkili degil) bir text yazarsa otomatik Flow gonder.
    const from = normalizePhone(msg.from);
    const staffPhone = normalizePhone(process.env.STAFF_WA_PHONE);
    const isStaff = staffPhone.length > 0 && from === staffPhone;

    if (!from || isStaff) return;

    try {
      const waMessageId = await sendFlowMessage(msg.from!);
      if (waMessageId) {
        log.info(
          { ...base, waMessageId },
          "Ziyaretci text mesaji -> Flow gonderildi",
        );
      } else {
        log.warn(
          base,
          "Ziyaretci text mesaji -> Flow gonderilemedi (WA_FLOW_ID veya token eksik olabilir)",
        );
      }
    } catch (err) {
      log.error({ ...base, err }, "sendFlowMessage hata");
    }
    return;
  }

  log.info(base, "Islenmeyen mesaj tipi");
}

function parseDecisionButtonId(
  id: string,
): { kind: DecisionKind; reservationId: string } | null {
  const match = /^(approve|reject)_(.+)$/.exec(id);
  if (!match) return null;
  return { kind: match[1] as DecisionKind, reservationId: match[2] };
}

function logStatus(status: WAStatus, log: FastifyBaseLogger) {
  log.info(
    {
      messageId: status.id,
      status: status.status,
      recipient: status.recipient_id,
      timestamp: status.timestamp,
      errors: status.errors,
    },
    "WA mesaj durumu guncellendi",
  );
  // TODO: notifications tablosuna delivered/read yaz
}

function safeParseJson(raw: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { _unparsed: raw };
  }
}
