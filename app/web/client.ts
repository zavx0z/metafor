import { openSharedDbIndexedDbBackend } from "@shared/db/browser"
import "../../bulk"
import { initProtocolLogger } from "./protocol-logger"
initProtocolLogger()

const db = await openSharedDbIndexedDbBackend({ databaseName: "metafor-web" })
await db.reset()

new Worker("dark.js", {
  name: "dark",
  type: "module",
})

new Worker("boundary.js", {
  name: "boundary",
  type: "module",
})
