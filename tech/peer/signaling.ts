import type {PeerSignal, RelaySignalTransport} from "./contracts"
import {decoder, encoder, MAX_SIGNAL_BYTES, parseSignal, positive, validId} from "./protocol"

/** Platform routing различает прямой bootstrap и отдельную relay линию без доступа к room credential/session key. */
export type SignalingSocketContext = Readonly<{kind: "signaling"} | {kind: "relay", peerId: string, channel: string}>

/**
Локальная platform factory создаёт WebSocket; transport сохраняет admission,
reconnect, bounded queues и владение close. Browser default использует native
WebSocket. Bun caller может выбрать HTTP proxy для конкретной relay линии.
Проверки разделения sockets: [socket factory](spec/socket.spec.ts).
*/
export type SignalingSocketFactory = (url: URL, context: SignalingSocketContext) => WebSocket

/**
Один исходящий WebSocket переносит signaling; каждое приложение channel получает
отдельный opt-in relay socket к выбранному peer. Авторизация первым
сообщением держит token вне URL/snapshot. Data sockets используют opaque session
key admitted signaling session. Relay требует допуска host и клиента.
После первоначального admission relay-enabled transport повторяет подключение с
backoff 250 ms..10 s. При потере socket roster становится пустым; сообщения не
сохраняются и не replay-ятся. close отменяет reconnect. RTC lives independently.
Frames и очереди ограничены; relay send ждёт освобождения bounded socket buffer.
Проверки: [admission](spec/rendezvous.spec.ts), [relay](spec/routed.spec.ts).
*/
export async function connectWebSocketSignaling(options: {
  url: string
  id: string
  token: string
  timeoutMs?: number
  relay?: boolean
  reconnect?: boolean
  socketFactory?: SignalingSocketFactory
}): Promise<RelaySignalTransport> {
  if (!validId(options.id) || options.token.length < 16) throw new Error("Invalid rendezvous credentials")
  const timeout = positive(options.timeoutMs ?? 10_000, "rendezvous timeout")
  const url = new URL(options.url)
  if ((url.protocol !== "ws:" && url.protocol !== "wss:") || url.username || url.password)
    throw new Error("Invalid rendezvous URL")
  const createSocket = (context: SignalingSocketContext) => {
    try {return options.socketFactory ? options.socketFactory(new URL(url), context) : new WebSocket(url)}
    catch {throw new Error("Rendezvous socket creation failed")}
  }
  const listeners = new Set<(signal: PeerSignal) => void>()
  const rosterListeners = new Set<(peers: readonly string[]) => void>()
  const relayListeners = new Set<(event: {from: string, frame: string, channel?: string}) => void>()
  const relayCloseListeners = new Set<(event: {peerId: string, channel: string}) => void>()
  type DataSocket = {socket: WebSocket, ready: Promise<void>, reject: (error: Error) => void}
  const channels = new Map<string, DataSocket>()
  let sessionKey = ""
  const channelKey = (to: string, channel: string) => JSON.stringify([to, channel])
  const closeChannels = () => {
    for (const entry of channels.values()) { entry.reject(new Error("Relay signaling unavailable"))
      entry.socket.close() }
    channels.clear()
  }
  const ensureChannel = (to: string, channel: string): DataSocket => {
    if (!admitted || !relayEnabled || !sessionKey || !roster.includes(to)) throw new Error("Relay peer unavailable")
    if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(channel)) throw new Error("Invalid relay channel")
    const key = channelKey(to, channel)
    const existing = channels.get(key)
    if (existing) return existing
    if (channels.size >= 32) throw new Error("Relay channel capacity")
    const data = createSocket({kind: "relay", peerId: to, channel})
    let resolve!: () => void
    let reject!: (error: Error) => void
    const ready = new Promise<void>((yes, no) => { resolve = yes
      reject = no })
    void ready.catch(() => {})
    const entry = {socket: data, ready, reject}
    channels.set(key, entry)
    const timer = setTimeout(() => { reject(new Error("Relay channel admission timed out"))
      data.close() }, timeout)
    data.addEventListener("open", () => data.send(JSON.stringify({type: "join-channel", id: options.id, to, channel, sessionKey})))
    data.addEventListener("message", event => {
      try {
        if (typeof event.data !== "string" || encoder.encode(event.data).length > 32 * 1024) throw new Error("Invalid relay channel frame")
        const message = JSON.parse(event.data)
        if (message.type === "channel-ready") { clearTimeout(timer)
          resolve() }
        else if (message.type === "relay" && message.from === to && typeof message.frame === "string" && encoder.encode(message.frame).length <= 16 * 1024) {
          for (const listener of relayListeners) { try { listener({from: to, frame: message.frame, channel}) } catch {} }
        } else throw new Error("Invalid relay channel route")
      } catch { data.close(1008, "Invalid relay channel message") }
    })
    data.addEventListener("error", () => data.close())
    data.addEventListener("close", () => {
      clearTimeout(timer)
      reject(new Error("Relay channel closed"))
      if (channels.get(key) === entry) channels.delete(key)
      for (const listener of relayCloseListeners) { try { listener({peerId: to, channel}) } catch {} }
    })
    return entry
  }
  let relayEnabled = false
  let roster: string[] = []
  let admitted = false
  let everAdmitted = false
  let stopped = false
  let backoff = 250
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let socket!: WebSocket
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const ready = new Promise<void>((yes, no) => { resolve = yes
    reject = no })
  const changed = () => { for (const listener of rosterListeners) { try { listener(roster) } catch {} } }
  const reconnect = () => {
    if (!stopped && everAdmitted && (options.reconnect ?? options.relay ?? false)) {
      retryTimer = setTimeout(openSocket, backoff)
      backoff = Math.min(backoff * 2, 10_000)
    }
  }
  const openSocket = () => {
    let current: WebSocket
    try {current = createSocket({kind: "signaling"})}
    catch {
      reject(new Error("Rendezvous socket creation failed"))
      reconnect()
      return
    }
    socket = current
    const timer = setTimeout(() => { reject(new Error("Rendezvous admission timed out"))
      current.close() }, timeout)
    current.addEventListener("open", () => current.send(JSON.stringify({type: "join", id: options.id, token: options.token, relay: options.relay === true})))
    current.addEventListener("close", () => {
      clearTimeout(timer)
      if (socket !== current) return
      admitted = false
      roster = []
      closeChannels()
      changed()
      reject(new Error("Rendezvous connection closed before admission"))
      reconnect()
    })
    current.addEventListener("error", () => { reject(new Error("Rendezvous connection failed"))
      current.close() })
    current.addEventListener("message", event => {
      try {
        if (typeof event.data === "string" && event.data.length > MAX_SIGNAL_BYTES) throw new Error("Rendezvous message exceeds limit")
        const raw = typeof event.data === "string" ? event.data : decoder.decode(new Uint8Array(event.data))
        if (encoder.encode(raw).byteLength > MAX_SIGNAL_BYTES) throw new Error("Rendezvous message exceeds limit")
        const message = JSON.parse(raw)
        if (message.type === "peers" && Array.isArray(message.peers) && message.peers.length <= 1024 && message.peers.every(validId)) {
          relayEnabled = options.relay === true && message.relay === true
          if (options.relay && !relayEnabled) throw new Error("Rendezvous relay is disabled")
          if (relayEnabled && typeof message.sessionKey !== "string") throw new Error("Relay session key required")
          sessionKey = message.sessionKey ?? ""
          roster = [...new Set<string>(message.peers)].filter(id => id !== options.id)
          admitted = true
          everAdmitted = true
          backoff = 250
          clearTimeout(timer)
          resolve()
          changed()
        } else if (message.type === "signal" && admitted) {
          const signal = parseSignal(message.signal)
          if (signal.to !== options.id || signal.via !== undefined) throw new Error("Invalid rendezvous signal route")
          for (const listener of listeners) { try { listener(signal) } catch {} }
        } else if (message.type === "relay-channel" && admitted && relayEnabled && validId(message.from) && typeof message.channel === "string") {
          ensureChannel(message.from, message.channel)
        } else throw new Error("Invalid rendezvous message")
      } catch { current.close(1008, "Invalid signaling message") }
    })
  }
  openSocket()
  try { await ready } catch (error) { stopped = true
    socket?.close()
    throw error }
  return {
    get relayEnabled() { return relayEnabled },
    subscribeRelay(listener) { relayListeners.add(listener)
      return () => { relayListeners.delete(listener) } },
    subscribeRelayClose(listener) { relayCloseListeners.add(listener)
      return () => { relayCloseListeners.delete(listener) } },
    async sendRelay(to, frame, channel = "peer:control") {
      const entry = ensureChannel(to, channel)
      await entry.ready
      const current = entry.socket
      if (!admitted || !relayEnabled || current.readyState !== WebSocket.OPEN) throw new Error("Relay is unavailable")
      if (!validId(to) || to === options.id || !roster.includes(to)) throw new Error("Relay peer is unavailable")
      if (encoder.encode(frame).byteLength > 16 * 1024) throw new Error("Relay frame limit exceeded")
      const deadline = Date.now() + timeout
      while (current.bufferedAmount > MAX_SIGNAL_BYTES * 2) {
        if (Date.now() >= deadline || current.readyState !== WebSocket.OPEN) throw new Error("Relay backpressure timed out")
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      if (current.readyState !== WebSocket.OPEN) throw new Error("Relay is unavailable")
      current.send(JSON.stringify({type: "relay", frame}))
    },
    get open() { return admitted && socket.readyState === WebSocket.OPEN },
    peers() { return [...roster] },
    subscribe(listener) { listeners.add(listener)
      return () => { listeners.delete(listener) } },
    subscribePeers(listener) { rosterListeners.add(listener)
      return () => { rosterListeners.delete(listener) } },
    send(signal) {
      if (!admitted || socket.readyState !== WebSocket.OPEN) throw new Error("Rendezvous is unavailable")
      const parsed = parseSignal(signal)
      if (parsed.from !== options.id || parsed.via !== undefined) throw new Error("Invalid local signaling origin")
      const message = JSON.stringify({type: "signal", signal: parsed})
      if (encoder.encode(message).byteLength > MAX_SIGNAL_BYTES || socket.bufferedAmount > MAX_SIGNAL_BYTES * 4)
        throw new Error("Rendezvous send limit exceeded")
      socket.send(message)
    },
    close() {
      stopped = true
      clearTimeout(retryTimer)
      socket.close()
      admitted = false
      roster = []
      closeChannels()
      changed()
      relayCloseListeners.clear()
      relayListeners.clear()
      listeners.clear()
      rosterListeners.clear()
    },
  }
}
