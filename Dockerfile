# syntax=docker/dockerfile:1

FROM node:26-bookworm-slim AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN npm install -g pnpm@12.4.1

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html vite.config.ts vitest.integration.config.ts playwright.config.ts ./
COPY tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.e2e.json ./
COPY public ./public
COPY src ./src
COPY e2e ./e2e

ARG VITE_API_URL=http://localhost:3000/api/v1
ENV VITE_API_URL=$VITE_API_URL

RUN test -n "$VITE_API_URL" && pnpm run build

FROM nginx:1.27-alpine AS production
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1/healthz"]

CMD ["nginx", "-g", "daemon off;"]
