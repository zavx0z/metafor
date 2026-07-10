import type {ServerWebSocket} from "bun"
import type {ForceMessage} from "@metafor/types/force/message"

type ForceSocketData = {
  domain?: string
  id?: string
}

export type ForceTestClient = {
  domain: string
  id: string
  socket: ServerWebSocket<ForceSocketData>
}

export type ForceTestMessage = {
  client: ForceTestClient
  domain: string
  id: string
  message: ForceMessage
}

export type ForceTestFixture = {
  address: string
  clients: ForceTestClient[]
  messages: ForceTestMessage[]
  waitForClient(domain: string, timeoutMs?: number): Promise<ForceTestClient>
  nextClient(domain: string, timeoutMs?: number): Promise<ForceTestClient>
  waitForMessage(
    predicate: (message: ForceTestMessage) => boolean,
    fromIndex?: number,
    timeoutMs?: number,
  ): Promise<ForceTestMessage>
  impulse(target: ForceTestClient | string, message: ForceMessage): void
  close(): void
}

const isForceMessage = (value: unknown): value is ForceMessage =>
  typeof value === "object" && value !== null &&
  Array.isArray((value as {parts?: unknown}).parts) &&
  (value as {parts: unknown[]}).parts.length === 1

export function createForceTestFixture(): ForceTestFixture {
  const clients: ForceTestClient[] = []
  const messages: ForceTestMessage[] = []
  const previousForceAddress = Bun.env.FORCE_ADDRESS
  const previousForceReconnect = Bun.env.FORCE_RECONNECT
  let closed = false
  const clientWaiters = new Set<{
    domain: string
    resolve(client: ForceTestClient): void
    reject(error: Error): void
    timer: ReturnType<typeof setTimeout>
  }>()
  const messageWaiters = new Set<{
    fromIndex: number
    predicate(message: ForceTestMessage): boolean
    resolve(message: ForceTestMessage): void
    reject(error: Error): void
    timer: ReturnType<typeof setTimeout>
  }>()

  let server: Bun.Server<ForceSocketData> | undefined
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      server = Bun.serve<ForceSocketData>({
        hostname: "127.0.0.1",
        port: 45000 + Math.floor(Math.random() * 10000),
        routes: {
          "/ws": {
            GET(req: Bun.BunRequest<"/ws">, server: Bun.Server<ForceSocketData>) {
              const upgraded = server.upgrade(req, {data: {}})
              return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
            },
          },
        },
        websocket: {
          close(ws) {
            const index = clients.findIndex((client) => client.socket === ws)
            if (index !== -1) clients.splice(index, 1)
          },
          message(ws, raw) {
            let payload: unknown
            try {
              payload = JSON.parse(String(raw)) as unknown
            } catch {
              return
            }

            if (
              typeof payload === "object" &&
              payload !== null &&
              (payload as {type?: unknown}).type === "register" &&
              typeof (payload as {domain?: unknown}).domain === "string" &&
              typeof (payload as {id?: unknown}).id === "string"
            ) {
              const client: ForceTestClient = {
                domain: (payload as {domain: string}).domain,
                id: (payload as {id: string}).id,
                socket: ws,
              }
              ws.data.domain = client.domain
              ws.data.id = client.id
              clients.push(client)

              for (const waiter of [...clientWaiters]) {
                if (waiter.domain !== client.domain) continue
                clearTimeout(waiter.timer)
                clientWaiters.delete(waiter)
                waiter.resolve(client)
              }
              return
            }

            if (!isForceMessage(payload)) return
            const client = clients.find((client) => client.socket === ws)
            if (!client) return
            const message: ForceTestMessage = {
              client,
              domain: client.domain,
              id: client.id,
              message: payload,
            }
            messages.push(message)

            for (const waiter of [...messageWaiters]) {
              const match = messages.slice(waiter.fromIndex).find(waiter.predicate)
              if (!match) continue
              clearTimeout(waiter.timer)
              messageWaiters.delete(waiter)
              waiter.resolve(match)
            }
          },
        },
      })
      break
    } catch (error) {
      lastError = error
    }
  }

  if (!server) {
    throw lastError instanceof Error ? lastError : new Error("Failed to start Force test fixture")
  }

  const resolveClient = (target: ForceTestClient | string): ForceTestClient => {
    if (typeof target !== "string") return target
    const client = [...clients].reverse().find((client) => client.domain === target && client.socket.readyState === WebSocket.OPEN)
    if (!client) throw new Error(`Force test client is not connected: ${target}`)
    return client
  }

  const send = (target: ForceTestClient | string, payload: unknown): void => {
    resolveClient(target).socket.send(JSON.stringify(payload))
  }

  const address = `ws://127.0.0.1:${new URL(server.url.href).port}/ws`
  Bun.env.FORCE_ADDRESS = address
  Bun.env.FORCE_RECONNECT = "0"

  return {
    address,
    clients,
    messages,
    waitForClient(domain, timeoutMs = 1000) {
      const client = clients.find((client) => client.domain === domain)
      if (client) return Promise.resolve(client)
      return this.nextClient(domain, timeoutMs)
    },
    nextClient(domain, timeoutMs = 1000) {
      return new Promise<ForceTestClient>((resolve, reject) => {
        const waiter = {
          domain,
          resolve,
          reject,
          timer: setTimeout(() => {
            clientWaiters.delete(waiter)
            reject(new Error(`Timed out waiting for Force test client: ${domain}`))
          }, timeoutMs),
        }
        clientWaiters.add(waiter)
      })
    },
    waitForMessage(predicate, fromIndex = 0, timeoutMs = 1000) {
      const match = messages.slice(fromIndex).find(predicate)
      if (match) return Promise.resolve(match)
      return new Promise<ForceTestMessage>((resolve, reject) => {
        const waiter = {
          fromIndex,
          predicate,
          resolve,
          reject,
          timer: setTimeout(() => {
            messageWaiters.delete(waiter)
            reject(new Error("Timed out waiting for Force test message"))
          }, timeoutMs),
        }
        messageWaiters.add(waiter)
      })
    },
    impulse(target, message) {
      send(target, message)
    },
    close() {
      if (closed) return
      closed = true
      for (const waiter of clientWaiters) {
        clearTimeout(waiter.timer)
        waiter.reject(new Error("Force test fixture closed"))
      }
      for (const waiter of messageWaiters) {
        clearTimeout(waiter.timer)
        waiter.reject(new Error("Force test fixture closed"))
      }
      clientWaiters.clear()
      messageWaiters.clear()
      for (const client of clients) client.socket.close()
      server.stop(true)
      if (previousForceAddress === undefined) delete Bun.env.FORCE_ADDRESS
      else Bun.env.FORCE_ADDRESS = previousForceAddress
      if (previousForceReconnect === undefined) delete Bun.env.FORCE_RECONNECT
      else Bun.env.FORCE_RECONNECT = previousForceReconnect
    },
  }
}
