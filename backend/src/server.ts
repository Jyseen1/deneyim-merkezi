import "dotenv/config"; // .env yuklemesi diger import'lardan ONCE olmali (queue.ts REDIS_URL'i import-time okuyor)
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyJwt from "@fastify/jwt";
import webhookRoutes from "./routes/webhooks";
import flowDataRoutes from "./routes/flow-data";
import telegramRoutes from "./routes/telegram";
import reservationRoutes from "./routes/reservations";
import dashboardRoutes from "./routes/dashboard";
import slotRoutes from "./routes/slots";
import authRoutes from "./routes/auth";
import staffRoutes from "./routes/staff";
import settingsRoutes from "./routes/settings";
import whatsappRoutes from "./routes/whatsapp";
import eventsRoutes from "./routes/events";
import visitorsRoutes from "./routes/visitors";
import "./jobs/reminder.job"; // worker'lar import side-effect ile baslar
import "./jobs/timeout.job";
import "./jobs/staff-notify.job";
import "./jobs/email.job";
import { shutdownQueues } from "./jobs/queue";
import { prisma } from "./db/client";
import { notifyAdminError } from "./services/error-alert.service";

const isProduction = process.env.NODE_ENV === "production";
const app = Fastify({
  // Production'da info, dev'de debug. Hatalar her ortamda log'lanir.
  logger: {
    level: isProduction ? "info" : "debug",
  },
});

async function main() {
  app.addHook("onClose", async () => {
    await shutdownQueues();
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      const allowed = [
        "http://localhost:3000",
        process.env.DASHBOARD_URL,
      ].filter(Boolean) as string[];
      // origin undefined olabilir (server-to-server, curl, Postman) — izin ver
      if (!origin || allowed.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error("CORS reddedildi"), false);
    },
    credentials: true,
  });
  await app.register(helmet);
  // Global rate limit: IP basina dakikada 100 istek. Webhook'lar mefuf
  // (Telegram/WhatsApp burst gondurebilir + onlarin kendi guvenligi var).
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    allowList: (req) => {
      const url = req.url || "";
      // /api/v1/webhooks/* yolu - Telegram + WhatsApp webhook'lari muaf
      return url.startsWith("/api/v1/webhooks/");
    },
  });

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET tanimli degil");
  await app.register(fastifyJwt, {
    secret: jwtSecret,
    sign: { expiresIn: "7d" },
  });

  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date(),
    env: process.env.NODE_ENV,
  }));

  // Fastify global error handler: sadece 500+ sunucu hatalarinda alarm.
  // 4xx (validation, not_found, vs.) zaten musteri tarafi sorun, alarm degil.
  app.setErrorHandler((err, req, reply) => {
    const status =
      (err as { statusCode?: number }).statusCode ??
      reply.statusCode ??
      500;
    if (status >= 500) {
      req.log.error({ err, url: req.url, method: req.method }, "5xx server error");
      void notifyAdminError(
        `${req.method} ${req.url}`,
        err,
        { reqId: req.id },
      );
    } else {
      req.log.warn({ err, url: req.url, method: req.method, status }, "4xx client error");
    }
    // Default Fastify formatting yerine kendi cevabımız — gizlemek istemiyoruz
    if (!reply.sent) {
      reply.code(status).send({
        error: status >= 500 ? "internal_error" : (err as { code?: string }).code ?? "error",
        message:
          status >= 500 ? "Sunucu hatasi olustu" : err.message,
      });
    }
  });

  // DEV/test alarm tetikleyici. Production'da kapali.
  if (!isProduction) {
    app.get("/debug/test-alert", async (req) => {
      req.log.info("test-alert tetiklendi");
      await notifyAdminError("test-alert", new Error("Bu bir test alarmidir"), {
        kaynak: "debug endpoint",
      });
      return { ok: true, sentTo: process.env.TELEGRAM_STAFF_CHAT_ID, throttled: "5dk icinde tekrar atilirsa engellenir" };
    });
  }

  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(webhookRoutes, { prefix: "/api/v1/webhooks" });
  await app.register(flowDataRoutes, { prefix: "/api/v1/webhooks" });
  await app.register(telegramRoutes, { prefix: "/api/v1/webhooks" });
  await app.register(reservationRoutes, { prefix: "/api/v1/reservations" });
  await app.register(slotRoutes, { prefix: "/api/v1/slots" });
  await app.register(dashboardRoutes, { prefix: "/api/v1/dashboard" });
  await app.register(staffRoutes, { prefix: "/api/v1/staff" });
  await app.register(settingsRoutes, { prefix: "/api/v1/settings" });
  await app.register(whatsappRoutes, { prefix: "/api/v1/whatsapp" });
  await app.register(eventsRoutes, { prefix: "/api/v1/events" });
  await app.register(visitorsRoutes, { prefix: "/api/v1/visitors" });

  const port = Number(process.env.PORT) || 3001;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`\nSunucu: http://localhost:${port}`);
  console.log(`Health: http://localhost:${port}/health\n`);
}

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(
    JSON.stringify({
      level: "info",
      scope: "server",
      msg: `${signal} alindi - graceful shutdown basliyor`,
    }),
  );

  // 10 saniye sonra zorla kapatma
  const force = setTimeout(() => {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "server",
        msg: "shutdown timeout - force exit",
      }),
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  try {
    await app.close(); // onClose hook'u shutdownQueues'u tetikler
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "server",
        msg: "app.close hata",
        err: String(err),
      }),
    );
  }
  try {
    await prisma.$disconnect();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        scope: "server",
        msg: "prisma.$disconnect hata",
        err: String(err),
      }),
    );
  }
  clearTimeout(force);
  console.log(
    JSON.stringify({
      level: "info",
      scope: "server",
      msg: "shutdown tamam",
    }),
  );
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    void gracefulShutdown(sig);
  });
}

// Yakalanmamis hatalar — alarm + log, sonra graceful shutdown
process.on("unhandledRejection", (reason) => {
  console.error(
    JSON.stringify({
      level: "error",
      scope: "process",
      msg: "unhandledRejection",
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    }),
  );
  void notifyAdminError("unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  console.error(
    JSON.stringify({
      level: "error",
      scope: "process",
      msg: "uncaughtException",
      err: err.message,
      stack: err.stack,
    }),
  );
  void notifyAdminError("uncaughtException", err);
  // uncaught exception sonrasi state belirsiz — graceful shutdown
  void gracefulShutdown("uncaughtException");
});

main().catch((err) => {
  console.error(err);
  void notifyAdminError("server.main", err);
  process.exit(1);
});
