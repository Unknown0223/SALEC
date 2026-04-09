# SALESDOC panel — Railway / Docker (Next.js 14)
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Build vaqtida brauzer API manzili (ixtiyoriy — berilsa proxy o‘chadi, client to‘g‘ridan-to‘g‘ri backendga uradi)
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Prod proxy uchun backend origin (Railway: `https://<backend>.*.railway.app`) — build vaqtida majburiy, agar NEXT_PUBLIC_API_URL bo‘sh bo‘lsa
ARG API_INTERNAL_ORIGIN
ENV API_INTERNAL_ORIGIN=${API_INTERNAL_ORIGIN}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./

EXPOSE 3000

CMD ["npm", "run", "start"]
