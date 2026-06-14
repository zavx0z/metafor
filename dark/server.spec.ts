import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {SQL, type ServerWebSocket} from "bun"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import type {ForceMessage, ForceMessageHandler} from "../store/index.ts"

type ForceSocketData = {kind: "force"}

const logBroadcastMessage = (event: MessageEvent<unknown>): void => {
  console.log("[force]", JSON.stringify(event.data, null, 2))
}

describe("dark/server разворачивает дерево zavx0z/git по gravity part", () => {
  let storePath: string
  let previousOnMessage: ForceMessageHandler = null
  let forceBridge: ReturnType<typeof Bun.serve<ForceSocketData>> | null = null
  let forceClient: WebSocket | null = null
  const forceSockets = new Set<ServerWebSocket<ForceSocketData>>()
  const storeMessages: ForceMessage[] = []
  const forceMessages: ForceMessage[] = []

  beforeAll(async () => {
    // Файл не удаляем после теста, чтобы результат разложения git можно было осмотреть руками.
    const tmpDir = join(import.meta.dir, "tmp")
    mkdirSync(tmpDir, {recursive: true})
    storePath = join(tmpDir, "boundary.sqlite")

    // Предыдущий аварийный запуск мог оставить sqlite sidecar-файлы на диске.
    // Чистим их перед импортом server.ts, потому что server.ts открывает store на этапе import.
    rmSync(storePath, {force: true})
    rmSync(`${storePath}-shm`, {force: true})
    rmSync(`${storePath}-wal`, {force: true})

    process.env.STORE_PATH = storePath
    await import("./server.ts")

    forceBridge = Bun.serve<ForceSocketData>({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req, server) {
        const url = new URL(req.url)
        if (url.pathname !== "/ws") return new Response("ok")

        const upgraded = server.upgrade(req, {data: {kind: "force"}})
        return upgraded ? undefined : new Response("WebSocket upgrade failed", {status: 426})
      },
      websocket: {
        open(ws) {
          forceSockets.add(ws)
        },
        close(ws) {
          forceSockets.delete(ws)
        },
      },
    })

    const bridgeUrl = new URL(forceBridge.url)
    bridgeUrl.protocol = "ws:"
    bridgeUrl.pathname = "/ws"
    forceClient = new WebSocket(bridgeUrl)
    forceClient.addEventListener("message", (event) => {
      forceMessages.push(JSON.parse(String(event.data)) as ForceMessage)
    })
    await waitForWebSocketOpen(forceClient)

    previousOnMessage = globalThis.store.onmessage
    globalThis.store.onmessage = function (event) {
      logBroadcastMessage(event)
      storeMessages.push(event.data)
      broadcastForceMessage(forceSockets, event.data)
      return previousOnMessage?.call(this, event)
    }
  })

  afterAll(async () => {
    if (globalThis.store) globalThis.store.onmessage = previousOnMessage
    forceClient?.close()
    forceSockets.clear()
    await forceBridge?.stop(true)
  })

  test("после add wimp zavx0z/git store содержит каноническое дерево git", async () => {
    const inputMessage: ForceMessage = {
      parts: [{part: "graviton", op: "add", path: "wimp", value: "zavx0z/git"}],
    }
    globalThis.store.postMessage(inputMessage)

    const bridgedMessage = await waitForForceMessage(forceMessages, (message) =>
      message.parts.some((part) => part.part === "graviton" && part.op === "add" && part.path === "wimp" && part.value === "zavx0z/git"),
    )
    expect(bridgedMessage).toEqual(inputMessage)

    // ждём пока Dark материализует root wimp + child wimps в БД
    const sql = new SQL(`sqlite://${storePath}`)
    const deadline = Date.now() + 30_000
    let materialized = false
    while (Date.now() < deadline) {
      try {
        // git-history-commit появляется до завершения root matter graph;
        // git-error приходит из later logical branch, поэтому ждём оба sentinel.
        const rows = await sql<Array<{src: string}>>`
          SELECT src FROM wimp
          WHERE src IN ('zavx0z/git-history-commit', 'zavx0z/git-error')
        `
        const srcs = new Set(rows.map((row) => row.src))
        if (srcs.has("zavx0z/git-history-commit") && srcs.has("zavx0z/git-error")) {
          materialized = true
          break
        }
      } catch {
        // БД может быть ещё не записана/locked
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(materialized, "Dark должен был материализовать дерево zavx0z/git").toBe(true)

    const actorMessage = storeMessages.find((message) =>
      message.parts.some((part) => part.part === "graviton" && part.op === "add" && part.path === "actor"),
    )
    expect(actorMessage, "Store должен был отправить runtime actor part").toBeDefined()
    const actorMessagePayload = JSON.stringify(actorMessage)
    const bridgedActorMessage = await waitForForceMessage(
      forceMessages,
      (message) => JSON.stringify(message) === actorMessagePayload,
    )
    expect(bridgedActorMessage).toEqual(actorMessage)

    try {
      const wimpRows = await sql<Array<{src: string}>>`SELECT src FROM wimp ORDER BY src`
      const srcs = wimpRows.map((row) => row.src)

      expect(srcs).toContain("zavx0z/git")
      expect(srcs).toContain("zavx0z/git-start")
      expect(srcs).toContain("zavx0z/git-error")
      expect(srcs).toContain("zavx0z/git-history-commit")

      const actorRows = await sql<Array<{uuid: string; wimp: string}>>`SELECT uuid, wimp FROM actor`
      const stateRows = await sql<Array<{actor: string}>>`SELECT actor FROM actor_state`
      const valueRows = await sql<Array<{value: string}>>`SELECT DISTINCT value FROM actor_value`

      expect(actorRows.length, "должно быть материализовано >20 акторов").toBeGreaterThan(20)
      expect(stateRows.length, "у каждого актора должна быть строка actor_state").toBe(actorRows.length)
      expect(valueRows.length, "должны быть записи в value через gluon").toBeGreaterThan(0)

      // root актор — единственный без parent, его wimp = zavx0z/git
      const rootRows = await sql<Array<{wimp: string}>>`
        SELECT wimp FROM actor WHERE parent_actor IS NULL AND parent_topology IS NULL
      `
      expect(rootRows.length).toBe(1)
      expect(rootRows[0]?.wimp).toBe("zavx0z/git")

    } finally {
      await sql.close()
    }
  }, 60_000)

  test("повторный add wimp zavx0z/git идемпотентен — server пропускает уже залитый root", async () => {
    const sql = new SQL(`sqlite://${storePath}`)
    const before = await waitForActorCountStable(sql)

    globalThis.store.postMessage({
      parts: [{part: "graviton", op: "add", path: "wimp", value: "zavx0z/git"}],
    })

    // даём server'у тик — если бы он начал загрузку, он бы уехал в matter()
    await new Promise((resolve) => setTimeout(resolve, 200))

    const after = await waitForActorCountStable(sql)
    expect(after).toBe(before)
    await sql.close()
  })
})

async function actorCount(sql: SQL): Promise<number> {
  return (await sql<Array<{count: number}>>`SELECT COUNT(*) AS count FROM actor`)[0]?.count ?? 0
}

function broadcastForceMessage(sockets: Set<ServerWebSocket<ForceSocketData>>, message: ForceMessage): void {
  const payload = JSON.stringify(message)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(payload)
  }
}

async function waitForWebSocketOpen(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.OPEN) return

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("force bridge websocket did not open")), 5_000)
    socket.addEventListener("open", () => {
      clearTimeout(timeout)
      resolve()
    }, {once: true})
    socket.addEventListener("error", () => {
      clearTimeout(timeout)
      reject(new Error("force bridge websocket failed"))
    }, {once: true})
  })
}

async function waitForForceMessage(
  messages: ForceMessage[],
  predicate: (message: ForceMessage) => boolean,
): Promise<ForceMessage> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const message = messages.find(predicate)
    if (message) return message
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("force bridge did not receive expected message")
}

async function waitForActorCountStable(sql: SQL): Promise<number> {
  const deadline = Date.now() + 5_000
  let count = await actorCount(sql)
  let stableSince = Date.now()

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    const next = await actorCount(sql)
    if (next !== count) {
      count = next
      stableSince = Date.now()
      continue
    }
    if (Date.now() - stableSince >= 300) return count
  }

  throw new Error("actor count did not stabilize")
}
