/**
Доставка готового server release через существующий RTC DataChannel.
Transport не назначает версии, не открывает listener и не исполняет artifacts.
Контракт выпуска принадлежит [release](../../README.md#как-сменяется-выпуск).
*/
import {
  publishedReleaseGraphDigest,
  validatePublishedReleaseGraph,
  type InstalledArtifactIdentity,
} from "@metafor/tech-release/installed"
import type {ReleaseDataChannelPort, ReleasePeer, ReleasePeerOptions, ReleasePeerSource} from "./contracts"

export type {ReleaseDataChannelPort, ReleasePeer, ReleasePeerOptions, ReleasePeerSource} from "./contracts"
export {createWeriftReleaseChannel} from "./werift"

const FRAME_LIMIT = 16_384
const HEADER_SIZE = 41
const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", {fatal: true})
const digestPattern = /^[a-f0-9]{64}$/
const requestPattern = /^[a-f0-9-]{36}$/

type Request = {type: "request", id: string} & (
  | {kind: "graph", digest: string}
  | {kind: "artifact", identity: InstalledArtifactIdentity}
)
type Control = Request
  | {type: "start", id: string, size: number}
  | {type: "ack", id: string, sequence: number}
  | {type: "end", id: string, size: number}
  | {type: "complete", id: string}
  | {type: "cancel", id: string}
  | {type: "error", id: string}

type Receiver = {
  id: string
  size: number | undefined
  limit: number
  received: number
  sequence: number
  started: boolean
  queue: AsyncQueue<Uint8Array>
  timer: ReturnType<typeof setTimeout> | undefined
  dispose(): void
}
type Sender = {
  abort: AbortController
  expectedAck: number | undefined
  ack: Deferred<void> | undefined
  timer: ReturnType<typeof setTimeout> | undefined
}

