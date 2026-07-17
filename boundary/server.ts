import {mkdir} from "node:fs/promises"
import {dirname, join, resolve} from "node:path"
import {Force} from "force"
import {unsourceForceMessage} from "@metafor/types/force/message"
import {parseForceReplayPath} from "@metafor/types/force/replay"
import {MATRIX_RUNTIME_PATH} from "@metafor/types/matrix/runtime"
import {open} from "./sqlite.ts"

const configuredFilename = process.argv[2]?.trim() || Bun.env.BOUNDARY_PATH?.trim()
const filename = resolve(configuredFilename || join(import.meta.dir, "..", ".metafor", "dev.sqlite"))
await mkdir(dirname(filename), {recursive: true})
const boundary = await open(filename)
const force = new Force("boundary")

const publishMatrixRuntime = async (): Promise<void> => {
  const snapshot = await boundary.matrixRuntime()
  force.impulse({
    parts: [{
      part: "graviton",
      op: "replace",
      path: MATRIX_RUNTIME_PATH,
      ts: Date.now(),
      value: snapshot,
    }],
  })
  console.log(`[boundary] matrix runtime atoms=${snapshot.runtime.atomIdByBraneIndex.length} fields=${snapshot.data.fields.length}`)
}

force.onImpulse = async (message) => {
  const part = message.parts[0]
  if (part.part === "inflaton" && part.by !== "dark") {
    console.warn(`[boundary] ignored inflaton from ${part.by ?? "unknown"}`)
    return
  }
  if (part.part === "z" && part.op === "test") {
    const request = parseForceReplayPath(part.path)
    if (request) {
      if (request.domain === "matrix") {
        await publishMatrixRuntime()
        return
      }
      if (request.domain === "energy" || request.domain === "bulk") {
        for (const replay of await boundary.replay()) force.impulse(unsourceForceMessage(replay))
      }
      return
    }
  }

  const commit = await boundary.materialize(message)
  if (commit) {
    for (const derived of commit.messages) force.impulse(unsourceForceMessage(derived))
    console.log(`[boundary] committed ${commit.rootSrc ?? "declaration"} impulses=${commit.messages.length}`)
  }

  // Dark emits this terminal Inflaton after a coherent declaration/Matter batch.
  // Rebuild the derived packed projection once, after Boundary has committed all
  // preceding particles. Matrix never reads Boundary storage directly.
  if (
    part.part === "inflaton" &&
    part.op === "test" &&
    typeof part.path === "string" &&
    !part.path.startsWith("force/replay/")
  ) {
    await publishMatrixRuntime()
  }
}

const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 4001),
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
