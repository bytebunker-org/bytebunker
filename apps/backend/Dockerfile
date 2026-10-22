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

# Compiler toolchain for the native modules (pg-native/libpq, mmmagic). Only the build stages use it; the
# runtime image gets the compiled node_modules and the shared libraries they link against.
FROM base AS toolchain

RUN apk add --no-cache --update libc6-compat alpine-sdk python3 py3-setuptools libpq-dev

RUN npm install -g corepack@latest && corepack enable

WORKDIR /opt/app

ENV CI=true

FROM toolchain AS build

# First install the dependencies (as they change less often)
COPY .gitignore .gitignore
COPY --from=cleaned-repo /cleaned-repo/out/json/ .
COPY --from=cleaned-repo /cleaned-repo/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install -r --frozen-lockfile --reporter=append-only

# Build the project
COPY --from=cleaned-repo /cleaned-repo/out/full/ .

RUN pnpm turbo build --filter=@bytebunker/backend

# Production dependencies only, native modules compiled here
FROM toolchain AS prod-deps

COPY --from=cleaned-repo /cleaned-repo/out/json/ .
COPY --from=cleaned-repo /cleaned-repo/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --prod --frozen-lockfile --reporter=append-only

FROM base

# libpq for pg-native, libstdc++ for both native addons (mmmagic bundles its own libmagic), curl for health checks
RUN apk add --no-cache --update libc6-compat libpq libstdc++ curl

WORKDIR /opt/app

COPY --from=prod-deps /opt/app .

# Fetch the pnpm version from packageManager now, so `pnpm mikro-orm …` works in the container without network
RUN npm install -g corepack@latest && corepack enable && corepack install

WORKDIR /opt/app/apps/backend

COPY --from=build /opt/app/packages/qs-esm/lib /opt/app/packages/qs-esm/lib
COPY --from=build /opt/app/packages/event-schema/lib /opt/app/packages/event-schema/lib
COPY --from=build /opt/app/apps/backend/.env.production.toml ./.env.production.toml
COPY --from=build /opt/app/apps/backend/run-mikro-orm.cjs ./run-mikro-orm.cjs
COPY --from=build /opt/app/apps/backend/dist ./dist

CMD node ./dist/main.js
