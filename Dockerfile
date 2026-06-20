FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000
ENV HOST=0.0.0.0

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public 2>/dev/null || true
COPY lib ./lib
COPY data ./data
COPY server.js ./
COPY next.config.mjs ./

EXPOSE 10000
CMD ["node", "server.js"]
