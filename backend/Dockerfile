FROM node:20-alpine

WORKDIR /app

# Bagimliliklar
COPY package*.json ./
RUN npm ci --only=production

# Prisma client (schema.prisma uzerinden generate)
COPY prisma ./prisma
RUN npx prisma generate

# Derlenmis kod (bu image'i build etmeden once `npm run build:prod` kosulmali)
COPY dist ./dist

EXPOSE 3001

CMD ["node", "dist/server.js"]
