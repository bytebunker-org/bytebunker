# Git worktrees and T3 Code

Every git worktree (each T3 Code thread gets one) can run its own bytebunker instance next to the
main checkout. `tools/worktree/wt.sh setup` turns a fresh worktree into that instance; T3 runs it
automatically when it creates a worktree (`t3.json` → **Setup**). The main checkout keeps its
ports, database and cookie.

## Main checkout vs. worktree

|                    | Main checkout (slot 0)      | Worktree (slot N = 1…8)                                            |
| ------------------ | --------------------------- | ------------------------------------------------------------------ |
| Backend            | `:12100`                    | `:12N00` (slot 1 → 12200)                                          |
| Frontend           | `:12101`                    | `:12N01`                                                           |
| Postgres           | DB `bytebunker`             | DB `bytebunker_wt_<dir>` on the same server, cloned                |
| Neo4j              | container on `:12112/12113` | own container `bytebunker-wt-<dir>` on `:12N12/12N13`, data cloned |
| KeyDB (BullMQ)     | index 0                     | index N on the same server                                         |
| Session cookie     | `sid`                       | `sid-wtN`                                                          |
| Local-file imports | `apps/backend/temp/data/…`  | the worktree's own `apps/backend/temp/data/…`                      |
| Asset storage      | local compose MinIO         | local compose MinIO `:12114`, shared by all worktrees              |
| Env files          | your own                    | copied from main, ports/DB/graph/cookie/CORS/MinIO patched         |

`.worktree/env` (gitignored) holds the slot, database and compose project name. Slots of deleted
worktrees are reused; `setup` and `prune` drop databases, Neo4j containers/volumes and KeyDB
indexes whose worktree is gone.

## Why

- **Ports:** fixed per slot, `strictPort` — a taken port fails loudly instead of hopping.
  `apps/frontend/vite.config.ts` reads `DEV_SERVER_PORT` from `.env.development.local`, so plain
  `pnpm dev` in the worktree uses the slot port too.
- **Cookie:** browsers ignore ports for cookies. Two backends on `127.0.0.1` sharing `sid` log each
  other out, so worktrees set `session.cookieName`.
- **Postgres:** a worktree must never write to main's data. The first `setup` snapshots `bytebunker`
  into `bytebunker_wt_template` (dump/restore inside the container); each worktree then gets
  `CREATE DATABASE … TEMPLATE … STRATEGY FILE_COPY` (seconds).
- **Neo4j:** community edition holds one user database per server, so each worktree runs its own
  container. Its volume is a copy of `bytebunker_wt_neo4j_template`, which is a cold copy of main's
  Neo4j volume. **Taking that snapshot stops main's Neo4j for a few seconds** (it is started again).
  That happens on the first setup and on `wt.sh graph snapshot` / `graph reset --fresh`.
- **KeyDB:** BullMQ workers take any job in their Redis database. Sharing index 0 would let a
  worktree backend run main's pipeline jobs with the worktree's code. Each slot uses index N
  (`redis.db`), emptied when the slot is cloned, torn down or pruned.
- **Asset storage:** everything on `*.syscy.de` is production. Worktrees always use the local
  compose MinIO (root credentials from `docker-compose.yml`), like the main dev checkout, and
  `wt.sh backend` refuses to start if any uncommented line in the worktree's env files still
  mentions `syscy.de`. There is no opt-out.
- **Schema:** there are no migrations; MikroORM `schema:update` changes the schema. `wt.sh schema`
  shows the SQL it would run (read-only). Running it is your call (**Schema update** script).

## Commands

```sh
tools/worktree/wt.sh setup           # slot, env files, pnpm install, build libs, clone DB + graph
tools/worktree/wt.sh info            # URLs, DB, graph, cookie
tools/worktree/wt.sh backend         # start services + backend on the slot port
tools/worktree/wt.sh frontend        # frontend on the slot port
tools/worktree/wt.sh services        # only postgres + keydb + minio (main project) and this worktree's neo4j
tools/worktree/wt.sh schema          # SQL diff between entities and this worktree's DB
tools/worktree/wt.sh config          # re-copy env files from main and re-patch them
tools/worktree/wt.sh db reset [--fresh]      # re-clone DB (--fresh: re-snapshot main first)
tools/worktree/wt.sh graph reset [--fresh]   # re-clone graph (--fresh: re-snapshot main first)
tools/worktree/wt.sh graph empty             # start from an empty graph
tools/worktree/wt.sh db psql
tools/worktree/wt.sh list | prune | teardown
```

`pnpm dev` also works in a worktree after `wt.sh services`. In the main checkout every command uses
the stock config.

## T3 scripts

`t3.json` defines **Setup** (runs on worktree creation and holds the agent until it finishes, about
40 s plus `pnpm install`), **Info**, **Backend**, **Frontend**, **All dev servers**, **Build libs**,
lint/check/test scripts, **Schema diff/update**, DB/graph resets, **List**, **Prune** and
**Teardown**. `t3.json` only reaches new worktrees once it is committed on the branch they start
from.

## Caveats

- **Assets referenced by the DB copy are missing.** They live in production storage; the
  worktree's local MinIO starts empty. Old images/files don't load; new imports work. All
  worktrees share the local MinIO buckets.
- **Outbound calls** (Google, YouTube, ICS calendar fetches in pipelines) are not blocked. Nothing
  runs on a timer, but a pipeline you trigger in a worktree reaches the same external services.
- **Local-file trigger folders** come from the settings table. They are relative today, so each
  worktree watches its own folder. `setup` and `backend` warn if one becomes absolute — a worktree
  would then import and move main's files.
- `apps/backend/.env.migration.toml` (production DB) is never copied into worktrees.
- Worktree data is a snapshot: it does not follow later changes in main. Use the `--fresh` resets.
