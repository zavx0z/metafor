import type {ActivePackage, PackageExit, ReleaseHandover} from "@cosmos/release"
import {sameServerProcessIdentity, type ServerProcessHandoverRequest, type ServerProcessHandoverResult} from "../../shared/package/process"
import type {ServerProcessCandidate, ServerProcessRuntime} from "./executor"
import {spawnStagedProcess, verifyServerProcessCandidate, type StagedProcess} from "./staged-process"

/** Parent разрешает установленную цель и единолично фиксирует её активацию. */
export interface ServerStagedStartupOptions {
  /** Cancels pending startup/transition acknowledgements; the caller owns active shutdown. */
  readonly signal?: AbortSignal
  readonly staged?: boolean
  readonly initialTarget?: string
  readonly resolveCandidate?: (target: string) => Promise<ServerProcessCandidate>
  readonly commitCandidate?: (candidate: ServerProcessCandidate) => Promise<void>
}

/** Последняя наблюдаемая попытка; failed после unbind не означает возврат старого listener. */
export interface ServerHandoverState {
  readonly target: string
  readonly phase: "preparing" | "quiescing" | "unbinding" | "binding" | "committing" | "admitting" | "complete" | "failed"
  readonly error?: string
}

/** Staged host сохраняет один current и наблюдает его исход после каждой замены. */
export interface StagedServerReleaseHost extends ReleaseHandover<string, ServerProcessCandidate> {
  /** True only after every owned process exit has been observed, including failed cleanup. */
  readonly ownedProcessesExited: boolean
  readonly active: ActivePackage<ServerProcessRuntime>
  readonly finished: Promise<PackageExit>
  readonly transition: ServerHandoverState | null
  handover(target: string): Promise<void>
  destroy(): Promise<void>
}

/**
Failed startup cleanup preserves whether its owned processes actually exited.
The launcher keeps exclusive ownership when exit cannot be confirmed. Confirmed
termination may still fail (for example, SIGKILL was required); it permits lock
release while preserving the cleanup failure. Cancellation and lock reuse are
checked by [installed launcher scenarios](../../release/spec/installed-launcher.spec.ts),
following the [startup lifecycle](../README.md#как-начинается-работа).
*/
export class ServerStartupCleanupError extends AggregateError {
  constructor(errors: readonly unknown[], readonly ownedProcessesExited: boolean) {
    super(errors, "Server startup and owned process cleanup failed")
  }
}

