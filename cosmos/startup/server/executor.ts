import type {
  PackageExecutor,
  PackageExit,
  VerifiedArtifact,
} from "@cosmos/release"
import {
  readServerProcessReady,
  sameServerProcessIdentity,
  serverProcessIdentityEnvironment,
  type ServerProcessIdentity,
} from "../../shared/package/process"

export type ServerProcessArtifact = VerifiedArtifact<string, ServerProcessIdentity>

export interface ServerProcessContext {
  readonly args?: readonly string[]
  readonly cwd: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly inspect?: string
  readonly readyTimeoutMs?: number
}

export interface ServerProcessCandidate {
  readonly artifact: ServerProcessArtifact
  readonly context: ServerProcessContext
}

export interface ServerProcessRuntime {
  readonly identity: ServerProcessIdentity
  readonly process: ReturnType<typeof Bun.spawn>
}

type ServerProcessExecutor = PackageExecutor<
  ServerProcessArtifact,
  ServerProcessContext,
  ServerProcessCandidate,
  ServerProcessRuntime
>

interface ProcessControl {
  destroying: boolean
}

/** Bun process adapter общего package execution lifecycle. */
export function createServerProcessExecutor(): ServerProcessExecutor {
  const controls = new WeakMap<ServerProcessRuntime, ProcessControl>()

  const executor: ServerProcessExecutor = {
    async prepare(artifact, context) {
      return Object.freeze({artifact, context})
    },

    async activate(candidate) {
      const ready = deferred<void>()
      let readySeen = false
      const command = serverProcessCommand(candidate)
      const child = Bun.spawn({
        cmd: command,
        cwd: candidate.context.cwd,
        env: {
          ...process.env,
          ...candidate.context.env,
          ...serverProcessIdentityEnvironment(candidate.artifact.identity),
        },
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
        ipc(message, process) {
          if (readySeen) return
          const parsed = readServerProcessReady(message)
          if (!parsed || !sameServerProcessIdentity(parsed.identity, candidate.artifact.identity)) {
            ready.reject(new Error("Server package process sent invalid ready identity"))
            process.kill("SIGTERM")
            return
          }
          readySeen = true
          ready.resolve()
        },
      })
      const control: ProcessControl = {destroying: false}
      const runtime = Object.freeze({
        identity: candidate.artifact.identity,
        process: child,
      })
      controls.set(runtime, control)
      const finished = child.exited.then<PackageExit>((exitCode) => control.destroying
        ? {reason: "destroyed"}
        : {
            reason: "failed",
            error: new Error(processExitMessage(exitCode, child.signalCode)),
          })

      try {
        await Promise.race([
          ready.promise,
          child.exited.then((exitCode) => {
            throw new Error(`Server package process exited before ready with code ${exitCode}`)
          }),
          Bun.sleep(candidate.context.readyTimeoutMs ?? 10_000).then(() => {
            throw new Error("Timed out waiting for server package process ready")
          }),
        ])
      } catch (error) {
        if (child.exitCode === null) child.kill("SIGTERM")
        await child.exited
        controls.delete(runtime)
        throw error
      }

      return Object.freeze({runtime, finished})
    },

    async destroy(active) {
      const control = controls.get(active.runtime)
      if (control) control.destroying = true
      if (active.runtime.process.exitCode === null) active.runtime.process.kill("SIGTERM")
      await active.runtime.process.exited
      controls.delete(active.runtime)
    },
  }

  return Object.freeze(executor)
}

export function serverProcessCommand(candidate: ServerProcessCandidate) {
  return [
    process.execPath,
    ...(candidate.context.inspect ? [`--inspect=${candidate.context.inspect}`] : []),
    "--conditions=cosmos:server",
    "--conditions=internal:server",
    candidate.artifact.executable,
    ...(candidate.context.args ?? []),
  ]
}

function processExitMessage(exitCode: number, signalCode: number | string | null) {
  return signalCode === null
    ? `Server package process exited with code ${exitCode}`
    : `Server package process exited from signal ${signalCode}`
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accepted, rejected) => {
    resolve = accepted
    reject = rejected
  })
  return {promise, resolve, reject}
}
