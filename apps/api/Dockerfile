# Build from repository root: docker build -f apps/api/Dockerfile .
FROM node:26-bookworm-slim AS deps
WORKDIR /repo
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/field-visit/package.json packages/field-visit/
# @kiorex/pay-contract is a file: dependency on this tarball; npm ci fails (ENOENT) without it.
COPY vendor ./vendor
RUN npm ci

FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN npm run build -w api

FROM node:26-bookworm-slim AS runner
WORKDIR /repo
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/field-visit/package.json packages/field-visit/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY apps/api/docker-entrypoint.mjs ./apps/api/docker-entrypoint.mjs
COPY apps/api/assets ./apps/api/assets
# Runtime market/residency registries (SC-01 + MS-05). Nest resolves these from repo root via __dirname walk.
COPY platform/data-cells.json platform/pdpc-egypt-filings.json platform/email-domain-auth.json ./platform/
COPY vendor ./vendor
RUN npm ci --omit=dev && npm install -g prisma@7.10.1 tsx
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/packages/field-visit/dist ./packages/field-visit/dist
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma

ENV NODE_ENV=production
ENV TZ=Europe/Berlin
WORKDIR /repo/apps/api
EXPOSE 3000
ENTRYPOINT ["node", "docker-entrypoint.mjs"]
