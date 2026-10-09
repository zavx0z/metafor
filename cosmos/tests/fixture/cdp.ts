import type {ProtocolMapping} from "devtools-protocol/types/protocol-mapping"

type Command = keyof ProtocolMapping.Commands
type Event = keyof ProtocolMapping.Events
type Listener = (value: never) => void

/** Test-owned CDP transport. Commands and events retain their native protocol names. */
export class CdpConnection {
  private nextId = 0
  private closed = false
  private pending = new Map<number, {resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>}>()
  private listeners = new Map<string, Set<Listener>>()
  private closeListeners = new Set<() => void>()

  private constructor(private socket: WebSocket) {
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data))
      if (message.id !== undefined) {
        const call = this.pending.get(message.id)
        if (!call) return
        this.pending.delete(message.id)
        clearTimeout(call.timer)
        if (message.error) call.reject(new Error(`CDP: ${message.error.message}`))
        else call.resolve(message.result)
      } else {
        for (const listener of this.listeners.get(`${message.sessionId ?? ""}:${message.method}`) ?? [])
          listener(message.params as never)
      }
    })
    socket.addEventListener("close", () => this.finish())
    socket.addEventListener("error", () => this.finish())
  }

  static async connect(url: string) {
    const socket = new WebSocket(url)
    const connection = new CdpConnection(socket)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error("CDP connection timed out")) }, 10_000)
      socket.addEventListener("open", () => { clearTimeout(timer); resolve() }, {once: true})
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP connection failed")) }, {once: true})
    })
    return connection
  }

  session(sessionId = "") { return new CdpSession(this, sessionId) }

  send<M extends Command>(method: M, params: object | undefined, sessionId: string): Promise<ProtocolMapping.Commands[M]["returnType"]> {
    if (this.closed) return Promise.reject(new Error("CDP connection closed"))
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP ${method} timed out`)) }, 30_000)
      this.pending.set(id, {resolve: value => resolve(value as ProtocolMapping.Commands[M]["returnType"]), reject, timer})
      this.socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}))
    })
  }

  on<M extends Event>(method: M, listener: (event: ProtocolMapping.Events[M][0]) => void, sessionId: string) {
    const key = `${sessionId}:${method}`
    const listeners = this.listeners.get(key) ?? new Set<Listener>()
    this.listeners.set(key, listeners)
    listeners.add(listener as Listener)
    return () => {
      listeners.delete(listener as Listener)
      if (listeners.size === 0) this.listeners.delete(key)
    }
  }

  close() { this.socket.close(); this.finish() }

  onClose(listener: () => void) {
    if (this.closed) queueMicrotask(listener)
    else this.closeListeners.add(listener)
    return () => { this.closeListeners.delete(listener) }
  }

  private finish() {
    if (this.closed) return
    this.closed = true
    for (const call of this.pending.values()) {
      clearTimeout(call.timer)
      call.reject(new Error("CDP connection closed"))
    }
    this.pending.clear()
    this.listeners.clear()
    for (const listener of this.closeListeners) listener()
    this.closeListeners.clear()
  }
}

export class CdpSession {
  constructor(readonly connection: CdpConnection, readonly id: string) {}

  send<M extends Command>(method: M, ...params: ProtocolMapping.Commands[M]["paramsType"]) {
    return this.connection.send(method, params[0], this.id)
  }

  on<M extends Event>(method: M, listener: (event: ProtocolMapping.Events[M][0]) => void) {
    return this.connection.on(method, listener, this.id)
  }
}

/** Evaluates a fixture assertion in its own page/worker, without handles or injected runtime. */
export async function evaluate<A extends unknown[], R>(session: CdpSession, callback: (...args: A) => R, ...args: A): Promise<Awaited<R>> {
  const expression = `(${callback.toString()})(${args.map(value => JSON.stringify(value) ?? "undefined").join(",")})`
  const result = await session.send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true})
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
  return result.result.value as Awaited<R>
}
