import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./client";

const BCRYPT_COST = 10;
const SINGLETON_ID = "singleton";

async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const waPhone = process.env.STAFF_WA_PHONE;
  if (!email || !password) {
    console.warn(
      "[seed] ADMIN_EMAIL veya ADMIN_PASSWORD tanimli degil — admin atlandi",
    );
    return;
  }
  if (!waPhone || waPhone.includes("X")) {
    console.warn(
      "[seed] STAFF_WA_PHONE yapilandirilmamis — admin atlandi (waPhone gerekli)",
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  // ADMIN_EMAIL ya da STAFF_WA_PHONE eslesirse mevcut admini yakala
  // (e-posta degistirilmis olsa bile waPhone unique olabilir).
  const existing =
    (await prisma.staff.findUnique({ where: { email } })) ??
    (await prisma.staff.findUnique({ where: { waPhone } }));

  if (existing) {
    // Mevcut hash + yeni ADMIN_PASSWORD uyusmuyorsa hash'i yenile.
    // (Bu sayede ADMIN_PASSWORD env'i degisirse seed cagrildiginda admin senkron olur.)
    let hashToWrite = existing.passwordHash;
    if (!existing.passwordHash) {
      hashToWrite = passwordHash;
    } else {
      const stillMatches = await bcrypt.compare(password, existing.passwordHash);
      if (!stillMatches) {
        hashToWrite = passwordHash;
        console.log("[seed] ADMIN_PASSWORD degismis - hash yenileniyor");
      }
    }
    await prisma.staff.update({
      where: { id: existing.id },
      data: {
        name: existing.name || "Yönetici",
        email,
        waPhone,
        role: "admin",
        isActive: true,
        passwordHash: hashToWrite,
      },
    });
    console.log(`[seed] admin guncellendi (${email})`);
  } else {
    const created = await prisma.staff.create({
      data: {
        name: "Yönetici",
        email,
        waPhone,
        role: "admin",
        isActive: true,
        passwordHash,
      },
    });
    console.log(`[seed] admin olusturuldu (${created.email})`);
  }
}

async function ensureSettings() {
  const existing = await prisma.settings.findUnique({
    where: { id: SINGLETON_ID },
  });
  if (existing) {
    console.log("[seed] settings singleton mevcut");
    return;
  }
  await prisma.settings.create({ data: { id: SINGLETON_ID } });
  console.log("[seed] settings singleton olusturuldu");
}

(async () => {
  try {
    await ensureAdmin();
    await ensureSettings();
  } catch (err) {
    console.error("[seed] hata:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
