import { openDbIndexedDbBackend } from "../../pkg/db/browser.ts"
import "../../bulk"
import { initProtocolLogger } from "./protocol-logger"
initProtocolLogger()

const db = await openDbIndexedDbBackend({ databaseName: "metafor-web" })
await db.reset()

new Worker("dark.js", {
  name: "dark",
  type: "module",
})

new Worker("boundary.js", {
  name: "boundary",
  type: "module",
})
