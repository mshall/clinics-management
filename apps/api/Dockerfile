# Build from repository root: docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS deps
WORKDIR /repo
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

FROM deps AS build
COPY apps/api ./apps/api
# prisma.config.ts loads at `prisma generate` time and requires DATABASE_URL; no DB is contacted during generate.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
RUN npm run build -w api

FROM node:22-bookworm-slim AS runner
WORKDIR /repo
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY apps/api/docker-entrypoint.mjs ./apps/api/docker-entrypoint.mjs
COPY apps/api/docker-boot.mjs ./apps/api/docker-boot.mjs
# Must match prisma major/minor used in package-lock (api devDependency); mismatched CLI breaks `migrate deploy` on boot.
RUN npm ci --omit=dev && npm install -g prisma@6.19.3 tsx
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma

ENV NODE_ENV=production
ENV TZ=Europe/Berlin
WORKDIR /repo/apps/api
EXPOSE 3000
ENTRYPOINT ["node", "docker-entrypoint.mjs"]