/**
Обслуживает ограниченное число запросов на одном borrowed connected channel.
Каждый stream имеет один chunk в полёте: ACK выдаётся после потребления chunk.
Прерывание iterator, timeout и disconnect отменяют request и освобождают source.
*/
export function createReleasePeer(channel: ReleaseDataChannelPort, options: ReleasePeerOptions = {}): ReleasePeer {
  const timeoutMs = positive(options.timeoutMs ?? 30_000, "timeoutMs")
  const maxRequests = positive(options.maxRequests ?? 8, "maxRequests")
  const maxGraphBytes = positive(options.maxGraphBytes ?? 4 * 1024 * 1024, "maxGraphBytes")
  const maxBufferedBytes = positive(options.maxBufferedBytes ?? 64 * 1024, "maxBufferedBytes")
  const limit = Math.min(FRAME_LIMIT, channel.maxMessageSize > 0 ? channel.maxMessageSize : FRAME_LIMIT)
  if (!Number.isSafeInteger(limit) || limit <= HEADER_SIZE) throw new Error("RTC message limit is too small")
  if (channel.readyState !== "open") throw new Error("Release RTC channel is not open")
  const receivers = new Map<string, Receiver>()
  const senders = new Map<string, Sender>()
  const drain = new Set<Deferred<void>>()
  const idle = new Set<Deferred<void>>()
  const notifyIdle = () => {
    if (receivers.size !== 0 || senders.size !== 0) return
    for (const waiter of idle) waiter.resolve(undefined)
    idle.clear()
  }
  let source: ReleasePeerSource | undefined
  let closed = false
  let unsubscribe = () => {}

  const send = (message: Control) => {
    const body = encoder.encode(JSON.stringify(message))
    const frame = new Uint8Array(body.length + 1)
    frame.set(body, 1)
    sendFrame(frame)
  }
  const sendFrame = (frame: Uint8Array) => {
    if (closed || channel.readyState !== "open") throw new Error("Release RTC channel disconnected")
    if (frame.byteLength > limit) throw new Error("Release RTC frame exceeds message limit")
    if (channel.bufferedAmount + frame.byteLength > maxBufferedBytes) throw new Error("Release RTC send buffer limit exceeded")
    channel.send(frame)
  }
  const bestEffort = (message: Control) => { try { send(message) } catch {} }
  const removeReceiver = (receiver: Receiver, error?: unknown) => {
    if (!receivers.delete(receiver.id)) return
    clearTimeout(receiver.timer)
    receiver.dispose()
    if (error !== undefined) receiver.queue.fail(asError(error))
    notifyIdle()
  }
  const touchReceiver = (receiver: Receiver) => {
    clearTimeout(receiver.timer)
    receiver.timer = setTimeout(() => {
      bestEffort({type: "cancel", id: receiver.id})
      removeReceiver(receiver, new Error("Release peer request timed out"))
    }, timeoutMs)
  }
  const stopSender = (id: string, reason: unknown) => {
    const sender = senders.get(id)
    if (!sender) return
    clearTimeout(sender.timer)
    sender.abort.abort(asError(reason))
    sender.ack?.reject(asError(reason))
  }
  const close = (reason: unknown = new Error("Release peer closed")) => {
    if (closed) return
    for (const receiver of receivers.values()) bestEffort({type: "cancel", id: receiver.id})
    closed = true
    unsubscribe()
    for (const receiver of receivers.values()) removeReceiver(receiver, reason)
    for (const id of senders.keys()) stopSender(id, reason)
    for (const waiter of drain) waiter.reject(asError(reason))
    drain.clear()
    source = undefined
  }
  const waitDrain = async (size: number, signal: AbortSignal) => {
    while (channel.bufferedAmount + size > maxBufferedBytes) {
      const waiter = deferred<void>()
      drain.add(waiter)
      try { await interrupted(waiter.promise, signal) } finally { drain.delete(waiter) }
    }
  }
  const sendAcknowledged = async (sender: Sender, id: string, sequence: number, frame: Uint8Array) => {
    sender.expectedAck = sequence
    sender.ack = deferred<void>()
    const waiting = sender.ack.promise
    // Наблюдатель ошибки устанавливается до send, включая синхронный отказ carrier.
    void waiting.catch(() => {})
    clearTimeout(sender.timer)
    sender.timer = setTimeout(() => stopSender(id, new Error("Release peer ACK timed out")), timeoutMs)
    await waitDrain(frame.byteLength, sender.abort.signal)
    sendFrame(frame)
    await interrupted(waiting, sender.abort.signal)
    clearTimeout(sender.timer)
    sender.ack = undefined
    sender.expectedAck = undefined
  }
  const controlFrame = (message: Control) => {
    const bytes = encoder.encode(JSON.stringify(message))
    const frame = new Uint8Array(bytes.length + 1)
    frame.set(bytes, 1)
    return frame
  }
  const serveRequest = async (request: Request, owner: ReleasePeerSource) => {
    const sender: Sender = {abort: new AbortController(), expectedAck: undefined, ack: undefined, timer: undefined}
    senders.set(request.id, sender)
    try {
      let bytes: Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
      let size: number
      if (request.kind === "graph") {
        const graph = validatePublishedReleaseGraph(await interrupted(owner.readGraph(request.digest), sender.abort.signal))
        if (publishedReleaseGraphDigest(graph) !== request.digest) throw new Error("Release graph digest mismatch")
        bytes = encoder.encode(JSON.stringify(graph))
        size = bytes.byteLength
        if (size > maxGraphBytes) throw new Error("Release graph exceeds limit")
      } else {
        size = request.identity.size
        bytes = await interrupted(owner.read(request.identity), sender.abort.signal)
      }
      await sendAcknowledged(sender, request.id, -1, controlFrame({type: "start", id: request.id, size}))
      let sent = 0
      let sequence = 0
      for await (const chunk of sourceChunks(bytes, sender.abort.signal)) {
        for (let offset = 0; offset < chunk.byteLength; offset += limit - HEADER_SIZE) {
          const part = chunk.subarray(offset, Math.min(offset + limit - HEADER_SIZE, chunk.byteLength))
          if (sent + part.byteLength > size) throw new Error("Release source exceeds expected size")
          const frame = new Uint8Array(HEADER_SIZE + part.byteLength)
          frame[0] = 1
          frame.set(encoder.encode(request.id), 1)
          new DataView(frame.buffer).setUint32(37, sequence)
          frame.set(part, HEADER_SIZE)
          await sendAcknowledged(sender, request.id, sequence, frame)
          sent += part.byteLength
          sequence += 1
          if (sequence > 0xffffffff) throw new Error("Release stream sequence exhausted")
        }
      }
      if (sent !== size) throw new Error("Release source ended before expected size")
      await sendAcknowledged(sender, request.id, -2, controlFrame({type: "end", id: request.id, size: sent}))
    } catch {
      if (!sender.abort.signal.aborted) bestEffort({type: "error", id: request.id})
    } finally {
      clearTimeout(sender.timer)
      if (senders.get(request.id) === sender) senders.delete(request.id)
      sender.abort.abort(new Error("Release source complete"))
      notifyIdle()
    }
  }
  const onControl = (message: Control) => {
    if (message.type === "request") {
      if (!source || senders.has(message.id) || senders.size >= maxRequests) {
        bestEffort({type: "error", id: message.id})
        return
      }
      void serveRequest(message, source)
      return
    }
    if (message.type === "ack" || message.type === "complete") {
      const sender = senders.get(message.id)
      const sequence = message.type === "complete" ? -2 : message.sequence
      if (sender && sender.expectedAck !== sequence) throw new Error("Unexpected release ACK sequence")
      sender?.ack?.resolve(undefined)
      return
    }
    if (message.type === "cancel") {
      stopSender(message.id, new Error("Release request cancelled by receiver"))
      return
    }
    const receiver = receivers.get(message.id)
    if (!receiver) return
    touchReceiver(receiver)
    if (message.type === "error") {
      removeReceiver(receiver, new Error("Remote release source failed"))
    } else if (message.type === "start") {
      if (receiver.started || message.size > receiver.limit || receiver.size !== undefined && message.size !== receiver.size)
        throw new Error("Release response size mismatch")
      receiver.started = true
      receiver.size = message.size
      send({type: "ack", id: message.id, sequence: -1})
    } else if (message.type === "end") {
      if (!receiver.started || message.size !== receiver.size || receiver.received !== receiver.size)
        throw new Error("Release response ended with a different size")
      receiver.queue.end()
      send({type: "complete", id: message.id})
      removeReceiver(receiver)
    }
  }
  const onMessage = (frame: Uint8Array) => {
    try {
      if (frame.byteLength === 0 || frame.byteLength > limit) throw new Error("Invalid release RTC frame size")
      if (frame[0] === 0) {
        onControl(parseControl(JSON.parse(decoder.decode(frame.subarray(1)))))
      } else if (frame[0] === 1 && frame.byteLength > HEADER_SIZE) {
        const id = decoder.decode(frame.subarray(1, 37))
        const receiver = receivers.get(id)
        if (!receiver) return
        const sequence = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(37)
        const part = frame.subarray(HEADER_SIZE)
        if (!receiver.started || sequence !== receiver.sequence || receiver.received + part.byteLength > receiver.size!)
          throw new Error("Release binary frame is out of sequence or exceeds expected size")
        receiver.sequence += 1
        receiver.received += part.byteLength
        receiver.queue.push(Uint8Array.from(part))
        touchReceiver(receiver)
      } else throw new Error("Unknown release RTC frame")
    } catch (error) { close(error) }
  }
  unsubscribe = channel.subscribe({
    message: onMessage,
    close: () => close(new Error("Release RTC channel disconnected")),
    error: close,
    bufferedAmountLow: () => { for (const waiter of drain) waiter.resolve(undefined) },
  })

  const receive = async function* (
    request: Omit<Extract<Request, {kind: "graph"}>, "id"> | Omit<Extract<Request, {kind: "artifact"}>, "id">,
    requestOptions: {signal?: AbortSignal} = {},
  ): AsyncGenerator<Uint8Array> {
    requestOptions.signal?.throwIfAborted()
    if (closed || channel.readyState !== "open") throw new Error("Release RTC channel disconnected")
    if (receivers.size >= maxRequests) throw new Error("Release peer pending request limit exceeded")
    const id = crypto.randomUUID()
    const receiver: Receiver = {
      id,
      size: request.kind === "artifact" ? request.identity.size : undefined,
      limit: request.kind === "artifact" ? request.identity.size : maxGraphBytes,
      received: 0,
      sequence: 0,
      started: false,
      queue: new AsyncQueue(),
      timer: undefined,
      dispose: () => requestOptions.signal?.removeEventListener("abort", abort),
    }
    const abort = () => {
      bestEffort({type: "cancel", id})
      removeReceiver(receiver, requestOptions.signal?.reason ?? new Error("Release request aborted"))
    }
    receivers.set(id, receiver)
    requestOptions.signal?.addEventListener("abort", abort, {once: true})
    touchReceiver(receiver)
    let completed = false
    try {
      send({...request, id} as Request)
      let sequence = 0
      for await (const part of receiver.queue) {
        yield part
        send({type: "ack", id, sequence: sequence++})
      }
      completed = true
    } finally {
      if (!completed) bestEffort({type: "cancel", id})
      removeReceiver(receiver)
    }
  }
  const readArtifact = (identity: InstalledArtifactIdentity, requestOptions: {signal?: AbortSignal} = {}) => {
    validateIdentity(identity)
    return receive({type: "request", kind: "artifact", identity}, requestOptions)
  }
  return {
    async getGraph(expectedDigest, requestOptions = {}) {
      if (!digestPattern.test(expectedDigest)) throw new Error("Invalid expected release digest")
      const chunks: Uint8Array[] = []
      let size = 0
      for await (const part of receive({type: "request", kind: "graph", digest: expectedDigest}, requestOptions)) {
        chunks.push(part)
        size += part.byteLength
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const part of chunks) {
        bytes.set(part, offset)
        offset += part.byteLength
      }
      const graph = validatePublishedReleaseGraph(JSON.parse(decoder.decode(bytes)))
      if (publishedReleaseGraphDigest(graph) !== expectedDigest) throw new Error("Release graph digest mismatch")
      return graph
    },
    read: async identity => readArtifact(identity),
    readArtifact,
    serve(owner) {
      if (source) throw new Error("Release peer source is already attached")
      if (closed) throw new Error("Release peer closed")
      source = owner
      return () => {
        if (source !== owner) return
        source = undefined
        for (const id of senders.keys()) stopSender(id, new Error("Release source detached"))
      }
    },
    whenIdle() {
      if (receivers.size === 0 && senders.size === 0) return Promise.resolve()
      const waiter = deferred<void>()
      idle.add(waiter)
      return waiter.promise
    },
    close,
  }
}

