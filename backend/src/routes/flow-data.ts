import type { FastifyPluginAsync } from "fastify";
import { getAvailableSlots } from "../services/slot.service";
import {
  isEncryptedFlowBody,
  decryptRequest,
  encryptResponse,
} from "../wa/flow-crypto";

// WhatsApp Flow Data Exchange payload yapisi (sifre cozulduktan sonra).
// Meta v3.0 protokol referansi:
// https://developers.facebook.com/docs/whatsapp/flows/reference/dataexchange
type FlowDataReq = {
  version?: string;
  action?: string;
  screen?: string;
  data?: Record<string, unknown>;
  flow_token?: string;
};

type AvailableSlotItem = { id: string; title: string };

const DEFAULT_DURATION_MIN =
  Number(process.env.DEFAULT_DURATION_MINUTES) || 120;

function isoDate(s: unknown): string | null {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function buildAvailableSlots(
  visitDate: string,
  durationMin: number,
): Promise<AvailableSlotItem[]> {
  const slots = await getAvailableSlots(visitDate, durationMin);
  return slots.map((s) => ({
    id: s.startTime,
    title: `${s.startTime} - ${s.endTime}`,
  }));
}

async function processRequest(payload: FlowDataReq): Promise<unknown> {
  // Saglik kontrolu — Meta Flow Builder dogrulamasi
  if (payload.action === "ping") {
    return { data: { status: "active" } };
  }

  // Hata/yenilenme bildirimi
  if (payload.action === "INIT") {
    return {
      screen: "TARIH_SAAT",
      data: { available_slots: [] as AvailableSlotItem[] },
    };
  }

  if (payload.action === "data_exchange") {
    const visitDate = isoDate(payload.data?.visit_date);
    if (visitDate) {
      const duration = Number(payload.data?.duration) || DEFAULT_DURATION_MIN;
      const available = await buildAvailableSlots(visitDate, duration);
      return {
        screen: payload.screen ?? "TARIH_SAAT",
        data: { available_slots: available },
      };
    }
    return {
      screen: payload.screen ?? "TARIH_SAAT",
      data: { available_slots: [] as AvailableSlotItem[] },
    };
  }

  // Bilinmeyen action — bos veri ile ack
  return { data: {} };
}

const flowDataRoutes: FastifyPluginAsync = async (app) => {
  app.post("/flow-data", async (req, reply) => {
    const body = req.body;

    // 1) Sifreli payload geldi mi?
    if (isEncryptedFlowBody(body)) {
      const privateKey = process.env.WA_FLOW_PRIVATE_KEY;
      if (!privateKey) {
        req.log.error("WA_FLOW_PRIVATE_KEY yok — sifreli istek isleyemiyor");
        return reply.code(421).send({ error: "encryption_not_configured" });
      }
      try {
        const { payload, aesKey, iv } = decryptRequest(body, privateKey);
        const response = await processRequest(payload as FlowDataReq);
        const encrypted = encryptResponse(response, aesKey, iv);
        return reply.type("text/plain").send(encrypted);
      } catch (err) {
        req.log.error({ err }, "flow-data decrypt/encrypt hata");
        return reply.code(421).send({ error: "encryption_failed" });
      }
    }

    // 2) Duz JSON (Meta Flow Builder preview veya unencrypted ortam testleri).
    if (!body || typeof body !== "object") {
      return reply.code(400).send({ error: "invalid_body" });
    }
    try {
      const response = await processRequest(body as FlowDataReq);
      return reply.send(response);
    } catch (err) {
      req.log.error({ err }, "flow-data islem hata");
      return reply.code(500).send({ error: "internal_error" });
    }
  });
};

export default flowDataRoutes;
