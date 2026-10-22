# bytebunker

- In a git worktree (every T3 Code thread) the dev servers run on the worktree's own ports, Postgres
  DB, Neo4j container and KeyDB index; `tools/worktree/wt.sh info` prints the URLs. Start servers
  with `tools/worktree/wt.sh backend|frontend`. Details: `docs/WORKTREES.md`.
