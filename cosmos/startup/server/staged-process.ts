import {artifactIntegrity} from "@metafor/tech-build/identity"
import type {ActivePackage, PackageExit} from "@cosmos/release"
import {
  readServerProcessFailure,
  readServerProcessHandoverRequest,
  readServerProcessLifecycle,
  sameServerProcessIdentity,
  serverProcessCommandMessage,
  serverProcessIdentityEnvironment,
  serverProcessLaunchEnvironment,
  type ServerProcessHandoverRequest,
  type ServerProcessLaunch,
  type ServerProcessLifecycleType,
  type ServerProcessOperation,
} from "../../shared/package/process"
import {serverProcessCommand, type ServerProcessCandidate, type ServerProcessRuntime} from "./executor"

export interface StagedProcess {
  readonly active: ActivePackage<ServerProcessRuntime>
  readonly exited: boolean
  wait(type: ServerProcessLifecycleType, transitionId: string): Promise<void>
  command(type: ServerProcessOperation, expected: ServerProcessLifecycleType, transitionId: string): Promise<void>
  send(value: unknown): void
  destroy(): Promise<void>
}

/** Сверяет exact executable непосредственно перед созданием process. */
export async function verifyServerProcessCandidate(candidate: ServerProcessCandidate) {
  if (candidate.artifact.identity.env !== "server")
    throw new Error("Server startup requires a server process artifact")
  const file = Bun.file(candidate.artifact.executable)
  if (!await file.exists()) throw new Error("Prepared server executable is missing")
  const actual = await artifactIntegrity(await file.arrayBuffer())
  if (actual.sha256 !== candidate.artifact.identity.sha256 || actual.size !== candidate.artifact.identity.size)
    throw new Error("Prepared server executable differs from its expected identity")
}

/** Один принадлежащий startup process и строго коррелированные IPC подтверждения. */
export async function spawnStagedProcess(
  candidate: ServerProcessCandidate,
  launch: ServerProcessLaunch,
  onHandover: (process: StagedProcess, request: ServerProcessHandoverRequest) => void,
  signal?: AbortSignal,
): Promise<StagedProcess> {
  signal?.throwIfAborted()
  await verifyServerProcessCandidate(candidate)
  signal?.throwIfAborted()
  let destroying = false
  let exited = false
  let destruction: Promise<void> | undefined
  let terminationFailure: Error | undefined
  let failure: Error | null = null
  const accepted = new Set<string>()
  const failures = new Map<string, Error>()
  const pending = new Map<string, {resolve(): void; reject(error: Error): void}>()
  const identity = candidate.artifact.identity
  const terminationTimeoutMs = candidate.context.terminationTimeoutMs ?? 5_000
  if (!Number.isSafeInteger(terminationTimeoutMs) || terminationTimeoutMs <= 0)
    throw new Error("Owned server process termination timeout is invalid")
  const initialKey = `${launch.mode === "active" ? "ready" : "prepared"}\u0000${launch.transitionId}`
  let initialSeen = false
  let managed!: StagedProcess
  const child = Bun.spawn({
    cmd: serverProcessCommand(candidate),
    cwd: candidate.context.cwd,
    env: {
      ...process.env,
      ...candidate.context.env,
      ...serverProcessIdentityEnvironment(identity),
      ...serverProcessLaunchEnvironment(launch),
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    ipc(message) {
      const request = readServerProcessHandoverRequest(message)
      if (request) {
        onHandover(managed, request)
        return
      }
      const ack = readServerProcessLifecycle(message)
      const rejected = readServerProcessFailure(message)
      if ((!ack && !rejected) || !sameServerProcessIdentity((ack ?? rejected)!.identity, identity)) {
        fail(new Error("Server package process sent invalid staged identity or message"))
        return
      }
      if (rejected) {
        const error = new Error(rejected.error)
        const stage = rejected.operation === "prepare" ? (launch.mode === "active" ? "ready" : "prepared")
          : {quiesce: "quiesced", resume: "resumed", unbind: "unbound", bind: "ready", admit: "admitted"}[rejected.operation]
        const key = `${stage}\u0000${rejected.transitionId}`
        const waiter = pending.get(key)
        if (waiter) waiter.reject(error)
        else if (key === initialKey && !initialSeen) failures.set(key, error)
        return
      }
      const key = `${ack!.type}\u0000${ack!.transitionId}`
      const waiter = pending.get(key)
      if (waiter) {
        if (key === initialKey) initialSeen = true
        waiter.resolve()
      } else if (key === initialKey && !initialSeen) {
        initialSeen = true
        accepted.add(key)
      }
    },
  })
  const runtime: ServerProcessRuntime = Object.freeze({identity, process: child})
  const abort = () => fail(signal?.reason instanceof Error ? signal.reason : new Error("Server process startup was cancelled"))
  signal?.addEventListener("abort", abort, {once: true})
  if (signal?.aborted) abort()
  const finished = child.exited.then<PackageExit>(exitCode => {
    signal?.removeEventListener("abort", abort)
    exited = true
    const error = new Error(`Server package process exited with code ${exitCode}`)
    fail(error)
    return terminationFailure ? {reason: "failed", error: terminationFailure}
      : destroying && (exitCode === 0 || child.signalCode === "SIGTERM")
        ? {reason: "destroyed"} : {reason: "failed", error}
  })

  const wait = async (type: ServerProcessLifecycleType, transitionId: string) => {
    if (failure) throw failure
    const key = `${type}\u0000${transitionId}`
    const rejected = failures.get(key)
    if (rejected) throw rejected
    if (accepted.delete(key)) return
    if (pending.has(key)) throw new Error(`Server package process already waits for ${type}`)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await new Promise<void>((resolve, reject) => {
        pending.set(key, {resolve, reject})
        timer = setTimeout(() => reject(new Error(`Timed out waiting for server package process ${type}`)),
          candidate.context.readyTimeoutMs ?? 10_000)
      })
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      pending.delete(key)
    }
  }

  managed = Object.freeze({
    active: Object.freeze({runtime, finished}),
    get exited() { return exited },
    wait,
    async command(type: ServerProcessOperation, expected: ServerProcessLifecycleType, transitionId: string) {
      const ready = wait(expected, transitionId)
      try {
        child.send(serverProcessCommandMessage(type, identity, transitionId))
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error))
        pending.get(`${expected}\u0000${transitionId}`)?.reject(normalized)
      }
      await ready
    },
    send(value: unknown) {
      if (!exited) child.send(value)
    },
    destroy() {
      destruction ??= (async () => {
        destroying = true
        fail(new Error("Server package process was destroyed"))
        if (exited) return
        child.kill("SIGTERM")
        if (await exitedWithin(terminationTimeoutMs)) {
          const outcome = await finished
          if (outcome.reason === "failed") throw outcome.error
          return
        }
        terminationFailure = new Error("Owned server process did not stop after SIGTERM; SIGKILL was required")
        child.kill("SIGKILL")
        if (!await exitedWithin(terminationTimeoutMs))
          throw new Error("Owned server process exit could not be confirmed after SIGKILL")
        throw terminationFailure
      })()
      return destruction
    },
  })
  return managed

  function fail(error: Error) {
    failure ??= error
    for (const waiter of pending.values()) waiter.reject(error)
  }

  async function exitedWithin(timeoutMs: number) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        child.exited.then(() => true),
        new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs) }),
      ])
    } finally { if (timer !== undefined) clearTimeout(timer) }
  }
}
