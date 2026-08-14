import {fileURLToPath} from "node:url"
import {
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
  hamiltonianLifecycleTransportId,
} from "../../core/lifecycle.js"

export interface VersionPayload {
  version: string
  sha256: string
  source: string
  serverEntityId: string
  authority?: EmbodimentAuthority | null
}

export interface EmbodimentAuthority {
  hostEpoch: string
  connectionId: string
  holderId: string
  fencingToken: number
  leaseId: string
  expiresAt: number
}

export interface BunEmbodimentSnapshot {
  runtime: "bun-process"
  role: string
  state: "idle" | "starting" | "ready" | "stopped" | "error"
  incarnation: string | null
  pid: number | null
  version: string | null
  sha256: string | null
  authority: EmbodimentAuthority | null
  description?: string
  error?: string
}

interface ReadyMessage {
  kind: "ready"
  monitor: {messageId: string}
  pid: number
  version: string
  sha256: string
  description: string
  snapshot: {
    runtime: string
    role: string
    incarnation: string
    version: string
    state: string
    authority: EmbodimentAuthority | null
  }
}

interface ErrorMessage {
  kind: "error"
  monitor: {messageId: string}
  pid: number
  error: string
}

type ChildMessage = ReadyMessage | ErrorMessage | {kind: "online" | "stopped"; monitor: {messageId: string}}
  | {kind: "lifecycle"; envelope: unknown}

export interface BunIpcMessageObservation {
  phase: "sent" | "received"
  messageId: string
  messageClass: string
  processEntityId: string
  transportId: string
}

export interface BunProcessExitObservation {
  role: string
  entityId: string
  transportId: string
  incarnation: string
  exitCode: number
  reason: string
}

const childEntry = fileURLToPath(new URL("./embodiment-entry.ts", import.meta.url))

