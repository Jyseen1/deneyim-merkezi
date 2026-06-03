// PM2 process tanımı — CloudPanel sunucusunda iki Node servisi:
//   gigax-backend   → Fastify API      (port 3001, api.gigax.cloud)
//   gigax-dashboard → Next.js dashboard (port 3000, gigax.cloud)
//
// Kullanım (repo kökünde):
//   pm2 start deploy/ecosystem.config.js
//   pm2 save && pm2 startup   # reboot sonrası otomatik başlat
//
// Not: Ortam değişkenleri kod içine GÖMÜLMEZ. Her servis kendi klasöründeki
// .env / .env.production dosyasından okur:
//   - backend  → dotenv ile backend/.env
//   - dashboard→ Next.js otomatik olarak dashboard/.env.production yükler
// Burada sadece PORT/NODE_ENV set ediyoruz.

module.exports = {
  apps: [
    {
      name: "gigax-backend",
      cwd: "./backend",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
      time: true,
    },
    {
      name: "gigax-dashboard",
      cwd: "./dashboard",
      // next binary'sini doğrudan çağırıyoruz (npm sarmalayıcısı olmadan,
      // PM2 sinyallerinin doğru iletilmesi için)
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      time: true,
    },
  ],
};
