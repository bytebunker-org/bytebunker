export type Opaque<T, K> = T & { __opaque__: K };

// This hack is for compatibility with the UuidV1 from paralo common
export type UuidV1 = Opaque<string, 'UuidV1'> | Opaque<string, 'Uuid'>;
export type UuidV4 = Opaque<string, 'UuidV4'> | Opaque<string, 'Uuid'>;
export type UuidV7 = Opaque<string, 'UuidV7'>;
