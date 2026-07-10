import {join} from "node:path"
import {Force} from "force"
import {open} from "./sqlite.ts"

const filename = (process.argv[2] ?? Bun.env.BOUNDARY_PATH?.trim()) || join(import.meta.dir, "tmp", "boundary.sqlite")
const boundary = await open(filename)
const force = new Force("boundary")

force.onImpulse = async (message) => {
  const commit = await boundary.materialize(message)
  if (!commit) return
  force.impulse(commit.graviton)
  force.impulse({type: "create", domain: "matrix", snapshot: commit.matrix})
  force.impulse({type: "create", domain: "energy", snapshot: commit.energy})
  force.impulse({type: "create", domain: "bulk", snapshot: commit.bulk})
  console.log(`[boundary] materialized ${commit.rootSrc} parts=${commit.graviton.parts.length}`)
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
