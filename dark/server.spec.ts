import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {GRAVITY_BROADCAST_CHANNEL, isGravitonMessage, type GravitonMessage} from "@shared/protocol"

// server.ts открывает store на верхнем уровне через top-level await.
// Имя зафиксировано — `dark/tmp/boundary.sqlite`, файл не удаляется после теста, чтобы
// результат разложения git можно было осмотреть руками.
const tmpDir = join(import.meta.dir, "tmp")
mkdirSync(tmpDir, {recursive: true})
const storePath = join(tmpDir, "boundary.sqlite")

// pre-clean: предыдущий запуск мог оставить файл — стартуем с чистого слепка
rmSync(storePath, {force: true})
rmSync(`${storePath}-shm`, {force: true})
rmSync(`${storePath}-wal`, {force: true})

process.env.DARK_STORE_PATH = storePath

// IMPORTANT: top-level await — server поднимается ровно один раз.
await import("./server.ts")

describe("dark/server разворачивает дерево zavx0z/git по gravity-патчу", () => {
  let outbound: BroadcastChannel
  const observed: GravitonMessage[] = []

  beforeAll(() => {
    outbound = new BroadcastChannel(GRAVITY_BROADCAST_CHANNEL)
    outbound.addEventListener("message", (event) => {
      const data = (event as MessageEvent<unknown>).data
      if (isGravitonMessage(data)) observed.push(data)
    })
  })

  afterAll(() => {
    outbound.close()
    // НЕ удаляем storePath — файл остаётся в dark/tmp/boundary.sqlite для ручного осмотра
  })

  test("после add /wimp/zavx0z~1git store содержит каноническое дерево git", async () => {
    outbound.postMessage({
      channel: "gravity",
      boson: "graviton",
      source: "app",
      patches: [{op: "add", path: "/wimp/zavx0z~1git"}],
    } satisfies GravitonMessage)

    // ждём пока Dark материализует root wimp + child wimps в БД
    const sql = new SQL(`sqlite://${storePath}`)
    const deadline = Date.now() + 30_000
    let materialized = false
    while (Date.now() < deadline) {
      try {
        const rows = await sql<Array<{src: string}>>`SELECT src FROM wimp WHERE src = 'zavx0z/git-history-commit'`
        if (rows.length > 0) {
          materialized = true
          break
        }
      } catch {
        // БД может быть ещё не записана/locked
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(materialized, "Dark должен был материализовать дерево zavx0z/git").toBe(true)

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

      // dark больше не эмитит gravity-патчи в matter() — emitAdd удалён,
      // механизм sync-сообщений будет переделан отдельно.
      const darkPatches = observed
        .filter((m) => m.source === "dark")
        .flatMap((m) => m.patches)
      expect(darkPatches).toEqual([])
    } finally {
      await sql.close()
    }
  }, 60_000)

  test("повторный add /wimp/zavx0z~1git идемпотентен — server пропускает уже залитый wimp", async () => {
    const observedBefore = observed.length

    outbound.postMessage({
      channel: "gravity",
      boson: "graviton",
      source: "app",
      patches: [{op: "add", path: "/wimp/zavx0z~1git"}],
    } satisfies GravitonMessage)

    // даём server'у тик — если бы он начал загрузку, он бы уехал в matter()
    await new Promise((resolve) => setTimeout(resolve, 200))

    // никаких новых /wimp/ add'ов и barrier'ов от dark не должно появиться
    const newDarkPatches = observed
      .slice(observedBefore)
      .filter((m) => m.source === "dark")
      .flatMap((m) => m.patches)
    expect(newDarkPatches).toEqual([])
  })
})
