import Module from 'node:module';

// `@nestjs/mapped-types` (pulled in by `@nestjs/swagger` PickType/IntersectionType/etc.) does
// `require('class-transformer/storage')`, but class-transformer 0.5.x ships no `exports` field and
// no top-level `storage.js` — only `cjs/storage.js`. Node's CJS loader cannot resolve the bare
// subpath, so we patch the resolver to rewrite it. Imported first in `main.ts` so the rewrite is in
// place before any DTO module loads. Mirrors the Vitest shim in `test/setup.ts`.
const moduleProto = Module as unknown as {
    _resolveFilename: (request: string, ...rest: unknown[]) => string;
};
const originalResolve = moduleProto._resolveFilename;

const REWRITES: Record<string, string> = {
    'class-transformer/storage': 'class-transformer/cjs/storage.js',
};

moduleProto._resolveFilename = function patchedResolve(request, ...rest) {
    return originalResolve.call(this, REWRITES[request] ?? request, ...rest);
};
