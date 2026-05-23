// Yetkiliye sistem hatasi alarm bildirimi gonderir.
// AYRI bir Telegram botu kullanir (ERROR_ALERT_BOT_TOKEN) — musteri rezervasyon
// botu (TELEGRAM_BOT_TOKEN) ile karistirilmamak icin. Hedef chat staf chat'idir.
// ERROR_ALERT_BOT_TOKEN tanimli degilse no-op (sistem akisi etkilenmez).

const TG_API = "https://api.telegram.org";

// In-memory throttle: ayni context icin 5dk icinde 1 mesajdan fazlasi atilmaz.
// Process restart sonrasi sifirlanir (Railway tek instance icin yeterli).
const THROTTLE_WINDOW_MS = 5 * 60 * 1000;
const lastSentByContext = new Map<string, number>();

function trMaybe(d: Date): string {
  try {
    return d.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
  } catch {
    return d.toISOString();
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

export async function notifyAdminError(
  context: string,
  error: unknown,
  extra?: Record<string, unknown>,
): Promise<void> {
  const token = process.env.ERROR_ALERT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_STAFF_CHAT_ID;
  if (!token || !chatId) {
    // Konfigurasyon yoksa sessiz no-op.
    return;
  }

  // Throttle: ayni context anahtariyla 5dk icinde 1 mesaj
  const key = context;
  const now = Date.now();
  const last = lastSentByContext.get(key) ?? 0;
  if (now - last < THROTTLE_WINDOW_MS) {
    return;
  }
  lastSentByContext.set(key, now);

  // Mesaj kur — parse_mode kullanmiyoruz, Telegram plain text isler.
  const errMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);
  const errStack =
    error instanceof Error && error.stack
      ? error.stack.split("\n").slice(0, 4).join("\n")
      : "";
  const extraStr =
    extra && Object.keys(extra).length > 0
      ? "\n\nBilgi:\n" + truncate(JSON.stringify(extra, null, 2), 800)
      : "";

  const body = [
    "⚠ Sistem Hatasi",
    "",
    `Nerede: ${context}`,
    `Hata: ${truncate(errMessage, 600)}`,
    `Zaman: ${trMaybe(new Date())}`,
    errStack ? `\nStack:\n${truncate(errStack, 600)}` : "",
    extraStr,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncate(body, 3800), // Telegram limit 4096
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      // Sessiz: alarm botu hata verirse rezervasyon akisini etkilemesin
      console.error(
        JSON.stringify({
          level: "error",
          scope: "error-alert",
          msg: "alarm bot sendMessage non-ok",
          status: res.status,
        }),
      );
    }
  } catch (err) {
    // Sonsuz dongu olmasin — sadece logla, alarm gonderme
    console.error(
      JSON.stringify({
        level: "error",
        scope: "error-alert",
        msg: "alarm bot fetch hata",
        err: (err as Error).message,
      }),
    );
  }
}
