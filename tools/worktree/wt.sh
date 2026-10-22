#!/usr/bin/env bash
# Run bytebunker from a git worktree beside the main checkout — own ports, own session cookie, own
# Postgres database copy, own KeyDB index (= own BullMQ queues), own Neo4j container with a copy of
# the graph, local MinIO instead of the production asset storage. See docs/WORKTREES.md.
#
#   wt.sh setup [--no-install] [--no-build] [--no-db]   allocate slot, copy+patch env, install, build libs, clone DB + graph
#   wt.sh info                                          print slot, URLs, database, graph, what runs
#   wt.sh list                                          all worktree slots of this repo and what runs in them
#   wt.sh backend | frontend                            start one dev server in the foreground
#   wt.sh stop                                          stop this worktree's dev servers and its Neo4j (data kept)
#   wt.sh settle                                        same as stop; T3 Code runs it when the thread settles
#   wt.sh teardown [--stop]                             drop DB, remove Neo4j container + volume, empty the KeyDB
#                                                       index, free the slot (refused while servers run)
#   wt.sh prune [--dry-run]                             drop DBs, Neo4j containers/volumes and KeyDB indexes of
#                                                       worktrees that no longer exist
#   wt.sh schema                                        show the SQL `mikro-orm schema:update` would run (read-only)
#   wt.sh services                                      start postgres + keydb + minio (project "bytebunker") and this worktree's neo4j
#   wt.sh config                                        re-copy env files from the main checkout and re-patch them
#   wt.sh db reset [--fresh]                            drop and re-clone this worktree's DB (--fresh: re-snapshot main DB first)
#   wt.sh db snapshot | psql [args] | drop | gc         refresh the template / psql / drop this DB / = prune
#   wt.sh graph reset [--fresh]                         re-clone this worktree's Neo4j data (--fresh: re-snapshot main graph first)
#   wt.sh graph snapshot                                copy main's Neo4j volume into the template (stops main neo4j for the copy)
#   wt.sh graph empty                                   wipe this worktree's Neo4j data (start from an empty graph)
#
# In the main checkout every command runs with the stock config (slot 0, ports 121xx, DB bytebunker).
# The generic part lives in wt-lib.sh (shared across projects; edit its source, then `wt sync`).
set -euo pipefail

WT_PROJECT=bytebunker
WT_SCRIPT=tools/worktree/wt.sh
WT_MAIN_DB=bytebunker
WT_DB_PREFIX=bytebunker_wt_
WT_PG_CONTAINER=bytebunker-bytebunker-backend-postgres-1
WT_PG_USER=bytebunker
# Slots 1–8 → ports 12200–12913. Slot 10 would collide with other projects' 13xxx ports.
WT_MAX_SLOT=8
# Gitignored dev env files that worktrees need from the main checkout. Never .env.migration.toml:
# it points at the production database.
ENV_FILES=(
    apps/backend/.env.development.toml
    apps/frontend/.env.development
    apps/frontend/.env.development.local
)
# Copies from main, patched for the slot: removed on teardown so a stale config can't reach a
# reused slot's Neo4j port or KeyDB index.
WT_GENERATED_FILES=("${ENV_FILES[@]}")
# Everything on these hosts is production. A worktree config must not mention them.
PROD_HOST_PATTERN='syscy\.de'
MAIN_NEO4J_VOLUME=bytebunker_bytebunker-backend-neo4j-data
MAIN_NEO4J_CONTAINER=bytebunker-bytebunker-backend-neo4j-1
TEMPLATE_NEO4J_VOLUME=bytebunker_wt_neo4j_template
NEO4J_IMAGE=neo4j:latest
KEYDB_CONTAINER=bytebunker-bytebunker-backend-keydb-1

# `services` also starts this worktree's neo4j; the lib's DB steps only need the shared services.
WITH_NEO4J=0
[ "${1:-}" = services ] && WITH_NEO4J=1

# shellcheck source=wt-lib.sh
. "$(dirname "$(readlink -f "$0")")/wt-lib.sh"

dc() { docker compose -p bytebunker -f "$MAIN_ROOT/docker-compose.yml" "$@"; }
dc_wt() {
    WT_NEO4J_HTTP_PORT=$NEO4J_HTTP_PORT WT_NEO4J_BOLT_PORT=$NEO4J_BOLT_PORT WT_NEO4J_VOLUME=$NEO4J_VOLUME WT_ROOT=$ROOT \
        docker compose -p "$PROJECT" -f "$ROOT/tools/worktree/docker-compose.worktree.yml" "$@"
}

