import {
  HamiltonianLifecycleSource,
  createHamiltonianLifecycleObservation,
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
} from "./core/lifecycle.js"

type BirthMessage = {
  kind: "birth"
  incarnation: string
  role: string
  version: string
  sha256: string
  source: string
  serverEntityId: string
  authority?: EmbodimentAuthority | null
  monitor: {messageId: string}
}

type EmbodimentAuthority = {
  hostEpoch: string
  connectionId: string
  holderId: string
  fencingToken: number
  leaseId: string
  expiresAt: number
}

type StopMessage = {kind: "stop"; monitor: {messageId: string}}

type ParentMessage = BirthMessage | StopMessage

type Embodiment = {
  start(): EmbodimentSnapshot
  stop(): EmbodimentSnapshot
}

type EmbodimentSnapshot = {
  runtime: string
  role: string
  incarnation: string
  version: string
  state: string
  authority: EmbodimentAuthority | null
}

let current: Embodiment | null = null
const [processIncarnation, processRole, serverEntityId, ipcTransportId] = process.argv.slice(2)
if (!processIncarnation || !processRole || !serverEntityId || !ipcTransportId) {
  throw new Error("Bun embodiment lifecycle identity is missing")
}
const processEntityId = hamiltonianLifecycleEntityId("bun-process", processIncarnation)
const lifecycle = new HamiltonianLifecycleSource({
  id: processEntityId,
  kind: "bun-process",
  incarnation: processIncarnation,
  startedAt: Date.now(),
})

function sha256Hex(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex") as string
}

function send(message: unknown): void {
  process.send?.(message)
}

function emitLifecycle(observation: Parameters<HamiltonianLifecycleSource["next"]>[0], causedBy: string | null = null): void {
  send({kind: "lifecycle", envelope: lifecycle.next(observation, {causedBy})})
}

function messageId(message: {monitor?: {messageId?: unknown}}): string | null {
  return typeof message.monitor?.messageId === "string" && message.monitor.messageId
    ? message.monitor.messageId
    : null
}

function observeMessage(
  phase: "sent" | "received",
  id: string,
  messageClass: string,
): void {
  const outgoing = phase === "sent"
  emitLifecycle(createHamiltonianLifecycleObservation({
    type: "message",
    phase,
    subjectId: id,
    subjectKind: "ipc-message",
    ownerId: processEntityId,
    sourceEntityId: outgoing ? processEntityId : serverEntityId,
    targetEntityId: outgoing ? serverEntityId : processEntityId,
    transportId: ipcTransportId,
    messageId: id,
    messageClass,
  }))
}

function sendObserved(message: Record<string, unknown> & {kind: string}): string {
  const id = hamiltonianLifecycleMessageId(crypto.randomUUID())
  observeMessage("sent", id, message.kind)
  send({...message, monitor: {messageId: id}})
  return id
}

emitLifecycle(createHamiltonianLifecycleObservation({
  type: "entity",
  phase: "born",
  subjectId: processEntityId,
  subjectKind: "bun-process",
  ownerId: serverEntityId,
  attributes: {
    incarnation: processIncarnation,
    pid: process.pid,
    role: processRole,
    state: "starting",
  },
}))
emitLifecycle(createHamiltonianLifecycleObservation({
  type: "transport",
  phase: "opened",
  subjectId: ipcTransportId,
  subjectKind: "ipc",
  ownerId: processEntityId,
  sourceEntityId: serverEntityId,
  targetEntityId: processEntityId,
  transportId: ipcTransportId,
  attributes: {state: "connected"},
}))

process.on("message", async (rawMessage) => {
  const message = rawMessage as ParentMessage
  if (message?.kind === "stop") {
    const stopMessageId = messageId(message)
    if (stopMessageId) observeMessage("received", stopMessageId, "stop")
    const snapshot = current?.stop() ?? null
    sendObserved({kind: "stopped", pid: process.pid, snapshot})
    emitLifecycle(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "closed",
      subjectId: ipcTransportId,
      subjectKind: "ipc",
      ownerId: processEntityId,
      sourceEntityId: serverEntityId,
      targetEntityId: processEntityId,
      transportId: ipcTransportId,
      attributes: {reason: "stopped"},
    }))
    emitLifecycle(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "ended",
      subjectId: processEntityId,
      subjectKind: "bun-process",
      ownerId: serverEntityId,
      attributes: {incarnation: processIncarnation, pid: process.pid, role: processRole, state: "stopped"},
    }))
    setTimeout(() => process.exit(0), 0)
    return
  }

  if (message?.kind !== "birth") return
  const birthMessageId = messageId(message)
  if (birthMessageId) observeMessage("received", birthMessageId, "birth")
  try {
    const actualHash = sha256Hex(message.source)
    if (actualHash !== message.sha256) throw new Error("version source SHA-256 mismatch")

    const moduleUrl = `data:text/javascript;base64,${Buffer.from(message.source).toString("base64")}`
    const loaded = await import(moduleUrl) as {
      version?: unknown
      createEmbodiment?: (context: {
        runtime: string
        role: string
        incarnation: string
        authority: EmbodimentAuthority | null
      }) => Embodiment
      describe?: () => string
    }
    if (loaded.version !== message.version) throw new Error("version source identity mismatch")
    if (typeof loaded.createEmbodiment !== "function") throw new Error("missing createEmbodiment export")
    if (typeof loaded.describe !== "function") throw new Error("missing describe export")

    current = loaded.createEmbodiment({
      runtime: "bun-process",
      role: message.role,
      incarnation: message.incarnation,
      authority: message.authority ?? null,
    })
    const snapshot = current.start()
    emitLifecycle(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: processEntityId,
      subjectKind: "bun-process",
      ownerId: serverEntityId,
      attributes: {
        incarnation: processIncarnation,
        pid: process.pid,
        role: processRole,
        state: "active",
        version: message.version,
      },
    }), birthMessageId)
    sendObserved({
      kind: "ready",
      pid: process.pid,
      version: message.version,
      sha256: actualHash,
      description: loaded.describe(),
      snapshot,
    })
  } catch (error) {
    sendObserved({kind: "error", pid: process.pid, error: error instanceof Error ? error.message : String(error)})
    setTimeout(() => process.exit(1), 0)
  }
})

process.on("disconnect", () => process.exit(0))

sendObserved({kind: "online", pid: process.pid})
