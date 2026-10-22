#!/usr/bin/env bash
# Run bytebunker from a git worktree beside the main checkout — own ports, own session cookie, own
# Postgres database copy, own KeyDB index (= own BullMQ queues), own Neo4j container with a copy of
# the graph, local MinIO instead of the production asset storage. See docs/WORKTREES.md.
#
#   wt.sh setup [--no-install] [--no-build] [--no-db]   allocate slot, copy+patch env, install, build libs, clone DB + graph
#   wt.sh info                                          print slot, URLs, database, graph
#   wt.sh list                                          all worktree slots of this repo
#   wt.sh prune                                         drop DBs and Neo4j containers of worktrees that no longer exist
#   wt.sh schema                                        show the SQL `mikro-orm schema:update` would run (read-only)
#   wt.sh services                                      start postgres + keydb + minio (project "bytebunker") and this worktree's neo4j
#   wt.sh backend | frontend                            start one dev server in the foreground
#   wt.sh config                                        re-copy env files from the main checkout and re-patch them
#   wt.sh db reset [--fresh]                            drop and re-clone this worktree's DB (--fresh: re-snapshot main DB first)
#   wt.sh db snapshot                                   refresh the template from the main dev DB (bytebunker)
#   wt.sh db psql [args]                                psql into this worktree's DB
#   wt.sh db drop                                       drop this worktree's DB
#   wt.sh graph reset [--fresh]                         re-clone this worktree's Neo4j data (--fresh: re-snapshot main graph first)
#   wt.sh graph snapshot                                copy main's Neo4j volume into the template (stops main neo4j for the copy)
#   wt.sh graph empty                                   wipe this worktree's Neo4j data (start from an empty graph)
#   wt.sh teardown                                      drop DB, remove the Neo4j container + volume, forget the slot
#
# In the main checkout every command runs with the stock config (slot 0, ports 121xx, DB bytebunker).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
MAIN_ROOT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
STATE_DIR="$ROOT/.worktree"
STATE_FILE="$STATE_DIR/env"
MAIN_DB=bytebunker
# Everything on these hosts is production. A worktree config must not mention them.
PROD_HOST_PATTERN='syscy\.de'
TEMPLATE_DB=bytebunker_wt_template
MAIN_NEO4J_VOLUME=bytebunker_bytebunker-backend-neo4j-data
TEMPLATE_NEO4J_VOLUME=bytebunker_wt_neo4j_template
NEO4J_IMAGE=neo4j:latest
# Slots 1–8 → ports 12200–12913. Slot 10 would collide with other projects' 13xxx ports.
MAX_SLOT=8
# Gitignored dev env files that worktrees need from the main checkout. Never .env.migration.toml:
# it points at the production database.
ENV_FILES=(
    apps/backend/.env.development.toml
    apps/frontend/.env.development
    apps/frontend/.env.development.local
)

log() { printf '\033[1;36m[wt]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[wt]\033[0m %s\n' "$*" >&2; exit 1; }
is_main() { [ "$ROOT" = "$MAIN_ROOT" ]; }

