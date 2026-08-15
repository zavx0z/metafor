import type {Module} from "../../startup/service/loader"

/** Internal RPC module, из которого importer формирует Service Worker-контур. */
export const rpc = {
  endpoint: "/internal/rpc",
  cache: "internal",
} satisfies Module
