FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
# Cache-bust: Railway her commit icin RAILWAY_GIT_COMMIT_SHA build-arg'ini
# benzersiz deger ile gecer. Bu ARG'i bir RUN'da kullanarak ASAGIDAKI tum
# layer'lari (COPY src + RUN npm run build) commit basina gecersiz kiliyoruz.
# Boylece stale Docker layer cache'i derlenmis dist/'i tekrar kullanamaz —
# kaynak degisince mutlaka yeniden derlenir. (Onceki bug: c25dde9'daki yeni
# route eski cache'lenmis dist/ ile deploy edildigi icin 404 donuyordu.)
ARG RAILWAY_GIT_COMMIT_SHA=local
RUN echo "Building commit: ${RAILWAY_GIT_COMMIT_SHA}"
# Deploy trigger: 2026-05-25 — backend/ icinde gercek dosya degisikligi ki
# Root Directory=/backend path-filtreli auto-deploy watch'i tetiklensin
# (bos commit dosya degistirmedigi icin path watch'i uyandirmiyordu).
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci --only=production
COPY prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3001
# Start: migration'lari uygula, ardindan sunucuyu baslat.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
