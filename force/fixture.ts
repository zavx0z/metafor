import type {ServerWebSocket} from "bun"
import type {ForceMessage, SourcedForceMessage} from "shared/protocol/force/message"

type ForceSocketData = {
  domain: string
  id: string
}

export type ForceTestClient = {
  domain: string
  id: string
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

type InternalClient = ForceTestClient & {
  socket: ServerWebSocket<ForceSocketData>
}

/**
 * Поднимает настоящий WebSocket transport для старых доменных unit fixtures.
 *
 * Identity домена читается из HTTP Upgrade. После открытия сокета fixture и
 * транспортные клиенты обмениваются только одной Particle без register или
 * replay payload.
 */
export function createForceTestFixture(): ForceTestFixture {
  const clients: InternalClient[] = []
  const messages: ForceTestMessage[] = []
  const previousForceAddress = Bun.env.FORCE_ADDRESS
  const previousForceReconnect = Bun.env.FORCE_RECONNECT
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
  let closed = false

  let server: Bun.Server<ForceSocketData> | undefined
  let lastError: unknown
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      server = Bun.serve<ForceSocketData>({
        hostname: "127.0.0.1",
        port: 45_000 + Math.floor(Math.random() * 10_000),
        routes: {
          "/ws": {
            GET(req: Bun.BunRequest<"/ws">, server: Bun.Server<ForceSocketData>) {
              const url = new URL(req.url)
              const domain = url.searchParams.get("domain")
              const id = url.searchParams.get("id")
              if (!domain || !id) return new Response("Force channel identity is required", {status: 400})
              const upgraded = server.upgrade(req, {data: {domain, id}})
              return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
            },
          },
        },
        websocket: {
          open(ws) {
            const client: InternalClient = {...ws.data, socket: ws}
            clients.push(client)
            for (const waiter of [...clientWaiters]) {
              if (waiter.domain !== client.domain) continue
              clearTimeout(waiter.timer)
              clientWaiters.delete(waiter)
              waiter.resolve(client)
            }
          },
          close(ws) {
            const index = clients.findIndex((client) => client.socket === ws)
            if (index !== -1) clients.splice(index, 1)
          },
          message(ws, raw) {
            let message: SourcedForceMessage
            try {
              message = JSON.parse(String(raw)) as SourcedForceMessage
            } catch {
              return
            }
            const client = clients.find((candidate) => candidate.socket === ws)
            if (!client) return
            const entry: ForceTestMessage = {
              client,
              domain: client.domain,
              id: client.id,
              message,
            }
            messages.push(entry)
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

  const resolveClient = (target: ForceTestClient | string): InternalClient => {
    if (typeof target !== "string") {
      const client = clients.find((candidate) => candidate === target)
      if (client) return client
      throw new Error(`Force test client is not connected: ${target.domain}`)
    }
    const client = [...clients].reverse().find((candidate) =>
      candidate.domain === target && candidate.socket.readyState === WebSocket.OPEN
    )
    if (!client) throw new Error(`Force test client is not connected: ${target}`)
    return client
  }

  const address = `ws://127.0.0.1:${new URL(server.url.href).port}/ws`
  Bun.env.FORCE_ADDRESS = address
  Bun.env.FORCE_RECONNECT = "0"

  return {
    address,
    clients,
    messages,
    waitForClient(domain, timeoutMs = 1_000) {
      const client = clients.find((candidate) => candidate.domain === domain)
      return client ? Promise.resolve(client) : this.nextClient(domain, timeoutMs)
    },
    nextClient(domain, timeoutMs = 1_000) {
      return new Promise((resolve, reject) => {
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
    waitForMessage(predicate, fromIndex = 0, timeoutMs = 1_000) {
      const match = messages.slice(fromIndex).find(predicate)
      if (match) return Promise.resolve(match)
      return new Promise((resolve, reject) => {
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
      resolveClient(target).socket.send(JSON.stringify(message))
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
