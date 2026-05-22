import "dotenv/config";
import { setChatMenuButton } from "../services/telegram.service";

// Kullanim: npm run telegram:menu
// veya: DASHBOARD_URL=https://my-dashboard.vercel.app npm run telegram:menu
//
// Bot'un sol-alt kalici menu butonunu Web App'e baglar. Kullanici /start
// yazmadan dogrudan rezervasyon formunu acabilir.
// chat_id dinamik gelmez — Web App icinde initDataUnsafe.user.id okunur.
(async () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("Hata: TELEGRAM_BOT_TOKEN env tanimli degil");
    process.exit(1);
  }
  const dashboardUrl = process.env.DASHBOARD_URL;
  if (!dashboardUrl) {
    console.error(
      "Hata: DASHBOARD_URL env tanimli degil.\n" +
        "Ornek: DASHBOARD_URL=https://YOUR-DASHBOARD.vercel.app npm run telegram:menu",
    );
    process.exit(1);
  }

  const webAppUrl = `${dashboardUrl.replace(/\/$/, "")}/rezervasyon?source=telegram`;
  console.log(`[telegram] setChatMenuButton → ${webAppUrl}`);
  // Emoji KULLANMA — bazi Telegram istemcileri "??" olarak goruyor.
  const result = await setChatMenuButton(webAppUrl, "Rezervasyon Yap");
  console.log("[telegram] sonuc:", JSON.stringify(result, null, 2));

  if (!result?.ok) {
    process.exit(2);
  }
})();
