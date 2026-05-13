import Module from 'node:module';

// `@nestjs/mapped-types` requires `class-transformer/storage`, but class-transformer 0.5.x ships
// no exports field and no top-level `storage.js` — only `cjs/storage.js`. Node's CJS loader cannot
// find the bare subpath; production builds work via SWC path rewriting. In Vitest we patch the
// resolver so importing any DTO that extends PickType/IntersectionType/etc. just works.
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
