import IORedis, { type RedisOptions } from "ioredis";
import { Queue, type Worker } from "bullmq";

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  throw new Error("REDIS_URL tanimli degil");
}

export const REMINDER_QUEUE = "reservation-reminders";
export const TIMEOUT_QUEUE = "reservation-timeouts";
// Yetkili (staff) bildirimi yeniden gonderim kuyruğu. createReservation ilk
// denemede gonderimde basarisiz olursa, gecikmeli retry'lar buraya dusurulur.
export const STAFF_NOTIFY_QUEUE = "staff-notify-retry";
// Email kuyruğu — admin/musteri mail gonderimleri. reservation.service emit
// noktalarindan push'lanır, worker (email.job) Resend SDK ile gönderir + DB log.
export const EMAIL_QUEUE = "email-send";

// BullMQ Worker'lari maxRetriesPerRequest=null ve enableReadyCheck=false bekler.
// Queue baglantilari icin de aynisini kullaniyoruz - Upstash uzerinde sorunsuz.
function redisOptions(): RedisOptions {
  const opts: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
  if (REDIS_URL!.startsWith("rediss://")) {
    opts.tls = {};
  }
  return opts;
}

export function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL!, redisOptions());
}

const queueConnection = createRedisConnection();

export const reminderQueue = new Queue(REMINDER_QUEUE, {
  connection: queueConnection,
});

export const timeoutQueue = new Queue(TIMEOUT_QUEUE, {
  connection: queueConnection,
});

export const staffNotifyQueue = new Queue(STAFF_NOTIFY_QUEUE, {
  connection: queueConnection,
});

export const emailQueue = new Queue(EMAIL_QUEUE, {
  connection: queueConnection,
});

const workers: Worker[] = [];
export function registerWorker(w: Worker): void {
  workers.push(w);
}

let shuttingDown = false;
export async function shutdownQueues(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ level: "info", scope: "jobs", msg: "shutdown basliyor" }));

  // Once worker'lar - aktif job'larin temiz birakmasi icin.
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([
    reminderQueue.close(),
    timeoutQueue.close(),
    staffNotifyQueue.close(),
    emailQueue.close(),
  ]);
  await queueConnection.quit().catch(() => {});

  console.log(JSON.stringify({ level: "info", scope: "jobs", msg: "shutdown tamam" }));
}

export async function removeJobSafe(queue: Queue, jobId: string): Promise<void> {
  try {
    await queue.remove(jobId);
  } catch (err) {
    // Job zaten yoksa ya da aktifse remove fail eder - log'a yaz, akisi durdurma.
    console.warn(
      JSON.stringify({
        level: "warn",
        scope: "jobs",
        msg: "remove job atlandi",
        queue: queue.name,
        jobId,
        err: (err as Error).message,
      }),
    );
  }
}