# Compose project of a worktree's Neo4j. Worktrees set up before wt-lib stored it as PROJECT
# (bytebunker-wt-<dir>); newer ones derive it from the lib's collision-free id.
project_of() { # project_of <worktree path>
    local project id
    project=$(state_get "$1/$WT_STATE_DIR/env" PROJECT)
    if [ -z "$project" ]; then
        read -r _ id _ <<<"$(state_identity "$1")"
        [ -n "$id" ] && project="bytebunker-wt-${id//_/-}"
    fi
    echo "$project"
}

wt_ports() {
    BASE=$((12100 + SLOT * 100))
    BACKEND_PORT=$BASE FRONTEND_PORT=$((BASE + 1)) NEO4J_HTTP_PORT=$((BASE + 12)) NEO4J_BOLT_PORT=$((BASE + 13))
    WT_PORTS=(backend=$BACKEND_PORT frontend=$FRONTEND_PORT)
    if is_main; then
        PROJECT=bytebunker NEO4J_VOLUME=$MAIN_NEO4J_VOLUME
    else
        PROJECT=$(project_of "$ROOT")
        NEO4J_VOLUME=${PROJECT}_neo4j-data
    fi
    # Cookies ignore ports, so every backend on this host needs its own session cookie name.
    COOKIE=sid
    is_main || COOKIE=sid-wt$SLOT
}

# --- docker helpers --------------------------------------------------------------------------------

volume_exists() { docker volume inspect "$1" >/dev/null 2>&1; }
# Containers (any state) of a compose project, found by label: works without the compose file.
project_containers() { docker ps -aq --filter "label=com.docker.compose.project=$1"; }
project_container_names() { docker ps -a --filter "label=com.docker.compose.project=$1" --format '{{.Names}}' | tr '\n' ' ' | sed 's/ $//'; }