export class BunEmbodimentSupervisor {
  readonly role: string
  readonly #onChange: (snapshot: BunEmbodimentSnapshot) => void
  readonly #onTraffic: (event: {direction: "forward" | "reverse"; messageClass: string}) => void
  readonly #onLifecycle: (envelope: unknown) => void
  readonly #onMessage: (event: BunIpcMessageObservation) => void
  readonly #onProcessExit: (event: BunProcessExitObservation) => void
  #child: ReturnType<typeof Bun.spawn> | null = null
  #snapshot: BunEmbodimentSnapshot = {
    runtime: "bun-process",
    role: "unassigned",
    state: "idle",
    incarnation: null,
    pid: null,
    version: null,
    sha256: null,
    authority: null,
  }
  #stopping = false
  #terminated = false
  #operations: Promise<void> = Promise.resolve()
  #processEntityId: string | null = null
  #ipcTransportId: string | null = null

  constructor(
    role: string,
    onChange: (snapshot: BunEmbodimentSnapshot) => void = () => {},
    onTraffic: (event: {direction: "forward" | "reverse"; messageClass: string}) => void = () => {},
    onLifecycle: (envelope: unknown) => void = () => {},
    onMessage: (event: BunIpcMessageObservation) => void = () => {},
    onProcessExit: (event: BunProcessExitObservation) => void = () => {},
  ) {
    this.role = role
    this.#onChange = onChange
    this.#onTraffic = onTraffic
    this.#onLifecycle = onLifecycle
    this.#onMessage = onMessage
    this.#onProcessExit = onProcessExit
    this.#snapshot = {...this.#snapshot, role}
  }

  snapshot(): BunEmbodimentSnapshot {
    return {...this.#snapshot}
  }

  rebirth(payload: VersionPayload): Promise<BunEmbodimentSnapshot> {
    if (this.#terminated) return Promise.reject(new Error("Bun embodiment supervisor is stopped"))
    return this.#enqueue(async () => {
      if (this.#terminated) throw new Error("Bun embodiment supervisor is stopped")
      await this.#stopNow()
      return await this.#birth(payload)
    })
  }

  crashForTest(): number | null {
    const child = this.#child
    if (!child || this.#terminated) return null
    const pid = child.pid
    child.kill("SIGKILL")
    return pid
  }

  async #birth(payload: VersionPayload): Promise<BunEmbodimentSnapshot> {
    const incarnation = crypto.randomUUID()
    const processEntityId = hamiltonianLifecycleEntityId("bun-process", incarnation)
    const ipcTransportId = hamiltonianLifecycleTransportId("ipc", incarnation)
    this.#processEntityId = processEntityId
    this.#ipcTransportId = ipcTransportId
    this.#setSnapshot({
      runtime: "bun-process",
      role: this.role,
      state: "starting",
      incarnation,
      pid: null,
      version: payload.version,
      sha256: payload.sha256,
      authority: payload.authority ?? null,
    })

    return await new Promise<BunEmbodimentSnapshot>((resolve, reject) => {
      let settled = false
      let ready = false
      const timeout = setTimeout(() => fail(new Error("Bun embodiment birth timed out")), 5_000)
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        this.#setSnapshot({...this.#snapshot, state: "error", error: error.message})
        this.#child?.kill("SIGKILL")
        reject(error)
      }

      const child = Bun.spawn({
        cmd: [process.execPath, childEntry, incarnation, this.role, payload.serverEntityId, ipcTransportId],
        stdin: "ignore",
        stdout: "ignore",
        stderr: "pipe",
        ipc: (rawMessage) => {
          const message = rawMessage as ChildMessage
          if (message?.kind === "lifecycle") {
            this.#onLifecycle(message.envelope)
            return
          }
          this.#observeMessage("received", message.monitor?.messageId, message.kind)
          this.#onTraffic({direction: "reverse", messageClass: message?.kind ?? "unknown"})
          if (message?.kind === "error") {
            fail(new Error(message.error))
            return
          }
          if (message?.kind !== "ready" || settled) return
          if (
            message.version !== payload.version ||
            message.sha256 !== payload.sha256 ||
            message.snapshot.runtime !== "bun-process" ||
            message.snapshot.role !== this.role ||
            message.snapshot.incarnation !== incarnation ||
            message.snapshot.state !== "active" ||
            JSON.stringify(message.snapshot.authority) !== JSON.stringify(payload.authority ?? null)
          ) {
            fail(new Error("Bun embodiment returned an invalid ready snapshot"))
            return
          }
          settled = true
          ready = true
          clearTimeout(timeout)
          this.#setSnapshot({
            runtime: "bun-process",
            role: this.role,
            state: "ready",
            incarnation,
            pid: message.pid,
            version: message.version,
            sha256: message.sha256,
            authority: message.snapshot.authority,
            description: message.description,
          })
          resolve(this.snapshot())
        },
      })
      this.#child = child
      child.exited.then(async (exitCode) => {
        if (this.#child !== child) return
        this.#child = null
        if (this.#stopping) return
        if (!settled) {
          const stderr = await new Response(child.stderr).text()
          fail(new Error(`Bun embodiment exited during birth (${exitCode}): ${stderr.trim()}`))
          return
        }
        if (!ready) return
        if (exitCode === 0) {
          const {error: _error, ...snapshot} = this.#snapshot
          this.#setSnapshot({...snapshot, state: "stopped"})
        } else {
          this.#setSnapshot({
            ...this.#snapshot,
            state: "error",
            error: `Bun embodiment exited with code ${exitCode}`,
          })
        }
        this.#onProcessExit({
          role: this.role,
          entityId: processEntityId,
          transportId: ipcTransportId,
          incarnation,
          exitCode,
          reason: `Bun embodiment exited with code ${exitCode}`,
        })
      })
      const birthMessageId = hamiltonianLifecycleMessageId(crypto.randomUUID())
      this.#observeMessage("sent", birthMessageId, "birth")
      child.send({
        kind: "birth",
        incarnation,
        role: this.role,
        ...payload,
        monitor: {messageId: birthMessageId},
      })
      this.#onTraffic({direction: "forward", messageClass: "birth"})
    })
  }

  stop(): Promise<void> {
    this.#terminated = true
    return this.#enqueue(() => this.#stopNow())
  }

  async #stopNow(): Promise<void> {
    const child = this.#child
    if (!child) {
      if (this.#snapshot.state !== "idle" && this.#snapshot.state !== "stopped") {
        this.#setSnapshot({...this.#snapshot, state: "stopped"})
      }
      return
    }
    this.#stopping = true
    const stopMessageId = hamiltonianLifecycleMessageId(crypto.randomUUID())
    this.#observeMessage("sent", stopMessageId, "stop")
    child.send({kind: "stop", monitor: {messageId: stopMessageId}})
    this.#onTraffic({direction: "forward", messageClass: "stop"})
    const exited = await Promise.race([
      child.exited.then(() => true),
      Bun.sleep(1_000).then(() => false),
    ])
    if (!exited) {
      child.kill("SIGKILL")
      await child.exited
    }
    if (this.#child === child) this.#child = null
    this.#stopping = false
    this.#setSnapshot({...this.#snapshot, state: "stopped", pid: null})
  }

  #setSnapshot(snapshot: BunEmbodimentSnapshot): void {
    this.#snapshot = snapshot
    this.#onChange(this.snapshot())
  }

  #observeMessage(phase: "sent" | "received", messageId: string | undefined, messageClass: string): void {
    if (!messageId || !this.#processEntityId || !this.#ipcTransportId) return
    this.#onMessage({
      phase,
      messageId,
      messageClass,
      processEntityId: this.#processEntityId,
      transportId: this.#ipcTransportId,
    })
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operations.then(operation, operation)
    this.#operations = result.then(() => undefined, () => undefined)
    return result
  }
}

