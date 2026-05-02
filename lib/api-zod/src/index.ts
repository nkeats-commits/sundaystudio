// Re-export only the Zod schemas (and their associated query/param/body
// validators). The `./generated/types` barrel emits TypeScript interfaces
// with the same names as these Zod schemas, which collides via `export *`.
// All consumers of `@workspace/api-zod` use the Zod schemas; the TS types
// can still be imported directly from `./generated/types/...` if needed.
export * from "./generated/api";
