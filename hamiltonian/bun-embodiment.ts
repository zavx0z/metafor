import {fileURLToPath} from "node:url"

export interface VersionPayload {
  version: string
  sha256: string
  source: string
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
  pid: number
  error: string
}

type ChildMessage = ReadyMessage | ErrorMessage | {kind: "online" | "stopped"}

const childEntry = fileURLToPath(new URL("./embodiment-process.ts", import.meta.url))

export class BunEmbodimentSupervisor {
  readonly role: string
  readonly #onChange: (snapshot: BunEmbodimentSnapshot) => void
  readonly #onTraffic: (event: {direction: "forward" | "reverse"; messageClass: string}) => void
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

  constructor(
    role: string,
    onChange: (snapshot: BunEmbodimentSnapshot) => void = () => {},
    onTraffic: (event: {direction: "forward" | "reverse"; messageClass: string}) => void = () => {},
  ) {
    this.role = role
    this.#onChange = onChange
    this.#onTraffic = onTraffic
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

  async #birth(payload: VersionPayload): Promise<BunEmbodimentSnapshot> {
    const incarnation = crypto.randomUUID()
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
        cmd: [process.execPath, childEntry],
        stdin: "ignore",
        stdout: "ignore",
        stderr: "pipe",
        ipc: (rawMessage) => {
          const message = rawMessage as ChildMessage
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
      })
      child.send({kind: "birth", incarnation, role: this.role, ...payload})
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
    child.send({kind: "stop"})
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
  ) {
    this.#supervisors = new Map(roles.map((role) => [
      role,
      new BunEmbodimentSupervisor(
        role,
        () => onChange(this.snapshot()),
        (event) => onTraffic(role, event),
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

  async stopAll(): Promise<void> {
    await Promise.all([...this.#supervisors.values()].map((supervisor) => supervisor.stop()))
  }
}
