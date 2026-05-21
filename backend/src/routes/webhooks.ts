import type { FastifyPluginAsync } from "fastify";
import {
  registerWaRawBodyParser,
  verifyWhatsAppSignature,
} from "../middleware/wa-verify";
import { handleWebhook, type WAWebhookPayload } from "../wa/webhook-handler";

type VerifyQuery = {
  "hub.mode"?: string;
  "hub.verify_token"?: string;
  "hub.challenge"?: string;
};

const webhookRoutes: FastifyPluginAsync = async (app) => {
  registerWaRawBodyParser(app);

  // Meta'nin webhook subscription dogrulamasi
  app.get<{ Querystring: VerifyQuery }>("/whatsapp", async (req, reply) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const expected = process.env.WA_WEBHOOK_VERIFY_TOKEN;

    if (
      mode === "subscribe" &&
      typeof token === "string" &&
      typeof expected === "string" &&
      expected.length > 0 &&
      token === expected &&
      typeof challenge === "string"
    ) {
      return reply.type("text/plain").send(challenge);
    }

    return reply.code(403).send({ error: "verification_failed" });
  });

  app.post<{ Body: WAWebhookPayload }>(
    "/whatsapp",
    { preHandler: verifyWhatsAppSignature },
    async (req, reply) => {
      try {
        await handleWebhook(req.body, req.log);
      } catch (err) {
        req.log.error({ err }, "WA webhook handler hata");
      }
      // Meta her durumda 200 bekler, aksi halde retry yagar
      return reply.code(200).send({ ok: true });
    },
  );
};

export default webhookRoutes;
