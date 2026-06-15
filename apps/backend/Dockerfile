# Node 22.12+ is required: the @kage0x3b/class-transformer fork is ESM-only, and CommonJS consumers
# (nest-typed-config, and ts-node during build:mikro-orm-cache) rely on unflagged require(ESM), which
# only landed in Node 22.12. 22.6 throws ERR_REQUIRE_ESM. Pinned to a verified-working 22.x patch.
FROM node:22.22-alpine AS base

LABEL org.opencontainers.image.title="@bytebunker/backend"
LABEL org.opencontainers.image.authors="moritz.hein+bytebunker@live.de"

FROM base AS cleaned-repo

RUN apk add --no-cache --update libc6-compat

WORKDIR /cleaned-repo

RUN npm add -g add turbo@^2
COPY . .

# Generate a partial monorepo with a pruned lockfile for a target workspace.
RUN turbo prune @bytebunker/backend @bytebunker/qs-esm @bytebunker/eslint-config @bytebunker/tsconfig @bytebunker/event-schema --docker

FROM base AS build

RUN apk add --no-cache --update libc6-compat alpine-sdk python3 curl py3-setuptools libpq-dev

WORKDIR /opt/app

ENV CI=true

# First install the dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=cleaned-repo /cleaned-repo/out/json/ .
# Why copy this? Contents are identical to the one copied in previous cmd
COPY --from=cleaned-repo /cleaned-repo/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN npm install -g corepack@latest && corepack enable && pnpm install -r --reporter=append-only

# Build the project
COPY --from=cleaned-repo /cleaned-repo/out/full/ .

RUN pnpm turbo build --filter=@bytebunker/backend

FROM base

RUN apk add --no-cache --update libc6-compat alpine-sdk python3 curl py3-setuptools libpq-dev
WORKDIR /opt/app

COPY --from=cleaned-repo /cleaned-repo/out/json/ .
# COPY --from=build /opt/app/package.json .
# COPY --from=build /opt/app/pnpm-lock.yaml .
# COPY --from=build  /opt/app/apps/backend/package.json ./apps/backend/package.json

RUN npm install -g corepack@latest && corepack enable && pnpm install --prod --reporter=append-only

WORKDIR /opt/app/apps/backend

# Only add pg-native bindings when running in production
RUN pnpm add --prod pg-native
COPY --from=build /opt/app/packages/qs-esm/lib /opt/app/packages/qs-esm/lib
COPY --from=build /opt/app/packages/event-schema/lib /opt/app/packages/event-schema/lib
# COPY --from=build /opt/app/apps/backend/resources ./resources
COPY --from=build /opt/app/apps/backend/.env.production.toml ./.env.production.toml
COPY --from=build /opt/app/apps/backend/run-mikro-orm.cjs ./run-mikro-orm.cjs
COPY --from=build /opt/app/apps/backend/dist ./dist

CMD node ./dist/main.js