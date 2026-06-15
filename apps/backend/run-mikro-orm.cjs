#!/usr/bin/env node
// Auto-selects the correct MikroORM CLI binary for the current environment:
//   - dev / CI (ts-node installed):  `mikro-orm-esm` registers the ts-node ESM loader and reads the
//     TypeScript config at `src/mikro-orm.config.ts`.
//   - production image (no ts-node, only compiled output):  plain `mikro-orm` reads the compiled
//     `dist/mikro-orm.config.js` via a native dynamic import. The `mikro-orm-esm` bin would hard-fail
//     here because its shebang always loads `ts-node/esm`, which isn't part of the --prod install.
// Invoke via `pnpm mikro-orm <command>` so node_modules/.bin is on PATH.
const { spawnSync } = require('node:child_process');

let hasTsNode = false;
try {
    require.resolve('ts-node');
    hasTsNode = true;
} catch {
    hasTsNode = false;
}

const bin = hasTsNode ? 'mikro-orm-esm' : 'mikro-orm';
const result = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' });

if (result.error) {
    console.error(`Failed to launch ${bin}: ${result.error.message}`);
    process.exit(1);
}

process.exit(result.status ?? 1);
