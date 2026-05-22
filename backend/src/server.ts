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
import { shutdownQueues } from "./jobs/queue";
import { prisma } from "./db/client";

const app = Fastify({ logger: true });

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
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