function parseControl(value: unknown): Control {
  if (!record(value) || typeof value.type !== "string" || typeof value.id !== "string" || !requestPattern.test(value.id))
    throw new Error("Invalid release control frame")
  if (value.type === "request") {
    if (value.kind === "graph" && typeof value.digest === "string" && digestPattern.test(value.digest)) return value as unknown as Request
    if (value.kind === "artifact") {
      validateIdentity(value.identity)
      return value as unknown as Request
    }
  }
  if ((value.type === "start" || value.type === "end") && Number.isSafeInteger(value.size) && Number(value.size) >= 0) return value as unknown as Control
  if (value.type === "ack" && Number.isSafeInteger(value.sequence) && Number(value.sequence) >= -1) return value as unknown as Control
  if (["complete", "cancel", "error"].includes(value.type)) return value as unknown as Control
  throw new Error("Unknown release control frame")
}

function validateIdentity(value: unknown): asserts value is InstalledArtifactIdentity {
  if (!record(value) || !["name", "version", "env", "artifact"].every(key => typeof value[key] === "string") ||
    typeof value.sha256 !== "string" || !digestPattern.test(value.sha256) || !Number.isSafeInteger(value.size) || Number(value.size) < 0)
    throw new Error("Invalid release artifact identity")
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value) }
function positive(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`)
  return value
}
function asError(value: unknown) { return value instanceof Error ? value : new Error(String(value)) }
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return {promise, resolve, reject}
}
type Deferred<T> = ReturnType<typeof deferred<T>>

function interrupted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, {once: true})
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
  })
}

async function* sourceChunks(value: Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>, signal: AbortSignal): AsyncGenerator<Uint8Array> {
  if (value instanceof Uint8Array) {
    signal.throwIfAborted()
    yield value
    return
  }
  if (value instanceof ReadableStream) {
    const reader = value.getReader()
    let ended = false
    try {
      while (true) {
        const next = await interrupted(reader.read(), signal)
        if (next.done) {
          ended = true
          return
        }
        if (!(next.value instanceof Uint8Array)) throw new Error("Release source must yield bytes")
        yield next.value
      }
    } finally {
      if (!ended) await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  } else {
    const iterator = value[Symbol.asyncIterator]()
    try {
      while (true) {
        const next = await interrupted(iterator.next(), signal)
        if (next.done) return
        if (!(next.value instanceof Uint8Array)) throw new Error("Release source must yield bytes")
        yield next.value
      }
    } finally { await iterator.return?.() }
  }
}

class AsyncQueue<T> implements AsyncIterable<T> {
  #value: T | undefined
  #waiting: Deferred<IteratorResult<T>> | undefined
  #done = false
  #error: Error | undefined
  push(value: T) {
    if (this.#done || this.#value !== undefined) throw new Error("Release receiver queue limit exceeded")
    if (this.#waiting) {
      const waiting = this.#waiting
      this.#waiting = undefined
      waiting.resolve({done: false, value})
    }
    else this.#value = value
  }
  end() {
    this.#done = true
    this.#waiting?.resolve({done: true, value: undefined})
    this.#waiting = undefined
  }
  fail(error: Error) {
    this.#error = error
    this.#done = true
    this.#waiting?.reject(error)
    this.#waiting = undefined
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {next: async () => {
      if (this.#error) throw this.#error
      if (this.#value !== undefined) {
        const value = this.#value
        this.#value = undefined
        return {done: false, value}
      }
      if (this.#done) return {done: true, value: undefined}
      this.#waiting = deferred()
      return this.#waiting.promise
    }}
  }
}
