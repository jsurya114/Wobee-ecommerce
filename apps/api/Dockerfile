# syntax=docker/dockerfile:1.7
#
# Woobe API + notification worker image (one image, two commands — see
# infra/terraform/modules/ssm-deploy/deploy.sh). Build from the repo root:
#
#   docker build -f apps/api/Dockerfile -t woobe-api .
#
# The API runs through `tsx`, not `node dist/server.js`: every workspace
# package (@woobe/database, utils, validation, types) exports raw TypeScript
# (`main: ./src/index.ts`, no build script, no dist/) because the Next.js apps
# consume them as source too. Node loads that as ESM and rejects the directory
# import `../generated/client` (ERR_UNSUPPORTED_DIR_IMPORT). Bundling or
# pre-compiling the workspace packages is a repo-wide change, not an image one.
# `tsx` and the `prisma` CLI (deploy-time `migrate deploy`) are therefore RUNTIME
# dependencies, declared as such in apps/api and packages/database.
#
# Two stages so the final image carries the app and nothing that built it:
#   deps    — production-only install + Prisma client generation. The pnpm
#             store/caches live on BuildKit cache mounts, so they never enter a
#             layer (they were ~735 MB of the previous 1.7 GB image).
#   runtime — base OS + the finished /app tree. No pnpm, no corepack, no caches.

# Base image pinned by digest (multi-arch index for node:22-bookworm-slim,
# resolved 2026-09-19) so a rebuild of the same commit starts from the same
# bytes. Bump deliberately; security patches to the base do NOT arrive
# automatically with a digest pin.
# openssl: Prisma's query engine needs libssl to load on Debian slim.
# ca-certificates: outbound TLS (SMTP, Razorpay, Google token verification, AWS).
FROM node:22-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9 AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

FROM base AS deps
# Version comes from package.json's `packageManager` field (same as CI).
RUN corepack enable
WORKDIR /app
COPY . .
# --prod: no devDependencies (eslint, vitest, typescript, prettier, …). Only the
# API and the workspace packages it depends on. The root postinstall generates
# the Prisma client for THIS image's platform, so the query engine always
# matches the runtime architecture.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/pnpm \
    --mount=type=cache,target=/root/.cache/node/corepack \
    --mount=type=cache,target=/root/.cache/prisma \
    pnpm install --prod --frozen-lockfile --filter "@woobe/api..." \
 && test -d packages/database/generated/client

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Root-owned and read-only to the runtime user: the application never writes to
# its own tree (media goes to S3 in production).
COPY --from=deps /app /app
USER node
WORKDIR /app/apps/api
EXPOSE 4000

# Liveness of the API process only (/health never touches Postgres/Redis;
# readiness is /ready). This marks a container "unhealthy" for `docker ps` and
# for the deploy verification — it does NOT restart anything by itself; the
# restart policy handles crashes. The worker has no HTTP server, so the deploy
# script starts it with --no-healthcheck.
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/tsx", "src/server.ts"]
