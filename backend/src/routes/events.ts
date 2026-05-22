import type { FastifyPluginAsync } from "fastify";
import {
  eventBus,
  type AppEventName,
  type AppEventPayload,
} from "../services/events.service";

const SUBSCRIBED_EVENTS: AppEventName[] = [
  "new_reservation",
  "reservation_updated",
];

// Server-Sent Events stream. Client EventSource header destegi olmadigi icin
// JWT token ?token=... query param ile geliyor.
const eventsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { token?: string } }>("/stream", async (req, reply) => {
    const token = req.query.token;
    if (!token) {
      return reply.code(401).send({ error: "token_required" });
    }
    try {
      await app.jwt.verify(token);
    } catch {
      return reply.code(401).send({ error: "invalid_token" });
    }

    // SSE headers
    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no"); // proxy buffering kapali
    reply.raw.flushHeaders?.();

    // Fastify yanit lifecycle'ini bypass et — stream'i biz yonetelim
    reply.hijack();

    // Ilk handshake
    reply.raw.write(`event: ready\ndata: {"ok":true}\n\n`);

    // Heartbeat (proxy/load balancer connection'i kesmesin)
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(":\n\n");
      } catch {
        /* socket kapaliysa sessiz gec */
      }
    }, 25_000);

    const writers: Array<{
      name: AppEventName;
      fn: (data: AppEventPayload) => void;
    }> = SUBSCRIBED_EVENTS.map((name) => ({
      name,
      fn: (data: AppEventPayload) => {
        try {
          reply.raw.write(`event: ${name}\n`);
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch {
          /* sessiz gec */
        }
      },
    }));
    writers.forEach((w) => eventBus.on(w.name, w.fn));

    const cleanup = () => {
      clearInterval(heartbeat);
      writers.forEach((w) => eventBus.off(w.name, w.fn));
    };
    req.raw.on("close", cleanup);
    req.raw.on("end", cleanup);
  });
};

export default eventsRoutes;