dc() { docker compose -p bytebunker -f "$MAIN_ROOT/docker-compose.yml" "$@"; }
dc_wt() {
    WT_NEO4J_HTTP_PORT=$NEO4J_HTTP_PORT WT_NEO4J_BOLT_PORT=$NEO4J_BOLT_PORT WT_NEO4J_VOLUME=$NEO4J_VOLUME \
        docker compose -p "$PROJECT" -f "$ROOT/tools/worktree/docker-compose.worktree.yml" "$@"
}
pgx() { dc exec -T bytebunker-backend-postgres "$@"; }
sql() { dc exec -T -e PGOPTIONS='-c client_min_messages=warning' bytebunker-backend-postgres psql -U bytebunker -d postgres -v ON_ERROR_STOP=1 -qAt -c "$1"; }
sql_db() { dc exec -T bytebunker-backend-postgres psql -U bytebunker -d "$1" -v ON_ERROR_STOP=1 -qAt -c "$2"; }
db_exists() { [ "$(sql "SELECT 1 FROM pg_database WHERE datname = '$1'")" = 1 ]; }
kick_connections() { sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$1' AND pid <> pg_backend_pid()" >/dev/null; }
# Empty a worktree's KeyDB index so a reused slot doesn't inherit another worktree's BullMQ jobs.
keydb_flush() { dc exec -T bytebunker-backend-keydb keydb-cli -n "$1" FLUSHDB >/dev/null; }
volume_exists() { docker volume inspect "$1" >/dev/null 2>&1; }
# Copy one docker volume into another (target emptied first). Uses the neo4j image: already pulled.
copy_volume() {
    docker run --rm --entrypoint sh -v "$1":/from:ro -v "$2":/to "$NEO4J_IMAGE" \
        -c 'find /to -mindepth 1 -delete && cp -a /from/. /to/'
}

load_state() {
    if is_main; then
        SLOT=0 DB=$MAIN_DB PROJECT=bytebunker
    else
        [ -f "$STATE_FILE" ] || die "no slot yet — run: tools/worktree/wt.sh setup"
        # shellcheck source=/dev/null
        . "$STATE_FILE"
    fi
    BASE=$((12100 + SLOT * 100))
    BACKEND_PORT=$BASE FRONTEND_PORT=$((BASE + 1)) NEO4J_HTTP_PORT=$((BASE + 12)) NEO4J_BOLT_PORT=$((BASE + 13))
    NEO4J_VOLUME=${PROJECT}_neo4j-data
    is_main && NEO4J_VOLUME=$MAIN_NEO4J_VOLUME
    # Cookies ignore ports, so every backend on this host needs its own session cookie name.
    COOKIE=sid
    is_main || COOKIE=sid-wt$SLOT
}

# This machine's private LAN IPv4 addresses (docker bridges and VPN tunnels skipped).
lan_ips() {
    ip -4 -o addr show scope global 2>/dev/null \
        | awk '$2 !~ /^(docker|br-|veth|virbr|tun|wg|tailscale|CloudflareWARP)/ { sub(/\/.*/, "", $4); print $4 }' \
        | grep -E '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' || true
}

# Map main's backend/frontend/neo4j ports (12100, 12101, 12112, 12113) in a text to this slot's.
shift_ports() { sed -E "s/:121(0[01]|1[23])([^0-9]|$)/:$((121 + SLOT))\1\2/g"; }

# Lowest slot not claimed by another live worktree; the slot picks the ports, the cookie name and
# the KeyDB index.
allocate_slot() {
    mkdir -p "$STATE_DIR"
    [ -f "$STATE_FILE" ] && return
    exec 9>"$(git rev-parse --path-format=absolute --git-common-dir)/bytebunker-worktree-slots.lock"
    flock 9
    local used=" " path
    while read -r path; do
        [ "$path" = "$ROOT" ] && continue
        [ -f "$path/.worktree/env" ] && used+="$(sed -n 's/^SLOT=//p' "$path/.worktree/env") "
    done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
    local slot name
    name="$(basename "$ROOT" | tr -c 'a-zA-Z0-9\n' '_' | tr 'A-Z' 'a-z')"
    for slot in $(seq 1 $MAX_SLOT); do
        if [[ "$used" != *" $slot "* ]]; then
            cat >"$STATE_FILE" <<EOF
SLOT=$slot
DB=bytebunker_wt_$name
PROJECT=bytebunker-wt-$(echo "$name" | tr '_' '-')
EOF
            log "allocated slot $slot"
            return
        fi
    done
    die "all $MAX_SLOT worktree slots in use — run 'wt.sh teardown' in an old worktree"
}

write_config() {
    local file
    for file in "${ENV_FILES[@]}"; do
        if [ -f "$MAIN_ROOT/$file" ]; then
            cp "$MAIN_ROOT/$file" "$ROOT/$file"
        else
            log "missing in main checkout, skipped: $file"
        fi
    done
    local toml="$ROOT/apps/backend/.env.development.toml"
    [ -f "$toml" ] || die "need $MAIN_ROOT/apps/backend/.env.development.toml"
    # Keep the main checkout's hosts in frontendUrl & co., move only the ports.
    shift_ports <"$toml" >"$toml.tmp" && mv "$toml.tmp" "$toml"
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
    # Main's dev config may point at production services (asset storage on *.syscy.de). The
    # worktree uses the local compose MinIO (root credentials from docker-compose.yml) instead.
    guard_prod_hosts
    patch_cors
    write_frontend_env
    log "patched apps/backend/.env.development.toml (port $BACKEND_PORT, db $DB, neo4j :$NEO4J_BOLT_PORT, keydb index $SLOT, cookie $COOKIE, local minio)"
}

# Set KEY=value in a dotenv file, replacing an existing line or appending one.
set_env() {
    if grep -q "^$2=" "$1" 2>/dev/null; then
        local tmp="$1.tmp"
        awk -v k="$2" -v v="$3" 'index($0, k "=") == 1 { print k "=" v; next } { print }' "$1" >"$tmp" && mv "$tmp" "$1"
    else
        printf '%s=%s\n' "$2" "$3" >>"$1"
    fi
}

# A variable as the frontend's dev env files set it (.local wins, as in Vite).
frontend_env() {
    local file
    for file in "$ROOT/apps/frontend/.env.development.local" "$ROOT/apps/frontend/.env.development"; do
        if [ -f "$file" ] && grep -q "^$1=" "$file"; then
            grep -m1 "^$1=" "$file" | cut -d= -f2- | tr -d '"'
            return
        fi
    done
}

# Point the frontend at this slot's backend and give it its own dev port, so plain `pnpm dev` in
# the worktree works too. The host stays main's (127.0.0.1 or the LAN IP).
write_frontend_env() {
    local file="$ROOT/apps/frontend/.env.development.local" value
    touch "$file"
    value="$(frontend_env PUBLIC_API_BASE_URL | shift_ports)"
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

ensure_shared_services() {
    dc up -d --wait bytebunker-backend-postgres bytebunker-backend-keydb bytebunker-backend-minio >/dev/null 2>&1 \
        || dc up -d bytebunker-backend-postgres bytebunker-backend-keydb bytebunker-backend-minio
    local i
    for i in $(seq 1 30); do
        pgx pg_isready -U bytebunker -q && return
        sleep 1
    done
    die "postgres did not become ready"
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

ensure_services() {
    ensure_shared_services
    ensure_neo4j
}

db_snapshot() {
    ensure_shared_services
    local tmp=${TEMPLATE_DB}_new
    log "snapshotting $MAIN_DB → $TEMPLATE_DB"
    sql "DROP DATABASE IF EXISTS $tmp"
    sql "CREATE DATABASE $tmp"
    # Dump and restore inside the container: same pg version, no data leaves the box.
    pgx sh -c "pg_dump -U bytebunker -Fc $MAIN_DB | pg_restore -U bytebunker -d $tmp --no-owner --no-privileges" \
        || log "pg_restore reported warnings (usually harmless)"
    kick_connections "$TEMPLATE_DB"
    sql "DROP DATABASE IF EXISTS $TEMPLATE_DB"
    sql "ALTER DATABASE $tmp RENAME TO $TEMPLATE_DB"
    log "template ready"
}

db_clone() {
    is_main && die "the main checkout uses $MAIN_DB directly"
    ensure_shared_services
    db_exists "$TEMPLATE_DB" || db_snapshot
    kick_connections "$DB"
    sql "DROP DATABASE IF EXISTS $DB"
    sql "CREATE DATABASE $DB TEMPLATE $TEMPLATE_DB STRATEGY FILE_COPY"
    keydb_flush "$SLOT"
    log "database $DB cloned from $TEMPLATE_DB (snapshot of $MAIN_DB)"
}

db_drop() {
    is_main && die "refusing to drop $MAIN_DB"
    ensure_shared_services
    kick_connections "$DB"
    sql "DROP DATABASE IF EXISTS $DB"
    log "dropped $DB"
}

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

# The local-file trigger watches folders from the settings table. Relative paths resolve inside
# this worktree; an absolute path would make the worktree import (and move away) main's files.
check_import_folders() {
    local absolute
    absolute="$(sql_db "$DB" "SELECT setting_key || ' = ' || (value #>> '{}') FROM setting_value_entity WHERE setting_key LIKE 'localFileTrigger%' AND (value #>> '{}') LIKE '/%'" 2>/dev/null || true)"
    [ -z "$absolute" ] && return
    log "WARNING: absolute local-file trigger folders in $DB — the worktree backend would watch main's folders:"
    printf '    %s\n' "$absolute" >&2
    log "change them in the worktree's settings (or wt.sh db psql) before starting the backend"
}

# Drop databases and Neo4j projects whose worktree is gone (git and T3 delete worktrees without a hook).
gc() {
    ensure_shared_services
    local live_db=" " live_project=" " live_slot=" " path db volume project slot
    while read -r path; do
        [ -f "$path/.worktree/env" ] || continue
        live_db+="$(sed -n 's/^DB=//p' "$path/.worktree/env") "
        live_project+="$(sed -n 's/^PROJECT=//p' "$path/.worktree/env") "
        live_slot+="$(sed -n 's/^SLOT=//p' "$path/.worktree/env") "
    done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
    for db in $(sql "SELECT datname FROM pg_database WHERE datname LIKE 'bytebunker\_wt\_%' AND datname NOT IN ('$TEMPLATE_DB', '${TEMPLATE_DB}_new')"); do
        if [[ "$live_db" != *" $db "* ]]; then
            kick_connections "$db"
            sql "DROP DATABASE IF EXISTS $db"
            log "dropped orphaned $db"
        fi
    done
    for slot in $(seq 1 $MAX_SLOT); do
        [[ "$live_slot" == *" $slot "* ]] || keydb_flush "$slot"
    done
    for volume in $(docker volume ls -q | grep -E '^bytebunker-wt-.*_neo4j-data$' || true); do
        project=${volume%_neo4j-data}
        if [[ "$live_project" != *" $project "* ]]; then
            docker compose -p "$project" down -v >/dev/null 2>&1 || true
            docker volume rm -f "$volume" >/dev/null
            log "removed orphaned $project"
        fi
    done
}

info() {
    load_state
    local lan
    lan="$(lan_ips | head -n1)"
    cat <<EOF
worktree  $ROOT
slot      $SLOT  (session cookie $COOKIE, keydb index $SLOT)
database  $DB
backend   http://127.0.0.1:$BACKEND_PORT   (health /health, docs /docs, queues /queues)
frontend  http://127.0.0.1:$FRONTEND_PORT
neo4j     http://127.0.0.1:$NEO4J_HTTP_PORT  bolt://127.0.0.1:$NEO4J_BOLT_PORT  (volume $NEO4J_VOLUME)
EOF
    [ -n "$lan" ] && echo "LAN       same ports on http://$lan"
    return 0
}

# Refuse any worktree config that still names a production host (uncommented lines only).
guard_prod_hosts() {
    is_main && return
    local file hits
    for file in "$ROOT/apps/backend/.env.development.toml" "$ROOT/apps/frontend/.env.development" "$ROOT/apps/frontend/.env.development.local"; do
        [ -f "$file" ] || continue
        hits="$(grep -nE "$PROD_HOST_PATTERN" "$file" | grep -vE '^[0-9]+:[[:space:]]*#' || true)"
        [ -z "$hits" ] || die "$(basename "$file") in this worktree points at production ($(echo "$hits" | cut -d: -f1 | tr '\n' ' ')) — fix tools/worktree/wt.sh write_config, then run: tools/worktree/wt.sh config"
    done
}

# Refuse to start a worktree backend that would use main's database or graph (setup/config not run,
# or the TOML was copied by hand).
guard_backend_config() {
    is_main && return
    guard_prod_hosts
    local toml="$ROOT/apps/backend/.env.development.toml" configured bolt
    [ -f "$toml" ] || die "apps/backend/.env.development.toml missing — run: tools/worktree/wt.sh setup"
    configured="$(sed -n '/^\[mikroOrm\]/,/^\[/{s/^database *= *"\(.*\)"/\1/p}' "$toml")"
    [ "$configured" = "$DB" ] || die "apps/backend/.env.development.toml points at database '${configured:-?}', not $DB — run: tools/worktree/wt.sh config"
    bolt="$(sed -n '/^\[neo4j\]/,/^\[/{s/^connectionString *= *"\(.*\)"/\1/p}' "$toml")"
    [[ "$bolt" == *":$NEO4J_BOLT_PORT" ]] || die "apps/backend/.env.development.toml points at neo4j '$bolt', not :$NEO4J_BOLT_PORT — run: tools/worktree/wt.sh config"
}

# One line per worktree slot, plus the main checkout.
list() {
    local path slot db
    printf '%-5s %-36s %s\n' slot database worktree
    printf '%-5s %-36s %s\n' 0 "$MAIN_DB" "$MAIN_ROOT"
    while read -r path; do
        [ -f "$path/.worktree/env" ] || continue
        slot="$(sed -n 's/^SLOT=//p' "$path/.worktree/env")"
        db="$(sed -n 's/^DB=//p' "$path/.worktree/env")"
        printf '%-5s %-36s %s\n' "$slot" "$db" "$path"
    done < <(git worktree list --porcelain | sed -n 's/^worktree //p')
}

build_libs() {
    (cd "$ROOT" && pnpm turbo run build:lib build:generate-metadata build:mikro-orm-cache --filter=@bytebunker/backend... --filter=@bytebunker/frontend...)
}

cmd=${1:-}
shift || true
case "$cmd" in
    setup)
        install=1 build=1 db=1
        for arg in "$@"; do
            case "$arg" in
                --no-install) install=0 ;;
                --no-build) build=0 ;;
                --no-db) db=0 ;;
                *) die "unknown option $arg" ;;
            esac
        done
        is_main || allocate_slot
        load_state
        is_main || write_config
        [ $install = 1 ] && (cd "$ROOT" && pnpm install --frozen-lockfile --prefer-offline)
        [ $build = 1 ] && build_libs
        if [ $db = 1 ] && ! is_main; then
            ensure_shared_services
            if db_exists "$DB"; then log "database $DB exists, kept (wt.sh db reset to re-clone)"; else db_clone; fi
            check_import_folders
            if volume_exists "$NEO4J_VOLUME"; then log "graph $NEO4J_VOLUME exists, kept (wt.sh graph reset to re-clone)"; else graph_clone; fi
            gc
        fi
        info
        ;;
    info) info ;;
    list) list ;;
    prune) gc ;;
    schema)
        load_state
        guard_backend_config
        ensure_shared_services
        cd "$ROOT/apps/backend" && exec pnpm mikro-orm schema:update --dump
        ;;
    services)
        load_state
        ensure_services
        ;;
    config)
        is_main && die "the main checkout owns its env files"
        load_state
        write_config
        ;;
    backend)
        load_state
        is_main || patch_cors
        guard_backend_config
        ensure_services
        is_main || check_import_folders
        log "backend → port $BACKEND_PORT (db $DB, neo4j :$NEO4J_BOLT_PORT, keydb index $SLOT, cookie $COOKIE)"
        cd "$ROOT/apps/backend" && exec pnpm dev
        ;;
    frontend)
        load_state
        if ! is_main; then
            [ "$(frontend_env DEV_SERVER_PORT)" = "$FRONTEND_PORT" ] || die "apps/frontend has no slot config — run: tools/worktree/wt.sh config"
            log "frontend → port $FRONTEND_PORT (backend $(frontend_env PUBLIC_API_BASE_URL))"
        fi
        exec pnpm --dir "$ROOT/apps/frontend" dev
        ;;
    db)
        sub=${1:-}
        shift || true
        load_state
        case "$sub" in
            reset)
                [ "${1:-}" = --fresh ] && db_snapshot
                db_clone
                ;;
            snapshot) db_snapshot ;;
            psql)
                ensure_shared_services
                tty=-T
                [ -t 0 ] && tty=
                dc exec $tty bytebunker-backend-postgres psql -U bytebunker -d "$DB" "$@"
                ;;
            drop) db_drop ;;
            *) sed -n '/^#   wt.sh db/p' "$0"; exit 1 ;;
        esac
        ;;
    graph)
        sub=${1:-}
        shift || true
        load_state
        case "$sub" in
            reset)
                [ "${1:-}" = --fresh ] && graph_snapshot
                graph_clone
                ;;
            snapshot) graph_snapshot ;;
            empty) graph_empty ;;
            *) sed -n '/^#   wt.sh graph/p' "$0"; exit 1 ;;
        esac
        ;;
    teardown)
        is_main && die "nothing to tear down in the main checkout"
        load_state
        for port in $BACKEND_PORT $FRONTEND_PORT; do
            ss -Hltn "sport = :$port" 2>/dev/null | grep -q . && die "a dev server still listens on :$port — stop it first"
        done
        db_drop
        keydb_flush "$SLOT"
        dc_wt down -v >/dev/null 2>&1 || true
        docker volume rm -f "$NEO4J_VOLUME" >/dev/null 2>&1 || true
        log "removed $PROJECT"
        rm -rf "$STATE_DIR"
        log "slot $SLOT released"
        ;;
    *) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
