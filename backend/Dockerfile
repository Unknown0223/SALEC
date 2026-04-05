# SALESDOC API — Railway / Docker (Fastify + Prisma)
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

# postinstall / prisma.config.ts uchun; ishga tushganda Railway haqiqiy DATABASE_URL beradi
ENV DATABASE_URL="postgresql://buildtime:buildtime@127.0.0.1:5432/buildtime?schema=public"

RUN npm ci

COPY tsconfig.json prisma.config.ts ./
COPY src ./src

RUN npx prisma generate && npm run build

ENV NODE_ENV=production

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
