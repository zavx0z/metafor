import type {Module} from "./loader"

/** Internal RPC module, из которого importer формирует Service Worker-контур. */
export const rpc = {
  endpoint: "/code?module=@internal/rpc",
  cache: "internal",
} satisfies Module
