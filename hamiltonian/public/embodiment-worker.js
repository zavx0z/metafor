import {
  HamiltonianLifecycleRetainedJournal,
  createHamiltonianLifecycleObservation,
  emitHamiltonianLifecycle,
  hamiltonianLifecycleEntityId,
  hamiltonianLifecycleMessageId,
} from "/core/lifecycle.js"
import {hamiltonianRealmSnapshot} from "/core/monitor.js"

let current = null
let pageEntityId = null
let mainEntityId = null
let workerTransportId = null

const realm = hamiltonianRealmSnapshot()
const workerEntityId = hamiltonianLifecycleEntityId("dedicated-worker", realm.incarnation)
const workerLifecycleJournal = new HamiltonianLifecycleRetainedJournal(workerEntityId)

self.addEventListener("message", async (event) => {
  const message = event.data
  if (message?.kind === "birth") {
    if (
      message.workerEntityId !== workerEntityId ||
      typeof message.pageEntityId !== "string" ||
      !message.pageEntityId.startsWith("page:") ||
      typeof message.mainEntityId !== "string" ||
      !message.mainEntityId.startsWith("window-main:") ||
      typeof message.workerTransportId !== "string" ||
      !message.workerTransportId.startsWith("worker-message:")
    ) return
    pageEntityId = message.pageEntityId
    mainEntityId = message.mainEntityId
    workerTransportId = message.workerTransportId
    emitWorkerLifecycle(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: workerEntityId,
      subjectKind: "dedicated-worker",
      ownerId: pageEntityId,
      attributes: {incarnation: realm.incarnation, state: "evaluating"},
    }), {causedBy: lifecycleMessageId(message)})
    emitWorkerLifecycle(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: workerTransportId,
      subjectKind: "worker-message",
      ownerId: workerEntityId,
      sourceEntityId: mainEntityId,
      targetEntityId: workerEntityId,
      transportId: workerTransportId,
      attributes: {state: "active"},
    }), {causedBy: lifecycleMessageId(message)})
    self.postMessage({kind: "lifecycle-snapshot", snapshot: workerLifecycleJournal.snapshot()})
  }
  observeReceivedMessage(message)
  if (message?.kind === "stop") {
    const snapshot = current?.stop() ?? null
    send({kind: "stopped", snapshot})
    closeLifecycle("stopped")
    self.close()
    return
  }
  if (message?.kind !== "birth") return

  try {
    const loaded = await import(message.moduleUrl)
    if (loaded.version !== message.version) throw new Error("version identity mismatch")
    if (typeof loaded.createEmbodiment !== "function") throw new Error("missing createEmbodiment export")
    current = loaded.createEmbodiment({
      runtime: "dedicated-worker",
      role: "per-window",
      incarnation: message.incarnation,
    })
    const snapshot = current.start()
    emitWorkerLifecycle(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: workerEntityId,
      subjectKind: "dedicated-worker",
      ownerId: pageEntityId,
      attributes: {
        incarnation: realm.incarnation,
        embodimentIncarnation: message.incarnation,
        state: "active",
        version: loaded.version,
      },
    }), {causedBy: lifecycleMessageId(message)})
    send({
      kind: "ready",
      version: loaded.version,
      sha256: message.sha256,
      description: loaded.describe(),
      snapshot,
    })
  } catch (error) {
    send({kind: "error", error: error instanceof Error ? error.message : String(error)})
    closeLifecycle("birth-error")
    self.close()
  }
})

function send(message) {
  const messageId = hamiltonianLifecycleMessageId(crypto.randomUUID())
  if (pageEntityId && mainEntityId && workerTransportId) {
    emitWorkerLifecycle(createHamiltonianLifecycleObservation({
      type: "message",
      phase: "sent",
      subjectId: messageId,
      subjectKind: "worker-message",
      ownerId: workerEntityId,
      sourceEntityId: workerEntityId,
      targetEntityId: mainEntityId,
      transportId: workerTransportId,
      messageId,
      messageClass: lifecycleMessageClass(message?.kind),
    }))
  }
  self.postMessage({...message, monitor: {messageId}})
}

function observeReceivedMessage(message) {
  const messageId = lifecycleMessageId(message)
  if (!messageId || !pageEntityId || !mainEntityId || !workerTransportId) return
  emitWorkerLifecycle(createHamiltonianLifecycleObservation({
    type: "message",
    phase: "received",
    subjectId: messageId,
    subjectKind: "worker-message",
    ownerId: workerEntityId,
    sourceEntityId: mainEntityId,
    targetEntityId: workerEntityId,
    transportId: workerTransportId,
    messageId,
    messageClass: lifecycleMessageClass(message?.kind),
  }))
}

function closeLifecycle(reason) {
  if (pageEntityId && mainEntityId && workerTransportId) {
    emitWorkerLifecycle(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "closed",
      subjectId: workerTransportId,
      subjectKind: "worker-message",
      ownerId: workerEntityId,
      sourceEntityId: mainEntityId,
      targetEntityId: workerEntityId,
      transportId: workerTransportId,
      attributes: {reason},
    }))
  }
  emitWorkerLifecycle(createHamiltonianLifecycleObservation({
    type: "entity",
    phase: "ended",
    subjectId: workerEntityId,
    subjectKind: "dedicated-worker",
    ownerId: pageEntityId ?? workerEntityId,
    attributes: {reason, state: "ended"},
  }))
}

function emitWorkerLifecycle(observation, context = {}) {
  const envelope = emitHamiltonianLifecycle(observation, context)
  workerLifecycleJournal.observe(envelope)
  return envelope
}

function lifecycleMessageId(message) {
  return typeof message?.monitor?.messageId === "string" && message.monitor.messageId
    ? message.monitor.messageId
    : null
}

function lifecycleMessageClass(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,64}$/.test(value) ? value : "unknown"
}
