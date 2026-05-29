# Torre de Controle — Frontend (Vite/React build → nginx static serve)
# Single-domain VPS deploy: nginx serves the SPA at / ; Traefik routes /api,
# /ws, /swagger, /health to the backend container on the same host.
#
# VITE_* vars are baked at BUILD time (Vite inlines them into the bundle), so
# they MUST be passed as build-args by the CI build job.

FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build-time public config (inlined into the bundle by Vite)
ARG VITE_API_URL
ARG VITE_SENTRY_DSN
ARG VITE_VAPID_PUBLIC_KEY
# Sentry source-map upload (optional — plugin self-disables when token absent)
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV VITE_API_URL=$VITE_API_URL \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY \
    SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
    SENTRY_ORG=$SENTRY_ORG \
    SENTRY_PROJECT=$SENTRY_PROJECT

# vite build only (NOT `npm run build` which runs `tsc -b` first). The Eden Treaty
# `App` type lives in the sibling api/ package, which is NOT in this build context,
# so cross-package tsc would fail here. Full typecheck runs in the CI `test` job
# (whole monorepo present). esbuild strips types without checking — bundle is correct.
RUN npx vite build

# ── Runtime: nginx static ────────────────────────────────────────────────────
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost/ || exit 1
