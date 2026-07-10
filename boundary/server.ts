import {join} from "node:path"
import {Force} from "force"
import {parseForceReplayPath} from "@metafor/types/force/replay"
import {open} from "./sqlite.ts"

const filename = (process.argv[2] ?? Bun.env.BOUNDARY_PATH?.trim()) || join(import.meta.dir, "tmp", "boundary.sqlite")
const boundary = await open(filename)
const force = new Force("boundary")

force.onImpulse = async (message) => {
  const part = message.parts[0]
  if (part.part === "z" && part.op === "test") {
    const request = parseForceReplayPath(part.path)
    if (request && (request.domain === "matrix" || request.domain === "energy" || request.domain === "bulk")) {
      for (const replay of await boundary.replay()) force.impulse(replay)
    }
    return
  }
  const commit = await boundary.materialize(message)
  if (!commit) return
  for (const derived of commit.messages) force.impulse(derived)
  console.log(`[boundary] committed ${commit.rootSrc ?? "declaration"} impulses=${commit.messages.length}`)
}

const server = Bun.serve({
  port: 4001,
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, domain: "boundary", database: filename})
      },
    },
  },
})

const close = async (): Promise<void> => {
  server.stop()
  await boundary.close()
}

force.onDestroy = close

console.log(`[boundary] listening on ${server.url} database=${filename}`)