export class BunEmbodimentSet {
  readonly #supervisors: Map<string, BunEmbodimentSupervisor>

  constructor(
    roles: string[],
    onChange: (snapshots: Record<string, BunEmbodimentSnapshot>) => void = () => {},
    onTraffic: (role: string, event: {direction: "forward" | "reverse"; messageClass: string}) => void = () => {},
    onLifecycle: (role: string, envelope: unknown) => void = () => {},
    onMessage: (role: string, event: BunIpcMessageObservation) => void = () => {},
    onProcessExit: (role: string, event: BunProcessExitObservation) => void = () => {},
  ) {
    this.#supervisors = new Map(roles.map((role) => [
      role,
      new BunEmbodimentSupervisor(
        role,
        () => onChange(this.snapshot()),
        (event) => onTraffic(role, event),
        (envelope) => onLifecycle(role, envelope),
        (event) => onMessage(role, event),
        (event) => onProcessExit(role, event),
      ),
    ]))
  }

  snapshot(): Record<string, BunEmbodimentSnapshot> {
    return Object.fromEntries(
      [...this.#supervisors].map(([role, supervisor]) => [role, supervisor.snapshot()]),
    )
  }

  async birthAll(
    payload: VersionPayload | ((role: string) => VersionPayload),
  ): Promise<Record<string, BunEmbodimentSnapshot>> {
    await Promise.all([...this.#supervisors].map(([role, supervisor]) =>
      supervisor.rebirth(typeof payload === "function" ? payload(role) : payload)
    ))
    return this.snapshot()
  }

  async rebirth(role: string, payload: VersionPayload): Promise<BunEmbodimentSnapshot> {
    const supervisor = this.#supervisors.get(role)
    if (!supervisor) throw new Error(`Unknown Bun embodiment role: ${role}`)
    return await supervisor.rebirth(payload)
  }

  crashForTest(role: string): number | null {
    const supervisor = this.#supervisors.get(role)
    if (!supervisor) return null
    return supervisor.crashForTest()
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.#supervisors.values()].map((supervisor) => supervisor.stop()))
  }
}
