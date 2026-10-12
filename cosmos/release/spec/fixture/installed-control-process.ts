import {appendFileSync} from "node:fs"
import {attachServerProcessControl} from "../../server/installed/control.ts"
import {currentServerProcessIdentity} from "../../../shared/package/process"

const identity = currentServerProcessIdentity()
const path = Bun.env.INSTALLED_CONTROL_FIXTURE_LOG!
const record = (event: string, extra: Record<string, unknown> = {}) =>
  appendFileSync(path, `${JSON.stringify({version: identity.version, event, ...extra})}\n`)
let server: Bun.Server<undefined> | null = null
let admitted = false
let destroyCalls = 0
const pending = new Set<Promise<Response>>()
let releaseBind!: () => void
const bindGate = new Promise<void>(resolve => { releaseBind = resolve })

const control = await attachServerProcessControl({
  async bind() {
    record("bind-start")
    if (Bun.env.INSTALLED_CONTROL_FIXTURE_HOLD_BIND) await bindGate
    server = Bun.serve({
      hostname: "127.0.0.1",
      port: Number(Bun.env.PORT ?? 0),
      fetch(request) {
        if (!admitted) return new Response("not admitted", {status: 503})
        const operation = (async () => {
          if (new URL(request.url).pathname === "/hold") {
            record("request-start")
            await Bun.sleep(100)
            record("request-complete")
          }
          return new Response(identity.version)
        })()
        pending.add(operation)
        void operation.finally(() => pending.delete(operation))
        return operation
      },
    })
    record("bind-end", {port: server.port})
  },
  async admit() { admitted = true; record("admit") },
  async quiesce() {
    admitted = false
    record("quiesce")
    if (Bun.env.INSTALLED_CONTROL_FIXTURE_FAIL_QUIESCE) throw new Error("fixture quiesce failed")
    await Promise.all([...pending])
    record("quiesced")
  },
  async resume() { admitted = true; record("resume") },
  async unbind() {
    await server?.stop(false)
    server = null
    record("unbind")
  },
  async destroy() {
    admitted = false
    destroyCalls++
    if (destroyCalls === 1 && Bun.env.INSTALLED_CONTROL_FIXTURE_FAIL_DESTROY_ONCE) {
      record("destroy-failure")
      throw new Error("fixture destroy failed")
    }
    if (destroyCalls === 1 && Bun.env.INSTALLED_CONTROL_FIXTURE_DELAY_DESTROY) {
      record("destroy-wait")
      await Bun.sleep(150)
    }
    const resources = server === null ? 0 : 1
    await server?.stop(true)
    server = null
    record("destroy", {resources})
  },
})

process.on("message", value => {
  const message = value as {type?: string}
  if (message.type === "fixture-release-bind") releaseBind()
  if (message.type === "fixture-destroy") {
    void control.destroy().then(
      () => process.send?.({type: "fixture-destroyed"}),
      error => process.send?.({type: "fixture-destroy-failed", error: error.message,
        aggregate: error instanceof AggregateError,
        errors: error instanceof AggregateError ? error.errors.map(value => String(value)) : []}),
    )
  }
  if (message.type === "fixture-request") {
    void control.requestHandover("d".repeat(64), 2_000).catch(error => record("request-rejected", {error: error.message}))
  }
})
