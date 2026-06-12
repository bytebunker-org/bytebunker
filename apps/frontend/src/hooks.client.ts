// Polyfill reflect-metadata on the client before any class-transformer DTOs from
// @bytebunker/backend execute during hydration (Vite 8 / Rolldown lazily wraps the CJS module).
import 'reflect-metadata/lite';
