import {fileURLToPath} from "node:url"
import type {PeerSignal, WeriftPeerSnapshot} from "./peer/werift-peer.ts"

type ChildMessage =
  | {kind: "online"; pid: number}
  | {kind: "peer-signal"; peerId: string; signal: PeerSignal}
  | {kind: "peer-state"; snapshot: WeriftPeerSnapshot}
  | {kind: "peer-error"; peerId: string | null; error: string}

export interface PeerProcessSnapshot {
  state: "starting" | "online" | "restarting" | "stopped"
  pid: number | null
  incarnation: string | null
  generation: number
  unexpectedExits: number
}

const childEntry = fileURLToPath(new URL("./peer-process.ts", import.meta.url))

export class PeerProcessSupervisor {
  readonly #onSignal: (peerId: string, signal: PeerSignal) => void
  readonly #onState: (
    snapshot: WeriftPeerSnapshot | null,
    error?: string,
    errorPeerId?: string | null,
  ) => void
  readonly #onTraffic: (event: {direction: "forward" | "reverse"; messageClass: string}) => void
  #child: ReturnType<typeof Bun.spawn> | null = null
  #ready!: Promise<ReturnType<typeof Bun.spawn>>
  #resolveReady!: (child: ReturnType<typeof Bun.spawn>) => void
  #rejectReady!: (error: Error) => void
  #startupTimer: ReturnType<typeof setTimeout> | null = null
  #snapshot: WeriftPeerSnapshot | null = null
  #process: PeerProcessSnapshot = {
    state: "starting",
    pid: null,
    incarnation: null,
    generation: 0,
    unexpectedExits: 0,
  }
  #stopped = false

  constructor({
    onSignal,
    onState = () => {},
    onTraffic = () => {},
  }: {
    onSignal: (peerId: string, signal: PeerSignal) => void
    onState?: (
      snapshot: WeriftPeerSnapshot | null,
      error?: string,
      errorPeerId?: string | null,
    ) => void
    onTraffic?: (event: {direction: "forward" | "reverse"; messageClass: string}) => void
  }) {
    this.#onSignal = onSignal
    this.#onState = onState
    this.#onTraffic = onTraffic
    this.#spawn("starting")
  }

  snapshot(): WeriftPeerSnapshot | null {
    return this.#snapshot ? {...this.#snapshot, channels: [...this.#snapshot.channels]} : null
  }

  processSnapshot(): PeerProcessSnapshot {
    return {...this.#process}
  }

  async begin(peerId: string, sessionEpoch: string): Promise<void> {
    await this.#send({kind: "begin", peerId, sessionEpoch})
  }

  async signal(peerId: string, signal: PeerSignal): Promise<void> {
    await this.#send({kind: "signal", peerId, signal})
  }

  async closePeer(peerId?: string): Promise<void> {
    await this.#send({kind: "close-peer", peerId})
  }

  crashForTest(): number | null {
    const child = this.#child
    if (!child || this.#stopped) return null
    const pid = child.pid
    child.kill("SIGKILL")
    return pid
  }

  reportErrorForTest(peerId: string, error: string): void {
    this.#onState(this.snapshot(), error, peerId)
  }

  async stop(): Promise<void> {
    if (this.#stopped) return
    this.#stopped = true
    if (this.#startupTimer) {
      clearTimeout(this.#startupTimer)
      this.#startupTimer = null
    }
    const child = this.#child
    if (!child) {
      this.#process = {...this.#process, state: "stopped", pid: null}
      return
    }
    try {
      const online = await Promise.race([
        this.#ready,
        Bun.sleep(250).then(() => null),
      ])
      if (online === child) child.send({kind: "stop"})
      if (online === child) this.#onTraffic({direction: "forward", messageClass: "stop"})
    } catch {}
    const exited = await Promise.race([
      child.exited.then(() => true),
      Bun.sleep(1_500).then(() => false),
    ])
    if (!exited) {
      child.kill("SIGKILL")
      await child.exited
    }
    if (this.#child === child) this.#child = null
    this.#process = {...this.#process, state: "stopped", pid: null}
  }

  async #send(message: unknown): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const child = await this.#ready
      if (child !== this.#child || this.#stopped) continue
      child.send(message)
      this.#onTraffic({
        direction: "forward",
        messageClass: message && typeof message === "object" && "kind" in message && typeof message.kind === "string"
          ? message.kind
          : "unknown",
      })
      return
    }
    throw new Error("peer process changed before IPC send")
  }

  #spawn(state: PeerProcessSnapshot["state"]): void {
    if (this.#stopped) return
    const generation = this.#process.generation + 1
    const incarnation = crypto.randomUUID()
    this.#process = {
      ...this.#process,
      state,
      pid: null,
      incarnation,
      generation,
    }
    let settled = false
    this.#ready = new Promise((resolve, reject) => {
      this.#resolveReady = resolve
      this.#rejectReady = reject
    })
    void this.#ready.catch(() => {})
    const child = Bun.spawn({
      cmd: [process.execPath, childEntry],
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
      ipc: (rawMessage) => this.#receive(child, rawMessage as ChildMessage),
    })
    this.#child = child
    this.#startupTimer = setTimeout(() => {
      if (settled || this.#child !== child) return
      settled = true
      const error = new Error("peer process start timed out")
      this.#rejectReady(error)
      child.kill("SIGKILL")
    }, 5_000)

    void child.exited.then(async (code) => {
      if (this.#child !== child) return
      if (this.#startupTimer) {
        clearTimeout(this.#startupTimer)
        this.#startupTimer = null
      }
      this.#child = null
      if (!settled) {
        settled = true
        this.#rejectReady(new Error(`peer process exited before ready (${code})`))
      }
      if (this.#stopped) {
        this.#process = {...this.#process, state: "stopped", pid: null}
        return
      }
      const stderr = typeof child.stderr === "number" ? "" : await new Response(child.stderr).text()
      const error = `peer process exited (${code}): ${stderr.trim()}`
      this.#process = {
        ...this.#process,
        state: "restarting",
        pid: null,
        unexpectedExits: this.#process.unexpectedExits + 1,
      }
      this.#spawn("restarting")
      this.#onState(this.#snapshot, error, this.#snapshot?.peerId ?? null)
    })
  }

  #receive(child: ReturnType<typeof Bun.spawn>, message: ChildMessage): void {
    if (child !== this.#child) return
    this.#onTraffic({direction: "reverse", messageClass: message?.kind ?? "unknown"})
    if (message?.kind === "online") {
      if (this.#startupTimer) {
        clearTimeout(this.#startupTimer)
        this.#startupTimer = null
      }
      this.#process = {...this.#process, state: "online", pid: message.pid}
      this.#resolveReady(child)
      return
    }
    if (message?.kind === "peer-signal") {
      this.#onSignal(message.peerId, message.signal)
      return
    }
    if (message?.kind === "peer-state") {
      this.#snapshot = message.snapshot
      this.#onState(this.snapshot())
      return
    }
    if (message?.kind === "peer-error") {
      this.#onState(this.snapshot(), message.error, message.peerId)
    }
  }
}
