import type {ServerWebSocket} from "bun"
import {randomUUID, timingSafeEqual} from "node:crypto"
import {decoder, encoder, MAX_SIGNAL_BYTES, parseSignal, positive, validId} from "./protocol"

/** Discriminant позволяет host маршрутизировать общий WebSocket union без раскрытия admission state. */
export interface RendezvousSession {
  readonly kind: "peer-signaling"
}

/** Room token разрешает вход в группу; path принадлежит host HTTP composition. */
export interface RendezvousOptions {
  token: string
  relay?: boolean
  path?: string
  maxPeers?: number
  maxSessions?: number
  authTimeoutMs?: number
}

/**
Встраиваемый Bun handler владеет только выпущенными им session data и sockets.
upgrade возвращает undefined при успешном WebSocket upgrade, иначе HTTP response.
Host передаёт свой server.upgrade и диспетчеризует callbacks через owns(data).
close прекращает admission и закрывает только собственные signaling sockets;
HTTP listener и чужие WebSocket остаются у host. Рекомендуемые Bun options можно
согласовать с лимитами остальных host routes: handler проверяет свои caps сам.
Проверки общей HTTP/WS композиции: [rendezvous](spec/rendezvous.spec.ts).
*/
export interface RendezvousHandler {
  upgrade(request: Request, upgradeFn: (request: Request, data: RendezvousSession) => boolean): Response | undefined
  owns(data: unknown): data is RendezvousSession
  readonly websocket: {
    open(socket: ServerWebSocket<unknown>): void
    message(socket: ServerWebSocket<unknown>, raw: string | Uint8Array): void
    close(socket: ServerWebSocket<unknown>, code?: number, reason?: string): void
  }
  readonly recommendedWebSocketOptions: {
    maxPayloadLength: number
    idleTimeout: number
    backpressureLimit: number
    closeOnBackpressureLimit: boolean
  }
  close(): void
}

type Socket = ServerWebSocket<unknown>
type SessionState = {
  socket?: Socket
  id?: string
  relay?: boolean
  sessionKey?: string
  channel?: string
  remote?: string
  timer?: ReturnType<typeof setTimeout>
  started: number
  messages: number
}

