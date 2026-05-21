import crypto from "node:crypto";
import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

// HMAC dogrulamasi icin gelen JSON gövdesinin BYTE-EXACT halini saklamamiz lazim.
// `register` yerine dogrudan cagrilir; parser webhook plugin'inin kendi scope'una eklensin.
export function registerWaRawBodyParser(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body: Buffer, done) => {
      (req as FastifyRequest).rawBody = body;
      if (body.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(body.toString("utf8")));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );
}

export async function verifyWhatsAppSignature(
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const secret = process.env.WA_APP_SECRET;
  if (!secret) {
    req.log.error("WA_APP_SECRET tanimli degil");
    return reply.code(500).send({ error: "server_misconfigured" });
  }

  const header = req.headers["x-hub-signature-256"];
  if (typeof header !== "string" || !header.startsWith("sha256=")) {
    return reply.code(401).send({ error: "invalid_signature" });
  }

  const raw = req.rawBody;
  if (!raw) {
    req.log.error("rawBody yok - waRawBodyPlugin kayitli mi?");
    return reply.code(401).send({ error: "invalid_signature" });
  }

  const providedHex = header.slice("sha256=".length);
  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(raw)
    .digest("hex");

  let provided: Buffer;
  let expected: Buffer;
  try {
    provided = Buffer.from(providedHex, "hex");
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return reply.code(401).send({ error: "invalid_signature" });
  }

  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return reply.code(401).send({ error: "invalid_signature" });
  }
}
