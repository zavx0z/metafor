import {appendFileSync} from "node:fs"
import {
  currentServerProcessIdentity,
  currentServerProcessLaunch,
  readServerProcessCommand,
  readServerProcessHandoverResult,
  sameServerProcessIdentity,
  serverProcessFailure,
  serverProcessLifecycle,
} from "../../../../shared/package/process"

const identity = currentServerProcessIdentity()
const launch = currentServerProcessLaunch()!
const failure = Bun.env.STAGED_FIXTURE_FAILURE
const path = Bun.env.STAGED_FIXTURE_LOG!
const write = (event: string) => appendFileSync(path, `${JSON.stringify({version: identity.version, event})}\n`)
write(`launch:${launch.mode}`)
const stop = new Promise<void>(resolve => {
  if (Bun.env.STAGED_FIXTURE_DEFAULT_SIGTERM) return
  process.once("SIGTERM", () => {
  if (Bun.env.STAGED_FIXTURE_IGNORE_TERMINATION) write("ignored-sigterm")
  else resolve()
  })
})
let requestSent = false
const requestHandover = () => {
  if (!Bun.env.STAGED_FIXTURE_REQUEST_TARGET || requestSent) return
  requestSent = true
  const request = {type: "handover-request", requestId: "fixture-request", target: Bun.env.STAGED_FIXTURE_REQUEST_TARGET!}
  process.send?.(request)
  if (Bun.env.STAGED_FIXTURE_DUPLICATE_REQUEST) process.send?.(request)
}

const receive = (value: unknown) => {
  const result = readServerProcessHandoverResult(value)
  if (result) {
    write(`handover-result:${result.success}`)
    return
  }
  const command = readServerProcessCommand(value)
  if (!command || !sameServerProcessIdentity(command.identity, identity)) throw new Error("Invalid fixture command")
  write(command.type)
  if (command.type === "bind" && Bun.env.STAGED_FIXTURE_HOLD_BIND) return
  if (failure === command.type) {
    process.send?.(serverProcessFailure(command.type, identity, command.transitionId, `fixture ${failure} failed`))
    return
  }
  const ack = {quiesce: "quiesced", resume: "resumed", unbind: "unbound", bind: "ready", admit: "admitted"} as const
  process.send?.(serverProcessLifecycle(ack[command.type], identity, command.transitionId))
  if (command.type === "admit" && Bun.env.STAGED_FIXTURE_REQUEST_ACTIVE)
    setTimeout(requestHandover, 20)
}
process.on("message", receive)

if (launch.mode === "prepared" && failure === "prepare") process.exit(17)
if (launch.mode === "prepared" && Bun.env.STAGED_FIXTURE_REQUEST_TARGET && !Bun.env.STAGED_FIXTURE_REQUEST_ACTIVE) {
  process.send?.({type: "handover-request", requestId: "candidate-request", target: Bun.env.STAGED_FIXTURE_REQUEST_TARGET})
}
process.send?.(serverProcessLifecycle(launch.mode === "active" ? "ready" : "prepared",
  failure === "wrong-prepared" ? {...identity, version: "9.9.9"} : identity, launch.transitionId))

if (launch.mode === "active" && Bun.env.STAGED_FIXTURE_REQUEST_TARGET) {
  setTimeout(requestHandover, 20)
}

await stop
write("destroy")
process.off("message", receive)
process.disconnect?.()