/**
Общий rendezvous admission и routing для существующего Bun server. From
назначается сервером по admitted session, duplicate identity отвергается.
Sessions, peers, frames и частота ограничены; token/SDP/payload не логируются.
Это допуск в доверенную группу, не cryptographic identity устройства.
[Связи участников](README.md) продолжают жить после закрытия bootstrap.
*/
export function createRendezvousHandler(options: RendezvousOptions): RendezvousHandler {
  if (options.token.length < 16 || options.token.length > 4096) throw new Error("Rendezvous requires a room token")
  const path = options.path ?? "/peer"
  if (!path.startsWith("/") || /[?#]/.test(path) || path.length > 256) throw new Error("Invalid rendezvous path")
  const maxPeers = positive(options.maxPeers ?? 32, "rendezvous peer limit")
  if (maxPeers > 1024) throw new Error("Rendezvous peer limit exceeds 1024")
  const maxSessions = positive(options.maxSessions ?? maxPeers * (options.relay ? 34 : 2), "rendezvous session limit")
  const authTimeout = positive(options.authTimeoutMs ?? 5_000, "rendezvous auth timeout")
  const tokenBytes = encoder.encode(options.token)
  const peers = new Map<string, Socket>()
  const channels = new Map<string, Socket>()
  const key = (id: string, remote: string, channel: string) => JSON.stringify([id, remote, channel])
  const sessions = new Map<RendezvousSession, SessionState>()
  const owned = new WeakSet<object>()
  let stopping = false
  const owns = (data: unknown): data is RendezvousSession =>
    typeof data === "object" && data !== null && owned.has(data)
  const remove = (data: RendezvousSession, state: SessionState) => {
    clearTimeout(state.timer)
    sessions.delete(data)
    if (state.id && state.channel && state.remote) {
      channels.delete(key(state.id, state.remote, state.channel))
      channels.get(key(state.remote, state.id, state.channel))?.close(1001, "Relay channel closed")
    } else if (state.id && peers.get(state.id) === state.socket) {
      peers.delete(state.id)
      for (const [data, child] of sessions) if (child.channel && (child.id === state.id || child.remote === state.id)) {
        channels.delete(key(child.id!, child.remote!, child.channel))
        clearTimeout(child.timer)
        sessions.delete(data)
        child.socket?.close(1001, "Relay participant left")
      }
    }
  }
  const roster = () => {
    for (const socket of peers.values()) {
      const state = sessions.get(socket.data as RendezvousSession)
      const message = JSON.stringify({type: "peers", peers: [...peers.keys()].sort(), relay: state?.relay === true, ...(state?.sessionKey ? {sessionKey: state.sessionKey} : {})})
      if (socket.getBufferedAmount() > MAX_SIGNAL_BYTES * 4) socket.close(1008, "Signaling queue limit")
      else socket.send(message)
    }
  }
  return {
    owns,
    recommendedWebSocketOptions: {
      maxPayloadLength: MAX_SIGNAL_BYTES,
      idleTimeout: 120,
      backpressureLimit: MAX_SIGNAL_BYTES * 4,
      closeOnBackpressureLimit: true,
    },
    upgrade(request, upgradeFn) {
      if (new URL(request.url).pathname !== path) return new Response("Not found", {status: 404})
      if (stopping || sessions.size >= maxSessions) return new Response("Rendezvous capacity", {status: 503})
      const data: RendezvousSession = {kind: "peer-signaling"}
      const state: SessionState = {started: Date.now(), messages: 0}
      owned.add(data)
      sessions.set(data, state)
      state.timer = setTimeout(() => {
        if (state.socket) state.socket.close(1008, "Admission required")
        else remove(data, state)
      }, authTimeout)
      try {
        if (upgradeFn(request, data)) return undefined
      } catch (error) { remove(data, state)
        throw error }
      remove(data, state)
      return new Response("WebSocket required", {status: 426})
    },
    websocket: {
      open(socket) {
        if (!owns(socket.data)) return
        const state = sessions.get(socket.data)
        if (!state || stopping || state.socket) { socket.close(1001, "Rendezvous unavailable")
          return }
        state.socket = socket
      },
      message(socket, raw) {
        if (!owns(socket.data)) return
        const state = sessions.get(socket.data)
        if (!state || state.socket !== socket || stopping) { socket.close(1001, "Rendezvous unavailable")
          return }
        try {
          const now = Date.now()
          if (now - state.started > 1000) { state.started = now
            state.messages = 0 }
          if (++state.messages > (state.relay ? 4096 : 128)) throw new Error("Signaling rate limit")
          if ((typeof raw === "string" ? raw.length : raw.byteLength) > MAX_SIGNAL_BYTES)
            throw new Error("Signaling frame limit")
          const text = typeof raw === "string" ? raw : decoder.decode(raw)
          if (encoder.encode(text).byteLength > MAX_SIGNAL_BYTES) throw new Error("Signaling frame limit")
          const message = JSON.parse(text)
          if (!state.id) {
            if (message.type === "join-channel") {
              const main = peers.get(message.id)
              const parent = main ? sessions.get(main.data as RendezvousSession) : undefined
              if (!options.relay || !parent?.relay || typeof message.sessionKey !== "string" || message.sessionKey !== parent.sessionKey ||
                !validId(message.to) || message.to === message.id || typeof message.channel !== "string" ||
                !/^[a-zA-Z0-9_.:-]{1,128}$/.test(message.channel)) throw new Error("Relay channel admission rejected")
              const target = peers.get(message.to)
              if (!target || !sessions.get(target.data as RendezvousSession)?.relay) throw new Error("Relay peer unavailable")
              const address = key(message.id, message.to, message.channel)
              if (channels.has(address) || [...sessions.values()].filter(s => s.id === message.id && s.channel).length >= 32)
                throw new Error("Relay channel capacity")
              state.id = message.id
              state.remote = message.to
              state.channel = message.channel
              state.relay = true
              clearTimeout(state.timer)
              channels.set(address, socket)
              const counterpart = channels.get(key(message.to, message.id, message.channel))
              if (counterpart) {
                socket.send(JSON.stringify({type: "channel-ready"}))
                counterpart.send(JSON.stringify({type: "channel-ready"}))
              } else target.send(JSON.stringify({type: "relay-channel", from: message.id, channel: message.channel}))
              return
            }
            if (message.type !== "join" || !validId(message.id) || typeof message.token !== "string") throw new Error("Admission required")
            const supplied = encoder.encode(message.token)
            if (supplied.length !== tokenBytes.length || !timingSafeEqual(supplied, tokenBytes)) throw new Error("Admission rejected")
            if (peers.has(message.id) || peers.size >= maxPeers) throw new Error("Identity unavailable")
            state.id = message.id
            state.relay = options.relay === true && message.relay === true
            if (state.relay) state.sessionKey = randomUUID()
            clearTimeout(state.timer)
            peers.set(message.id, socket)
            roster()
          } else {
            if (state.channel) {
              if (message.type !== "relay" || typeof message.frame !== "string" || encoder.encode(message.frame).byteLength > 16 * 1024)
                throw new Error("Relay channel frame rejected")
              const target = channels.get(key(state.remote!, state.id!, state.channel))
              if (!target || target.getBufferedAmount() > MAX_SIGNAL_BYTES * 4) throw new Error("Relay channel unavailable")
              target.send(JSON.stringify({type: "relay", from: state.id, frame: message.frame}))
              return
            }
            if (message.type !== "signal") throw new Error("Signal required")
            // Авторизованная сессия задаёт origin; RTC introducer здесь не назначается.
            const signal = parseSignal({...message.signal, from: state.id, via: undefined})
            const target = peers.get(signal.to)
            if (target) {
              if (target.getBufferedAmount() > MAX_SIGNAL_BYTES * 4) target.close(1008, "Signaling queue limit")
              else target.send(JSON.stringify({type: "signal", signal}))
            }
          }
        } catch { socket.close(1008, "Signaling rejected") }
      },
      close(socket) {
        if (!owns(socket.data)) return
        const state = sessions.get(socket.data)
        if (!state) return
        remove(socket.data, state)
        if (!stopping && !state.channel) roster()
      },
    },
    close() {
      if (stopping) return
      stopping = true
      for (const [data, state] of sessions) {
        remove(data, state)
        state.socket?.close(1001, "Rendezvous shutdown")
      }
    },
  }
}

/** Standalone wrapper использует общий handler и дополнительно закрывает собственный HTTP listener. */
export function createRendezvousServer(options: RendezvousOptions & {hostname?: string, port?: number}) {
  const handler = createRendezvousHandler(options)
  const server = Bun.serve<RendezvousSession>({
    hostname: options.hostname ?? "127.0.0.1", port: options.port ?? 0,
    fetch(request, server) { return handler.upgrade(request, (request, data) => server.upgrade(request, {data})) },
    websocket: {...handler.recommendedWebSocketOptions, ...handler.websocket},
  })
  const hostname = server.hostname ?? "127.0.0.1"
  return {
    url: `ws://${hostname.includes(":") ? `[${hostname}]` : hostname}:${server.port}${options.path ?? "/peer"}`,
    async close() {
      handler.close()
      await server.stop(true)
    },
  }
}
