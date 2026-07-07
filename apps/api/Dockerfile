# Priority API — production image.
# Monorepo-aware: builds the shared workspace packages, generates the Prisma
# client, compiles the NestJS app, then runs the long-lived process (so the
# @nestjs/schedule cron jobs keep firing). Build context is the REPO ROOT:
#   docker build -f apps/api/Dockerfile .
# On Railway, set the service root to the repo and Dockerfile path to apps/api/Dockerfile.

FROM node:20-slim AS build
WORKDIR /app

# System deps for argon2 (native) + prisma engines.
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install the whole workspace (dev deps included — needed to build).
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN npm install

# Build shared packages, generate Prisma client, compile the API.
RUN npm run build -w packages/types \
 && npm run build -w packages/scoring-engine \
 && npm run build -w packages/ai-prompts \
 && npm run prisma:generate -w apps/api \
 && npm run build -w apps/api

# --- runtime image ---
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy the built app + the full node_modules (workspaces are symlinked, so we
# copy the whole tree to keep resolution intact).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/package*.json ./

WORKDIR /app/apps/api
EXPOSE 3000
# Apply any pending migrations (best-effort: the schema is pre-provisioned and
# baselined in Supabase, so a checksum hiccup must not block boot), then start
# the persistent server so the @nestjs/schedule cron jobs keep running.
CMD ["sh", "-c", "npm run migrate:deploy || echo 'migrate skipped (schema pre-provisioned)'; npm run start:prod"]