/**
Запускает staged server host, сохраняя listener и composition policy у release.

До unbind отказ кандидата отменяет переход и возвращает admission прежнему
исполнению. После запроса unbind исход считается необратимым: host сообщает
ошибку, не запускает process повторно и не выбирает прежний выпуск.
*/
export async function startStagedServerRelease(
  initial: ServerProcessCandidate,
  options: ServerStagedStartupOptions,
): Promise<StagedServerReleaseHost> {
  if (!options.resolveCandidate || !options.commitCandidate)
    throw new Error("Staged server startup requires candidate resolution and activation commit")
  const resolveCandidate = options.resolveCandidate
  const commitCandidate = options.commitCandidate
  const children = new Set<StagedProcess>()
  const cancellation = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, cancellation.signal]) : cancellation.signal
  signal.throwIfAborted()
  const requests = new WeakMap<StagedProcess, Map<string, {target: string; result: Promise<ServerProcessHandoverResult>}>>()
  const completion = deferred<PackageExit>()
  let current: StagedProcess | null = null
  let currentTarget = initial.context.env?.COSMOS_RELEASE_DIGEST
  if (!currentTarget) throw new Error("Initial server release digest is missing")
  let transition: ServerHandoverState | null = null
  let queue = Promise.resolve()
  let destroyed = false
  let destruction: Promise<void> | undefined
  let terminal = false
  const launchId = crypto.randomUUID()
  const boot = await spawn(initial, "prepared", launchId)
  try {
    await boot.wait("prepared", launchId)
    await boot.command("bind", "ready", launchId)
    signal.throwIfAborted()
    await commitCandidate(initial)
    signal.throwIfAborted()
    await boot.command("admit", "admitted", launchId)
    current = boot
  } catch (error) {
    try { await remove(boot) }
    catch (cleanupError) { throw new ServerStartupCleanupError([error, cleanupError], children.size === 0) }
    throw error
  }

  const host: StagedServerReleaseHost = Object.freeze({
    get ownedProcessesExited() { return children.size === 0 },
    get active() { return current!.active },
    finished: completion.promise,
    get transition() { return transition },
    async prepare(target = currentTarget) {
      if (destroyed || terminal) throw new Error("Server release host cannot prepare another handover")
      if (!target) throw new Error("Installed server target is missing")
      const candidate = await resolveCandidate(target)
      validateTarget(candidate, target)
      await verifyServerProcessCandidate(candidate)
      return candidate
    },
    activate(candidate: ServerProcessCandidate) {
      const target = candidate.context.env?.COSMOS_RELEASE_DIGEST
      if (!target) return Promise.reject(new Error("Prepared server release digest is missing"))
      return enqueue(target, candidate)
    },
    handover,
    destroy() {
      destruction ??= (async () => {
        destroyed = true
        cancellation.abort(new Error("Server release host was destroyed"))
        const outcomes = await Promise.allSettled([...children].map(remove))
        await queue
        const errors = outcomes.flatMap(outcome => outcome.status === "rejected" ? [outcome.reason] : [])
        if (errors.length > 0) {
          const failure = new AggregateError(errors, "Owned server process cleanup failed")
          completion.resolve({reason: "failed", error: failure})
          throw failure
        }
        completion.resolve({reason: "destroyed"})
      })()
      return destruction
    },
  })
  return host

  function handover(target: string): Promise<void> {
    return enqueue(target)
  }

  function enqueue(target: string, candidate?: ServerProcessCandidate): Promise<void> {
    const operation = queue.then(() => replace(target, candidate))
    queue = operation.then(() => undefined, () => undefined)
    return operation
  }

  async function replace(target: string, prepared?: ServerProcessCandidate) {
    if (destroyed || terminal) throw new Error("Server release host cannot accept another handover")
    if (typeof target !== "string" || target.length === 0 || target.length > 4096)
      throw new Error("Installed server target is invalid")
    const previous = current!
    let next: StagedProcess | null = null
    let quiescing = false
    let unbinding = false
    let admitted = false
    const transitionId = crypto.randomUUID()
    try {
      setPhase("preparing")
      const candidate = prepared ?? await resolveCandidate(target)
      validateTarget(candidate, target)
      if (destroyed) throw new Error("Server release host was destroyed")
      if (currentTarget === target && sameServerProcessIdentity(candidate.artifact.identity, previous.active.runtime.identity)) {
        setPhase("complete")
        return
      }
      next = await spawn(candidate, "prepared", transitionId)
      if (destroyed) throw new Error("Server release host was destroyed")
      await next.wait("prepared", transitionId)
      setPhase("quiescing")
      quiescing = true
      await previous.command("quiesce", "quiesced", transitionId)
      setPhase("unbinding")
      unbinding = true
      await previous.command("unbind", "unbound", transitionId)
      setPhase("binding")
      await next.command("bind", "ready", transitionId)
      setPhase("committing")
      await commitCandidate(candidate)
      signal.throwIfAborted()
      if (destroyed) throw new Error("Server release host was destroyed")
      current = next
      currentTarget = target
      setPhase("admitting")
      await next.command("admit", "admitted", transitionId)
      admitted = true
      for (const [requestId, accepted] of requests.get(previous) ?? []) {
        if (accepted.target === target) previous.send({type: "handover-result", requestId, success: true})
      }
      await remove(previous)
      setPhase("complete")
    } catch (error) {
      let failure = error instanceof Error ? error : new Error(String(error))
      if (next && !admitted) {
        try { await remove(next) }
        catch (cleanupError) {
          failure = new AggregateError([failure, cleanupError], `Server handover and candidate cleanup failed: ${failure.message}`)
        }
      }
      if (!destroyed && quiescing && !unbinding) {
        try {
          await previous.command("resume", "resumed", transitionId)
        } catch (resumeError) {
          failure = new AggregateError([failure, resumeError], `Server handover failed and admission could not resume: ${failure.message}`)
          terminal = true
        }
      }
      setPhase("failed", failure.message)
      if (!destroyed && (unbinding || terminal)) {
        terminal = true
        completion.resolve({reason: "failed", error: failure})
      }
      throw failure
    }

    function setPhase(phase: ServerHandoverState["phase"], error?: string) {
      transition = Object.freeze({target, phase, ...(error === undefined ? {} : {error})})
    }
  }

  function validateTarget(candidate: ServerProcessCandidate, target: string) {
    if (candidate.context.env?.COSMOS_RELEASE_DIGEST !== target)
      throw new Error("Resolved server candidate differs from the installed target")
  }

  async function spawn(candidate: ServerProcessCandidate, mode: "active" | "prepared", transitionId: string) {
    const child = await spawnStagedProcess(candidate, {mode, transitionId}, receiveRequest, signal)
    children.add(child)
    void child.active.finished.then(exit => {
      if (!destroyed && child === current && exit.reason === "failed") {
        terminal = true
        completion.resolve(exit)
      }
    })
    if (destroyed) await remove(child)
    return child
  }

  async function remove(child: StagedProcess) {
    try { await child.destroy() }
    finally { if (child.exited) children.delete(child) }
  }

  function receiveRequest(sender: StagedProcess, request: ServerProcessHandoverRequest) {
    if (destroyed || sender !== current) {
      sender.send({type: "handover-result", requestId: request.requestId, success: false, error: "Only the active server release may request handover"})
      return
    }
    const previous = requests.get(sender) ?? new Map<string, {target: string; result: Promise<ServerProcessHandoverResult>}>()
    requests.set(sender, previous)
    let accepted = previous.get(request.requestId)
    if (accepted && accepted.target !== request.target) {
      sender.send({type: "handover-result", requestId: request.requestId, success: false, error: "Handover request identity was reused for another target"})
      return
    }
    if (!accepted) {
      const result = handover(request.target).then<ServerProcessHandoverResult, ServerProcessHandoverResult>(
        () => ({type: "handover-result", requestId: request.requestId, success: true}),
        error => ({type: "handover-result", requestId: request.requestId, success: false,
          error: error instanceof Error ? error.message : String(error)}),
      )
      accepted = {target: request.target, result}
      previous.set(request.requestId, accepted)
    }
    void accepted.result.then(result => sender.send(result)).catch(() => {})
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accepted => { resolve = accepted })
  return {promise, resolve}
}