# Remove a worktree Neo4j project: its containers first (a volume in use can't be removed), then
# the compose network and the data volume. Needs neither the worktree nor its compose file.
remove_neo4j_project() { # remove_neo4j_project <project> <volume>
    local ids
    ids="$(project_containers "$1" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    if [ -n "${ids// /}" ]; then docker rm -f $ids >/dev/null; fi
    docker network rm "$1_default" >/dev/null 2>&1 || true
    if volume_exists "$2"; then
        docker volume rm "$2" >/dev/null || warn "could not remove volume $2"
    fi
    return 0
}

# Copy one docker volume into another (target emptied first). Uses the neo4j image: already pulled.
copy_volume() {
    docker run --rm --entrypoint sh -v "$1":/from:ro -v "$2":/to "$NEO4J_IMAGE" \
        -c 'find /to -mindepth 1 -delete && cp -a /from/. /to/'
}

keydb_up() { [ "$(docker inspect -f '{{.State.Running}}' "$KEYDB_CONTAINER" 2>/dev/null)" = true ]; }
keydb() { docker exec -i "$KEYDB_CONTAINER" keydb-cli "$@"; }
# Empty a worktree's KeyDB index so a reused slot doesn't inherit another worktree's BullMQ jobs.
keydb_flush() {
    if keydb_up; then
        keydb -n "$1" FLUSHDB >/dev/null
    else
        warn "keydb is down — index $1 is emptied on the next setup/prune"
    fi
}

# --- services --------------------------------------------------------------------------------------

wt_services() {
    dc up -d --wait bytebunker-backend-postgres bytebunker-backend-keydb bytebunker-backend-minio >/dev/null 2>&1 ||
        dc up -d bytebunker-backend-postgres bytebunker-backend-keydb bytebunker-backend-minio
    if [ "$WITH_NEO4J" = 1 ]; then ensure_neo4j; fi
}

ensure_neo4j() {
    if is_main; then
        dc up -d bytebunker-backend-neo4j >/dev/null
    else
        volume_exists "$NEO4J_VOLUME" || graph_clone
        dc_wt up -d >/dev/null
    fi
    local i
    for i in $(seq 1 90); do
        curl -fs "http://127.0.0.1:$NEO4J_HTTP_PORT" >/dev/null && return
        sleep 1
    done
    die "neo4j on :$NEO4J_HTTP_PORT did not become ready"
}

# A fresh DB copy gets an empty KeyDB index: jobs queued against the old copy must not run.
wt_db_cloned() { keydb_flush "$SLOT"; }

# --- config ----------------------------------------------------------------------------------------

# Map main's backend/frontend/neo4j ports (12100, 12101, 12112, 12113) in a text to this slot's.
shift_ports() { sed -E "s/:121(0[01]|1[23])([^0-9]|$)/:$((121 + SLOT))\1\2/g"; }

wt_config() {
    copy_from_main "${ENV_FILES[@]}"
    local toml="$ROOT/apps/backend/.env.development.toml"
    [ -f "$toml" ] || die "need $MAIN_ROOT/apps/backend/.env.development.toml"
    # Keep the main checkout's hosts in frontendUrl & co., move only the ports.
    shift_ports <"$toml" >"$toml.tmp" && mv "$toml.tmp" "$toml"
    # Main's dev config may point at production services (asset storage on *.syscy.de). The
    # worktree uses the local compose MinIO (root credentials from docker-compose.yml) instead.
    node "$ROOT/tools/worktree/patch-toml.mjs" "$toml" \
        "port=$BACKEND_PORT" \
        "mikroOrm.database=\"$DB\"" \
        "neo4j.connectionString=\"bolt://127.0.0.1:$NEO4J_BOLT_PORT\"" \
        "redis.db=$SLOT" \
        'session.cookieDomain=""' \
        "session.cookieName=\"$COOKIE\"" \
        'minio.endPoint="127.0.0.1"' \
        'minio.port=12114' \
        'minio.useSSL=false' \
        'minio.accessKey="bytebunker"' \
        'minio.secretKey="bytebunker"' \
        'minio.publicBaseUrl="http://127.0.0.1:12114"'
    guard_prod_hosts
    patch_cors
    write_frontend_env
    log "patched apps/backend/.env.development.toml (port $BACKEND_PORT, db $DB, neo4j :$NEO4J_BOLT_PORT, keydb index $SLOT, cookie $COOKIE, local minio)"
}

# Point the frontend at this slot's backend and give it its own dev port, so plain `pnpm dev` in
# the worktree works too. The host stays main's (127.0.0.1 or the LAN IP).
write_frontend_env() {
    local file="$ROOT/apps/frontend/.env.development.local" value
    touch "$file"
    value="$(app_env frontend PUBLIC_API_BASE_URL | shift_ports)"
    [ -n "$value" ] && set_env "$file" PUBLIC_API_BASE_URL "$value"
    set_env "$file" DEV_SERVER_PORT "$FRONTEND_PORT"
}

# Allow this slot's frontend on loopback and on the current LAN IPs. Re-run on every backend start:
# DHCP may have moved the IP.
patch_cors() {
    local origins="" host port
    for host in 127.0.0.1 localhost $(lan_ips); do
        for port in $BACKEND_PORT $FRONTEND_PORT; do
            origins+="${origins:+, }\"http://$host:$port\""
        done
    done
    node "$ROOT/tools/worktree/patch-toml.mjs" "$ROOT/apps/backend/.env.development.toml" "cors.endpoint=[$origins]"
}

# Refuse any worktree config that still names a production host (uncommented lines only).
guard_prod_hosts() {
    is_main && return
    local file hits
    for file in "${ENV_FILES[@]/#/$ROOT/}"; do
        [ -f "$file" ] || continue
        hits="$(grep -nE "$PROD_HOST_PATTERN" "$file" | grep -vE '^[0-9]+:[[:space:]]*#' || true)"
        [ -z "$hits" ] || die "$(basename "$file") in this worktree points at production ($(echo "$hits" | cut -d: -f1 | tr '\n' ' ')) — fix wt_config in $WT_SCRIPT, then run: $WT_SCRIPT config"
    done
}

# Refuse to start a worktree backend that would use main's database or graph (setup/config not run,
# or the TOML was copied by hand).
guard_backend_config() {
    is_main && return
    guard_prod_hosts
    local toml="$ROOT/apps/backend/.env.development.toml" configured bolt
    [ -f "$toml" ] || die "apps/backend/.env.development.toml missing — run: $WT_SCRIPT setup"
    configured="$(sed -n '/^\[mikroOrm\]/,/^\[/{s/^database *= *"\(.*\)"/\1/p}' "$toml")"
    [ "$configured" = "$DB" ] || die "apps/backend/.env.development.toml points at database '${configured:-?}', not $DB — run: $WT_SCRIPT config"
    bolt="$(sed -n '/^\[neo4j\]/,/^\[/{s/^connectionString *= *"\(.*\)"/\1/p}' "$toml")"
    [[ "$bolt" == *":$NEO4J_BOLT_PORT" ]] || die "apps/backend/.env.development.toml points at neo4j '$bolt', not :$NEO4J_BOLT_PORT — run: $WT_SCRIPT config"
}

# The local-file trigger watches folders from the settings table. Relative paths resolve inside
# this worktree; an absolute path would make the worktree import (and move away) main's files.
check_import_folders() {
    local absolute
    absolute="$(sql_db "$DB" "SELECT setting_key || ' = ' || (value #>> '{}') FROM setting_value_entity WHERE setting_key LIKE 'localFileTrigger%' AND (value #>> '{}') LIKE '/%'" 2>/dev/null || true)"
    [ -z "$absolute" ] && return
    warn "absolute local-file trigger folders in $DB — the worktree backend would watch main's folders:"
    printf '    %s\n' "$absolute" >&2
    warn "change them in the worktree's settings (or $WT_SCRIPT db psql) before starting the backend"
}

wt_build() {
    (cd "$ROOT" && pnpm turbo run build:lib build:generate-metadata build:mikro-orm-cache --filter=@bytebunker/backend... --filter=@bytebunker/frontend...)
}

# --- graph -----------------------------------------------------------------------------------------

# Neo4j community can't dump a running database, so the template is a cold copy of main's volume:
# main's neo4j is stopped for the copy (seconds) and started again if it was running.
graph_snapshot() {
    volume_exists "$MAIN_NEO4J_VOLUME" || die "main Neo4j volume $MAIN_NEO4J_VOLUME not found"
    local was_running=0
    [ -n "$(dc ps -q --status running bytebunker-backend-neo4j 2>/dev/null)" ] && was_running=1
    [ $was_running = 1 ] && { log "stopping main neo4j for the copy"; dc stop bytebunker-backend-neo4j >/dev/null; }
    log "snapshotting $MAIN_NEO4J_VOLUME → $TEMPLATE_NEO4J_VOLUME"
    docker volume create "$TEMPLATE_NEO4J_VOLUME" >/dev/null
    local status=0
    copy_volume "$MAIN_NEO4J_VOLUME" "$TEMPLATE_NEO4J_VOLUME" || status=$?
    [ $was_running = 1 ] && { dc start bytebunker-backend-neo4j >/dev/null; log "main neo4j started again"; }
    [ $status = 0 ] || die "copying the Neo4j volume failed"
    log "graph template ready"
}

graph_clone() {
    is_main && die "the main checkout uses its Neo4j directly"
    volume_exists "$TEMPLATE_NEO4J_VOLUME" || graph_snapshot
    dc_wt down >/dev/null 2>&1 || true
    docker volume create "$NEO4J_VOLUME" >/dev/null
    copy_volume "$TEMPLATE_NEO4J_VOLUME" "$NEO4J_VOLUME"
    log "graph $NEO4J_VOLUME cloned from $TEMPLATE_NEO4J_VOLUME"
}

graph_empty() {
    is_main && die "refusing to wipe the main graph"
    dc_wt down >/dev/null 2>&1 || true
    docker volume rm -f "$NEO4J_VOLUME" >/dev/null
    docker volume create "$NEO4J_VOLUME" >/dev/null
    log "graph $NEO4J_VOLUME is empty"
}

# --- lib hooks -------------------------------------------------------------------------------------

wt_setup_extra() {
    is_main && return 0
    [ "${WT_SETUP_DB:-1}" = 1 ] || return 0
    check_import_folders
    if volume_exists "$NEO4J_VOLUME"; then log "graph $NEO4J_VOLUME exists, kept ($WT_SCRIPT graph reset to re-clone)"; else graph_clone; fi
}

wt_info() {
    local container state
    echo "session   cookie $COOKIE, keydb index $SLOT"
    if is_main; then container=$MAIN_NEO4J_CONTAINER; else container=$(project_containers "$PROJECT" | head -n1); fi
    state=$(docker inspect -f '{{.State.Status}}' "${container:-none}" 2>/dev/null | head -n1 || true)
    echo "neo4j     http://127.0.0.1:$NEO4J_HTTP_PORT  bolt://127.0.0.1:$NEO4J_BOLT_PORT  (volume $NEO4J_VOLUME, ${state:-no container})"
    echo "minio     http://127.0.0.1:12114  (local, buckets shared with main and all worktrees)"
    return 0
}

wt_describe_extra() {
    has_state && ! is_main || return 0
    echo "containers=$(project_container_names "$PROJECT")"
}

# Stop this slot's Neo4j; container and volume stay for the next start.
wt_stop_extra() {
    is_main && return 0
    local ids
    ids="$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    if [ -n "${ids// /}" ]; then docker stop $ids >/dev/null && log "stopped neo4j ($PROJECT)"; fi
    return 0
}

wt_teardown_extra() {
    remove_neo4j_project "$PROJECT" "$NEO4J_VOLUME"
    log "removed $PROJECT (neo4j container + volume $NEO4J_VOLUME)"
    keydb_flush "$SLOT"
    return 0
}

# Neo4j projects (a volume or leftover containers) and KeyDB indexes whose worktree is gone.
wt_gc_extra() {
    local live=" " path project candidates volume slot n
    while read -r path; do
        [ "$path" = "$MAIN_ROOT" ] && continue
        project=$(project_of "$path")
        [ -n "$project" ] && live+="$project "
    done < <(wt_worktree_paths)
    candidates="$(
        {
            docker volume ls -q | sed -n 's/^\(bytebunker-wt-.*\)_neo4j-data$/\1/p'
            docker ps -a --format '{{.Label "com.docker.compose.project"}}' | grep -E '^bytebunker-wt-' || true
        } | sort -u
    )"
    for project in $candidates; do
        [[ "$live" == *" $project "* ]] && continue
        volume=${project}_neo4j-data
        if [ "$WT_DRY_RUN" = 1 ]; then
            log "would remove orphaned $project (containers: $(project_container_names "$project"); volume: $(volume_exists "$volume" && echo "$volume" || echo none))"
        else
            remove_neo4j_project "$project" "$volume"
            log "removed orphaned $project"
        fi
    done
    if ! keydb_up; then
        log "keydb is down — orphaned KeyDB indexes are checked on the next prune"
        return 0
    fi
    for slot in $(seq 1 "$WT_MAX_SLOT"); do
        [[ "$WT_LIVE_SLOTS" == *" $slot "* ]] && continue
        n=$(keydb -n "$slot" DBSIZE 2>/dev/null || echo 0)
        [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -gt 0 ] || continue
        if [ "$WT_DRY_RUN" = 1 ]; then
            log "would empty KeyDB index $slot ($n keys, no worktree holds slot $slot)"
        else
            keydb -n "$slot" FLUSHDB >/dev/null && log "emptied KeyDB index $slot"
        fi
    done
    return 0
}

# --- project commands ------------------------------------------------------------------------------

wt_cmd_schema() {
    load_state
    guard_backend_config
    ensure_services
    cd "$ROOT/apps/backend" && exec pnpm mikro-orm schema:update --dump
}

wt_cmd_backend() {
    load_state
    is_main || patch_cors
    guard_backend_config
    ensure_services
    ensure_neo4j
    is_main || check_import_folders
    log "backend → port $BACKEND_PORT (db $DB, neo4j :$NEO4J_BOLT_PORT, keydb index $SLOT, cookie $COOKIE)"
    cd "$ROOT/apps/backend" && exec pnpm dev
}

wt_cmd_frontend() {
    load_state
    if ! is_main; then
        [ "$(app_env frontend DEV_SERVER_PORT)" = "$FRONTEND_PORT" ] || die "apps/frontend has no slot config — run: $WT_SCRIPT config"
        log "frontend → port $FRONTEND_PORT (backend $(app_env frontend PUBLIC_API_BASE_URL))"
    fi
    exec pnpm --dir "$ROOT/apps/frontend" dev
}

wt_cmd_graph() {
    local sub=${1:-}
    shift || true
    load_state
    case "$sub" in
        reset)
            [ "${1:-}" = --fresh ] && graph_snapshot
            graph_clone
            ;;
        snapshot) graph_snapshot ;;
        empty) graph_empty ;;
        *) die "usage: $WT_SCRIPT graph reset [--fresh] | snapshot | empty" ;;
    esac
}

wt_main "$@"
