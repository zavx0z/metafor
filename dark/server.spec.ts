import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import {mkdirSync, rmSync} from "node:fs"
import {join} from "node:path"
import {createProtocolChannel, type ProtocolChannel} from "store/protocol"

describe("dark/server разворачивает дерево zavx0z/git по gravity-патчу", () => {
  let outbound: ProtocolChannel
  let storePath: string

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

    outbound = createProtocolChannel()
    outbound.onmessage = (event) => {
      for (const patch of event.data.patches) {
        console.log(`[dark/server.spec] patch ${JSON.stringify(patch)}`)
      }
    }
  })

  afterAll(() => {
    outbound.close()
    // НЕ удаляем storePath — файл остаётся в dark/tmp/boundary.sqlite для ручного осмотра
  })

  test("после add zavx0z/git store содержит каноническое дерево git", async () => {
    outbound.postMessage({
      patches: [{part: "graviton", op: "add", path: "zavx0z/git"}],
    })

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

  test("повторный add zavx0z/git идемпотентен — server пропускает уже залитый root", async () => {
    const sql = new SQL(`sqlite://${storePath}`)
    const before = await waitForActorCountStable(sql)

    outbound.postMessage({
      patches: [{part: "graviton", op: "add", path: "zavx0z/git"}],
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
