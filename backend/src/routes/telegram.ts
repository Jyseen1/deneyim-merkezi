import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client";
import {
  answerCallbackQuery,
  editStaffMessage,
  getBotUsername,
  sendMessage,
  sendPhoto,
  statusLabel,
} from "../services/telegram.service";
import {
  approveReservation,
  createReservation,
  rejectReservation,
} from "../services/reservation.service";
import {
  ReservationAlreadyProcessedError,
  SlotUnavailableError,
  TooManyPendingReservationsError,
  type CreateReservationInput,
} from "../types/reservation";
import { notifyAdminError } from "../services/error-alert.service";

// Telegram webhook payload sablonu (gerekli alanlar).
type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    web_app_data?: { data: string; button_text?: string };
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message: { chat: { id: number }; message_id: number; text?: string };
    data?: string;
  };
};

// Web App formundan gelen JSON sablonu (dashboard rezervasyon page sendData)
const webAppFormSchema = z.object({
  name: z.string().min(1),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  email: z.string().email().optional(),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().positive().optional(),
  groupSize: z.number().int().positive(),
  note: z.string().optional(),
  telegramChatId: z.union([z.string(), z.number()]).optional(),
});

function toIntOpt(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const telegramRoutes: FastifyPluginAsync = async (app) => {
  app.post("/telegram", async (req, reply) => {
    // Webhook secret token dogrulama
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expected) {
      const got = req.headers["x-telegram-bot-api-secret-token"];
      if (got !== expected) {
        req.log.warn(
          { got: typeof got === "string" ? got.slice(0, 8) + "…" : null },
          "Telegram webhook: gecersiz secret token",
        );
        return reply.code(401).send({ ok: false });
      }
    }

    const update = req.body as TgUpdate;
    if (!update || typeof update !== "object") {
      return reply.code(400).send({ ok: false });
    }

    try {
      await handleUpdate(update, req.log);
    } catch (err) {
      req.log.error({ err }, "Telegram update isleme hatasi");
      void notifyAdminError("telegram.webhook.handleUpdate", err, {
        updateId: update.update_id,
      });
    }

    // Telegram her zaman 200 bekler; aksi halde retry yagar
    return reply.send({ ok: true });
  });
};

