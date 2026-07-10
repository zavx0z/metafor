import {join} from "node:path"
import {Force} from "force"
import {
  forceReplayBeginPath,
  forceReplayEndPath,
  forceReplayPath,
  parseForceReplayPath,
} from "@metafor/types/force/replay"
import {open} from "./sqlite.ts"

const filename = (process.argv[2] ?? Bun.env.BOUNDARY_PATH?.trim()) || join(import.meta.dir, "tmp", "boundary.sqlite")
const boundary = await open(filename)
const force = new Force("boundary")
const ownReplayPath = forceReplayPath(force.domain, force.id)
const pendingReplayRequests = new Set<string>()
let ready = false

const emitCommit = (commit: Awaited<ReturnType<typeof boundary.materialize>>): void => {
  if (!commit) return
  for (const message of commit.messages) force.impulse(message)
}

const respondReplay = async (requestPath: string): Promise<void> => {
  const request = parseForceReplayPath(requestPath)
  if (!request) return
  force.impulse({parts: [{part: "z", op: "test", path: forceReplayBeginPath(request.domain, request.id)}]})
  for (const message of await boundary.replay(requestPath)) force.impulse(message)
  force.impulse({parts: [{part: "z", op: "test", path: forceReplayEndPath(request.domain, request.id)}]})
}

force.onReplayStart = (requestPath) => {
  ready = false
  boundary.projection.beginReplay(requestPath)
}

force.onReady = async () => {
  emitCommit(await boundary.projection.completeReplay(ownReplayPath))
  ready = true
  for (const requestPath of [...pendingReplayRequests]) {
    pendingReplayRequests.delete(requestPath)
    await respondReplay(requestPath)
  }
}

force.onImpulse = async (message) => {
  const part = message.parts[0]
  if (part.part === "z" && part.op === "test") {
    const request = parseForceReplayPath(part.path)
    if (request && (request.domain === "matrix" || request.domain === "energy" || request.domain === "bulk")) {
      if (ready) await respondReplay(String(part.path))
      else pendingReplayRequests.add(String(part.path))
    }
    return
  }
  const commit = await boundary.materialize(message)
  emitCommit(commit)
  if (commit) console.log(`[boundary] committed ${commit.rootSrc ?? "declaration"} impulses=${commit.messages.length}`)
}

const server = Bun.serve({
  port: 4001,
  routes: {
    "/health": {
      GET() {
        return Response.json({ok: true, ready, domain: "boundary", database: filename})
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
