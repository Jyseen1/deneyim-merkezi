import "dotenv/config";
import { setWebhook } from "../services/telegram.service";

// Kullanim: npm run telegram:webhook -- https://my-backend.railway.app
// veya env: BACKEND_PUBLIC_URL=https://... npm run telegram:webhook
(async () => {
  const cliArg = process.argv[2];
  const baseUrl =
    cliArg ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.RAILWAY_PUBLIC_URL ||
    "";

  if (!baseUrl) {
    console.error(
      "Hata: backend public URL gerekli.\n" +
        "Kullanim: npm run telegram:webhook -- https://YOUR-RAILWAY-APP.up.railway.app",
    );
    process.exit(1);
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("Hata: TELEGRAM_BOT_TOKEN env tanimli degil");
    process.exit(1);
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/webhooks/telegram`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "Uyari: TELEGRAM_WEBHOOK_SECRET tanimli degil — webhook secret-token'siz kurulacak (onerilmez)",
    );
  }

  console.log(`[telegram] setWebhook → ${url}`);
  const result = await setWebhook(url, secret);
  console.log("[telegram] sonuc:", JSON.stringify(result, null, 2));

  if (!result?.ok) {
    process.exit(2);
  }
})();