async function handleUpdate(
  update: TgUpdate,
  log: { error: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; info: (...a: unknown[]) => void },
) {
  // 1) Komut: /start → kisa karsilama. Persistent menu butonu zaten
  // sol-altta duruyor, inline buton eklemiyoruz (cift gorunmesin).
  if (update.message?.text === "/start") {
    const chatId = update.message.chat.id;
    await sendMessage(
      chatId,
      [
        "👋 *Deneyim Merkezi*'ne hoş geldiniz.",
        "",
        "Rezervasyon yapmak için aşağıdaki *Rezervasyon Yap* menü butonunu kullanabilirsiniz.",
      ].join("\n"),
    );
    return;
  }

  // 1b) Komut: /qr → SADECE staff chat icin bot linkinin QR'i
  if (update.message?.text === "/qr") {
    const chatId = update.message.chat.id;
    const staffChatId = process.env.TELEGRAM_STAFF_CHAT_ID;
    if (!staffChatId || String(chatId) !== String(staffChatId)) {
      // Yetkili olmayanlara duz bilgilendirme (menu butonuna yonlendir)
      await sendMessage(
        chatId,
        "Rezervasyon yapmak için sol-alttaki *Rezervasyon Yap* menü butonunu kullanabilirsiniz.",
      );
      return;
    }
    const username = await getBotUsername();
    if (!username) {
      await sendMessage(
        chatId,
        "❗ Bot kullanıcı adı alınamadı. TELEGRAM_BOT_USERNAME env'i ayarlayın veya bot'un public username'i olduğundan emin olun.",
      );
      return;
    }
    const botLink = `https://t.me/${username}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(botLink)}`;
    const caption = [
      "📱 Bu QR kodu müşterileriniz okutarak rezervasyon yapabilir.",
      "",
      `Bot linki: ${botLink}`,
    ].join("\n");
    await sendPhoto(chatId, qrUrl, caption);
    return;
  }

  // 2) Web App'ten gelen form verisi
  if (update.message?.web_app_data) {
    const chatId = update.message.chat.id;
    const raw = update.message.web_app_data.data;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      await sendMessage(chatId, "❗ Form verisi okunamadı.");
      return;
    }
    const result = webAppFormSchema.safeParse(parsed);
    if (!result.success) {
      log.warn({ issues: result.error.flatten() }, "Telegram web_app_data sema disi");
      await sendMessage(chatId, "❗ Form verisi geçersiz.");
      return;
    }
    const input: CreateReservationInput = {
      name: result.data.name,
      phone: result.data.phone,
      email: result.data.email,
      visitDate: result.data.visitDate,
      startTime: result.data.startTime,
      durationMinutes: toIntOpt(result.data.durationMinutes),
      groupSize: result.data.groupSize,
      note: result.data.note?.trim() || undefined,
      source: "telegram",
      telegramChatId: String(result.data.telegramChatId ?? chatId),
    };

    try {
      const res = await createReservation(input);
      await sendMessage(
        chatId,
        [
          "✅ *Talebiniz alındı.*",
          "",
          `Onay sonrası bilgilendirileceksiniz.`,
          `Rezervasyon kodu: \`${res.reservation.id.slice(0, 8).toUpperCase()}\``,
        ].join("\n"),
      );
    } catch (err) {
      if (err instanceof TooManyPendingReservationsError) {
        await sendMessage(
          chatId,
          [
            "⚠️ *Çok fazla bekleyen talebiniz var.*",
            "",
            err.message,
          ].join("\n"),
        );
      } else if (err instanceof SlotUnavailableError) {
        const alts =
          err.alternatives.length > 0
            ? err.alternatives
                .map((s, i) => `${i + 1}\\. ${s.startTime} - ${s.endTime}`)
                .join("\n")
            : "_(Bu gün için uygun saat kalmadı)_";
        await sendMessage(
          chatId,
          [
            "❌ Seçtiğiniz saat artık müsait değil.",
            "",
            "*Alternatif saatler:*",
            alts,
            "",
            "Yeni rezervasyon için /start yazın.",
          ].join("\n"),
        );
      } else {
        log.error({ err }, "Telegram createReservation hata");
        await sendMessage(
          chatId,
          "❗ Talebiniz işlenirken hata oluştu. Lütfen tekrar deneyin.",
        );
      }
    }
    return;
  }

  // 3) Buton tiklamasi: yetkili onay/red
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data ?? "";
    const match = /^(approve|reject)_(.+)$/.exec(data);
    if (!match) {
      await answerCallbackQuery(cb.id, "Bilinmeyen aksiyon");
      return;
    }
    const kind = match[1] as "approve" | "reject";
    const reservationId = match[2];

    try {
      let updated;
      if (kind === "approve") {
        updated = await approveReservation(reservationId, "telegram");
      } else {
        const r = await rejectReservation(reservationId);
        updated = r.reservation;
      }
      await answerCallbackQuery(
        cb.id,
        kind === "approve" ? "Onaylandı" : "Reddedildi",
      );
      // Service stored-refs ile mesaji zaten edit etmis olabilir; ama eski
      // reservation'larda (refs yok) buton hala duruyor. Bu callback'te
      // gelen mesaj ID'sini kullanarak idempotent bir edit dener.
      if (!updated.telegramStaffMessageId) {
        await editStaffMessage(
          cb.message.chat.id,
          cb.message.message_id,
          updated,
        );
      }
    } catch (err) {
      if (err instanceof ReservationAlreadyProcessedError) {
        // Zaten islenmis: alert ile uyari + stale mesaji guncel duruma getir
        await answerCallbackQuery(
          cb.id,
          `Bu rezervasyon zaten işlenmiş (${statusLabel(err.currentStatus)})`,
          true,
        );
        try {
          const current = await prisma.reservation.findUnique({
            where: { id: reservationId },
            include: { visitor: true },
          });
          if (current) {
            await editStaffMessage(
              cb.message.chat.id,
              cb.message.message_id,
              current,
            );
          }
        } catch (e) {
          log.error({ err: e }, "Telegram stale mesaj sync hatasi");
        }
        return;
      }
      log.error({ err }, "Telegram callback action hata");
      await answerCallbackQuery(cb.id, "Hata oluştu");
    }
    return;
  }

  // 4) Diger metin: kisa yonlendirme (persistent menu butonuna)
  if (update.message?.text) {
    const chatId = update.message.chat.id;
    await sendMessage(
      chatId,
      "Rezervasyon yapmak için sol-alttaki *Rezervasyon Yap* menü butonunu kullanabilirsiniz.",
    );
  }
}

export default telegramRoutes;
