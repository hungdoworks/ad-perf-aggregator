# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN chmod +x /app/dist/cli.js && ln -s /app/dist/cli.js /usr/local/bin/agg

ENTRYPOINT ["agg"]
CMD ["--input", "/data/ad_data.csv", "--output", "/results"]
